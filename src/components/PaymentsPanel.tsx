import Image from "next/image";
import { Lock } from "lucide-react";

export default function PaymentsPanel() {
  return (
    <section className="mt-4">
      <div className="mx-auto mb-3 h-px w-full max-w-4xl bg-slate-200" />
      <p className="mt-2 text-center text-xs text-slate-500">Packages are valid for 12 months.</p>

      <div className="mt-4 flex items-center justify-center">
        <Image
          src="/assets/payment-strip.png"
          alt="Square, Apple Pay, Visa, Mastercard, American Express, and Discover"
          width={760}
          height={120}
          className="h-auto w-full max-w-[560px] object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.12)]"
        />
      </div>

      <p className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm text-slate-500">
        <Lock className="h-4 w-4" aria-hidden="true" />
        Secure checkout powered by Square
      </p>

    </section>
  );
}

