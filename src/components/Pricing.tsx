import React from 'react'

type PriceItem = {
  label: string
  price: string
  note?: string
}

interface Props {
  title?: string
  description: string
  items: PriceItem[]
}

export default function Pricing({ title = 'Pricing', description, items }: Props) {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-slate-700">{description}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="rounded-xl bg-slate-50 p-4 text-center ring-1 ring-slate-100">
              <div className="text-sm font-medium text-slate-700">{it.label}</div>
              <div className="mt-2 text-xl font-extrabold text-slate-900">{it.price}</div>
              {it.note ? <div className="mt-1 text-sm text-slate-600">{it.note}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
