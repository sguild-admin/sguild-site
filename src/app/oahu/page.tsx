'use client'
import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import FeaturableReviews from '../../components/FeaturableReviews'

const PHONE_DISPLAY = '(808) 201-0147'
const PHONE_TEL = '+18082010147'
const EMAIL = 'info@sguildswim.com'

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
      <Head>
        <title>
          Oʻahu Swim Lessons | Mobile Private Swim Lessons in Honolulu &amp; North Shore
        </title>
        <meta
          name="description"
          content="Mobile private and small-group swim lessons on Oʻahu. At-home and ocean swim lessons for kids and adults in Honolulu, Waikīkī, Kailua, Kāneʻohe, Ko Olina, and the North Shore."
        />
        <link rel="canonical" href="https://sguildswim.com/oahu" />
        <meta property="og:title" content="Oʻahu Swim Lessons | Sguild Swim Instruction" />
        <meta
          property="og:description"
          content="Certified mobile swim instructors offering private, semi-private, and group swim lessons across Oʻahu. We come to your home pool or the ocean."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sguildswim.com/oahu" />
        <meta property="og:image" content="https://sguildswim.com/assets/oceanSwim.jpg" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(businessStructuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
        />
      </Head>

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-slate-200/50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Sguild Swim Instruction home">
            <img
              src="/assets/logo-graphic.png"
              alt="Sguild Swim Instruction logo"
              className="h-9 w-auto"
            />
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Sguild <span className="text-slate-500">Swim Instruction</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="hover:text-sky-700">
              Locations
            </Link>
            <Link href="/oahu/contact" className="hover:text-sky-700">
              Contact
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-sky-100 to-transparent" />
          <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 items-center gap-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
              Oʻahu Swim Lessons
            </h1>

            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              At-home private and small-group swim instruction across Oʻahu. We come to you, ocean or pool.
            </p>

            <blockquote className="mt-4 rounded-xl bg-white/70 p-4 text-slate-700 ring-1 ring-slate-200 italic">
              “Fitness is what happens when practicing proper technique”
            </blockquote>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={telHref}
                className="inline-flex items-center rounded-2xl bg-sky-600 px-5 py-3 text-white shadow hover:bg-sky-700"
              >
                {PHONE_DISPLAY}
              </a>
              <a
                href={smsHref}
                className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50"
              >
                Text Us
              </a>
              <a
                href={mailHref}
                className="inline-flex items-center rounded-2xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50"
              >
                Email
              </a>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Text or call now to book your lesson
            </p>
          </div>

          <div className="relative">
            <div
              className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200"
              style={{ aspectRatio: '4 / 3' }}
            >
              <img
                src="/assets/oceanSwim.jpg"
                alt="Ocean swim lessons on Oʻahu with Sguild Swim Instruction"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200">
              <p className="text-sm font-medium">
                Mobile instructors • Home pools • Ocean safety
              </p>
            </div>
          </div>
        </div>
      </section>




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
          {/* Location */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              Where are you located?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              We are an at-home swim school on Oʻahu. Our instructors come to your home pool, condo pool, or,
              for confident swimmers, an arranged ocean location around the island.
            </p>
          </details>

          {/* Ages */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              What ages do you teach?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              We offer Oʻahu swim lessons for ages <span className="font-medium">2 through adult</span>, from
              water-shy beginners to advanced swimmers.
            </p>
          </details>

          {/* Lesson Length */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How long is a lesson?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              Each session is <span className="font-medium">30 minutes</span>. Lessons are focused and
              efficient so swimmers stay engaged while building real skills and confidence.
            </p>
          </details>

          {/* Booking */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How do I book?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>
            <p className="mt-3 text-sm text-slate-700">
              Call, text, or email us and we&apos;ll help you schedule your Oʻahu swim lessons.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">
                {PHONE_DISPLAY}
              </a>
              <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">
                Text
              </a>
              <a href={mailHref} className="rounded-full border border-slate-300 px-3 py-1.5">
                Email
              </a>
            </div>
          </details>

          {/* Pricing */}
          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
              How much do lessons cost?
              <span className="ml-3 text-slate-400 transition">▾</span>
            </summary>

            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
              <li>
                <strong>Private Lessons:</strong> $35 per 30-minute session
              </li>
              <li>
                <strong>Semi-Private Lessons:</strong> $20 per student per 30-minute session (2 students)
              </li>
              <li>
                <strong>Group Lessons:</strong> $15 per student per 30-minute session (3+ students)
              </li>
            </ul>

            <p className="mt-3 text-xs text-slate-500">
              *A $20 mobile service fee applies per visit.
            </p>
          </details>
        </div>
      </section>

      {/* Reviews */}
      <FeaturableReviews />

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white/70">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-600 flex flex-col md:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Sguild LLC – Oʻahu</p>
          <div className="flex items-center gap-5">
            <Link href="/oahu/contact" className="hover:text-slate-800">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
