import Head from 'next/head'

type SEOProps = {
  title?: string
  description?: string
  url?: string
  image?: string
  ldJson?: unknown
}

export default function SEO({ title, description, url, image, ldJson }: SEOProps) {
  return (
    <Head>
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      {url && <link rel="canonical" href={url} />}
      {image && <meta property="og:image" content={image} />}
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      {ldJson ? (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson as any) }} />
      ) : null}
    </Head>
  )
}
