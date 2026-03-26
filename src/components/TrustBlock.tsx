import type { ReactNode } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

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
  ctaLabel = "Book Lessons Today",
  className = "",
  showTopBorder = false,
}: TrustBlockProps) {
  if (!quote) return null;

  return (
    <div
      className={[
        "w-full max-w-2xl",
        showTopBorder ? "border-t border-slate-200 pt-6" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <div className="max-w-[34rem]">
          <div className="text-xl italic font-medium leading-8 text-slate-900 md:text-2xl md:leading-9">
            "{quote}"
          </div>

          {subtext && (
            <div className="mt-3 max-w-[30rem] text-sm leading-6 text-slate-600 md:text-base md:leading-7">
              {subtext}
            </div>
          )}
        </div>

        {(author || true) && (
          <div className="mt-5 flex items-center gap-3">
            <div
              className="flex items-center gap-0.5 text-amber-400"
              aria-label="5 out of 5 stars"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-4 w-4 fill-current stroke-none" aria-hidden="true" />
              ))}
            </div>

            {author && (
              <p className="text-sm font-semibold tracking-[-0.01em] text-slate-800">
                {author}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 pr-4 sm:pr-8">
          <Link
            href="/lesson-request"
            className="inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
