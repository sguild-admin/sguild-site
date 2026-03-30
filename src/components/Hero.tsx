import React from "react";
import Button from "./Button";
import NextImage from "./NextImage";
import TrustBar from "./TrustBar";

type CTA = { label: string; href: string; variant?: "primary" | "secondary" };

export default function Hero({
  title,
  subtitle,
  ctas = [],
  contactLine,
  imageSrc,
  imageAlt,
  blockquote,
  trustCityLabel,
  imageTagline,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  ctas?: CTA[];
  contactLine?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  blockquote?: React.ReactNode;
  trustCityLabel?: string;
  imageTagline?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-t from-slate-100 to-transparent" />
        <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-slate-300/25 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-slate-200/30 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_1.08fr] md:py-24 lg:gap-12">
        <div className="mx-auto max-w-xl text-center md:mx-0 md:text-left">
          <h1 className="font-['Inter'] text-[1.95rem] font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-[2.3rem] lg:text-[3rem]">{title}</h1>
          {subtitle && <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-700 md:mt-5 md:text-lg mx-auto md:mx-0">{subtitle}</p>}

          {blockquote && (
            <blockquote className="mt-4 rounded-xl bg-white/70 p-4 text-slate-700 ring-1 ring-slate-200 italic">
              {blockquote}
            </blockquote>
          )}

          {ctas.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-3 md:items-start">
              {ctas.map((c) => (
                <Button
                  key={c.href + c.label}
                  href={c.href}
                  variant={c.variant}
                  className={`w-full max-w-[320px] justify-center rounded-2xl px-5 py-3 text-[1.15rem] ${
                    c.variant !== "secondary" ? "shadow-[0_3px_10px_rgba(27,128,208,0.27)]" : ""
                  }`}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-col items-center space-y-4 md:items-start">
            {contactLine && (
              <p className="text-[0.97rem] leading-relaxed text-slate-700 md:pl-1">{contactLine}</p>
            )}

            <TrustBar
              ariaLabel={`Google rating: 5.0 out of 5, trusted by ${trustCityLabel ?? "local families"}`}
            />
          </div>
        </div>

        {imageSrc && (
          <div className="relative mx-auto w-full max-w-xl md:mx-0 md:max-w-none">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200 relative" style={{ aspectRatio: '4 / 3' }}>
              <NextImage src={imageSrc} alt={imageAlt || "Hero image"} fill className="object-cover" />
            </div>
            <div className="absolute -bottom-5 -right-5 max-w-[90%] bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200 sm:max-w-none">
              <p className="text-xs font-medium sm:text-sm">{imageTagline ?? "We come to you • Flexible scheduling • Kids & adults"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <div className="border-b-2 border-slate-200/60" />
      </div>
    </section>
  );
}

