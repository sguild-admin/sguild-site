import React from 'react'
import FAQItem from './FAQItem'

type Props = {
  city: string
  phoneDisplay: string
  telHref: string
  smsHref: string
  mailHref: string
  includeOcean?: boolean
}

export default function FAQs({ city, phoneDisplay, telHref, smsHref, mailHref, includeOcean = true }: Props) {
  const cityDisplay = city
  const locationText = includeOcean
    ? `We are an at-home swim school in ${cityDisplay}. Our instructors come to your home pool, condo pool, or, for confident swimmers, an arranged ocean or outdoor location.`
    : `We are an at-home swim school in ${cityDisplay}. Our instructors come to your home, condo, or community pool.`

  return (
    <section id="faqs" className="mx-auto max-w-6xl px-4 pb-20">
      <h2 className="text-2xl md:text-3xl font-bold">Swim Lesson FAQs</h2>
      <div className="mt-4 space-y-3">
        <FAQItem question={`Where are you located?`}>
          {locationText}
        </FAQItem>

        <FAQItem question={`What ages do you teach?`}>
          We offer lessons for ages <span className="font-medium">2 through adult</span>, from water-shy beginners to advanced swimmers.
        </FAQItem>

        <FAQItem question={`How long is a lesson?`}>
          Each session is <span className="font-medium">30 minutes</span>. Lessons are focused and efficient so swimmers stay engaged while building real skills and confidence.
        </FAQItem>

        <FAQItem question={`How do I book?`}>
          <p className="mt-0 text-sm text-slate-700">Call, text, or email us and we&apos;ll help you schedule your {cityDisplay} swim lessons.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">{phoneDisplay}</a>
            <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">Text</a>
            <a href={mailHref} className="rounded-full border border-slate-300 px-3 py-1.5">Email</a>
          </div>
        </FAQItem>

        <div id="rates">
          <FAQItem question={`How much do lessons cost?`}>
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
              <li><strong>Private Lessons:</strong> $35 per 30-minute session</li>
              <li><strong>Semi-Private Lessons:</strong> $20 per student per 30-minute session (2 students)</li>
              <li><strong>Group Lessons:</strong> $15 per student per 30-minute session (3+ students)</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">*A $20 mobile service fee applies per visit.</p>
          </FAQItem>
        </div>
      </div>
    </section>
  )
}
