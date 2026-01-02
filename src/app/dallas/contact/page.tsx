'use client'
import React from 'react'
import Button from '../../../components/Button'
import Image from '../../../components/Image'
import PageContainer from '../../../components/PageContainer'
import { CONTACTS } from '../../../config/contact'

const { phoneDisplay: PHONE, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.dallas

// -----------------------------------------------------------------------------
// Dallas Contact Page — Stabilized build (no arbitrary Tailwind classes)
export default function DallasContactPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const mailHref = `mailto:${EMAIL}`

  return (
    <PageContainer>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-sky-100 to-transparent" />
          <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 items-center gap-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Contact — Dallas</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              Ready to book at‑home swim lessons in Dallas or Collin County? Reach out and we’ll get you scheduled.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href={telHref} variant="primary">Call Now</Button>
              <Button href={smsHref} variant="secondary">Text Us</Button>
              <Button href={mailHref} variant="secondary">Email</Button>
            </div>
            <div className="mt-6 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Helpful details to include</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                <li>Address or ZIP (to confirm travel)</li>
                <li>Swimmer age(s) & current comfort level</li>
                <li>Goals (water‑comfort, stroke work, triathlon, etc.)</li>
                <li>Preferred days & times</li>
              </ul>
            </div>
          </div>

          <div className="relative">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200" style={{ aspectRatio: '4 / 3' }}>
              <Image src="/assets/contact.JPG" alt="Dallas backyard swim lesson" className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200">
              <p className="text-sm font-medium">Flexible scheduling • Home pools • Water safety</p>
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
            <Button href={telHref} className="mt-4" variant="primary">{PHONE}</Button>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Text</h3>
            <p className="mt-2 text-sm text-slate-700">Great for sharing names, ages, and scheduling preferences.</p>
            <Button href={smsHref} className="mt-4" variant="secondary">Text us</Button>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Email</h3>
            <p className="mt-2 text-sm text-slate-700">We typically reply the same day.</p>
            <Button href={mailHref} className="mt-4" variant="secondary">{EMAIL}</Button>
          </article>
        </div>
      </section>

      {/* Service Area */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold">Dallas service area</h2>
          <p className="mt-2 text-slate-700">Dallas • Plano • Frisco • McKinney • Prosper • Garland • Allen • Richardson • Addison • University Park • Highland Park</p>
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
            <p className="mt-3 text-sm text-slate-700">We travel to your pool across Dallas and Collin counties.</p>
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
      
    </PageContainer>
  )
}
 
