import {
  CONNECTIONS_PATH,
  PROVIDERS_PATH,
} from "../shell/navigation.js";

export { CONNECTIONS_PATH, PROVIDERS_PATH };

export const CONNECTION_SERVER_PARAM = "server";

export function connectionHref(serverName?: string): string {
  if (!serverName) {
    return CONNECTIONS_PATH;
  }
  return `${CONNECTIONS_PATH}?${CONNECTION_SERVER_PARAM}=${encodeURIComponent(serverName)}`;
}
