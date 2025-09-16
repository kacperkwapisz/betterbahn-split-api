import { StatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: StatusCode,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError(message, 400, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(message, 401, "UNAUTHORIZED");
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(message, 403, "FORBIDDEN");
  }

  static notFound(message = "Not Found") {
    return new ApiError(message, 404, "NOT_FOUND");
  }

  static internal(message = "Internal Server Error") {
    return new ApiError(message, 500, "INTERNAL_SERVER_ERROR");
  }
}
