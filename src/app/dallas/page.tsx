'use client'
import Script from 'next/script'
import React, { useEffect } from 'react'
import Link from 'next/link'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import FAQItem from '../../components/FAQItem'
import { CONTACTS } from '../../config/contact'

// -----------------------------------------------------------------------------
// Dallas Page — Stabilized build (no arbitrary Tailwind classes)
// - Matches the Oʻahu page structure & styles
// - Booking: simple Call / Text / Email
// - Pricing: $55 first lesson; $40 each additional lesson in the same visit
// - Header: your <Link> logo snippet
// - Hero image: /public/assets/dallasSwim.png
// -----------------------------------------------------------------------------

const { phoneDisplay: PHONE, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.dallas

export default function DallasPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const mailHref = `mailto:${EMAIL}`

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800">
      

      <Hero
        title={"Dallas Swim Lessons"}
        subtitle={"At‑home private and small‑group instruction across Dallas and Collin counties — we come to your backyard pool."}
        ctas={[
          { label: '(972) 210-5375', href: telHref, variant: 'primary' },
          { label: 'Text Us', href: smsHref },
          { label: 'Email', href: mailHref },
        ]}
        imageSrc={'/assets/dallasSwim.jpg'}
        imageAlt={'Backyard swim lessons in Dallas'}
          blockquote={"Fitness is what happens when practicing proper technique"}
        />

      {/* Offerings */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-bold">What we offer in Dallas</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Private Lessons',
              body: 'One‑on‑one home lessons with a Sguild instructor for maximum focus and progress. Our method is structured for long‑lasting results.'
            },
            {
              title: 'Semi‑Private',
              body: 'Learn alongside a sibling or friend of similar level. Enroll additional students in the same lesson free of charge.'
            },
            {
              title: 'Adult Lessons',
              body: 'From first‑time swimmers to triathlon prep, we tailor sessions to your goals with clear, personalized guidance.'
            },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-700">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Pricing & Details */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
            <h3 className="text-xl font-semibold">Pricing</h3>
            <p className="mt-2 text-slate-700">
              The total cost of a single lesson is <span className="font-semibold">$55</span> (travel included). <br />
              <span className="font-medium">Additional lessons during the same visit are $40 each.</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
            <h3 className="text-xl font-semibold">Lesson Length</h3>
            <p className="mt-2 text-slate-700">
              Each lesson is 30 minutes. Please allow for lessons to run up to 5 minutes long when needed.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
            <h3 className="text-xl font-semibold">Ages & Levels</h3>
            <p className="mt-2 text-slate-700">
              We teach ages 2 through adult—from water‑comfort beginners to stroke refinement and water safety.
            </p>
          </div>
        </div>
      </section>

      {/* Coverage */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold">Where we teach</h2>
          <p className="mt-2 text-slate-700">
            Dallas • Plano • Frisco • McKinney • Allen • Richardson • Addison • University Park • Highland Park
          </p>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence and strong technique.
            In Dallas, our team brings a wide variety of classes to your pool—tailored to meet every need and level.
          </p>
        </div>
      </section>

      {/* FAQs */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold">FAQs</h2>
        <div className="mt-4 space-y-3">
          <FAQItem question={"Where are you located?"}>
            We are an at‑home swim school. We come to you across Dallas and Collin counties — home pools or condo pools.
          </FAQItem>

          <FAQItem question={"What ages do you teach?"}>
            We offer lessons for ages 2 to adult.
          </FAQItem>

          <FAQItem question={"How do I book?"}>
            <p className="mt-0 text-sm text-slate-700">Simple — call, text, or email us and we’ll set it up.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">Call</a>
              <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">Text</a>
              <a href={mailHref} className="rounded-full border border-slate-300 px-3 py-1.5">Email</a>
            </div>
          </FAQItem>
        </div>
      </section>
{/* Reviews */}
<FeaturableReviews />
      
    </div>
  )
}
