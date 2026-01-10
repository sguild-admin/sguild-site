import React from 'react'
import Pricing from './Pricing'
import { PRICING, CityPricing } from '../config/pricing'

type Props = {
  city: 'oahu' | 'dallas' | string
  title?: string
}

export default function PricingSection({ city, title = 'Pricing' }: Props) {
  const p: CityPricing = PRICING[city] || PRICING.dallas

  const items = [
    { label: 'Trial Lesson', price: p.trial },
    { label: 'Single Lesson', price: p.single },
    { label: '4-Lesson Package', price: p.pack4, note: p.savings4 },
    { label: '8-Lesson Package', price: p.pack8, note: p.savings8 },
  ]

  return <Pricing title={title} description={'All lessons are private, one-on-one, 30-minute sessions at your pool.'} items={items} />
}
