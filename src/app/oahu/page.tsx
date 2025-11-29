'use client'
import React, { useEffect } from 'react'
import Link from 'next/link'
import FeaturableReviews from '../../components/FeaturableReviews'

// -----------------------------------------------------------------------------
// Oʻahu Page  -  Stabilized build (no arbitrary Tailwind classes)
// - Fix: removed Tailwind arbitrary utilities (e.g., bg-[...], aspect-[...]) that
//   can crash some toolchains and test sandboxes, which likely caused the
//   "Cannot read properties of null (reading '_')" error during class parsing.
// - Booking: simple Call / Text / Email
// - Pricing: $55 first lesson; $40 each additional lesson in the same visit
// - Header: your <Link> logo snippet
// - Hero image: /public/assets/oceanSwim.jpg (safe to render in tests)
// -----------------------------------------------------------------------------

const PHONE = '(808) 201-0147' // 
const EMAIL = 'info@sguildswim.com' // TODO: replace with your email

export default function OahuPage() {
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
        {/* Background accents (simplified to avoid arbitrary classes) */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-sky-100 to-transparent" />
          <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 items-center gap-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Oʻahu Swim Lessons</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              At‑home private and small‑group instruction across Honolulu, Waikīkī, Kailua, Kāneʻohe, Ko Olina, and the North Shore. We come to you - ocean or pool.
            </p>
            <blockquote className="mt-4 rounded-xl bg-white/70 p-4 text-slate-700 ring-1 ring-slate-200 italic">
              “Fitness is what happens when practicing proper technique”
            </blockquote>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={telHref} className="inline-flex items-center rounded-2xl bg-sky-600 px-5 py-3 text-white shadow hover:bg-sky-700">Call Now</a>
              <a href={smsHref} className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50">Text Us</a>
              <a href={mailHref} className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50">Email</a>
            </div>
          </div>

          <div className="relative">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200" style={{ aspectRatio: '4 / 3' }}>
              {/* Main hero image */}
              <img src="/assets/oceanSwim.jpg" alt="Ocean swim lessons on Oʻahu" className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200">
              <p className="text-sm font-medium">Flexible scheduling • Home pools • Ocean safety</p>
            </div>
          </div>
        </div>
      </section>

      {/* Offerings */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-bold">What we offer on Oʻahu</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Private Lessons',
              body: 'One-on-one home lessons with a Sguild instructor for maximum focus and progress. Our teaching method is structured for long-lasting results.'
            },
            {
              title: 'Semi-Private',
              body: 'Learn alongside a sibling or friend of similar level. Enroll additional students at discounted rates.'
            },
            {
              title: 'Group Lessons',
              body: 'Perfect for families, neighbors, or friends. Students build skills together in a fun, supportive environment - ideal for groups of three or more.'
            },
            {
              title: 'Adult Lessons',
              body: 'From first-time swimmers to triathlon prep, we tailor sessions to your goals with clear, personalized guidance.'
            },

          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-700">{item.body}</p>
            </article>
          ))}
        </div>
      </section>



      {/* Coverage */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold">Where we teach</h2>
          <p className="mt-2 text-slate-700">
            Honolulu • Waikīkī • Kailua • Kāneʻohe • Ko Olina • North Shore (Haleʻiwa) • and nearby areas
          </p>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence and strong technique.
            On Oʻahu, our team brings a wide variety of classes to your pool or the ocean - tailored to meet every need and level.
          </p>
        </div>
      </section>

      {/* FAQs */}
      {/* FAQs */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold">FAQs</h2>
        <div className="mt-4 space-y-3">

          {/* Location */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              Where are you located?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              We are an at-home swim school. We come to you across Oʻahu - your home pool, condo pool, or (for confident swimmers) arranged ocean sessions.
            </p>
          </details>

          {/* Ages */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              What ages do you teach?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              We offer lessons for ages 2 to adult.
            </p>
          </details>

          {/* Lesson Length */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How long is a lesson?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              Each session is <span className="font-medium">30 minutes</span>.
              We design lessons to be focused and efficient so swimmers stay engaged while building real skills and confidence.
            </p>
          </details>

          {/* Booking */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How do I book?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              Easy - call, text, or email us and we’ll get you scheduled.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">Call</a>
              <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">Text</a>
              <a href={mailHref} className="rounded-full border border-slate-300 px-3 py-1.5">Email</a>
            </div>
          </details>
          {/* Pricing */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How much do lessons cost?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>

            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
              <li><strong>Private Lessons:</strong> $35 per 30-minute session</li>
              <li><strong>Semi-Private Lessons:</strong> $20 per student per 30-minute session (2 students)</li>
              <li><strong>Group Lessons:</strong> $15 per student per 30-minute session (3+ students)</li>
            </ul>

            <p className="mt-3 text-xs text-slate-500">
              *A $20 mobile service fee applies per visit.
            </p>
          </details>

        </div>
      </section>

      {/* Reviews */}
      <FeaturableReviews />
      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white/70">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-600 flex flex-col md:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Sguild LLC  -  Oʻahu</p>
          <div className="flex items-center gap-5">
            <Link href="/oahu/contact" className="hover:text-slate-800">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

