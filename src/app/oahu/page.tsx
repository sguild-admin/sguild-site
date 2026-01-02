
import Link from 'next/link'
import Head from 'next/head'
import SEO from '../../components/SEO'
import FeaturableReviews from '../../components/FeaturableReviews'
import PageContainer from '../../components/PageContainer'
import Hero from '../../components/Hero'
import FAQItem from '../../components/FAQItem'
import { CONTACTS } from '../../config/contact'

const { phoneDisplay: PHONE_DISPLAY, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.oahu

export default function OahuPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const mailHref = `mailto:${EMAIL}`

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

  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Where are you located on Oʻahu?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We are a mobile, at-home swim school on Oʻahu. We come to you at your home pool, condo pool, or an arranged ocean location for confident swimmers.',
        },
      },
      {
        '@type': 'Question',
        name: 'What ages do you teach in your Oʻahu swim lessons?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We offer lessons for ages 2 through adult, including beginner, intermediate, and advanced swimmers.',
        },
      },
      {
        '@type': 'Question',
        name: 'How long is a swim lesson on Oʻahu?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Each swim lesson is 30 minutes long. Sessions are focused and efficient so swimmers stay engaged and build real skills and confidence.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I book Oʻahu swim lessons?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can call, text, or email us to schedule swim lessons on Oʻahu. We will help you choose times and lesson types that fit your needs.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much do Oʻahu swim lessons cost?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Private lessons are $35 per 30-minute session. Semi-private lessons are $20 per student (2 students), and group lessons are $15 per student (3 or more students). A $20 mobile service fee applies per visit.',
        },
      },
    ],
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800">
      <SEO
        title={"Oʻahu Swim Lessons | Mobile Private Swim Lessons in Honolulu & North Shore"}
        description={"Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikīkī, Kailua, Kāneʻohe, Ko Olina, and the North Shore."}
        url={'https://sguildswim.com/oahu'}
        image={'https://sguildswim.com/assets/oceanSwim.jpg'}
        ldJson={[businessStructuredData, faqStructuredData]}
      />

      

      <Hero
        title={"Oʻahu Swim Lessons"}
        subtitle={"At-home private and small-group swim instruction across Oʻahu. We come to you, ocean or pool."}
        ctas={[
          { label: PHONE_DISPLAY, href: telHref, variant: 'primary' },
          { label: 'Text Us', href: smsHref },
          { label: 'Email', href: mailHref },
        ]}
        imageSrc={'/assets/oceanSwim.jpg'}
        imageAlt={'Ocean swim lessons on Oʻahu with Sguild Swim Instruction'}
        blockquote={"Fitness is what happens when practicing proper technique"}
      />




      {/* Offerings */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-bold">
          What we offer on Oʻahu
        </h2>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">
          All lessons are 30 minutes and take place at your home, condo, or an arranged ocean location.
          Choose the option that best fits your swimmer&apos;s goals.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Private Lessons',
              body:
                'One-on-one Oʻahu swim lessons with a Sguild instructor for maximum focus and progress. Ideal for keiki or adults who want personalized attention and faster results.',
            },
            {
              title: 'Semi-Private Lessons',
              body:
                'Share a lesson with a sibling or friend of similar level. Semi-private lessons make swim instruction more affordable while keeping groups small and focused.',
            },
            {
              title: 'Group Lessons',
              body:
                'Perfect for families, neighbors, or friends (3+ swimmers). Build skills together in a fun, supportive atmosphere while learning essential water safety.',
            },
            {
              title: 'Adult Swim Lessons',
              body:
                'From first-time swimmers to triathlon prep, our adult lessons focus on comfort, efficiency, and technique in the pool or ocean.',
            },
            {
              title: 'Ocean Safety & Skills',
              body:
                'For confident swimmers, we offer sessions that focus on navigating waves, currents, and open-water safety around Oʻahu.',
            },
            {
              title: 'Technique & Stroke Development',
              body:
                'Refine freestyle, backstroke, breaststroke, or butterfly with drills that build long-lasting technique and confidence.',
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-700">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Coverage */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold">Where we teach</h2>
          <p className="mt-2 text-slate-700">
            We offer mobile swim lessons across:
          </p>
          <p className="mt-1 text-slate-700">
            Honolulu • Waikīkī • Kailua • Kāneʻohe • Ko Olina • Ewa Beach • Mililani •
            North Shore (Haleʻiwa) • and nearby areas
          </p>
        </div>
      </section>

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

      {/* FAQs */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold">Swim Lesson FAQs</h2>
        <div className="mt-4 space-y-3">
          <FAQItem question={"Where are you located?"}>
            We are an at-home swim school on Oʻahu. Our instructors come to your home pool, condo pool, or, for confident swimmers, an arranged ocean location around the island.
          </FAQItem>

          <FAQItem question={"What ages do you teach?"}>
            We offer Oʻahu swim lessons for ages <span className="font-medium">2 through adult</span>, from water-shy beginners to advanced swimmers.
          </FAQItem>

          <FAQItem question={"How long is a lesson?"}>
            Each session is <span className="font-medium">30 minutes</span>. Lessons are focused and efficient so swimmers stay engaged while building real skills and confidence.
          </FAQItem>

          <FAQItem question={"How do I book?"}>
            <p className="mt-0 text-sm text-slate-700">Call, text, or email us and we&apos;ll help you schedule your Oʻahu swim lessons.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">{PHONE_DISPLAY}</a>
              <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">Text</a>
              <a href={mailHref} className="rounded-full border border-slate-300 px-3 py-1.5">Email</a>
            </div>
          </FAQItem>

          <FAQItem question={"How much do lessons cost?"}>
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
              <li><strong>Private Lessons:</strong> $35 per 30-minute session</li>
              <li><strong>Semi-Private Lessons:</strong> $20 per student per 30-minute session (2 students)</li>
              <li><strong>Group Lessons:</strong> $15 per student per 30-minute session (3+ students)</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">*A $20 mobile service fee applies per visit.</p>
          </FAQItem>
        </div>
      </section>

      {/* Reviews */}
      <FeaturableReviews />

      
    </div>
  )
}
