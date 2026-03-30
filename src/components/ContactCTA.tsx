import Link from 'next/link'

type Props = {
  city: string
  href: string
  ariaLabel?: string
}

export default function ContactCTA({ city, href, ariaLabel }: Props) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-0 pb-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h3 className="text-[1.35rem] font-semibold md:text-[1.5rem]">Book Your First Lesson in {city}</h3>
        <p className="mt-2 text-[0.95rem] text-slate-700 md:text-[1rem]">Get in touch and we&apos;ll find a time that works for you.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href={href} aria-label={ariaLabel ?? `Book Your First Lesson`} className="inline-flex items-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95">
            Book Your First Lesson
          </Link>
        </div>
      </div>
    </section>
  )
}
