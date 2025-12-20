"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    gtag_report_conversion?: (url?: string) => boolean
  }
}

export default function GoogleContactTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const link = target?.closest?.("a") as HTMLAnchorElement | null
      if (!link) return

      const href = link.getAttribute("href") || ""
      if (!href.startsWith("tel:")) return

      // Fire Google Ads "Click to call" conversion
      window.gtag_report_conversion?.()
      // Do NOT prevent default; we want the phone dialer to open normally.
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return null
}
