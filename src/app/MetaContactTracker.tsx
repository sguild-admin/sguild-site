"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    fbq?: (...args: any[]) => void
  }
}

function trackContact(method: "call" | "text" | "email", href: string) {
  if (typeof window === "undefined") return
  if (typeof window.fbq !== "function") return

  window.fbq("track", "Contact", {
    method,
    href,
  })
}

export default function MetaContactTracker() {
  useEffect(() => {
    let lastFire = 0

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      const a = target.closest("a") as HTMLAnchorElement | null
      if (!a) return

      const href = (a.getAttribute("href") || "").trim()
      if (!href) return

      const now = Date.now()
      if (now - lastFire < 600) return
      lastFire = now

      const lower = href.toLowerCase()

      if (lower.startsWith("tel:")) trackContact("call", href)
      if (lower.startsWith("sms:")) trackContact("text", href)
      if (lower.startsWith("mailto:")) trackContact("email", href)
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return null
}
