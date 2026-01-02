"use client";
import React from "react";

export default function Image({ src, alt, className = "", fallback }: { src: string; alt: string; className?: string; fallback?: string }) {
  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (fallback) t.src = fallback;
  };

  return <img src={src} alt={alt} className={className} onError={handleError} />;
}
