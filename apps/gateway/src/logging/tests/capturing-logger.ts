import type { LogFields, LogLevel, Logger } from "../types/logger.js";

export interface CapturedLog {
  level: LogLevel;
  event: string;
  fields: LogFields;
}

export class CapturingLogger implements Logger {
  readonly logs: CapturedLog[] = [];

  debug(event: string, fields?: LogFields): void {
    this.capture("debug", event, fields);
  }

  info(event: string, fields?: LogFields): void {
    this.capture("info", event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.capture("warn", event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.capture("error", event, fields);
  }

  private capture(level: LogLevel, event: string, fields?: LogFields): void {
    this.logs.push({ level, event, fields: fields ?? {} });
  }
}
