import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import type { AppEnv } from "../types";

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const requestId = c.get("requestId");
  if (error instanceof ApiError)
    return c.json(
      { error: { code: error.code, message: error.message, requestId } },
      error.status,
    );
  if (error instanceof ZodError)
    return c.json(
      {
        error: {
          code: "invalid_input",
          message: "Request fields are invalid.",
          requestId,
        },
      },
      400,
    );
  // Never log uploaded text, tokens, provider responses or error messages containing request URLs.
  console.error(
    JSON.stringify({
      requestId,
      code: "internal_error",
      errorType: error.name,
    }),
  );
  return c.json(
    {
      error: {
        code: "internal_error",
        message:
          "Storage or processing failed. Please retry; no demonstration findings were substituted.",
        requestId,
      },
    },
    500,
  );
};
