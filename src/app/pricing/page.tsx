import React from 'react'
import PricingShell from './PricingShell'

export default function PricingPage() {
  return (
    <React.Suspense fallback={<div className="py-12 text-center">Loading pricing…</div>}>
      <PricingShell />
    </React.Suspense>
  )
}
