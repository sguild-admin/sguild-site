import type { ReactNode } from "react";

export default function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div id="content" className={`min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800 ${className}`}>
      {children}
    </div>
  );
}
