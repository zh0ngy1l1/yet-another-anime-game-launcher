/** Presentation at an operation boundary, with the original evidence retained. */
export function operationError(message: string, original: unknown): Error {
  const error = Object.assign(new Error(message), { cause: original });
  logDiagnostic(error);
  return error;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = Reflect.get(error, "message");
    const code = Reflect.get(error, "code");
    if (typeof message === "string")
      return message + (typeof code === "string" ? ` (${code})` : "");
  }
  return "The launcher could not complete this operation. See neutralinojs.log for details.";
}

export function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    const cause: unknown = Reflect.get(error, "cause");
    return (
      (error.stack || String(error)) +
      (cause !== undefined && cause !== error
        ? `\nCaused by: ${errorDetails(cause)}`
        : "")
    );
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function logDiagnostic(error: unknown) {
  // Reporting must never change ownership or replace the original failure.
  void Promise.resolve()
    .then(() => Neutralino.debug.log(errorDetails(error), "ERROR"))
    .catch(() => undefined);
}
