import type { ReactNode } from 'react'

export default function FAQItem({ question, children }: { question: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" style={{ backgroundColor: "#ffffff" }}>
      <summary className="cursor-pointer list-none select-none bg-white text-[1.05rem] font-medium flex items-center justify-between md:text-lg" style={{ backgroundColor: "#ffffff" }}>
        {question}
        <span className="ml-3 text-slate-400 transition">▾</span>
      </summary>
      <div className="mt-2 bg-white" style={{ backgroundColor: "#ffffff" }}>
        <div className="w-fit border-t border-slate-200/65 px-1">
          <span className="invisible block text-[1.05rem] font-bold leading-none md:text-lg">{question}</span>
        </div>
        <div className="pt-0 text-base leading-7 text-slate-700">{children}</div>
      </div>
    </details>
  )
}
