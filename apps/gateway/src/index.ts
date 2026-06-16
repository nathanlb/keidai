#!/usr/bin/env node
import "reflect-metadata";
import { loadConfig, reportConfigError } from "./config/loader.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { createContainer } from "./container.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const app = createContainer(config);
  const configService = app.resolve(ToriiConfigService);

  console.log(
    `Loaded Torii config with ${configService.get().servers.length} server(s)`,
  );
}

main().catch(reportConfigError);
