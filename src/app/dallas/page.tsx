'use client'
import Script from 'next/script'
import React, { useEffect } from 'react'
import Link from 'next/link'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import FAQItem from '../../components/FAQItem'
import Offerings from '../../components/Offerings'
import FAQs from '../../components/FAQs'
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
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-white text-slate-800">
      

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
      <Offerings 
        title="What we offer in Dallas"
        description="All lessons are 30 minutes and take place at your home, apartment, or an community pool. Choose the option that best fits your swimmer's goals."
      />

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
        <div className="rounded-3xl bg-linear-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
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
      <FAQs
        telHref={telHref}
        smsHref={smsHref}
        mailHref={mailHref}
        phoneDisplay={PHONE}
        cityName="Dallas"
        includeRates={false}
        faqItems={[
          {
            question: "Where are you located?",
            content: <>We are an at-home swim school. We come to you across Dallas and Collin counties - home pools or condo pools.</>,
          },
          {
            question: "What ages do you teach?",
            content: <>We offer lessons for ages 2 to adult.</>,
          },
          {
            question: "How do I book?",
            content: (
              <>
                <p className="mt-0 text-sm text-slate-700">Simple - call, text, or email us and we'll set it up.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">Call</a>
                  <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">Text</a>
                  <a href={mailHref} className="rounded-full border border-slate-300 px-3 py-1.5">Email</a>
                </div>
              </>
            ),
          },
        ]}
      />


{/* Reviews */}
<FeaturableReviews />
      
    </div>
  )
}
