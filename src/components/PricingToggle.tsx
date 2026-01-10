"use client"
import React from 'react'

type Props = {
  value: 'dallas' | 'oahu' | 'perth'
  onChange: (v: 'dallas' | 'oahu' | 'perth') => void
}

export default function PricingToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onChange('dallas')}
        className={`px-4 py-2 rounded-lg ${value === 'dallas' ? 'bg-white shadow' : 'text-slate-600'}`}
      >
        Dallas
      </button>
      <button
        type="button"
        onClick={() => onChange('oahu')}
        className={`px-4 py-2 rounded-lg ${value === 'oahu' ? 'bg-white shadow' : 'text-slate-600'}`}
      >
        Oʻahu
      </button>
      <button
        type="button"
        onClick={() => onChange('perth')}
        className={`px-4 py-2 rounded-lg ${value === 'perth' ? 'bg-white shadow' : 'text-slate-600'}`}
      >
        Perth
      </button>
    </div>
  )
}
