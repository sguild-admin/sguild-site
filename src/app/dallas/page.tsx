'use client'
import Script from 'next/script'
import React, { useEffect } from 'react'
import Link from 'next/link'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import FAQs from '../../components/FAQs'
import Offerings from '../../components/Offerings'
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
        description="All lessons are 30 minutes and take place at your home, condo, or community pool. Choose the option that best fits your swimmer's goals."
      />

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

      <FAQs
        city="Dallas"
        phoneDisplay={PHONE}
        telHref={telHref}
        smsHref={smsHref}
        mailHref={mailHref}
        includeOcean={false}
      />
{/* Reviews */}
<FeaturableReviews />
      
    </div>
  )
}
