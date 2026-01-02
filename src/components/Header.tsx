"use client";
import React, { useState } from "react";
import Link from "next/link";
import { NAV } from "../config/nav";

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3" aria-label="Sguild Swim Instruction home">
          <img src="/assets/logo-graphic.png" alt="Sguild Swim Instruction logo" className="h-9 w-auto" />
          <span className="text-base font-semibold tracking-tight text-slate-900">
            Sguild <span className="text-slate-500">Swim Instruction</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          {NAV.filter((n) => n.group === "locations").map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-sky-600">
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          aria-controls="mobile-menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden inline-flex items-center justify-center p-2 rounded-lg border border-slate-300"
        >
          <span className="sr-only">Toggle menu</span>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      <div id="mobile-menu" className={`md:hidden border-t border-slate-200 bg-white ${open ? "" : "hidden"}`}>
        <div className="px-4 py-3 grid gap-3 text-base">
          <Link href="/oahu/" className="block hover:text-sky-600">O&apos;ahu</Link>
          <Link href="/dallas/" className="block hover:text-sky-600">Dallas, TX</Link>
        </div>
      </div>
    </header>
  );
}
