"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    fbq?: (...args: any[]) => void
    gtag_report_conversion?: (url?: string) => boolean
  }
}

export default function ContactTracker() {
  useEffect(() => {
    let lastFire = 0

    function trackFbContact(method: "call" | "text" | "email", href: string) {
      if (typeof window === "undefined") return
      if (typeof window.fbq !== "function") return
      try {
        window.fbq("track", "Contact", { method, href })
      } catch {}
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      const a = target.closest?.("a") as HTMLAnchorElement | null
      if (!a) return

      const href = (a.getAttribute("href") || "").trim()
      if (!href) return

      const now = Date.now()
      if (now - lastFire < 600) return
      lastFire = now

      const lower = href.toLowerCase()

      if (lower.startsWith("tel:")) {
        try {
          window.gtag_report_conversion?.()
        } catch {}
        trackFbContact("call", href)
      } else if (lower.startsWith("sms:")) {
        trackFbContact("text", href)
      } else if (lower.startsWith("mailto:")) {
        trackFbContact("email", href)
      }
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return null
}
