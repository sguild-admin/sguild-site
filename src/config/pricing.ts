export type CityPricing = {
  trial: string
  single: string
  pack4: string
  pack8: string
  savings4?: string
  savings8?: string
}

export type DallasLessonLength = 'standard' | 'compact'

export const PRICING: Record<string, CityPricing> = {
  oahu: {
    trial: '$55',
    single: '$65',
    pack4: '$240',
    pack8: '$440',
    savings4: 'Save $40',
    savings8: 'Save $120',
  },
  dallas: {
    trial: '$50',
    single: '$60',
    pack4: '$220',
    pack8: '$400',
    savings4: 'Save $40',
    savings8: 'Save $120',
  },
}

export const DALLAS_LESSON_LENGTH_PRICING: Record<DallasLessonLength, CityPricing> = {
  standard: PRICING.dallas,
  compact: {
    trial: '$30',
    single: '$40',
    pack4: '$150',
    pack8: '$280',
  },
}

export default PRICING
