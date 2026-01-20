import Script from 'next/script'

export default function Analytics() {
  return (
    <>
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

    </>
  )
}
