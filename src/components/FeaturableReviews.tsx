'use client'
import { useEffect } from 'react'

const FEATURABLE_ID = 'featurable-a6f4f535-5df6-4b9b-b6a4-6865a4acf5e1'

export default function FeaturableReviews() {
  useEffect(() => {
    const SRC = 'https://featurable.com/assets/bundle.js'
    let cancelled = false

    // Ensure the script exists and is fully loaded exactly once
    const ensureScript = () =>
      new Promise<void>((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
        if (existing) {
          if (existing.dataset.loaded === '1') resolve()
          else existing.addEventListener('load', () => resolve(), { once: true })
          return
        }
        const s = document.createElement('script')
        s.src = SRC
        s.defer = true
        s.charset = 'UTF-8'
        s.onload = () => {
          s.dataset.loaded = '1'
          resolve()
        }
        document.body.appendChild(s)
      })

    ;(async () => {
      await ensureScript()
      if (cancelled) return

      // Clear any previous mount so the bundle can attach cleanly after client nav
      const el = document.getElementById(FEATURABLE_ID)
      if (el) el.innerHTML = ''

      // Try official re-init if available, else force a fresh execute
      setTimeout(() => {
        // @ts-ignore
        if (window.Featurable?.init) {
          // @ts-ignore
          window.Featurable.init()
        } else {
          const bump = document.createElement('script')
          bump.src = `${SRC}?r=${Date.now()}`
          bump.defer = true
          bump.charset = 'UTF-8'
          document.body.appendChild(bump)
        }
      }, 0)
    })()

    return () => { cancelled = true }
  }, [])

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="text-2xl md:text-3xl font-bold">Reviews</h2>
      <div id={FEATURABLE_ID} data-featurable-async />
    </section>
  )
}
