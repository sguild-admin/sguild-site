import React from 'react'
import FAQItem from './FAQItem'

type Props = {
  city: string
  phoneDisplay: string
  telHref: string
  smsHref: string
  requestHref: string
  includeOcean?: boolean
  serviceAreaSummary?: string
}

export default function FAQs({ city, phoneDisplay, telHref, smsHref, requestHref, includeOcean = true, serviceAreaSummary }: Props) {
  const cityDisplay = city
  const areaSentence = serviceAreaSummary ? ` We currently serve ${serviceAreaSummary}.` : ''
  const locationText = includeOcean
    ? `We are a mobile, at-home swim school in ${cityDisplay}. Our instructors come to your home or condo pool, and for confident swimmers we can also coach at approved ocean locations.${areaSentence}`
    : `We are an at-home swim school in ${cityDisplay}. Our instructors come to your home, condo, or community pool.${areaSentence}`

  return (
    <section id="faqs" className="mx-auto max-w-6xl px-4 pt-10 pb-10">
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
          <p className="mt-0 text-slate-700">Call, text, or submit a lesson request and we&apos;ll help you schedule your {cityDisplay} swim lessons.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={requestHref} className="inline-flex items-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95">Submit Request</a>
            <a href={telHref} className="inline-flex items-center rounded-xl border-[0.4px] border-slate-200/45 bg-white/90 px-4 py-2 font-sf-pro text-[1rem] font-medium text-sky-700 shadow-[0_2px_6px_rgba(15,23,42,0.08)] hover:bg-white">{phoneDisplay}</a>
            <a href={smsHref} className="inline-flex items-center rounded-xl border-[0.4px] border-slate-200/45 bg-white/90 px-4 py-2 font-sf-pro text-[1rem] font-medium text-sky-700 shadow-[0_2px_6px_rgba(15,23,42,0.08)] hover:bg-white">Text</a>
          </div>
        </FAQItem>
      </div>

    </section>
  )
}
