import type { Metadata } from "next"
import FeaturableReviews from '../../components/FeaturableReviews'
import Hero from '../../components/Hero'
import FAQs from '../../components/FAQs'
import ContactCTA from '../../components/ContactCTA'
import Offerings from '../../components/Offerings'
import ServiceArea from '../../components/ServiceArea'
import PricingSection from '../../components/PricingSection'
import { CONTACTS } from '../../config/contact'
import { getSiteUrl } from '@/lib/blog'

const { phoneDisplay: PHONE_DISPLAY, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.oahu
const SITE_URL = getSiteUrl()
const PAGE_URL = `${SITE_URL}/oahu`
const SOCIALS = [
  'https://www.facebook.com/profile.php?id=61585015406844',
  'https://www.instagram.com/sguildswim/',
]

export const metadata: Metadata = {
  title: "O'ahu Mobile Swim Lessons | Private Swim Lessons in Honolulu & North Shore",
  description:
    "Mobile private and small-group swim lessons on O'ahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikiki, Kailua, Kaneohe, Ko Olina, and the North Shore.",
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "O'ahu Mobile Swim Lessons | Private Swim Lessons in Honolulu & North Shore",
    description:
      "Mobile private and small-group swim lessons on O'ahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikiki, Kailua, Kaneohe, Ko Olina, and the North Shore.",
    url: PAGE_URL,
    images: [`${SITE_URL}/assets/oahuHero.png`],
    type: 'website',
  },
}

export default function OahuPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const requestHref = '/lesson-request'

  const businessStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: "Sguild Swim Instruction - O'ahu",
    description:
      "Mobile private and small-group swim lessons on O'ahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikiki, Kailua, Kaneohe, Ko Olina, and the North Shore.",
    telephone: PHONE_TEL,
    email: EMAIL,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: "O'ahu, Hawaii",
    },
    url: PAGE_URL,
    sameAs: SOCIALS,
    serviceArea: ['Honolulu', 'Waikiki', 'Kailua', 'Kaneohe', 'Ko Olina', 'North Shore'],
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-white text-slate-800">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessStructuredData) }}
      />

      <Hero
        title={"O'ahu Mobile Swim Lessons"}
        subtitle={"At-home private and small-group swim instruction across O'ahu. We come to you, ocean or pool."}
        ctas={[
          { label: 'Book Lessons', href: '/lesson-request', variant: 'primary' },
          { label: PHONE_DISPLAY, href: telHref, variant: 'secondary' },
          { label: 'View Pricing', href: '#pricing', variant: 'secondary' },
        ]}
        imageSrc={'/assets/oahuHero.png'}
        imageAlt={'Oahu swim lessons with Sguild Swim Instruction'}
        blockquote={"Fitness is what happens when practicing proper technique"}
      />

      <Offerings
        title="What we offer on O'ahu"
        description="All lessons are 30 minutes and take place at your home, condo, or an arranged ocean location. Choose the option that best fits your swimmer's goals."
      />

      <PricingSection city="oahu" />

      <ServiceArea city="oahu" />

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim Instruction</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence and strong
            technique. On O'ahu, our experienced instructors bring <strong>at-home swim lessons</strong> and ocean
            sessions directly to you, tailoring each class to your swimmer's age, goals, and comfort level.
          </p>
        </div>
      </section>

      <FAQs
        city="O'ahu"
        phoneDisplay={PHONE_DISPLAY}
        telHref={telHref}
        smsHref={smsHref}
        requestHref={requestHref}
      />

      <ContactCTA city="O'ahu" href="/lesson-request" />

      <div id="reviews">
        <FeaturableReviews />
      </div>
    </div>
  )
}
