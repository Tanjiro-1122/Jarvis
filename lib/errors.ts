/**
 * Rune application error types and utilities.
 * Provides consistent error handling across API routes and services.
 */

export type RuneErrorCode =
  | "VALIDATION_ERROR"
  | "PERSISTENCE_ERROR"
  | "EXECUTION_ERROR"
  | "TOOL_ERROR"
  | "AUTH_ERROR"
  | "RATE_LIMIT_ERROR"
  | "NOT_FOUND_ERROR"
  | "UPSTREAM_ERROR"
  | "UNKNOWN_ERROR";

export class RuneError extends Error {
  readonly code: RuneErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: RuneErrorCode = "UNKNOWN_ERROR",
    statusCode = 500,
    cause?: unknown
  ) {
    super(message);
    this.name = "RuneError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

/** Extract a safe human-readable error message from any thrown value. */
export function safeErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred."
): string {
  if (err instanceof RuneError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

/** Log an error with structured context to stderr. */
export function logError(context: string, err: unknown): void {
  const msg = safeErrorMessage(err);
  const code = err instanceof RuneError ? err.code : "UNKNOWN_ERROR";
  const extra =
    err instanceof Error && err.cause != null
      ? { cause: String(err.cause) }
      : undefined;
  if (extra) {
    console.error(`[Rune:${context}] ${code}: ${msg}`, extra);
  } else {
    console.error(`[Rune:${context}] ${code}: ${msg}`);
  }
}
