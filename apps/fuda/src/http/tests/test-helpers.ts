import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
  type IsolatedSchema,
  type Pool,
} from "@keidai/postgres";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { createContainer, FUDA_DATABASE } from "../../container.js";
import { StructuredLoggerService } from "../../logging/structured-logger.service.js";
import { PgOwnerRepository } from "../../owners/pg-owner-repository.js";
import { writeTempSigningKeyPem } from "../../signing/tests/test-helpers.js";
import { FudaHttpServer } from "../fuda-http-server.service.js";

// Opt out of ecosystem BFF service-token hardening for HTTP unit tests.
// Gate-focused tests clear this and set BFF_SERVICE_TOKEN explicitly.
process.env.BFF_SERVICE_TOKEN_DISABLED ??= "true";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as StructuredLoggerService;

export { writeTempSigningKeyPem };

export const sampleAgentBody = {
  slug: "newsletter",
  name: "Newsletter agent",
  ownerId: "owner-1",
  groups: ["editors"],
  persona: "You draft the weekly newsletter.",
};

async function seedSampleOwner(
  container: Awaited<ReturnType<typeof createContainer>>["container"],
): Promise<void> {
  const pool = container.resolve<Pool>(FUDA_DATABASE);
  await new PgOwnerRepository(pool).upsert(sampleAgentBody.ownerId);
}

function wrapServerStart(
  server: FudaHttpServer,
  isolated: IsolatedSchema,
): FudaHttpServer {
  const start = server.start.bind(server);
  server.start = async (options) => {
    const handle = await start(options);
    return {
      baseUrl: handle.baseUrl,
      close: async () => {
        await handle.close();
        await isolated.close();
      },
    };
  };
  return server;
}

export async function createTestServer(
  listenGroups?: string,
): Promise<FudaHttpServer> {
  const isolated = await createIsolatedSchema();
  const keyPath = writeTempSigningKeyPem("test");

  const { config, subjectTokenValidatorConfig } = loadRuntimeConfig({
    FUDA_DATABASE_URL: resolveTestDatabaseUrl(),
    FUDA_HOST: "127.0.0.1",
    FUDA_PORT: "3300",
    FUDA_ISSUER: "https://fuda.test",
    FUDA_SIGNING_KEYS: `test=${keyPath}`,
    FUDA_SIGNING_KID: "test",
    FUDA_STATIC_SUBJECT_MAPPINGS: "test-secret=test-bearer",
    ...(listenGroups ? { FUDA_LISTEN_GROUPS: listenGroups } : {}),
  });
  const { container } = await createContainer(
    config,
    subjectTokenValidatorConfig,
    { pool: isolated.pool },
  );
  container.register(StructuredLoggerService, { useValue: silentLogger });
  await seedSampleOwner(container);
  return wrapServerStart(container.resolve(FudaHttpServer), isolated);
}

export async function createTestServerWithKeys(options: {
  listenGroups?: string;
  keys: Array<{ kid: string; path: string }>;
  signingKid: string;
}): Promise<{
  server: FudaHttpServer;
  container: Awaited<ReturnType<typeof createContainer>>["container"];
}> {
  const isolated = await createIsolatedSchema();
  const signingKeys = options.keys
    .map((key) => `${key.kid}=${key.path}`)
    .join(",");

  const { config, subjectTokenValidatorConfig } = loadRuntimeConfig({
    FUDA_DATABASE_URL: resolveTestDatabaseUrl(),
    FUDA_HOST: "127.0.0.1",
    FUDA_PORT: "3300",
    FUDA_ISSUER: "https://fuda.test",
    FUDA_SIGNING_KEYS: signingKeys,
    FUDA_SIGNING_KID: options.signingKid,
    FUDA_STATIC_SUBJECT_MAPPINGS: "test-secret=test-bearer",
    ...(options.listenGroups
      ? { FUDA_LISTEN_GROUPS: options.listenGroups }
      : {}),
  });
  const { container } = await createContainer(
    config,
    subjectTokenValidatorConfig,
    { pool: isolated.pool },
  );
  container.register(StructuredLoggerService, { useValue: silentLogger });
  await seedSampleOwner(container);
  return {
    server: wrapServerStart(container.resolve(FudaHttpServer), isolated),
    container,
  };
}
