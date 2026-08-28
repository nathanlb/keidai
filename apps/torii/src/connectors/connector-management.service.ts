import { inject, injectable } from "tsyringe";
import { isUniqueViolation } from "@keidai/postgres";
import type {
  CatalogEntry,
  ConnectorOAuthOverride,
  ConnectorRecord,
  PublicConnector,
} from "@keidai/shared";
import {
  CONNECTOR_CATALOG,
  CONNECTOR_CATALOG_VERSION,
  getCatalogEntry,
} from "@keidai/shared";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import { GROUP_POLICY_REPOSITORY } from "../policy/types/group-policy-repository.js";
import type { GroupPolicyRepository } from "../policy/types/group-policy-repository.js";
import {
  createEnvRefSecret,
  createSealedSecret,
  resolveSecretPayload,
  SECRET_REPOSITORY,
  type SecretRepository,
} from "../secrets/secret-store.js";
import { PgOAuthRegistrationRepository } from "../credentials/pg-oauth-registration-repository.service.js";
import { PgOAuthDiscoveryCache } from "../credentials/pg-oauth-discovery-cache.service.js";
import { ConnectorRegistry } from "./connector-registry.service.js";
import { PgConnectorRepository } from "./pg-connector-repository.service.js";
import type {
  CreateConnectorBody,
  InstallCatalogBody,
  UpdateConnectorBody,
} from "./types/connector-api.js";
import { ConnectorWriteError } from "./types/connector-write.js";
import { projectPublicConnector } from "./utils/project-connector.js";

@injectable()
export class ConnectorManagementService {
  constructor(
    @inject(PgConnectorRepository)
    private readonly repository: PgConnectorRepository,
    @inject(ConnectorRegistry)
    private readonly registry: ConnectorRegistry,
    @inject(SECRET_REPOSITORY)
    private readonly secrets: SecretRepository,
    @inject(PgOAuthRegistrationRepository)
    private readonly registrations: PgOAuthRegistrationRepository,
    @inject(GROUP_POLICY_REPOSITORY)
    private readonly groups: GroupPolicyRepository,
    @inject(ConnectionManager)
    private readonly connections: ConnectionManager,
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
    @inject(PgOAuthDiscoveryCache)
    private readonly discoveryCache?: PgOAuthDiscoveryCache,
  ) {}

  async list(): Promise<PublicConnector[]> {
    const hydrated = this.registry.get();
    return Promise.all(hydrated.map((connector) => this.toPublic(connector)));
  }

  async get(slug: string): Promise<PublicConnector | null> {
    const connector = this.registry.find(slug);
    return connector ? this.toPublic(connector) : null;
  }

  listCatalog(): CatalogEntry[] {
    return [...CONNECTOR_CATALOG];
  }

  async create(
    input: CreateConnectorBody,
    provenance: { catalogId?: string; catalogVersion?: string } = {},
  ): Promise<PublicConnector> {
    this.assertAuthFields(input.authMode, input);
    try {
      const serviceKeyRef = await this.storeServiceKey(input);
      const oauth = this.oauthFromBody(input.oauth);
      const created = await this.repository.insert({
        slug: input.slug,
        displayName: input.displayName,
        url: input.url,
        authMode: input.authMode,
        enabled: true,
        catalogId: provenance.catalogId,
        catalogVersion: provenance.catalogVersion,
        icon: input.icon,
        serviceKeyRef,
        serviceKeyHeader: input.serviceKeyHeader,
        oauth,
      });
      if (oauth?.clientId && oauth.clientSecret && oauth.issuer) {
        await this.storeManualRegistration(oauth);
      }
      await this.refreshRuntime();
      const hydrated = this.registry.find(created.slug);
      return this.toPublic(hydrated ?? created);
    } catch (error) {
      if (isUniqueViolation(error, "connectors_pkey")) {
        throw new ConnectorWriteError("connector slug already exists", 409);
      }
      throw error;
    }
  }

  async installFromCatalog(input: InstallCatalogBody): Promise<PublicConnector> {
    const entry = getCatalogEntry(input.catalogId);
    if (!entry) {
      throw new ConnectorWriteError(
        `unknown catalog connector "${input.catalogId}"`,
        404,
      );
    }
    const slug = input.slug ?? entry.id;
    const oauth = oauthFromCatalog(entry, input.oauthClient);
    return this.create(
      {
        slug,
        displayName: entry.displayName,
        url: entry.url,
        authMode: entry.authMode,
        icon: entry.icon,
        serviceKey: input.serviceKey,
        serviceKeyEnvRef: input.serviceKeyEnvRef,
        oauth,
      },
      { catalogId: entry.id, catalogVersion: CONNECTOR_CATALOG_VERSION },
    );
  }

  async update(
    slug: string,
    input: UpdateConnectorBody,
  ): Promise<PublicConnector | null> {
    const existing = await this.repository.get(slug);
    if (!existing) {
      return null;
    }
    let serviceKeyRef = existing.serviceKeyRef;
    if (input.serviceKey === null && !input.serviceKeyEnvRef) {
      if (serviceKeyRef) {
        await this.secrets.delete(serviceKeyRef);
      }
      serviceKeyRef = undefined;
    } else if (input.serviceKey || input.serviceKeyEnvRef) {
      if (serviceKeyRef) {
        await this.secrets.delete(serviceKeyRef);
      }
      serviceKeyRef = await this.storeServiceKey({
        authMode: existing.authMode,
        serviceKey: input.serviceKey ?? undefined,
        serviceKeyEnvRef: input.serviceKeyEnvRef,
      });
    }

    const oauth =
      input.oauth === undefined
        ? existing.oauth
        : input.oauth === null
          ? undefined
          : this.oauthFromBody(input.oauth);

    const updated = await this.repository.update(slug, {
      displayName: input.displayName,
      url: input.url,
      enabled: input.enabled,
      icon: input.icon === null ? undefined : input.icon,
      serviceKeyRef,
      serviceKeyHeader:
        input.serviceKeyHeader === null ? undefined : input.serviceKeyHeader,
      oauth,
    });
    if (!updated) {
      return null;
    }
    if (oauth?.clientId && oauth.clientSecret && oauth.issuer) {
      await this.storeManualRegistration(oauth);
    }
    await this.refreshRuntime();
    const hydrated = this.registry.find(slug);
    return this.toPublic(hydrated ?? updated);
  }

  async delete(slug: string): Promise<boolean> {
    if (await this.groups.referencesServer(slug)) {
      throw new ConnectorWriteError(
        `connector "${slug}" is referenced by group policy; update groups first`,
        409,
      );
    }
    const existing = await this.repository.get(slug);
    if (!existing) {
      return false;
    }
    if (existing.serviceKeyRef) {
      await this.secrets.delete(existing.serviceKeyRef);
    }
    const deleted = await this.repository.delete(slug);
    if (deleted) {
      await this.refreshRuntime();
    }
    return deleted;
  }

  async loadIntoRegistry(): Promise<void> {
    const rows = await this.repository.list();
    const hydrated = await Promise.all(
      rows.map((row) => this.hydrate(row)),
    );
    this.registry.replace(hydrated);
  }

  private async hydrate(row: ConnectorRecord): Promise<ConnectorRecord> {
    let resolvedServiceKey = row.resolvedServiceKey;
    if (row.serviceKeyRef) {
      const secret = await this.secrets.get(row.serviceKeyRef);
      if (secret) {
        resolvedServiceKey = await resolveSecretPayload(secret);
      }
    }
    return { ...row, resolvedServiceKey };
  }

  private async refreshRuntime(): Promise<void> {
    await this.loadIntoRegistry();
    await this.connections.reconcile();
    await this.toolCatalog.refresh();
    this.connections.rebroadcast();
  }

  private async toPublic(connector: ConnectorRecord): Promise<PublicConnector> {
    let issuer = connector.oauth?.issuer;
    if (!issuer && this.discoveryCache) {
      const cached = await this.discoveryCache.get(connector.url);
      issuer = cached?.issuer;
    }
    const registration = issuer
      ? await this.registrations.get(issuer)
      : null;
    return projectPublicConnector(connector, {
      oauthClient:
        connector.authMode === "user_oauth"
          ? {
              set: Boolean(
                connector.oauth?.clientId || registration?.clientId,
              ),
              ...(registration?.issuer
                ? { issuer: registration.issuer }
                : issuer
                  ? { issuer }
                  : {}),
              ...(registration?.clientId
                ? { clientId: registration.clientId }
                : connector.oauth?.clientId
                  ? { clientId: connector.oauth.clientId }
                  : {}),
            }
          : undefined,
    });
  }

  private assertAuthFields(
    authMode: CreateConnectorBody["authMode"],
    input: {
      serviceKey?: string;
      serviceKeyEnvRef?: string;
    },
  ): void {
    if (
      authMode === "service_key" &&
      !input.serviceKey &&
      !input.serviceKeyEnvRef
    ) {
      throw new ConnectorWriteError(
        "service_key connectors require serviceKey or serviceKeyEnvRef",
      );
    }
  }

  private async storeServiceKey(input: {
    authMode?: string;
    serviceKey?: string;
    serviceKeyEnvRef?: string;
  }): Promise<string | undefined> {
    if (input.serviceKeyEnvRef) {
      const secret = createEnvRefSecret(input.serviceKeyEnvRef);
      await this.secrets.insert(secret);
      return secret.id;
    }
    if (input.serviceKey) {
      const secret = await createSealedSecret(input.serviceKey);
      await this.secrets.insert(secret);
      return secret.id;
    }
    return undefined;
  }

  private oauthFromBody(
    oauth: CreateConnectorBody["oauth"],
  ): ConnectorOAuthOverride | undefined {
    if (!oauth) {
      return undefined;
    }
    return {
      issuer: oauth.issuer ?? oauth.tokenUrl,
      tokenUrl: oauth.tokenUrl,
      authorizeUrl: oauth.authorizeUrl,
      scopes: oauth.scopes,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      authorizeParams: oauth.authorizeParams,
    };
  }

  private async storeManualRegistration(
    oauth: ConnectorOAuthOverride,
  ): Promise<void> {
    if (!oauth.issuer || !oauth.clientId || !oauth.clientSecret) {
      return;
    }
    const secret = await createSealedSecret(oauth.clientSecret);
    await this.secrets.insert(secret);
    await this.registrations.upsert({
      issuer: oauth.issuer,
      clientId: oauth.clientId,
      clientSecretRef: secret.id,
      origin: "manual",
      scopes: oauth.scopes ?? [],
    });
  }
}

function oauthFromCatalog(
  entry: CatalogEntry,
  oauthClient?: { clientId: string; clientSecret: string },
): CreateConnectorBody["oauth"] {
  if (entry.setup.kind !== "byo_oauth") {
    return oauthClient
      ? {
          clientId: oauthClient.clientId,
          clientSecret: oauthClient.clientSecret,
        }
      : undefined;
  }
  return {
    issuer: entry.setup.issuerHint,
    authorizeUrl: entry.setup.authorizeUrl,
    tokenUrl: entry.setup.tokenUrl,
    scopes: entry.setup.scopes,
    authorizeParams: entry.setup.authorizeParams,
    ...(oauthClient
      ? {
          clientId: oauthClient.clientId,
          clientSecret: oauthClient.clientSecret,
        }
      : {}),
  };
}
