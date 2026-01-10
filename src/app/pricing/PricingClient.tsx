"use client"
import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageContainer from '../../components/PageContainer'
import PricingSection from '../../components/PricingSection'
import PricingToggle from '../../components/PricingToggle'
import Link from 'next/link'

export default function PricingClient() {
  const params = useSearchParams()
  const qCity = params?.get('city')
  const defaultCity = qCity === 'oahu' ? 'oahu' : qCity === 'perth' ? 'perth' : 'dallas'

  const [city, setCity] = useState<'dallas' | 'oahu' | 'perth'>(defaultCity as 'dallas' | 'oahu' | 'perth')

  useEffect(() => {
    if (qCity === 'oahu' && city !== 'oahu') setCity('oahu')
    if (qCity === 'dallas' && city !== 'dallas') setCity('dallas')
    if (qCity === 'perth' && city !== 'perth') setCity('perth')
  }, [qCity])

  return (
    <PageContainer>
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-slate-700">Simple pricing. No fees.</p>

        <div className="mt-6">
          <PricingToggle value={city} onChange={(v) => setCity(v)} />
        </div>

        <div className="mt-6">
          <PricingSection city={city} />
        </div>

        <div className="mt-4 text-sm">
          {city === 'dallas' ? (
            <Link href={'/pricing?city=oahu'} className="text-sky-600">View Oʻahu pricing</Link>
          ) : (
            <Link href={'/pricing?city=dallas'} className="text-sky-600">View Dallas pricing</Link>
          )}
        </div>
      </section>
    </PageContainer>
  )
}
