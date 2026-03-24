
import Link from 'next/link'
import Head from 'next/head'
import SEO from '../../components/SEO'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import FAQs from '../../components/FAQs'
import ContactCTA from '../../components/ContactCTA'
import Offerings from '../../components/Offerings'
import ServiceArea from '../../components/ServiceArea'
import PricingSection from '../../components/PricingSection'
import { CONTACTS } from '../../config/contact'

const { phoneDisplay: PHONE_DISPLAY, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.oahu

export default function OahuPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const requestHref = '/lesson-request'

  // ---- Structured Data (SEO) ----
  const businessStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Sguild Swim Instruction - Oʻahu',
    description:
      'Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikīkī, Kailua, Kāneʻohe, Ko Olina, and the North Shore.',
    telephone: PHONE_TEL,
    email: EMAIL,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Oʻahu, Hawaii',
    },
    url: 'https://sguildswim.com/oahu',
    sameAs: [
      // add socials here if/when you have them
    ],
    serviceArea: [
      'Honolulu',
      'Waikīkī',
      'Kailua',
      'Kāneʻohe',
      'Ko Olina',
      'North Shore',
    ],
  }

  

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-white text-slate-800">
      <SEO
        title={"Oʻahu Mobile Swim Lessons | Private Swim Lessons in Honolulu & North Shore"}
        description={"Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikīkī, Kailua, Kāneʻohe, Ko Olina, and the North Shore."}
        url={'https://sguildswim.com/oahu'}
        image={'https://sguildswim.com/assets/oahuHero.png'}
        ldJson={[businessStructuredData]}
      />

      

      <Hero
        title={"Oʻahu Mobile Swim Lessons"}
        subtitle={"At-home private and small-group swim instruction across Oʻahu. We come to you, ocean or pool."}
        ctas={[
          { label: 'Book Lessons', href: '/lesson-request', variant: 'primary' },
          { label: PHONE_DISPLAY, href: telHref, variant: 'secondary' },
          { label: 'View Pricing', href: '#pricing', variant: 'secondary' },
        ]}
        imageSrc={'/assets/oahuHero.png'}
        imageAlt={'Oahu swim lessons with Sguild Swim Instruction'}
        blockquote={"Fitness is what happens when practicing proper technique"}
      />




      {/* Offerings */}
      <Offerings 
        title="What we offer on Oʻahu"
        description="All lessons are 30 minutes and take place at your home, condo, or an arranged ocean location. Choose the option that best fits your swimmer's goals."
      />
      {/* Pricing */}
      <PricingSection city="oahu" />

      <ServiceArea city="oahu" />

      {/* About */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim Instruction</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence
            and strong technique. On Oʻahu, our experienced instructors bring <strong>at-home swim lessons</strong>{' '}
            and ocean sessions directly to you, tailoring each class to your swimmer&apos;s age, goals, and comfort
            level.
          </p>
        </div>
      </section>

      <FAQs
        city="Oʻahu"
        phoneDisplay={PHONE_DISPLAY}
        telHref={telHref}
        smsHref={smsHref}
        requestHref={requestHref}
      />

      <ContactCTA city="Oʻahu" href="/lesson-request" />

      {/* Reviews */}
      <div id="reviews">
        <FeaturableReviews />
      </div>

      
    </div>
  )
}
