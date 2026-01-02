import Image from 'next/image'

type Props = {
  src: string
  alt: string
  className?: string
  sizes?: string
  priority?: boolean
  width?: number
  height?: number
  fill?: boolean
}

export default function NextImage({
  src,
  alt,
  className = '',
  sizes,
  priority = false,
  width,
  height,
  fill = false,
}: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      sizes={sizes}
      priority={priority}
      style={{ objectFit: 'cover' }}
      className={className}
      {...(fill ? { fill: true } : { width, height })}
    />
  )
}
