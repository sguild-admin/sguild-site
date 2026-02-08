import React from 'react'
import PricingClient from './PricingClient'

export default function PricingPage() {
  return (
    <React.Suspense fallback={<div className="py-12 text-center">Loading pricing…</div>}>
      <PricingClient />
    </React.Suspense>
  )
}
