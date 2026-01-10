"use client"
import React from "react";
import Link from "next/link";
import { NAV } from "../config/nav";
import { usePathname } from 'next/navigation'

export default function Footer() {
  const pathname = usePathname() || '/'

  let city: string | null = null
  if (pathname.startsWith('/dallas')) city = 'dallas'
  else if (pathname.startsWith('/oahu')) city = 'oahu'
  else if (pathname.startsWith('/perth')) city = 'perth'

  const pricingHref = city ? `/pricing?city=${city}` : '/pricing'
  const contactHref = city ? `/${city}/contact` : '/oahu/contact'

  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Sguild Swim LLC</p>
        <nav className="flex gap-6">
          {NAV.filter((n) => n.group !== "locations").map((n) => {
            if (n.label === 'Pricing') return <Link key="pricing" href={pricingHref} className="hover:text-slate-700">Pricing</Link>
            if (n.label === 'Contact') return <Link key="contact" href={contactHref} className="hover:text-slate-700">Contact</Link>
            return (
              <Link key={n.href} href={n.href} className="hover:text-slate-700">
                {n.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </footer>
  );
}
