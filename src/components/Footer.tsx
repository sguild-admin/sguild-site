import React from "react";
import Link from "next/link";
import { NAV } from "../config/nav";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Sguild Swim LLC</p>
        <nav className="flex gap-6">
          {NAV.filter((n) => n.group !== "locations").map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-slate-700">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
