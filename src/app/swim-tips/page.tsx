import Link from "next/link";
import type { Metadata } from "next";
import NextImage from "@/components/NextImage";
import PageContainer from "@/components/PageContainer";
import { getSiteUrl } from "@/lib/blog";

const BLOG_INDEX_TITLE = "Swim Tips | Sguild Swim Instruction";
const BLOG_INDEX_DESCRIPTION =
  "Simple coaching series and practical drills to build confident, efficient swimmers.";

export const metadata: Metadata = {
  title: BLOG_INDEX_TITLE,
  description: BLOG_INDEX_DESCRIPTION,
  alternates: {
    canonical: `${getSiteUrl()}/swim-tips`,
  },
  openGraph: {
    title: BLOG_INDEX_TITLE,
    description: BLOG_INDEX_DESCRIPTION,
    url: `${getSiteUrl()}/swim-tips`,
    type: "website",
  },
};

export default async function BlogPage() {
  return (
    <PageContainer>
      <main className="mx-auto max-w-4xl px-4 py-16 md:py-20">
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">Swim Tips</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Explore guided series designed to build better technique, confidence, and efficiency in the water.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Link
            href="/swim-tips/swim-fundamentals"
            className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-sm"
          >
            <figure className="relative aspect-[4/3] w-full overflow-hidden">
              <NextImage
                src="/assets/Fundamentals.png"
                alt="Swim Fundamentals technique series"
                fill
                className="transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </figure>

            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900">Swim Fundamentals</h2>
              <p className="mt-2 text-slate-700">
                Core skills that make every stroke smoother, stronger, and more efficient.
              </p>
              <p className="mt-4 font-medium text-sky-700 group-hover:text-sky-800">Open series</p>
            </div>
          </Link>
        </section>
      </main>
    </PageContainer>
  );
}
