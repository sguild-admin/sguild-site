import FAQItem from './FAQItem'

interface FAQsProps {
  telHref: string
  smsHref: string
  mailHref: string
  phoneDisplay: string
  cityName: string
  faqItems: Array<{
    question: string
    content: React.ReactNode
  }>
  includeRates?: boolean
  rateContent?: React.ReactNode
}

export default function FAQs({
  telHref,
  smsHref,
  mailHref,
  phoneDisplay,
  cityName,
  faqItems,
  includeRates = false,
  rateContent,
}: FAQsProps) {
  return (
    <section id="faqs" className="mx-auto max-w-6xl px-4 pb-20">
      <h2 className="text-2xl md:text-3xl font-bold">Swim Lesson FAQs</h2>
      <div className="mt-4 space-y-3">
        {faqItems.map((item) => (
          <FAQItem key={item.question} question={item.question}>
            {item.content}
          </FAQItem>
        ))}

        {includeRates && (
          <div id="rates">
            <FAQItem question={"How much do lessons cost?"}>
              {rateContent}
            </FAQItem>
          </div>
        )}
      </div>
    </section>
  )
}
