"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV } from "../config/nav";
import NextImage from "./NextImage";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const qCity = params?.get("city");

  let city: string | null = null;
  if (pathname.startsWith("/dallas")) city = "dallas";
  else if (pathname.startsWith("/oahu")) city = "oahu";
  else if (pathname.startsWith("/perth")) city = "perth";

  // if on /pricing prefer the query param
  if (pathname.startsWith("/pricing") && qCity) city = qCity;

  const pricingHref = city ? `/pricing?city=${city}` : "/pricing";
  const contactHref = city ? `/${city}/contact` : "/oahu/contact";
  const logoHref = city ? `/${city}` : "/";

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-start h-16">
        <Link
          href={logoHref}
          className="flex items-center gap-3"
          aria-label="Sguild Swim Instruction home"
        >
          <NextImage
            src="/assets/logo-graphic.png"
            alt="Sguild Swim Instruction logo"
            width={36}
            height={36}
            className="h-9 w-auto"
          />

          {/* Aesthetic only: shorten brand on mobile to avoid wrap/clipping */}
          <span className="text-base font-semibold tracking-tight text-slate-900 leading-none">
            <span className="sm:hidden">Sguild Swim</span>
            <span className="hidden sm:inline">
              Sguild <span className="text-slate-500">Swim Instruction</span>
            </span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6 ml-auto">
          <Link href={pricingHref} className="hover:text-sky-600">
            Pricing
          </Link>
          <Link href={contactHref} className="hover:text-sky-600">
            Contact
          </Link>

          <div
            className="relative"
            onMouseEnter={() => setLocOpen(true)}
            onMouseLeave={() => setLocOpen(false)}
          >
            <button
              type="button"
              className="inline-flex items-center gap-2 hover:text-sky-600"
              aria-haspopup="true"
              aria-expanded={locOpen}
            >
              Locations
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <path d="M6 8l4 4 4-4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div
              onMouseEnter={() => setLocOpen(true)}
              onMouseLeave={() => setLocOpen(false)}
              className={`absolute right-0 top-full w-48 rounded-md bg-white shadow-lg ring-1 ring-slate-200 ${locOpen ? 'block' : 'hidden'} z-50`}
            >
              <div className="py-1">
                {(() => {
                  const order = ['Dallas', "Oʻahu", 'Perth'];
                  const locs = NAV.filter((n) => n.group === 'locations');
                  return order
                    .map((label) => locs.find((l) => l.label === label))
                    .filter(Boolean)
                    .map((n) => (
                      // @ts-ignore
                      <Link key={n.href} href={n.href} className="block px-4 py-2 text-sm hover:bg-slate-50">{n.label}</Link>
                    ));
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Aesthetic only: more contrast + nicer button styling on mobile */}
        <button
          type="button"
          aria-controls="mobile-menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden ml-auto inline-flex items-center justify-center h-11 w-11 rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50 active:bg-slate-100"
        >
          <span className="sr-only">Toggle menu</span>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {/* Aesthetic only: spacing + touch targets */}
      <div
        id="mobile-menu"
        className={`md:hidden border-t border-slate-200 bg-white ${open ? "" : "hidden"}`}>
        <div className="px-4 py-3 grid gap-1 text-base">
          {/* Single Locations link on mobile */}
          {(() => {
            const loc = NAV.find((n) => n.label === "Locations");
            return loc ? (
              <Link
                key={loc.href}
                href={loc.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-2 py-2.5 font-medium text-slate-900 hover:bg-slate-50 hover:text-sky-700"
              >
                {loc.label}
              </Link>
            ) : null;
          })()}

          <Link
            href={pricingHref}
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-2.5 font-medium text-slate-900 hover:bg-slate-50 hover:text-sky-700"
          >
            Pricing
          </Link>
          <Link
            href={contactHref}
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-2.5 font-medium text-slate-900 hover:bg-slate-50 hover:text-sky-700"
          >
            Contact
          </Link>
        </div>
      </div>
    </header>
  );
}
