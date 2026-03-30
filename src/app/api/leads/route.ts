import { handleLeadSubmission } from "@/modules/customers/route";

export async function POST(request: Request) {
  return handleLeadSubmission(request);
}
