import Link from 'next/link'

type Props = {
  city: string
  href: string
  ariaLabel?: string
}

export default function ContactCTA({ city, href, ariaLabel }: Props) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h3 className="text-xl font-semibold">Ready to get started in {city}?</h3>
        <p className="mt-2 text-sm text-slate-700">Get in touch and we&apos;ll find a time that works for you.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href={href} aria-label={ariaLabel ?? `Check Availability`} className="rounded-full bg-sky-600 px-4 py-2 text-white">
            Check Availability
          </Link>
        </div>
      </div>
    </section>
  )
}
