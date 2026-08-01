import { cn } from "@/lib/utils";

/**
 * The Bartr mark: two arrows trading places.
 *
 * Kept in sync with `src/app/icon.svg` (favicon) and `src/app/apple-icon.png`.
 * The tile is a CSS gradient rather than an SVG one so the glyph can be
 * rendered many times per page without duplicating a gradient element id.
 */
export function BartrMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700",
        className
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className="h-[62%] w-[62%] text-white"
        aria-hidden="true"
      >
        <g
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="currentColor"
        >
          <path d="M7.5 11.5h10" strokeWidth="3" fill="none" />
          <path d="M17.4 7.9 24.2 11.5 17.4 15.1Z" strokeWidth="2.2" />
          <g transform="rotate(180 16 16)">
            <path d="M7.5 11.5h10" strokeWidth="3" fill="none" />
            <path d="M17.4 7.9 24.2 11.5 17.4 15.1Z" strokeWidth="2.2" />
          </g>
        </g>
      </svg>
    </span>
  );
}
