import type { RuntimeConfig } from "./runtime-config.js";

export class FudaConfigService {
  constructor(private readonly config: RuntimeConfig) {}

  get(): RuntimeConfig {
    return this.config;
  }
}
