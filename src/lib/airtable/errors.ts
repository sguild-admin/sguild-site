export type AirtableErrorBody = {
  error?: {
    message?: string;
    type?: string;
  };
};

export async function parseAirtableError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as AirtableErrorBody;
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through
  }
  return response.statusText || "Unknown Airtable error";
}

export function isRetryableAirtableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

