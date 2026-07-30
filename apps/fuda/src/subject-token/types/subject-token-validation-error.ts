/**
 * Subject token rejected. Messages must not include the native credential
 * subject string — callers may log the error as an identity denial.
 */
export class SubjectTokenValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SubjectTokenValidationError";
  }
}
