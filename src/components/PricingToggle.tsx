'use client'

import React from 'react'

type City = 'dallas' | 'oahu'

type Props = {
  value: City
  onChange: (v: City) => void
}

export default function PricingToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onChange('dallas')}
        aria-pressed={value === 'dallas'}
        className={[
          'rounded-md px-3 py-1.5 text-sm font-semibold transition',
          value === 'dallas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800',
        ].join(' ')}
      >
        Dallas
      </button>
      <button
        type="button"
        onClick={() => onChange('oahu')}
        aria-pressed={value === 'oahu'}
        className={[
          'rounded-md px-3 py-1.5 text-sm font-semibold transition',
          value === 'oahu' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800',
        ].join(' ')}
      >
        Oʻahu
      </button>
    </div>
  )
}
