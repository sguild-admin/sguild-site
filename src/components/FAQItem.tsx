import type { ReactNode } from 'react'

export default function FAQItem({ question, children }: { question: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer list-none select-none font-medium flex items-center justify-between">
        {question}
        <span className="ml-3 text-slate-400 transition">▾</span>
      </summary>
      <div className="mt-3 text-sm text-slate-700">{children}</div>
    </details>
  )
}
