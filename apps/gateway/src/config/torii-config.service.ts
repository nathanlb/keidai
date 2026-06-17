import { injectable } from "tsyringe";
import type { ServerConfig, ToriiConfig } from "@torii/shared";

/**
 * Read-only view of the validated boot config, injectable across gateway services.
 * Loading and validation stay in utils/loader.ts; this class only holds the result.
 */
@injectable()
export class ToriiConfigService {
  constructor(private readonly config: ToriiConfig) {}

  get(): Readonly<ToriiConfig> {
    return this.config;
  }

  getServer(name: string): ServerConfig | undefined {
    return this.config.servers.find((server) => server.name === name);
  }
}
