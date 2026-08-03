import type {
  GroupDefinitionConfig,
  GroupPermissionConfig,
  ServerConfig,
} from "@keidai/shared";

/** Build a none-credential server without the removed per-server policy block. */
export function testServer(
  name: string,
  url: string,
  credential: ServerConfig["credential"] = { strategy: "none" },
): ServerConfig {
  return {
    name,
    transport: { type: "http", url },
    credential,
  };
}

export function testAgentsGroup(
  permissions: GroupPermissionConfig[],
  description = "Test agents group",
): GroupDefinitionConfig {
  return {
    name: "agents",
    description,
    permissions,
  };
}
