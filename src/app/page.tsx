import NextImage from '../components/NextImage'
import Link from "next/link";
import PageContainer from "../components/PageContainer";
import FeaturableReviews from '../components/FeaturableReviews'



type LocKey = 'oahu' | 'dallas';
type LocationItem = {
  key: LocKey;
  name: string;
  href: string;
  image: string;
  imageAlt: string;
  description: string;
  areaTag: string;
  badges: string[];
};

const FEATURABLE_ID = 'featurable-a6f4f535-5df6-4b9b-b6a4-6865a4acf5e1'
const LOCATIONS: LocationItem[] = [
  {
    key: 'oahu',
    name: 'O‘ahu, HI',
    href: '/oahu/',
    image: '/assets/oahu.jpg',
    imageAlt: 'O‘ahu swim lessons in Honolulu — private, year-round coaching',
    description: 'Private in-home lessons island-wide. Hotels, condos, and community pools welcome.',
    areaTag: 'Honolulu & Surrounding',
    badges: ['Island-wide', 'Year-round', 'Vacation-friendly'],
  },
  {
    key: 'dallas',
    name: 'Dallas, TX',
    href: '/dallas/',
    image: '/assets/dallas.jpg',
    imageAlt: 'DFW summer swim lessons — residential and community pools',
    description: 'Our original home base. Book at your home or community pool.',
    areaTag: 'Dallas County • Collin County',
    badges: ['Summer (June–Aug)', 'Residential', 'Community/HOA'],
  },
];

// Header moved to src/components/Header.tsx

function LocationCard({ item }: { item: LocationItem }) {
  return (
    <Link href={item.href} className="group block rounded-2xl border border-slate-200 overflow-hidden hover:shadow-sm transition">
        <figure className="aspect-[4/3] w-full overflow-hidden relative">
        <NextImage src={item.image} alt={item.imageAlt} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 50vw" />
      </figure>
      <div className="p-6">
        <h2 className="text-2xl font-bold">{item.name}</h2>
        <p className="mt-2 text-slate-700">{item.description}</p>
        <p className="mt-1 text-sm text-slate-500">{item.areaTag}</p>
        {item.badges?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {item.badges.map(b => (
              <li key={b} className="text-xs rounded-full bg-sky-100 text-sky-800 px-2 py-1">{b}</li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function Footer() {
  return (
    null
  );
}

export default function LocationSelectorPage() {
  return (
    <PageContainer className="bg-slate-50 text-slate-800">
      {/* background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-cyan-200/60 blur-3xl" />
      </div>

      
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 text-center">
          <h2 className="text-4xl md:text-6xl font-extrabold leading-tight">Select your location</h2>
          <p className="mt-3 text-lg text-slate-600">
            We come to your pool - home, condo, HOA, or resort. Choose your area to see schedules and pricing.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {LOCATIONS.map((item) => (
              <LocationCard key={item.key} item={item} />
            ))}
          </div>
        </div>
      </section>

      <FeaturableReviews />
    </PageContainer>
  );
}
