import { inject, injectable } from "tsyringe";
import type {
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
} from "./types/config.dto.js";
import { ToriiConfigService } from "./torii-config.service.js";
import {
  projectConfigAgents,
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

  listAgents(): ConfigAgentsResponse {
    return projectConfigAgents(this.configService.get());
  }
}
