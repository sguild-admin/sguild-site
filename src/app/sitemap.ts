import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  const now = new Date();

  const routes = [
    "",
    "/oahu",
    "/dallas",
    "/pricing",
    "/lesson-request",
    "/privacy",
    "/swim-tips",
    "/swim-tips/swim-fundamentals",
    "/swim-tips/swim-fundamentals/streamline-swimming",
    "/swim-tips/swim-fundamentals/breathing-while-swimming",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
  }));
}
