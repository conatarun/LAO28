// Emoji-based sport pictograms in a gradient tile. Covers the full LA28
// sport list; falls back to a monogram for anything unrecognised.

type Palette = [string, string]; // gradient stops

const SPORT_MAP: Array<[RegExp, { emoji: string; color: Palette }]> = [
  [/^3x3 basketball|^basketball/i,     { emoji: "🏀", color: ["#ff7a29", "#c44a0c"] }],
  [/archery/i,                          { emoji: "🏹", color: ["#6ee7b7", "#047857"] }],
  [/artistic swim|synchroniz/i,         { emoji: "🤽", color: ["#60a5fa", "#1e40af"] }],
  [/artistic gymnast|^gymnast/i,        { emoji: "🤸", color: ["#f472b6", "#9d174d"] }],
  [/rhythmic gymnast/i,                 { emoji: "🎀", color: ["#f9a8d4", "#be185d"] }],
  [/trampoline/i,                       { emoji: "🤾", color: ["#fbbf24", "#b45309"] }],
  [/athletics|track|marathon|race walk/i,{ emoji: "🏃", color: ["#fb7185", "#9f1239"] }],
  [/triathlon|pentathlon/i,             { emoji: "🏅", color: ["#f59e0b", "#b45309"] }],
  [/badminton/i,                        { emoji: "🏸", color: ["#a78bfa", "#6d28d9"] }],
  [/baseball/i,                         { emoji: "⚾", color: ["#fafafa", "#6b7280"] }],
  [/softball/i,                         { emoji: "🥎", color: ["#fde047", "#a16207"] }],
  [/beach volleyball/i,                 { emoji: "🏐", color: ["#fcd34d", "#c2410c"] }],
  [/volleyball/i,                       { emoji: "🏐", color: ["#60a5fa", "#1e3a8a"] }],
  [/boxing/i,                           { emoji: "🥊", color: ["#ef4444", "#7f1d1d"] }],
  [/break/i,                            { emoji: "🕺", color: ["#f472b6", "#6d28d9"] }],
  [/canoe slalom/i,                     { emoji: "🛶", color: ["#22d3ee", "#155e75"] }],
  [/canoe|kayak/i,                      { emoji: "🛶", color: ["#2dd4bf", "#115e59"] }],
  [/cricket/i,                          { emoji: "🏏", color: ["#84cc16", "#3f6212"] }],
  [/bmx freestyle/i,                    { emoji: "🚵", color: ["#fb923c", "#9a3412"] }],
  [/bmx/i,                              { emoji: "🚴", color: ["#fb923c", "#9a3412"] }],
  [/mountain bike|mtb/i,                { emoji: "🚵", color: ["#a3e635", "#4d7c0f"] }],
  [/cycling/i,                          { emoji: "🚴", color: ["#38bdf8", "#075985"] }],
  [/diving/i,                           { emoji: "🤿", color: ["#0ea5e9", "#0c4a6e"] }],
  [/equestrian|horse/i,                 { emoji: "🏇", color: ["#d6a171", "#7c2d12"] }],
  [/fencing/i,                          { emoji: "🤺", color: ["#cbd5e1", "#334155"] }],
  [/field hockey|^hockey/i,             { emoji: "🏑", color: ["#4ade80", "#14532d"] }],
  [/flag football/i,                    { emoji: "🏈", color: ["#78350f", "#451a03"] }],
  [/football|soccer/i,                  { emoji: "⚽", color: ["#f8fafc", "#374151"] }],
  [/golf/i,                             { emoji: "⛳", color: ["#86efac", "#15803d"] }],
  [/handball/i,                         { emoji: "🤾", color: ["#fbbf24", "#854d0e"] }],
  [/judo/i,                             { emoji: "🥋", color: ["#93c5fd", "#1e3a8a"] }],
  [/taekwondo/i,                        { emoji: "🥋", color: ["#fca5a5", "#7f1d1d"] }],
  [/karate/i,                           { emoji: "🥋", color: ["#fde68a", "#78350f"] }],
  [/lacrosse/i,                         { emoji: "🥍", color: ["#a855f7", "#6b21a8"] }],
  [/marathon swim/i,                    { emoji: "🏊", color: ["#38bdf8", "#0369a1"] }],
  [/swimming/i,                         { emoji: "🏊", color: ["#22d3ee", "#0e7490"] }],
  [/water polo/i,                       { emoji: "🤽", color: ["#3b82f6", "#1e3a8a"] }],
  [/modern pentathlon/i,                { emoji: "🤺", color: ["#fbbf24", "#7c2d12"] }],
  [/rowing/i,                           { emoji: "🚣", color: ["#14b8a6", "#134e4a"] }],
  [/rugby/i,                            { emoji: "🏉", color: ["#065f46", "#022c22"] }],
  [/sailing/i,                          { emoji: "⛵", color: ["#7dd3fc", "#075985"] }],
  [/shooting/i,                         { emoji: "🎯", color: ["#fca5a5", "#991b1b"] }],
  [/skateboard/i,                       { emoji: "🛹", color: ["#fb7185", "#831843"] }],
  [/sport climb|climb/i,                { emoji: "🧗", color: ["#f97316", "#7c2d12"] }],
  [/squash/i,                           { emoji: "🟢", color: ["#4ade80", "#15803d"] }],
  [/surf/i,                             { emoji: "🏄", color: ["#22d3ee", "#0e7490"] }],
  [/table tennis|ping.pong/i,           { emoji: "🏓", color: ["#f87171", "#7f1d1d"] }],
  [/tennis/i,                           { emoji: "🎾", color: ["#bef264", "#3f6212"] }],
  [/weight.?lift/i,                     { emoji: "🏋", color: ["#64748b", "#1e293b"] }],
  [/wrestling/i,                        { emoji: "🤼", color: ["#f59e0b", "#78350f"] }],
  [/open|closing|ceremony/i,            { emoji: "🎆", color: ["#c084fc", "#581c87"] }],
];

function lookup(sport: string) {
  for (const [re, v] of SPORT_MAP) if (re.test(sport)) return v;
  return null;
}

function monogram(sport: string) {
  return sport
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "·";
}

export function SportIcon({
  sport,
  size = 40,
  rounded = "xl",
  className = "",
}: {
  sport: string;
  size?: number;
  rounded?: "md" | "lg" | "xl" | "2xl" | "full";
  className?: string;
}) {
  const hit = lookup(sport);
  const radius = rounded === "full" ? "9999px" : { md: "8px", lg: "12px", xl: "16px", "2xl": "20px" }[rounded];
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    fontSize: Math.round(size * 0.55),
    lineHeight: 1,
    background: hit
      ? `linear-gradient(135deg, ${hit.color[0]}, ${hit.color[1]})`
      : "linear-gradient(135deg, #e5e7eb, #9ca3af)",
    color: hit ? "white" : "#1f2937",
    textShadow: hit ? "0 1px 2px rgba(0,0,0,0.25)" : undefined,
  };
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center select-none shrink-0 shadow-sm ${className}`}
      style={style}
    >
      {hit ? (
        <span style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}>{hit.emoji}</span>
      ) : (
        <span style={{ fontSize: Math.round(size * 0.38), fontWeight: 700 }}>
          {monogram(sport)}
        </span>
      )}
    </span>
  );
}
