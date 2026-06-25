import { injectable } from "tsyringe";
import type { LogFields, LogLevel, Logger } from "./types/logger.js";

@injectable()
export class StructuredLoggerService implements Logger {
  debug(event: string, fields?: LogFields): void {
    this.write("debug", event, fields);
  }

  info(event: string, fields?: LogFields): void {
    this.write("info", event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.write("warn", event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.write("error", event, fields);
  }

  private write(level: LogLevel, event: string, fields?: LogFields): void {
    const record = {
      recordType: "log",
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields,
    };
    process.stderr.write(`${JSON.stringify(record)}\n`);
  }
}
