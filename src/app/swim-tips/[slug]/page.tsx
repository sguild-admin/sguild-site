import { notFound, permanentRedirect } from "next/navigation";

type LegacySwimTipsPageProps = {
  params: Promise<{ slug: string }>;
};

const LEGACY_REDIRECTS: Record<string, string> = {
  "streamline-swimming": "/swim-tips/swim-fundamentals/streamline-swimming",
  "breathing-while-swimming": "/swim-tips/swim-fundamentals/breathing-while-swimming",
  "water-safety-basics": "/swim-tips/swim-fundamentals/streamline-swimming",
};

export default async function LegacySwimTipsPage({ params }: LegacySwimTipsPageProps) {
  const { slug } = await params;
  const redirectTarget = LEGACY_REDIRECTS[slug];
  if (redirectTarget) {
    permanentRedirect(redirectTarget);
  }

  notFound();
}

