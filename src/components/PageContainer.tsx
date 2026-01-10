import type { ReactNode } from "react";

export default function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div id="content" className={`min-h-screen bg-white text-slate-800 ${className}`}>
      {children}
    </div>
  );
}
