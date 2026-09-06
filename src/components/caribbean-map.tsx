/**
 * Caribbean trade-routes map — the identity element from the reference art.
 * Stylized vector: the Antilles arc, the Guianas & Orinoco coast, dashed
 * nautical/air lanes converging on Port of Spain (coral pin), plus a dotted
 * network web across the Atlantic. Drawn with `currentColor` so the parent
 * controls the tone; drop it behind a hero at opacity-[0.05]-[0.10].
 */
export function CaribbeanMap({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 1440 720"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* ── Landmasses (abstract, low-detail) ── */}
      {/* Florida / Gulf coast */}
      <path
        d="M150 40c22 8 30 30 26 52s-26 34-24 56 22 30 18 52-30 28-52 20-34-38-30-66 14-46 22-68S128 32 150 40Z"
        fill="currentColor"
      />
      {/* Central America */}
      <path
        d="M40 210c40-14 78-6 108 14s44 52 82 62 76 2 108 22 48 58 88 66c30 6 56-6 74 12-28 26-74 34-116 28s-78-24-112-48-72-40-110-62-70-48-74-78c-2-8 34-12 52-16Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Greater Antilles arc */}
      <ellipse cx="430" cy="238" rx="66" ry="14" fill="currentColor" transform="rotate(-8 430 238)" />
      <ellipse cx="560" cy="272" rx="34" ry="10" fill="currentColor" transform="rotate(-12 560 272)" />
      <path d="M614 258c30-8 62-4 88 6 18 8 16 22-4 24-32 2-66-4-90-14-10-6-8-12 6-16Z" fill="currentColor" />
      {/* Lesser Antilles arc — the island chain */}
      <circle cx="800" cy="308" r="5" fill="currentColor" />
      <circle cx="820" cy="324" r="4" fill="currentColor" />
      <circle cx="838" cy="342" r="4.5" fill="currentColor" />
      <circle cx="852" cy="362" r="4" fill="currentColor" />
      <circle cx="866" cy="384" r="3.5" fill="currentColor" />
      {/* Trinidad — hub (geometric, sits apart) */}
      <path d="M892 418c14-6 30-2 36 8s0 24-12 28-28 0-34-10 0-20 10-26Z" fill="currentColor" />
      {/* Tobago */}
      <circle cx="928" cy="404" r="4" fill="currentColor" />
      {/* South America — Venezuela & the Guianas coastline */}
      <path
        d="M700 480c60-18 128-22 190-10 66 12 132 10 198 26 70 16 140 20 210 42 40 12 74 30 96 58-96 18-198 22-296 16-104-6-206-24-304-52-52-14-96-34-118-56-10-10-6-18 24-24Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* West Africa bulge (right edge) */}
      <path
        d="M1310 240c34-16 76-18 104 2 26 18 30 52 18 82s-40 46-70 44-56-24-64-54c-8-28-14-60 12-74Z"
        fill="currentColor"
        opacity="0.75"
      />
      <path d="M1380 420c26-6 52 4 60 24-24 16-54 18-74 6-14-10-6-24 14-30Z" fill="currentColor" opacity="0.75" />

      {/* ── Trade lanes (dashed nautical / air) ── */}
      <g stroke="currentColor" strokeWidth="2" strokeDasharray="1 10" strokeLinecap="round">
        {/* Panama → Antilles → Trinidad → Africa (the main line) */}
        <path d="M120 250C300 200 540 220 760 300s260 96 380 120 140 30 200 44" />
        {/* Gulf → Bahamas → Trinidad */}
        <path d="M170 130c140 40 320 90 480 160 90 38 180 78 260 122" />
        {/* Trinidad → Guianas → Brazil coast */}
        <path d="M910 440c80 40 180 80 300 110" />
        {/* Trinidad → Azores → Europe long haul */}
        <path d="M920 400c120-60 260-110 400-140" />
        {/* NY → Kingston → Panama feeder */}
        <path d="M460 90c-60 60-160 120-240 170" />
        {/* Island hopper along the arc */}
        <path d="M810 310c40 20 80 44 110 78" />
      </g>

      {/* ── Route vessels / aircraft glyphs ── */}
      <g fill="currentColor">
        {/* container ship on the main line */}
        <path d="M700 296l26-8 6 8-6 10-26-2z" opacity="0.9" />
        <rect x="706" y="282" width="6" height="6" opacity="0.7" />
        <rect x="714" y="283" width="6" height="6" opacity="0.8" />
        {/* plane heading east */}
        <path d="M1060 486l22-6-4 10 6 8-12-2-8 8-2-10z" opacity="0.9" />
        {/* small feeder ship */}
        <path d="M330 190l18-6 4 6-4 8-18-2z" opacity="0.8" />
      </g>

      {/* ── Atlantic network web (dots + fine links, right side) ── */}
      <g stroke="currentColor" strokeWidth="1" opacity="0.9">
        <path d="M1150 140L1230 90l90 40-30 80 60 60-70 50 20 90-90 20-40-70-80 30-10-80-60-40 50-60z" strokeDasharray="3 6" fill="none" />
        <path d="M1230 90l80 190M1320 130l-90 150M1160 240l160 60" strokeDasharray="2 7" fill="none" />
      </g>
      <g fill="currentColor">
        {[
          [1150, 140], [1230, 90], [1320, 130], [1290, 210], [1350, 270],
          [1280, 320], [1190, 340], [1150, 260], [1110, 190], [1250, 260],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" />
        ))}
      </g>

      {/* ── Port of Spain: the coral pin ── */}
      <g>
        <circle cx="902" cy="430" r="18" stroke="#f2764b" strokeWidth="2" strokeDasharray="2 6" fill="none" />
        <circle cx="902" cy="430" r="5" fill="#f2764b" />
      </g>
    </svg>
  );
}
