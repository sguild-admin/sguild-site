import React from 'react'
import { PRICING, CityPricing } from '../config/pricing'

type Props = {
  city: 'oahu' | 'dallas' | 'perth' | string
  title?: string
  subtitle?: string
}

type PricingItem = {
  key: string
  label: string
  price: string
  note?: string
  badge?: string
  meta?: string
  featured?: boolean
}

function moneyToNumber(v: string) {
  const n = Number(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export default function PricingSection({
  city,
  title = 'Pricing',
  subtitle = 'All lessons are private, one-on-one, 30-minute sessions at your pool.',
}: Props) {
  const p: CityPricing = PRICING[city] || PRICING.dallas

  const pack4 = moneyToNumber(p.pack4)
  const pack8 = moneyToNumber(p.pack8)

  const items: PricingItem[] = [
    { key: 'trial', label: 'Trial Lesson', price: p.trial },
    { key: 'single', label: 'Single Lesson', price: p.single },
    {
      key: 'pack4',
      label: '4-Lesson Package',
      price: p.pack4,
      note: p.savings4,
      badge: 'Popular',
      meta: pack4 ? `$${Math.round(pack4 / 4)}/lesson` : undefined,
    },
    {
      key: 'pack8',
      label: '8-Lesson Package',
      price: p.pack8,
      note: p.savings8,
      badge: 'Best value',
      meta: pack8 ? `$${Math.round(pack8 / 8)}/lesson` : undefined,
      featured: true,
    },
  ]

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-2 text-slate-700">{subtitle}</p>
          </div>

          <div className="mt-3 inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 sm:mt-0">
            No fees • Simple packages
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => {
            const selectedClasses = it.featured
              ? 'border-sky-200 ring-1 ring-sky-100 bg-sky-50/40'
              : 'border-slate-200 bg-white'

            return (
              <div
                key={it.key}
                className={[
                  'relative h-full rounded-2xl border text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                  selectedClasses,
                  it.badge ? 'pt-12 pb-5 px-5' : 'p-5',
                  'flex flex-col', // ✅ makes footer stick
                ].join(' ')}
              >
                {it.badge ? (
                  <div className="absolute left-1/2 top-3 -translate-x-1/2">
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm',
                        it.featured ? 'bg-sky-600 text-white' : 'bg-slate-900 text-white',
                      ].join(' ')}
                    >
                      {it.badge}
                    </span>
                  </div>
                ) : null}

                {/* Content */}
                <div>
                  <div className="text-sm font-semibold text-slate-900">{it.label}</div>

                  <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{it.price}</div>

                  {/* Keep meta line height consistent */}
                  <div className="mt-1 min-h-[20px] text-sm font-medium text-slate-600">
                    {it.meta ?? '\u00A0'}
                  </div>

                  {/* Keep note area height consistent across cards */}
                  <div className="mt-3 min-h-[40px]">
                    {it.note ? (
                      <div className="flex justify-center">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-800">
                          {it.note}
                        </span>
                      </div>
                    ) : (
                      <span className="block">&nbsp;</span>
                    )}
                  </div>
                </div>

                {/* Footer pinned to bottom */}
                <div className="mt-auto pt-4 text-xs text-slate-500">
                  30 minutes • Private or small group
                </div>
              </div>
            )
          })}
        </div>

        {/* New footer line */}
        <p className="mt-4 text-xs text-slate-500">
          One trial lesson per student. Packages valid for 6 months. No additional fees.
        </p>
      </div>
    </section>
  )
}
