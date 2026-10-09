// Tile colours. A tile is a very light wash of its colour mixed into the theme surface (index.css, .tile), so text
// uses the theme ink and reads well in light and dark mode whatever the colour. The full colour is kept for the
// border, shadow and tooltip strip.

export const PRESET_COLORS = [
  '#a78bfa', '#c084fc', '#818cf8', '#60a5fa', '#38bdf8', '#22d3ee', '#2dd4bf', '#4ade80',
  '#a3e635', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#fb7185', '#94a3b8', '#a8a29e',
]

/** CSS custom properties for a tile of this colour. */
export function tileStyle(hex: string): React.CSSProperties {
  return { '--tile': hex } as React.CSSProperties
}
