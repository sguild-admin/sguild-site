export type RetryClassification =
  | "Provider Transient"
  | "Writeback Failure"
  | "Idempotent Uncertain"
  | "Validation Failure"
  | "Ambiguity"
  | "Policy Failure"
  | "Provider Permanent";

export function classifyRetryability(input: {
  stage: "validation" | "provider" | "writeback" | "ambiguity";
  httpStatus?: number;
  errorType?: string;
}): { retryable: boolean; classification: RetryClassification } {
  if (input.stage === "ambiguity") {
    return { retryable: false, classification: "Ambiguity" };
  }

  if (input.stage === "validation") {
    return { retryable: false, classification: "Validation Failure" };
  }

  if (input.stage === "writeback") {
    return { retryable: true, classification: "Writeback Failure" };
  }

  if (input.stage === "provider") {
    if (input.errorType === "idempotent_uncertain") {
      return { retryable: true, classification: "Idempotent Uncertain" };
    }

    if (input.httpStatus === 429) {
      return { retryable: true, classification: "Provider Transient" };
    }

    if (typeof input.httpStatus === "number" && input.httpStatus >= 500) {
      return { retryable: true, classification: "Provider Transient" };
    }

    if (typeof input.httpStatus === "number" && input.httpStatus >= 400) {
      return { retryable: false, classification: "Provider Permanent" };
    }

    if (input.errorType === "network_timeout" || input.errorType === "network_error") {
      return { retryable: true, classification: "Provider Transient" };
    }
  }

  return { retryable: false, classification: "Policy Failure" };
}

export function inferErrorType(message: string | null | undefined): string | undefined {
  if (!message) return undefined;
  const normalized = message.toLowerCase();
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("etimedout")
  ) {
    return "network_timeout";
  }
  if (
    normalized.includes("network") ||
    normalized.includes("econnreset") ||
    normalized.includes("connection reset") ||
    normalized.includes("socket hang up") ||
    normalized.includes("fetch failed")
  ) {
    return "network_error";
  }
  if (normalized.includes("idempotency") && normalized.includes("unknown")) {
    return "idempotent_uncertain";
  }
  return undefined;
}
