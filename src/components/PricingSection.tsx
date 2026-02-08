import React from 'react'
import { PRICING, CityPricing } from '../config/pricing'

type Props = {
  city: 'oahu' | 'dallas' | string
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
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {items.map((it) => {
      const surface = it.featured
        ? 'border-sky-200 ring-1 ring-sky-100 bg-sky-50/40'
        : 'border-slate-200 bg-white'

      return (
        <div
          key={it.key}
          className={[
            'relative flex h-full min-h-[240px] flex-col rounded-2xl border p-5 text-center shadow-sm',
            'transition hover:-translate-y-0.5 hover:shadow-md',
            surface,
          ].join(' ')}
        >
          {/* Badge slot (always reserved) */}
          <div className="flex h-7 items-center justify-center">
            {it.badge ? (
              <span
                className={[
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                  it.featured ? 'bg-sky-600 text-white' : 'bg-slate-900 text-white',
                ].join(' ')}
              >
                {it.badge}
              </span>
            ) : (
              <span className="invisible rounded-full px-2.5 py-1 text-xs font-semibold">
                placeholder
              </span>
            )}
          </div>

          <div className="mt-2">
            <div className="text-sm font-semibold text-slate-900">{it.label}</div>

            {/* Softer price styling */}
            <div className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
              {it.price}
            </div>

            <div className="mt-1 min-h-[20px] text-sm font-medium text-slate-600">
              {it.meta ?? '\u00A0'}
            </div>

            <div className="mt-4 min-h-[34px]">
              {it.note ? (
                <div className="flex justify-center">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800">
                    {it.note}
                  </span>
                </div>
              ) : (
                <span className="block">&nbsp;</span>
              )}
            </div>
          </div>

          <div className="mt-auto pt-5 text-xs text-slate-500">
            30 minutes • Private or small group
          </div>
        </div>
      )
    })}
  </div>
)


}
