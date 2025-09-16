interface ErrorContext {
  [key: string]: unknown;
}

interface ApiErrorContext extends ErrorContext {
  route?: string;
  requestBody?: unknown;
  userId?: string;
  statusCode?: number;
  url?: string;
  method?: string;
  userAgent?: string;
}

function safeStringifyError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Enhanced API error handler with context and logging
 */
export const apiErrorHandler = async (
  routeHandler: () => Promise<Response>,
  routeName?: string,
) => {
  try {
    return await routeHandler();
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    const context: ApiErrorContext = {
      route: routeName || "unknown-route",
      timestamp: new Date().toISOString(),
      errorType: "api",
    };

    // Enhanced logging with context
    console.error("🔴 API Error:", {
      message: errorObj.message,
      name: errorObj.name,
      route: context.route,
      timestamp: context.timestamp,
      stack:
        process.env.NODE_ENV === "development" ? errorObj.stack : undefined,
    });

    // Return sanitized error response
    return Response.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? safeStringifyError(error)
            : "Internal server error",
        timestamp: context.timestamp,
        ...(context.route && { route: context.route }),
      },
      { status: 500 },
    );
  }
};

/**
 * Log an error with additional context
 */
export function logError(
  error: Error | string,
  context: ApiErrorContext = {},
): void {
  const errorObj = typeof error === "string" ? new Error(error) : error;

  console.error("🔴 Error:", {
    message: errorObj.message,
    name: errorObj.name,
    ...context,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === "development" ? errorObj.stack : undefined,
  });
}

/**
 * Log a warning with context
 */
export function logWarning(message: string, context: ErrorContext = {}): void {
  console.warn("🟡 Warning:", {
    message,
    ...context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log informational message
 */
export function logInfo(message: string, context: ErrorContext = {}): void {
  console.log("ℹ️ Info:", {
    message,
    ...context,
    timestamp: new Date().toISOString(),
  });
}
