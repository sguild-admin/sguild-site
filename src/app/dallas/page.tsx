'use client'
import Script from 'next/script'
import React, { useEffect } from 'react'
import Link from 'next/link'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import SEO from '../../components/SEO'
import FAQs from '../../components/FAQs'
import ContactCTA from '../../components/ContactCTA'
import Offerings from '../../components/Offerings'
import ServiceArea from '../../components/ServiceArea'
import PricingSection from '../../components/PricingSection'
import { CONTACTS } from '../../config/contact'


const { phoneDisplay: PHONE, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.dallas

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
    url: 'https://sguildswim.com/dallas',
    sameAs: [],
    serviceArea: [
      'Dallas',
      'Plano',
      'Frisco',
      'Prosper',
      'McKinney',
      'Allen',
      'Richardson',
      'Garland',
    ],
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 to-white text-slate-800">
      <SEO
        title={"Dallas Mobile Swim Lessons | Home Swim Lessons in Dallas & Collin County"}
        description={"Mobile private and small-group swim lessons in Dallas and surrounding Collin County areas. At-home and backyard pool lessons for kids and adults."}
        url={'https://sguildswim.com/dallas'}
        image={'https://sguildswim.com/assets/dallasSwim.jpg'}
        ldJson={[businessStructuredData]}
      />
      

      <Hero
        title={"Dallas Mobile Swim Lessons"}
        subtitle={<>
            Private swim lessons at your home across Dallas &amp; Collin County.
            <br />
            We come to your pool.
          </>}
        ctas={[
          { label: 'Book Lessons', href: '/lesson-request', variant: 'primary' },
          { label: PHONE, href: telHref, variant: 'secondary' },
          { label: 'View Pricing', href: '#pricing', variant: 'secondary' },
        ]}
        imageSrc={'/assets/dallasHero.png'}
        imageAlt={'Backyard swim lessons in Dallas'}
          blockquote={"Fitness is what happens when practicing proper technique"}
        />

      {/* Offerings */}
      <Offerings 
        title="What we offer in Dallas"
        description="All lessons are 30 minutes and take place at your home, condo, or community pool. Choose the option that best fits your swimmer's goals."
      />



      {/* Pricing */}
      <PricingSection city="dallas" />


      <ServiceArea city="dallas" title="Where we teach" />

      {/* About */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">About Sguild Swim</h2>
          <p className="mt-2 text-slate-700">
            Sguild Swim is a mobile swim school dedicated to helping swimmers of all ages build confidence and strong technique.
            In Dallas, our team brings a wide variety of classes to your pool - tailored to meet every need and level.
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
{/* Reviews */}
<FeaturableReviews />
      
    </div>
  )
}


