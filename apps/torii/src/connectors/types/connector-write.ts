export class ConnectorWriteError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ConnectorWriteError";
    this.statusCode = statusCode;
  }
}
