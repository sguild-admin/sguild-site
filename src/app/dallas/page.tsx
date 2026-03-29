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

const { phoneDisplay: PHONE, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.dallas
const SITE_URL = getSiteUrl()
const PAGE_URL = `${SITE_URL}/dallas`
const SOCIALS = [
  'https://www.facebook.com/profile.php?id=61585015406844',
  'https://www.instagram.com/sguildswim/',
]

export const metadata: Metadata = {
  title: 'Dallas Mobile Swim Lessons | Home Swim Lessons in Dallas & Collin County',
  description:
    'Mobile private and small-group swim lessons in Dallas and surrounding Collin County areas. At-home and backyard pool lessons for kids and adults.',
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: 'Dallas Mobile Swim Lessons | Home Swim Lessons in Dallas & Collin County',
    description:
      'Mobile private and small-group swim lessons in Dallas and surrounding Collin County areas. At-home and backyard pool lessons for kids and adults.',
    url: PAGE_URL,
    images: [`${SITE_URL}/assets/dallasSwim.jpg`],
    type: 'website',
  },
}

export default function DallasPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const requestHref = '/lesson-request'

  const businessStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Sguild Swim Instruction - Dallas',
    description:
      'Mobile private and small-group swim lessons in Dallas and surrounding Collin County areas. At-home and backyard pool lessons for kids and adults.',
    telephone: PHONE_TEL,
    email: EMAIL,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Dallas County, Texas',
    },
    url: PAGE_URL,
    sameAs: SOCIALS,
    serviceArea: ['Dallas', 'Plano', 'Frisco', 'Prosper', 'McKinney', 'Allen', 'Richardson', 'Garland'],
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-white text-slate-800">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessStructuredData) }}
      />

      <Hero
        title={'Mobile Swim Lessons in Dallas'}
        subtitle={'Personalized swim instruction for kids and adults, focused on confidence, safety, and technique. One price per 30-minute lesson for private or small-group sessions.'}
        ctas={[
          { label: 'Check Availability', href: '/lesson-request', variant: 'primary' },
          { label: PHONE, href: telHref, variant: 'secondary' },
          { label: 'See Pricing', href: '#pricing', variant: 'secondary' },
        ]}
        imageSrc={'/assets/dallasHero.png'}
        imageAlt={'Backyard swim lessons in Dallas'}
        trustCityLabel="Dallas families"
      />

      <Offerings
        title="Swim Lessons for Every Level"
        titleSubline="Personalized instruction at your home pool"
        description="From beginners to advanced swimmers, each lesson is tailored to your goals and comfort and can be shared with others at no extra cost."
        youthLabel="For Kids"
      />

      <PricingSection city="dallas" />

      <ServiceArea city="dallas" title="Where we teach" />

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence and strong
            technique. In Dallas, our team brings a wide variety of classes to your pool - tailored to meet every
            need and level.
          </p>
        </div>
      </section>

      <FAQs
        city="Dallas"
        phoneDisplay={PHONE}
        telHref={telHref}
        smsHref={smsHref}
        requestHref={requestHref}
        includeOcean={false}
      />

      <ContactCTA city="Dallas" href="/lesson-request" />
      <FeaturableReviews />
    </div>
  )
}

