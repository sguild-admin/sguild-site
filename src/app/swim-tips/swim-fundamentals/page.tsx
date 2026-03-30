import Link from "next/link";
import type { Metadata } from "next";
import PageContainer from "@/components/PageContainer";
import { getBlogPostBySlug, getSiteUrl } from "@/lib/blog";

const SERIES_TITLE = "Swim Fundamentals | Sguild Swim Tips";
const SERIES_DESCRIPTION =
  "A progressive series on the essential body-position and technique skills every swimmer should master.";

export const metadata: Metadata = {
  title: SERIES_TITLE,
  description: SERIES_DESCRIPTION,
  alternates: {
    canonical: `${getSiteUrl()}/swim-tips/swim-fundamentals`,
  },
  openGraph: {
    title: SERIES_TITLE,
    description: SERIES_DESCRIPTION,
    url: `${getSiteUrl()}/swim-tips/swim-fundamentals`,
    type: "website",
  },
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}

export default async function SwimFundamentalsPage() {
  const articles = await Promise.all([
    getBlogPostBySlug("streamline-swimming"),
    getBlogPostBySlug("breathing-while-swimming"),
  ]);
  const publishedArticles = articles.filter((article): article is NonNullable<typeof article> =>
    Boolean(article)
  );

  return (
    <PageContainer>
      <main className="mx-auto max-w-4xl px-4 py-16 md:py-20">
        <header className="mb-10">
          <p className="text-sm font-medium text-slate-500">
            <Link href="/swim-tips" className="hover:text-sky-700">
              Swim Tips
            </Link>{" "}
            / Swim Fundamentals
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            Swim Fundamentals
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Start with the body-line skills that unlock better speed, control, and confidence in every stroke.
          </p>
        </header>

        {publishedArticles.length > 0 ? (
          <section className="space-y-4">
            {publishedArticles.map((article) => {
              const articleHref = `/swim-tips/swim-fundamentals/${article.slug}`;

              return (
                <article key={article.slug} className="rounded-xl border border-slate-200 bg-white p-6">
                  <p className="text-sm text-slate-500">{formatDate(article.date)}</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    <Link href={articleHref} className="hover:text-sky-700">
                      {article.title}
                    </Link>
                  </h2>
                  <p className="mt-3 text-slate-700">{article.excerpt}</p>
                  <div className="mt-4">
                    <Link href={articleHref} className="font-medium text-sky-700 hover:text-sky-800">
                      Read article
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">Series article coming soon</h2>
            <p className="mt-2 text-slate-600">Check back soon for the first Swim Fundamentals lesson.</p>
          </section>
        )}

        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-xl font-semibold text-slate-900">Ready for coached progress?</h2>
          <p className="mt-2 text-slate-700">
            Pair this series with personalized lessons to improve faster and build confidence in real swim conditions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/pricing" className="inline-flex items-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95">
              See Pricing
            </Link>
            <Link href="/lesson-request" className="inline-flex items-center rounded-xl border-[0.4px] border-slate-200/45 bg-white/90 px-4 py-2 font-sf-pro text-[1rem] font-medium text-sky-700 shadow-[0_2px_6px_rgba(15,23,42,0.08)] transition hover:bg-white">
              Check Availability
            </Link>
          </div>
        </section>
      </main>
    </PageContainer>
  );
}
