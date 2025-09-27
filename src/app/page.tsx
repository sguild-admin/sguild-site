'use client';
import React, { useEffect, useState } from 'react';

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

const LOCATIONS: LocationItem[] = [
  {
    key: 'oahu',
    name: 'O‘ahu',
    href: '/locations/oahu/',
    image: '/assets/oahu.jpg',
    imageAlt: 'O‘ahu swim lessons in Honolulu — private, year-round coaching',
    description: 'Private in-home lessons island-wide. Hotels, condos, and community pools welcome.',
    areaTag: 'Honolulu & Surrounding',
    badges: ['Island-wide', 'Year-round', 'Vacation-friendly'],
  },
  {
    key: 'dallas',
    name: 'Dallas, TX',
    href: '/locations/dallas/',
    image: '/assets/dallas.jpg',
    imageAlt: 'DFW summer swim lessons — residential and community pools',
    description: 'Our original home base. Book at your home or community pool.',
    areaTag: 'Dallas County • Collin County',
    badges: ['Summer (June–Aug)', 'Residential', 'Community/HOA'],
  },
];

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between h-16">
        <a href="/" className="flex items-center gap-3" aria-label="Sguild Swim Instruction home">
          <img src="/assets/logo-graphic.png" alt="Sguild Swim Instruction logo" className="h-9 w-auto" />
          <span className="text-base font-semibold tracking-tight text-slate-900">
            Sguild <span className="text-slate-500">Swim Instruction</span>
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <a href="/locations/oahu/" className="hover:text-sky-600">O&apos;ahu</a>
          <a href="/locations/dallas/" className="hover:text-sky-600">Dallas, TX</a>
        </nav>
        <button
          type="button"
          aria-controls="mobile-menu"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="md:hidden inline-flex items-center justify-center p-2 rounded-lg border border-slate-300"
        >
          <span className="sr-only">Toggle menu</span>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      <div id="mobile-menu" className={`md:hidden border-t border-slate-200 bg-white ${open ? '' : 'hidden'}`}>
        <div className="px-4 py-3 grid gap-3 text-base">
          <a href="/locations/oahu/" className="block hover:text-sky-600">O&apos;ahu</a>
          <a href="/locations/dallas/" className="block hover:text-sky-600">Dallas, TX</a>
        </div>
      </div>
    </header>
  );
}

function LocationCard({ item }: { item: LocationItem }) {
  return (
    <a href={item.href} className="group block rounded-2xl border border-slate-200 overflow-hidden hover:shadow-sm transition">
      <figure className="aspect-[4/3] w-full overflow-hidden">
        <img
          src={item.image}
          alt={item.imageAlt}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            const t = e.currentTarget as HTMLImageElement;
            t.src =
              item.key === 'oahu'
                ? 'https://images.unsplash.com/photo-1504439904031-93ded9f93b98?q=80&w=1600&auto=format&fit=crop'
                : 'https://images.unsplash.com/photo-1465847899084-d164df4dedc8?q=80&w=1600&auto=format&fit=crop';
          }}
        />
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
    </a>
  );
}

function Reviews() {
  // Load Featurable once on client
  useEffect(() => {
    const SRC = 'https://featurable.com/assets/bundle.js';
    if (!document.querySelector(`script[src="${SRC}"]`)) {
      const s = document.createElement('script');
      s.src = SRC;
      s.defer = true;
      s.charset = 'UTF-8';
      document.body.appendChild(s);
    }
  }, []);
  return (
    <section className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <h3 className="text-2xl md:text-3xl font-extrabold text-center">What families say</h3>
        <p className="mt-2 text-center text-slate-600">Real reviews from parents and adult learners.</p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-4 md:p-6 shadow-sm">
          <div id="featurable-a6f4f535-5df6-4b9b-b6a4-6865a4acf5e1" data-featurable-async />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Sguild Swim Instruction. All rights reserved.</p>
        <nav className="flex gap-6">
          <a href="/privacy" className="hover:text-sky-600">Privacy</a>
          <a href="/contact" className="hover:text-sky-600">Contact</a>
        </nav>
      </div>
    </footer>
  );
}

export default function LocationSelectorPage() {
  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen">
      {/* background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-cyan-200/60 blur-3xl" />
      </div>

      <Header />

      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 text-center">
          <h2 className="text-4xl md:text-6xl font-extrabold leading-tight">Select your location</h2>
          <p className="mt-3 text-lg text-slate-600">
            We come to your pool—home, condo, HOA, or resort. Choose your area to see schedules and pricing.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {LOCATIONS.map((item) => (
              <LocationCard key={item.key} item={item} />
            ))}
          </div>
        </div>
      </section>

      <Reviews />
      <Footer />
    </div>
  );
}
