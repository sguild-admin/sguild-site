import { handleLeadSubmission } from "@/modules/lead-intakes";

export async function POST(request: Request) {
  return handleLeadSubmission(request);
}

