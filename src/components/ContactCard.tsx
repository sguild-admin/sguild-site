import type { ReactNode } from 'react'
import Button from './Button'

type Props = {
  title: ReactNode
  description: ReactNode
  href?: string
  btnLabel?: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}

export default function ContactCard({ title, description, href, btnLabel, variant = 'secondary', className }: Props) {
  return (
    <article className={className ?? 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-700">{description}</p>
      {href && btnLabel ? (
        <div className="mt-4">
          <Button href={href} variant={variant}>{btnLabel}</Button>
        </div>
      ) : null}
    </article>
  )
}
