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
  const base = "inline-flex items-center rounded-xl px-4 py-2 font-sf-pro text-[1rem] font-medium";
  const variants: Record<string, string> = {
    primary: "bg-linear-to-b from-[#1b80d0] to-[#1562bc] text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95",
    secondary: "border-[0.4px] border-slate-200/45 bg-white/90 text-sky-700 shadow-[0_2px_6px_rgba(15,23,42,0.08)] hover:bg-white",
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
