import React from 'react'
import FAQItem from './FAQItem'

type Props = {
  city: string
  phoneDisplay: string
  telHref: string
  smsHref: string
  requestHref: string
  includeOcean?: boolean
}

export default function FAQs({ city, phoneDisplay, telHref, smsHref, requestHref, includeOcean = true }: Props) {
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

        <FAQItem question={`Can siblings or friends share a lesson?`}>
          Yes. Lessons are priced per session, not per swimmer, so siblings and friends are welcome to join at no extra charge. It is a great fit for kids at similar levels or adults learning together.
        </FAQItem>

        <FAQItem question={`How do I book?`}>
          <p className="mt-0 text-sm text-slate-700">Call, text, or submit a lesson request and we&apos;ll help you schedule your {cityDisplay} swim lessons.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <a href={telHref} className="rounded-full bg-sky-600 px-3 py-1.5 text-white">{phoneDisplay}</a>
            <a href={smsHref} className="rounded-full border border-slate-300 px-3 py-1.5">Text</a>
            <a href={requestHref} className="rounded-full border border-slate-300 px-3 py-1.5">Check Availability</a>
          </div>
        </FAQItem>
      </div>
    </section>
  )
}
