import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export type BlogFrontmatter = {
  title: string;
  date: string;
  excerpt: string;
  author?: string;
  coverImage?: string;
  seoTitle?: string;
  seoDescription?: string;
};

export type BlogPostSummary = BlogFrontmatter & {
  slug: string;
};

export type BlogPost = BlogPostSummary & {
  contentHtml: string;
};

function normalizeStringField(
  value: unknown,
  fieldName: keyof BlogFrontmatter,
  slug: string,
  required = false
) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (required) {
    throw new Error(`Missing required frontmatter "${fieldName}" in blog post "${slug}".`);
  }

  return undefined;
}

function parseFrontmatter(slug: string, data: Record<string, unknown>): BlogFrontmatter {
  return {
    title: normalizeStringField(data.title, "title", slug, true)!,
    date: normalizeStringField(data.date, "date", slug, true)!,
    excerpt: normalizeStringField(data.excerpt, "excerpt", slug, true)!,
    author: normalizeStringField(data.author, "author", slug),
    coverImage: normalizeStringField(data.coverImage, "coverImage", slug),
    seoTitle: normalizeStringField(data.seoTitle, "seoTitle", slug),
    seoDescription: normalizeStringField(data.seoDescription, "seoDescription", slug),
  };
}

function toSortableTime(dateString: string) {
  const time = Date.parse(dateString);
  return Number.isNaN(time) ? 0 : time;
}

async function getBlogFileNames() {
  try {
    const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function slugFromFileName(fileName: string) {
  return fileName.replace(path.extname(fileName), "");
}

export async function getAllBlogPosts(): Promise<BlogPostSummary[]> {
  const fileNames = await getBlogFileNames();

  const posts = await Promise.all(
    fileNames.map(async (fileName) => {
      const slug = slugFromFileName(fileName);
      const fullPath = path.join(BLOG_DIR, fileName);
      const source = await fs.readFile(fullPath, "utf8");
      const parsed = matter(source);
      const frontmatter = parseFrontmatter(slug, parsed.data);
      return { slug, ...frontmatter };
    })
  );

  return posts.sort((a, b) => toSortableTime(b.date) - toSortableTime(a.date));
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const fileNames = await getBlogFileNames();
  const targetFile = fileNames.find((fileName) => slugFromFileName(fileName) === slug);

  if (!targetFile) {
    return null;
  }

  const source = await fs.readFile(path.join(BLOG_DIR, targetFile), "utf8");
  const parsed = matter(source);
  const frontmatter = parseFrontmatter(slug, parsed.data);
  const contentHtml = (await remark().use(remarkHtml).process(parsed.content)).toString();

  return {
    slug,
    ...frontmatter,
    contentHtml,
  };
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
