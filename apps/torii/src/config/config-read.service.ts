import { inject, injectable } from "tsyringe";
import type {
  ConfigGroupsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
} from "@keidai/shared";
import { ToriiConfigService } from "./torii-config.service.js";
import {
  projectConfigGroups,
  projectConfigOAuthProviders,
  projectConfigServers,
} from "./utils/project-config-api.js";

/** Read-only projections of boot-loaded config for UI consumption. */
@injectable()
export class ConfigReadService {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
  ) {}

  listServers(): ConfigServersResponse {
    return projectConfigServers(this.configService.get());
  }

  listOAuthProviders(): ConfigOAuthProvidersResponse {
    return projectConfigOAuthProviders(this.configService.get());
  }

  listGroups(): ConfigGroupsResponse {
    return projectConfigGroups(this.configService.get());
  }
}
