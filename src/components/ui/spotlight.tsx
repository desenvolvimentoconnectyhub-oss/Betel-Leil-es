import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type SpotlightProps = {
  className?: string;
  fill?: string;
};

export const Spotlight = ({ className, fill }: SpotlightProps) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-spotlight pointer-events-none absolute z-[1] h-[130%] w-[118%] opacity-0 blur-3xl lg:h-[118%] lg:w-[84%]",
        className,
      )}
      style={
        {
          "--spotlight-fill": fill || "white",
        } as CSSProperties
      }
    >
      <div className="h-full w-full bg-[radial-gradient(ellipse_at_center,var(--spotlight-fill)_0%,transparent_68%)] opacity-25" />
    </div>
  );
};
