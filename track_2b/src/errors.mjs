export class CiteOpsError extends Error {
  constructor(message, { status = 400, code = "bad_request", cause } = {}) {
    super(message, { cause });
    this.name = "CiteOpsError";
    this.status = status;
    this.code = code;
  }
}

export function asPublicError(error) {
  if (error instanceof CiteOpsError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  console.error("Unhandled CiteOps error", error);
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
      },
    },
  };
}
