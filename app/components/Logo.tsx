/**
 * The Permit Preflight mark: a paper airplane (the "flight" in preflight - a check before you take off) on a rounded tile, with a faint ground line under it (the
 * building). Pure SVG, no dependencies, sized by `size` and inheriting nothing from the page. The same artwork is the site icon (app/icon.svg).
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Permit Preflight" className={className}>
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      {/* the plane: a dart with a crease from the nose back along the fold */}
      <path d="M6.5 14 L25.5 6 L19 24 L15 17.2 Z" fill="#ffffff" />
      <path d="M25.5 6 L15 17.2" stroke="#4f46e5" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M15 17.2 L16.2 22 L19 24" fill="#c7d2fe" />
      {/* the ground / foundation line */}
      <path d="M8 27 H24" stroke="#c7d2fe" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
