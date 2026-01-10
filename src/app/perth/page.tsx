import Link from 'next/link'
import Head from 'next/head'
import SEO from '../../components/SEO'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import FAQs from '../../components/FAQs'
import Offerings from '../../components/Offerings'
import ServiceArea from '../../components/ServiceArea'
import ContactCTA from '../../components/ContactCTA'
import PricingSection from '../../components/PricingSection'
import { CONTACTS } from '../../config/contact'

const { phoneDisplay: PHONE_DISPLAY, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.perth

export default function PerthPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const mailHref = `mailto:${EMAIL}`

  const businessStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Sguild Swim Instruction - Perth',
    description:
      'Mobile private and small-group swim lessons in Perth. At-home and community pool lessons for kids and adults.',
    telephone: PHONE_TEL,
    email: EMAIL,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: 'Perth, Western Australia',
    },
    url: 'https://sguildswim.com/perth',
    sameAs: [],
    serviceArea: [
      'Perth',
      'Fremantle',
      'Cottesloe',
      'Subiaco',
    ],
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-white text-slate-800">
      <SEO
        title={"Perth Swim Lessons | Mobile Private Swim Lessons in Perth"}
        description={"Mobile private and small-group swim lessons in Perth. At-home and community pool lessons for kids and adults."}
        url={'https://sguildswim.com/perth'}
        image={'https://sguildswim.com/assets/Perth.png'}
        ldJson={[businessStructuredData]}
      />

      <Hero
        title={"Perth Mobile Swim Lessons"}
        subtitle={"At-home private and small-group swim instruction across Perth. We come to you, home or community pool."}
        ctas={[
          { label: PHONE_DISPLAY || 'Call', href: telHref, variant: 'primary' },
          { label: 'Text Us', href: smsHref, variant: 'primary' },
          { label: 'View Pricing', href: '#pricing', variant: 'secondary' },
        ]}
        imageSrc={'/assets/perthHero.png'}
        imageAlt={'Perth swim lessons with Sguild Swim Instruction'}
        blockquote={"Fitness is what happens when practicing proper technique"}
      />

      <Offerings 
        title="What we offer in Perth"
        description="All lessons are 30 minutes and take place at your home, condo, or community pool. Choose the option that best fits your swimmer's goals."
      />

      <PricingSection city="perth" />

      <ServiceArea city="perth" />

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim Instruction</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence and strong technique. In Perth, our experienced instructors bring at-home and community pool sessions directly to you.
          </p>
        </div>
      </section>

      <FAQs
        city="Perth"
        phoneDisplay={PHONE_DISPLAY}
        telHref={telHref}
        smsHref={smsHref}
        mailHref={mailHref}
      />

      <ContactCTA city="Perth" href="/perth/contact" />

      <div id="reviews">
        <FeaturableReviews />
      </div>
    </div>
  )
}
