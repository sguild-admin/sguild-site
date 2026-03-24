import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NextImage from "@/components/NextImage";
import PageContainer from "@/components/PageContainer";
import { getBlogPostBySlug, getSiteUrl } from "@/lib/blog";

const ARTICLE_SLUG = "breathing-while-swimming";

type ArticlePageData = Awaited<ReturnType<typeof getBlogPostBySlug>>;

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}

async function getArticleOrThrow(): Promise<Exclude<ArticlePageData, null>> {
  const post = await getBlogPostBySlug(ARTICLE_SLUG);
  if (!post) {
    notFound();
  }
  return post;
}

export async function generateMetadata(): Promise<Metadata> {
  const post = await getBlogPostBySlug(ARTICLE_SLUG);

  if (!post) {
    return {
      title: "Post Not Found | Sguild Swim Instruction",
      robots: { index: false, follow: false },
    };
  }

  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/swim-tips/swim-fundamentals/breathing-while-swimming`;
  const title = post.seoTitle ?? `${post.title} | Sguild Swim Tips`;
  const description = post.seoDescription ?? post.excerpt;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
      publishedTime: post.date,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function BreathingWhileSwimmingPage() {
  const post = await getArticleOrThrow();
  const siteUrl = getSiteUrl();
  const articleUrl = `${siteUrl}/swim-tips/swim-fundamentals/breathing-while-swimming`;
  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    image: post.coverImage ? [`${siteUrl}${post.coverImage}`] : undefined,
    author: {
      "@type": "Organization",
      name: post.author ?? "Sguild Swim Instruction",
    },
    publisher: {
      "@type": "Organization",
      name: "Sguild Swim Instruction",
      sameAs: [
        "https://www.facebook.com/profile.php?id=61585015406844",
        "https://www.instagram.com/sguildswim/",
      ],
    },
    mainEntityOfPage: articleUrl,
    url: articleUrl,
  };

  return (
    <PageContainer>
      <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
        />
        <p className="text-sm font-medium text-slate-500">
          <Link href="/swim-tips" className="hover:text-sky-700">
            Swim Tips
          </Link>{" "}
          /{" "}
          <Link href="/swim-tips/swim-fundamentals" className="hover:text-sky-700">
            Swim Fundamentals
          </Link>{" "}
          / {post.title}
        </p>

        <article className="mt-6">
          <header>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">{post.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              {post.author ? <span>| {post.author}</span> : null}
            </div>
          </header>

          {post.coverImage ? (
            <figure className="relative mt-8 aspect-[16/9] overflow-hidden rounded-xl border border-slate-200">
              <NextImage
                src={post.coverImage}
                alt={post.title}
                fill
                className="h-full w-full object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
              />
            </figure>
          ) : null}

          <div className="blog-content mt-8 text-slate-800" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
        </article>
      </main>
    </PageContainer>
  );
}
