import { AGENTS_KEY } from "./use-fetch-agents.js";
import { SERVERS_KEY } from "./use-fetch-servers.js";
import { GATEWAY_STATUS_KEY } from "./use-gateway-status.js";

export function refreshGatewayConfig(
  mutate: (key: string) => void,
): void {
  mutate(GATEWAY_STATUS_KEY);
  mutate(AGENTS_KEY);
  mutate(SERVERS_KEY);
}
