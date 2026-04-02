import { handleLeadSubmission } from "@/modules/customers";

export async function POST(request: Request) {
  return handleLeadSubmission(request);
}

