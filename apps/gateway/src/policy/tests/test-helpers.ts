import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { PolicyEnforcementService } from "../policy-enforcement.service.js";

export function createPolicyEnforcement(
  config: ToriiConfig | ToriiConfigService,
): PolicyEnforcementService {
  const configService =
    config instanceof ToriiConfigService
      ? config
      : new ToriiConfigService(config);
  return new PolicyEnforcementService(configService);
}
