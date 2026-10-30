export type ErrorCategory =
  | "VALIDATION"
  | "AUTHORIZATION"
  | "INTEGRATION"
  | "TRANSIENT"
  | "CONFIGURATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";
export class AppError extends Error {
  constructor(
    public category: ErrorCategory,
    message: string,
    public status = 400,
    public detail?: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  const e =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL", "An unexpected error occurred", 500);
  if (!(error instanceof AppError))
    console.error(
      JSON.stringify({
        level: "error",
        message: "Request failed",
        errorType: error instanceof Error ? error.name : typeof error,
      }),
    );
  return Response.json(
    { error: { category: e.category, message: e.message } },
    { status: e.status },
  );
}
