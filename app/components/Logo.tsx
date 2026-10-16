/**
 * The Permit Preflight mark: a paper airplane seen head-on, which is also a gable roof - the two wings are the roof slopes and the fold between them is the ridge
 * (flying and building in one shape: a check before you take off, and before you build). The shaded half gives the fold, a faint line beneath is the ground. Pure SVG,
 * no dependencies, sized by `size`. The same artwork is the site icon (app/icon.svg).
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Permit Preflight" className={className}>
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      {/* the two wings / roof slopes, meeting at the fold (ridge) */}
      <path d="M16 5.5 L4.5 22 L16 17.5 Z" fill="#ffffff" />
      <path d="M16 5.5 L27.5 22 L16 17.5 Z" fill="#c7d2fe" />
      {/* the ground */}
      <path d="M8 27 H24" stroke="#c7d2fe" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
