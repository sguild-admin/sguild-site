import type { Metadata } from "next"
import FeaturableReviews from '../../components/FeaturableReviews'
import Hero from '../../components/Hero'
import FAQs from '../../components/FAQs'
import ContactCTA from '../../components/ContactCTA'
import Offerings from '../../components/Offerings'
import HowItWorks from '../../components/HowItWorks'
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
  title: "Oʻahu Mobile Swim Lessons | Private Swim Lessons in Honolulu & North Shore",
  description:
    "Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikiki, Kailua, Kaneohe, Ko Olina, and the North Shore.",
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "Oʻahu Mobile Swim Lessons | Private Swim Lessons in Honolulu & North Shore",
    description:
      "Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikiki, Kailua, Kaneohe, Ko Olina, and the North Shore.",
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
    name: "Sguild Swim Instruction - Oʻahu",
    description:
      "Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikiki, Kailua, Kaneohe, Ko Olina, and the North Shore.",
    telephone: PHONE_TEL,
    email: EMAIL,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: "Oʻahu, Hawaii",
    },
    url: PAGE_URL,
    sameAs: SOCIALS,
    serviceArea: ['Honolulu', 'Waikiki', 'Kailua', 'Kaneohe', 'Ko Olina', 'North Shore'],
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-slate-50 text-slate-800">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessStructuredData) }}
      />

      <Hero
        title={"Mobile Swim Lessons on Oʻahu"}
        subtitle={"Personalized swim instruction for kids and adults, designed to build confidence and a love of the water at your ocean spot or pool on Oʻahu."}
        ctas={[
          { label: 'Book Your First Lesson', href: '/lesson-request', variant: 'primary' },
          { label: 'See Pricing', href: '#pricing', variant: 'secondary' },
        ]}
        contactLine={
          <>
            Call or text{" "}
            <a href={smsHref} className="font-medium text-sky-700 hover:text-sky-800 hover:underline">{PHONE_DISPLAY}</a>
          </>
        }
        imageSrc={'/assets/oahuHero.png'}
        imageAlt={'Oʻahu swim lessons with Sguild Swim Instruction'}
        trustCityLabel="Oʻahu families"
        imageTagline="Confidence • Efficiency • Ocean-ready Skills"
      />

      <Offerings
        title="Swim Lessons for Every Level"
        titleSubline="Personalized instruction at your home pool"
        description="From beginners to advanced swimmers, each lesson is tailored to your goals and comfort and can be shared with others at no extra cost."
        youthLabel="For Keiki"
      />

      <PricingSection city="oahu" />

      <HowItWorks city="oahu" />

      <FAQs
        city="Oʻahu"
        phoneDisplay={PHONE_DISPLAY}
        telHref={telHref}
        smsHref={smsHref}
        requestHref={requestHref}
        serviceAreaSummary="Honolulu, Windward, and West O'ahu"
      />

      <ContactCTA city="Oʻahu" href="/lesson-request" />

      <div id="reviews">
        <FeaturableReviews />
      </div>
    </div>
  )
}


