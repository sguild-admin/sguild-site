import Link from "next/link";

type Props = {
  city: "oahu" | "dallas" | string;
};

export default function HowItWorks({ city }: Props) {
  const step3Description =
    city === "oahu"
      ? "Meet at your pool or ocean spot and get started."
      : "Meet at your pool and get started.";

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">How It Works</h2>
            <p className="mt-2 max-w-2xl text-slate-700">
              Simple scheduling, clear pricing, and lessons built around you.
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-3">
          <Link href="/lesson-request" className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Step 1</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 md:text-[1.05rem]">Submit your request</h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Submit your request and tell us where you'd like to swim and who it's for.
            </p>
          </Link>

          <div className="hidden items-center justify-center text-slate-300 md:flex" aria-hidden="true">
            <span className="text-xl leading-none">→</span>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Step 2</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 md:text-[1.05rem]">Share your availability and goals</h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              We match you with the right instructor and confirm a time.
            </p>
          </article>

          <div className="hidden items-center justify-center text-slate-300 md:flex" aria-hidden="true">
            <span className="text-xl leading-none">→</span>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">Step 3</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 md:text-[1.05rem]">Meet your instructor</h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              {step3Description}
            </p>
            <div className="mt-4 hidden md:flex w-full">
              <Link
                href="/lesson-request"
                className="inline-flex w-full justify-center items-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95"
              >
                Get Started
              </Link>
            </div>
          </article>
        </div>

        <div className="mt-6 flex justify-center md:hidden">
          <Link
            href="/lesson-request"
            className="inline-flex items-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95"
          >
            Get Started
          </Link>
        </div>
      </div>
    </section>
  );
}
