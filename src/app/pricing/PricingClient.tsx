'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PageContainer from '../../components/PageContainer'
import PricingSection from '../../components/Packages'
import PricingToggle from '../../components/PricingToggle'
import PaymentsPanel from '../../components/PaymentsPanel'
import { CONTACTS } from '../../config/contact'
import { DALLAS_LESSON_LENGTH_PRICING } from '../../config/pricing'
import type { CityPricing, DallasLessonLength } from '../../config/pricing'

type City = 'dallas' | 'oahu'

export default function PricingClient() {
  const params = useSearchParams()
  const router = useRouter()

  const qCity = params?.get('city')
  const defaultCity: City = qCity === 'oahu' ? 'oahu' : 'dallas'

  const [city, setCity] = useState<City>(defaultCity)
  const [dallasLessonLength, setDallasLessonLength] = useState<DallasLessonLength>('standard')

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
  const lessonMinutes = city === 'dallas' && dallasLessonLength === 'compact' ? 20 : 30
  const pricingOverride: CityPricing | undefined =
    city === 'dallas' ? DALLAS_LESSON_LENGTH_PRICING[dallasLessonLength] : undefined

  return (
    <PageContainer>
      <section className="mx-auto max-w-6xl px-4 py-8">
        {/* Top header */}
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h1 className="font-['Inter'] text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                Pricing
              </h1>
              <p className="mt-4 font-sf-pro text-lg leading-relaxed text-slate-700">
                Private or small-group, {lessonMinutes}-minute lessons at your pool.
              </p>
              <p className="mt-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">
                No fees - Simple packages
              </p>
            </div>
            

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[0.95rem] text-slate-500">Location</span>
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
          <p className="mt-1 font-sf-pro text-base text-slate-600">
            {lessonMinutes}-minute private or shared lessons at your location, add students at no extra charge.
          </p>
        </div>
        {city === 'dallas' ? (
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setDallasLessonLength('standard')}
              aria-pressed={dallasLessonLength === 'standard'}
              className={[
                'rounded-md px-2.5 py-2 text-[0.9rem] font-semibold transition',
                dallasLessonLength === 'standard'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800',
              ].join(' ')}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setDallasLessonLength('compact')}
              aria-pressed={dallasLessonLength === 'compact'}
              className={[
                'rounded-md px-2.5 py-2 text-[0.9rem] font-semibold transition',
                dallasLessonLength === 'compact'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800',
              ].join(' ')}
            >
              Compact
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <PricingSection
          key={`pricing-cards-${city}-${dallasLessonLength}`}
          city={city}
          dallasLessonLength={city === 'dallas' ? dallasLessonLength : undefined}
          pricingOverride={pricingOverride}
          lessonMinutesOverride={city === 'dallas' ? lessonMinutes : undefined}
        />
      </div>

      <PaymentsPanel />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.95rem] text-slate-700 md:text-base">
            Book Your First Lesson in {cityLabel}. We will match you to the best lesson option.
          </p>
          <a
            href="/lesson-request"
            className="inline-flex items-center justify-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95"
          >
            Book Your First Lesson
          </a>
        </div>
      </div>
    </div>

    {/* Reassurance (avoid widget overlap) */}
    <div className="mt-8 pb-16">
  <div className="relative z-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-[0.95rem] text-slate-700 md:text-base">
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
