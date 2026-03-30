import { Star } from "lucide-react";
import NextImage from "./NextImage";

type TrustBarProps = {
  rating?: number;
  title?: string;
  className?: string;
  ariaLabel?: string;
};

export default function TrustBar({
  rating = 5.0,
  title = "Google Rating",
  className = "",
  ariaLabel,
}: TrustBarProps) {
  const stars = [0, 1, 2, 3, 4];

  return (
    <div
      className={[
        "inline-flex items-center rounded-lg bg-slate-50/90 px-3 py-2 shadow-[0_2px_7px_rgba(2,132,199,0.14)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
    >
      <NextImage
        src="/assets/g.png"
        alt="Google"
        width={18}
        height={18}
        className="h-[18px] w-[18px]"
      />

      <div className="ml-1.5 flex items-center gap-1.5 leading-none">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <div className="flex items-center gap-1" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
          <span className="text-sm font-semibold text-slate-700">{rating.toFixed(1)}</span>
          {stars.map((i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400 stroke-none" aria-hidden="true" />
          ))}
        </div>
      </div>
    </div>
  );
}
