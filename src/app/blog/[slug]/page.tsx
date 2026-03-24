import { permanentRedirect } from "next/navigation";

type LegacyBlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LegacyBlogPostPage({ params }: LegacyBlogPostPageProps) {
  const { slug } = await params;
  const normalizedSlug = slug === "water-safety-basics" ? "streamline-swimming" : slug;
  permanentRedirect(`/swim-tips/swim-fundamentals/${normalizedSlug}`);
}
