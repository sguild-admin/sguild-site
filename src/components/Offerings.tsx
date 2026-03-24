interface OfferingsProps {
  title?: string
  description?: string
}

const defaultOfferings = [
  {
    title: 'Private Lessons',
    body:
      'One-on-one swim lessons with a Sguild instructor for maximum focus and progress. Ideal for those who want personalized attention and faster results.',
  },
  {
    title: 'Semi-Private Lessons',
    body:
      'Share a lesson with a sibling or friend of similar level. Additional students are included at no additional cost for semi-private lessons.',
  },
  {
    title: 'Parent-Child Lessons',
    body:
      'Parents can be in the water during the lesson to learn the teaching process and support progress between sessions.',
  },
  {
    title: 'Infant Water Safety',
    body:
      'Lessons emphasize awareness, control, survival skills, and safe movement in water. Essential for all ages and skill levels.',
  },
  {
    title: 'Adult Swim Lessons',
    body:
      'From first-time swimmers to triathlon prep, our adult lessons focus on comfort, efficiency, and technique. We tailor sessions to your goals with clear, personalized guidance.',
  },
  {
    title: 'Technique & Stroke Development',
    body:
      'Refine freestyle, backstroke, breaststroke, or butterfly with drills that build long-lasting technique and confidence.',
  },
]

export default function Offerings({ title = 'What we offer', description = 'All lessons are 30 minutes and take place at your home, condo, or an arranged location. Choose the option that best fits your swimmer\'s goals.' }: OfferingsProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h2 className="text-2xl md:text-3xl font-bold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-600 max-w-3xl">
        {description}
      </p>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {defaultOfferings.map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-700">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
