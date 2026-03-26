import type { ReactNode } from "react";
import { Star } from "lucide-react";
import Link from "next/link";

type TrustBlockProps = {
  quote?: ReactNode;
  subtext?: ReactNode;
  author?: string;
  ctaLabel?: string;
  className?: string;
  showTopBorder?: boolean;
};

export default function TrustBlock({
  quote,
  subtext,
  author,
  ctaLabel = "Book Lesson Today",
  className = "",
  showTopBorder = false,
}: TrustBlockProps) {
  if (!quote) return null;

  return (
    <div
      className={[
        "w-full max-w-lg px-4 py-2 sm:px-1 sm:py-1 md:px-0",
        showTopBorder ? "border-t border-slate-200 pt-6" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <div className="max-w-[28rem]">
          <div className="text-xl font-normal italic leading-relaxed tracking-[-0.01em] text-slate-900 sm:text-2xl">
            <span className="text-slate-400">"</span>
            {quote}
            <span className="text-slate-400">"</span>
          </div>

          {subtext && (
            <div className="mt-2.5 max-w-[26rem] text-sm leading-6 text-slate-600">
              {subtext}
            </div>
          )}
        </div>

        {(author || true) && (
          <div className="mt-5 flex items-center gap-2.5">
            <div
              className="flex items-center gap-0.5 text-amber-400"
              aria-label="5 out of 5 stars"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3 w-3 fill-current stroke-none" aria-hidden="true" />
              ))}
            </div>

            {author && (
              <p className="text-sm font-medium text-slate-600">
                {author}
              </p>
            )}
          </div>
        )}

        <Link
          href="/lesson-request"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
