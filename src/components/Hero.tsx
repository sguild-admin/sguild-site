import React from "react";
import Button from "./Button";
import NextImage from "./NextImage";
import { Phone, Star } from "lucide-react";

type CTA = { label: string; href: string; variant?: "primary" | "secondary" };

export default function Hero({
  title,
  subtitle,
  ctas = [],
  imageSrc,
  imageAlt,
  blockquote,
  trustCityLabel,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  ctas?: CTA[];
  imageSrc?: string;
  imageAlt?: string;
  blockquote?: React.ReactNode;
  trustCityLabel?: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-t from-slate-100 to-transparent" />
        <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-slate-300/25 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-slate-200/30 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24 lg:gap-12">
        <div className="max-w-xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-700 md:mt-5 md:text-lg">{subtitle}</p>}

          {blockquote && (
            <blockquote className="mt-4 rounded-xl bg-white/70 p-4 text-slate-700 ring-1 ring-slate-200 italic">
              {blockquote}
            </blockquote>
          )}

          {ctas.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {ctas.map((c) => (
                <Button key={c.href + c.label} href={c.href} variant={c.variant}>
                  {c.href.startsWith("tel:") ? (
                    <span className="inline-flex items-center gap-2">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {c.label}
                    </span>
                  ) : (
                    c.label
                  )}
                </Button>
              ))}
            </div>
          )}

          <div className="mt-5 inline-flex items-center gap-2 text-xs text-slate-700 sm:text-sm">
            <div className="flex items-center gap-0.5 text-amber-400">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />
              ))}
            </div>
            <p className="font-medium">5.0 rated by {trustCityLabel ?? "local families"}</p>
          </div>
        </div>

        {imageSrc && (
          <div className="relative">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200 relative" style={{ aspectRatio: '4 / 3' }}>
              <NextImage src={imageSrc} alt={imageAlt || "Hero image"} fill className="object-cover" />
            </div>
            <div className="absolute -bottom-5 -right-5 max-w-[90%] bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200 sm:max-w-none">
              <p className="text-xs font-medium sm:text-sm">We come to you • Flexible scheduling • Kids & adults</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

