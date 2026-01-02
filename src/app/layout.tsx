import "./globals.css"
import Script from "next/script"
import MetaContactTracker from "./MetaContactTracker"
import GoogleContactTracker from "./GoogleContactTracker"
import Header from "../components/Header"

export const metadata = {
  title: "Sguild Swim Instruction — Choose Your Location",
  description:
    "Select your city to get started with Sguild Swim Instruction. Serving O'ahu (Honolulu) and Dallas–Fort Worth with private lessons focused on technique and water safety.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google tag (gtag.js) */}
        <Script
          id="google-tag-src"
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-17126265247"
          strategy="afterInteractive"
        />
        <Script
          id="google-tag-inline"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-17126265247');
            `,
          }}
        />
{/* Google Ads click-to-call conversion helper */}
<Script
  id="google-ads-gtag-report-conversion"
  strategy="afterInteractive"
  dangerouslySetInnerHTML={{
    __html: `
      function gtag_report_conversion(url) {
        var callback = function () {
          if (typeof(url) != 'undefined') {
            window.location = url;
          }
        };
        gtag('event', 'conversion', {
          'send_to': 'AW-17126265247/cBsCCOGft9QbEJ-juOY_',
          'value': 1.0,
          'currency': 'USD',
          'event_callback': callback
        });
        return false;
      }
    `,
  }}
/>
        {/* Meta Pixel */}
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '1913689873365458');
              fbq('track', 'PageView');
            `,
          }}
        />

        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/assets/favicon-32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/assets/favicon-16.png"
        />
        <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
        <link rel="manifest" href="/assets/site.webmanifest" />
        <meta name="theme-color" content="#0ea5e9" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>

      <body className="bg-slate-50 text-slate-800">
        {/* Tracks tel:, sms:, mailto: clicks as fbq('track','Contact') */}
        <MetaContactTracker />
          <GoogleContactTracker />
        {/* Meta Pixel noscript fallback */}
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=1913689873365458&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>

        <Header />

        {children}
      </body>
    </html>
  )
}
