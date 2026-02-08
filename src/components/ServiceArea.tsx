import { SERVICE_AREAS } from '../config/serviceAreas'

type Props = {
  city: 'oahu' | 'dallas' | string
  title?: string
}

export default function ServiceArea({ city, title = 'Where we teach' }: Props) {
  const list = SERVICE_AREAS[city] || []
  const text = list.join(' • ')

  return (
    <section id="coverage" className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-3xl bg-linear-to-r from-sky-100 to-cyan-50 p-6 ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-slate-700">{text}{list.length > 0 ? ' • and nearby areas' : ''}</p>
      </div>
    </section>
  )
}
