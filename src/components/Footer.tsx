"use client"
import React from "react";
import Link from "next/link";
import { Facebook, Instagram } from "lucide-react";
import { NAV } from "../config/nav";
import { usePathname, useSearchParams } from 'next/navigation'

export default function Footer() {
  const pathname = usePathname() || '/'
  const params = useSearchParams()
  const qCity = params?.get('city')

  let city: string | null = null
  if (pathname.startsWith('/dallas')) city = 'dallas'
  else if (pathname.startsWith('/oahu')) city = 'oahu'
  
  // if on /pricing prefer the query param value
  if (pathname.startsWith('/pricing') && (qCity === 'oahu' || qCity === 'dallas')) city = qCity

  const pricingHref = city ? `/pricing?city=${city}` : '/pricing'
  const contactHref = city ? `/${city}/contact` : '/oahu/contact'
  const socials = [
    { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61585015406844', icon: Facebook },
    { label: 'Instagram', href: 'https://www.instagram.com/sguildswim/', icon: Instagram },
  ]

  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Sguild Swim LLC</p>
        <nav className="flex flex-wrap items-center justify-center gap-6">
          {NAV.filter((n) => n.group !== "locations").map((n) => {
            if (n.label === 'Pricing') return <Link key="pricing" href={pricingHref} className="hover:text-slate-700">Pricing</Link>
            if (n.label === 'Contact') return <Link key="contact" href={contactHref} className="hover:text-slate-700">Contact</Link>
            return (
              <Link key={n.href} href={n.href} className="hover:text-slate-700">
                {n.label}
              </Link>
            )
          })}
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              title={social.label}
              className="inline-flex items-center justify-center rounded-full p-1 hover:bg-slate-100 hover:text-slate-700"
            >
              <social.icon className="h-4 w-4" aria-hidden="true" />
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
