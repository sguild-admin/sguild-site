'use client'
import React from 'react'
import Link from 'next/link'

// -----------------------------------------------------------------------------
// Oʻahu Contact Page — Stabilized build (no arbitrary Tailwind classes)
// - Matches the Oʻahu/Dallas page structure & styles
// - Booking via Call / Text / Email (no JS UA detection)
// - Uses /assets/logo-graphic.png and /assets/contact.jpg
// -----------------------------------------------------------------------------

const PHONE = '+18087468825' // TODO: replace if needed
const EMAIL = 'info@sguildswim.com' // TODO: replace if needed

export default function OahuContactPage() {
  const telHref = `tel:${PHONE}`
  const smsHref = `sms:${PHONE}`
  const mailHref = `mailto:${EMAIL}`

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-slate-200/50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          {/* Logo (your exact snippet) */}
          <Link href="/" className="flex items-center gap-3" aria-label="Sguild Swim Instruction home">
            <img src="/assets/logo-graphic.png" alt="Sguild Swim Instruction logo" className="h-9 w-auto" />
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Sguild <span className="text-slate-500">Swim Instruction</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="hover:text-sky-700">Locations</Link>
            <Link href="/oahu/contact" className="hover:text-sky-700">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-sky-100 to-transparent" />
          <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 items-center gap-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Contact — Oʻahu</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              Ready to book at‑home (or ocean) swim lessons on Oʻahu? Reach out and we’ll get you scheduled.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={telHref} className="inline-flex items-center rounded-2xl bg-sky-600 px-5 py-3 text-white shadow hover:bg-sky-700">Call Now</a>
              <a href={smsHref} className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50">Text Us</a>
              <a href={mailHref} className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50">Email</a>
            </div>
            <div className="mt-6 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Helpful details to include</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                <li>Neighborhood or ZIP (to confirm travel)</li>
                <li>Swimmer age(s) & current comfort level</li>
                <li>Goals (water‑comfort, stroke work, triathlon, ocean safety)</li>
                <li>Preferred days & times</li>
              </ul>
            </div>
          </div>

          <div className="relative">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200" style={{ aspectRatio: '4 / 3' }}>
              <img src="/assets/contact.JPG" alt="Ocean swim lessons on Oʻahu" className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200">
              <p className="text-sm font-medium">Flexible scheduling • Home pools • Ocean safety</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-bold">Ways to reach us</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Call</h3>
            <p className="mt-2 text-sm text-slate-700">Fastest for quick questions and immediate booking.</p>
            <a href={telHref} className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-white">{PHONE}</a>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Text</h3>
            <p className="mt-2 text-sm text-slate-700">Great for sharing names, ages, and scheduling preferences.</p>
            <a href={smsHref} className="mt-4 inline-block rounded-full border border-slate-300 px-4 py-2">Text us</a>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Email</h3>
            <p className="mt-2 text-sm text-slate-700">We typically reply the same day.</p>
            <a href={mailHref} className="mt-4 inline-block rounded-full border border-slate-300 px-4 py-2">{EMAIL}</a>
          </article>
        </div>
      </section>

      {/* Service Area */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold">Oʻahu service area</h2>
          <p className="mt-2 text-slate-700">Honolulu • Waikīkī • Kailua • Kāneʻohe • Ko Olina • North Shore (Haleʻiwa) • and nearby areas</p>
        </div>
      </section>

      {/* FAQs (brief) */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold">FAQs</h2>
        <div className="mt-4 space-y-3">
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How do I book?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">Call or text with your ZIP, swimmer age(s), goals, and preferred days. We’ll confirm availability and get you scheduled.</p>
          </details>
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              Where do you teach?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">We travel to your home or condo pool across Oʻahu. Ocean sessions can be arranged for confident swimmers and specific goals.</p>
          </details>
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              Do you offer group lessons?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">Yes — additional students can join the same 30‑minute lesson at no extra charge.</p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white/70">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-600 flex flex-col md:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Sguild Swim LLC — Oʻahu</p>
          <div className="flex items-center gap-5">
            <Link href="/oahu/contact" className="hover:text-slate-800">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
