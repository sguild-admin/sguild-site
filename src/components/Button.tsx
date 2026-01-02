import React from "react";
import Link from "next/link";

type Props = {
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
  className?: string;
  target?: string;
};

export default function Button({ href, onClick, variant = "primary", children, className = "", target }: Props) {
  const base = "inline-flex items-center rounded-2xl px-5 py-3 font-medium";
  const variants: Record<string, string> = {
    primary: "bg-sky-600 text-white shadow hover:bg-sky-700",
    secondary: "border border-slate-300 text-slate-800 hover:bg-slate-50",
  };

  const cls = `${base} ${variants[variant]} ${className}`.trim();

  const isExternal = href && (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("sms:"));

  if (href) {
    if (isExternal) {
      return (
        // external link (tel:, mailto:, http)
        <a href={href} className={cls} onClick={onClick} target={target} rel={target === "_blank" ? "noopener noreferrer" : undefined}>
          {children}
        </a>
      );
    }

    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}
