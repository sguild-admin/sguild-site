import React from "react";
import Link from "next/link";

type CTA = { label: string; href: string; variant?: "primary" | "secondary" };

export default function Hero({
  title,
  subtitle,
  ctas = [],
  imageSrc,
  imageAlt,
  blockquote,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  ctas?: CTA[];
  imageSrc?: string;
  imageAlt?: string;
  blockquote?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-t from-sky-100 to-transparent" />
        <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 items-center gap-10">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-4 text-lg leading-relaxed text-slate-700">{subtitle}</p>}

          {blockquote && (
            <blockquote className="mt-4 rounded-xl bg-white/70 p-4 text-slate-700 ring-1 ring-slate-200 italic">
              {blockquote}
            </blockquote>
          )}

          {ctas.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {ctas.map((c) => (
                c.variant === "primary" ? (
                  <a key={c.href} href={c.href} className="inline-flex items-center rounded-2xl bg-sky-600 px-5 py-3 text-white shadow hover:bg-sky-700">{c.label}</a>
                ) : (
                  <a key={c.href} href={c.href} className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50">{c.label}</a>
                )
              ))}
            </div>
          )}
        </div>

        {imageSrc && (
          <div className="relative">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200" style={{ aspectRatio: '4 / 3' }}>
              <img src={imageSrc} alt={imageAlt || "Hero image"} className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200">
              <p className="text-sm font-medium">Flexible scheduling • Home pools • Water safety</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
