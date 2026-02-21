import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/lesson-request?utm_campaign=${encodeURIComponent(code)}`);
}
