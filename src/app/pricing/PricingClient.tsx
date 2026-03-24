'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PageContainer from '../../components/PageContainer'
import PricingSection from '../../components/Packages'
import PricingToggle from '../../components/PricingToggle'
import PaymentsPanel from '../../components/PaymentsPanel'
import { CONTACTS } from '../../config/contact'

type City = 'dallas' | 'oahu'

export default function PricingClient() {
  const params = useSearchParams()
  const router = useRouter()

  const qCity = params?.get('city')
  const defaultCity: City = qCity === 'oahu' ? 'oahu' : 'dallas'

  const [city, setCity] = useState<City>(defaultCity)

  useEffect(() => {
    if (qCity === 'oahu' && city !== 'oahu') setCity('oahu')
    if (qCity === 'dallas' && city !== 'dallas') setCity('dallas')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qCity])

  const contact = useMemo(() => {
    if (city === 'oahu') return CONTACTS.oahu
    return CONTACTS.dallas
  }, [city])

  const telHref = `tel:${contact.phoneTel}`
  const smsHref = `sms:${contact.phoneTel}`
  const cityLabel = city === 'oahu' ? 'O\'ahu' : 'Dallas'

  return (
    <PageContainer>
      <section className="mx-auto max-w-6xl px-4 py-8">
        {/* Top header */}
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                Pricing
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-slate-700">
                Private, 30-minute lessons. No fees.
              </p>
            </div>
            

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-slate-500">Location</span>
              <PricingToggle
                value={city}
                onChange={(v: City) => {
                  setCity(v)
                  router.replace(`/pricing?city=${v}`)
                }}
              />
            </div>
          </div>
        </section>
    {/* Pricing container */}
    <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Lessons and Packages</h2>
          <p className="mt-1 text-sm text-slate-600">
            All lessons are private, one-on-one, 30-minute sessions at your pool.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <PricingSection city={city} />
      </div>

      <PaymentsPanel />
    </div>

    {/* Reassurance (avoid widget overlap) */}
    <div className="mt-8 pb-16">
  <div className="relative z-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-sm text-slate-700">
    Questions before you start? Text us and we’ll recommend the best option based on your swimmer’s age and goals.
  </p>



<div className="flex items-center gap-2 sm:gap-3">
  <a
    href={smsHref}
    className="inline-flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
  >
    Text
  </a>

  <a
    href={telHref}
    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
  >
    Call
  </a>
</div>
    </div>
  </div>
</div>
  </section>
</PageContainer>

)
}
