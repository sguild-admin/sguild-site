import "./globals.css"
import React from "react"
import Header from "../components/Header"
import Footer from "../components/Footer"

export const metadata = {
  title: "Sguild Swim Instruction — Choose Your Location",
  description:
    "Select your city to get started with Sguild Swim Instruction. Serving O'ahu (Honolulu) and Dallas–Fort Worth with private lessons focused on technique and water safety.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-50">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png" />
        <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
        <link rel="manifest" href="/assets/site.webmanifest" />

        {/* Match the page background so iOS overscroll doesn't show a weird tint */}
        <meta name="theme-color" content="#f8fafc" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>

      <body className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
        <a
          href="#content"
          className="sr-only focus:not-sr-only z-50 inline-block m-4 rounded bg-white px-3 py-2 text-sm font-medium text-sky-700"
        >
          Skip to content
        </a>

        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=1913689873365458&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>

        <React.Suspense fallback={<div className="h-16" />}>
          <Header />
        </React.Suspense>

        <main id="content" className="flex-1">
          {children}
        </main>

        <React.Suspense fallback={<div className="h-24" />}>
          <Footer />
        </React.Suspense>
      </body>
    </html>
  )
}
