import Button from '../../../components/Button'
import NextImage from '../../../components/NextImage'
import PageContainer from '../../../components/PageContainer'
import FAQItem from '../../../components/FAQItem'
import ContactCard from '../../../components/ContactCard'
import { CONTACTS } from '../../../config/contact'

const { phoneDisplay: PHONE, phoneTel: PHONE_TEL, email: EMAIL } = CONTACTS.dallas

// -----------------------------------------------------------------------------
// Dallas Contact Page — Stabilized build (no arbitrary Tailwind classes)
export default function DallasContactPage() {
  const telHref = `tel:${PHONE_TEL}`
  const smsHref = `sms:${PHONE_TEL}`
  const mailHref = `mailto:${EMAIL}`

  return (
    <PageContainer>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-sky-100 to-transparent" />
          <div className="absolute left-0 top-0 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 items-center gap-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Contact — Dallas</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              Ready to book at‑home swim lessons in Dallas or Collin County? Reach out and we’ll get you scheduled.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href={telHref} variant="primary">Call Now</Button>
              <Button href={smsHref} variant="secondary">Text Us</Button>
              <Button href={mailHref} variant="secondary">Email</Button>
            </div>
            <div className="mt-6 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Helpful details to include</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                <li>Address or ZIP (to confirm travel)</li>
                <li>Swimmer age(s) & current comfort level</li>
                <li>Goals (water‑comfort, stroke work, triathlon, etc.)</li>
                <li>Preferred days & times</li>
              </ul>
            </div>
          </div>

          <div className="relative">
            <div className="w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-slate-200 relative" style={{ aspectRatio: '4 / 3' }}>
              <NextImage src="/assets/contact.JPG" alt="Dallas backyard swim lesson" className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white/80 backdrop-blur rounded-2xl px-4 py-3 shadow ring-1 ring-slate-200">
              <p className="text-sm font-medium">Flexible scheduling • Home pools • Water safety</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-bold">Ways to reach us</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <ContactCard
            title="Call"
            description="Fastest for quick questions and immediate booking."
            href={telHref}
            btnLabel={PHONE}
            variant="primary"
          />

          <ContactCard
            title="Text"
            description="Great for sharing names, ages, and scheduling preferences."
            href={smsHref}
            btnLabel="Text us"
            variant="secondary"
          />

          <ContactCard
            title="Email"
            description="We typically reply the same day."
            href={mailHref}
            btnLabel={EMAIL}
            variant="secondary"
          />
        </div>
      </section>

      {/* Service Area */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold">Dallas service area</h2>
          <p className="mt-2 text-slate-700">Dallas • Plano • Frisco • McKinney • Prosper • Garland • Allen • Richardson • Addison • University Park • Highland Park</p>
        </div>
      </section>

      {/* FAQs (brief) */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold">FAQs</h2>
        <div className="mt-4 space-y-3">
          <FAQItem question={"How do I book?"}>
            Call or text with your ZIP, swimmer age(s), goals, and preferred days. We’ll confirm availability and get you scheduled.
          </FAQItem>

          <FAQItem question={"Where do you teach?"}>
            We travel to your pool across Dallas and Collin counties.
          </FAQItem>

          <FAQItem question={"Do you offer group lessons?"}>
            Yes — additional students can join the same 30‑minute lesson at no extra charge.
          </FAQItem>
        </div>
      </section>
      
    </PageContainer>
  )
}
 
