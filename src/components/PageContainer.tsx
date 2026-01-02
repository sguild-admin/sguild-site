import React from "react";

export default function PageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800 ${className}`}>
      {children}
    </div>
  );
}
