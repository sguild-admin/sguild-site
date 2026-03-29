import React from 'react'
import Packages from './Packages'
import PaymentsPanel from './PaymentsPanel'

type Props = {
  city: 'oahu' | 'dallas' | string
  title?: string
  subtitle?: string
  badgeText?: string
  sectionId?: string
}

export default function PricingSection({
  city,
  title = 'Pricing',
  subtitle = '30-minute private or shared lessons at your location, add students at no extra charge.',
  badgeText = 'No fees - Simple packages',
  sectionId = 'pricing',
}: Props) {
  return (
    <section id={sectionId} className="mx-auto max-w-6xl px-4 py-12 scroll-mt-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          </div>

          <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            {badgeText}
          </span>
        </div>

        <div className="mt-6">
          <Packages city={city} />
        </div>

        <PaymentsPanel />
      </div>
    </section>
  )
}


