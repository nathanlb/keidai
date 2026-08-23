import { inject, injectable } from "tsyringe";
import type {
  ConfigGroupsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
} from "@keidai/shared";
import { GroupPolicyCache } from "../policy/group-policy-cache.service.js";
import { ToriiConfigService } from "./torii-config.service.js";
import {
  projectConfigOAuthProviders,
  projectPublicServer,
} from "./utils/project-config-api.js";

/** Read-only projections of boot-loaded config for UI consumption. */
@injectable()
export class ConfigReadService {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(GroupPolicyCache)
    private readonly groupPolicies: GroupPolicyCache,
  ) {}

  listServers(): ConfigServersResponse {
    const groups = this.groupPolicies.get();
    return {
      servers: this.configService.get().servers.map((server) =>
        projectPublicServer(server, groups),
      ),
    };
  }

  listOAuthProviders(): ConfigOAuthProvidersResponse {
    return projectConfigOAuthProviders(this.configService.get());
  }

  listGroups(): ConfigGroupsResponse {
    return {
      groups: this.groupPolicies.get().map((group) => ({
        name: group.name,
        description: group.description,
      })),
    };
  }
}
