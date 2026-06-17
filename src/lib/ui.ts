// Solurna design tokens — single source of truth for shared surface styles.
// Tune here to restyle the whole app at once.

// Surfaces are iOS-style glass (recipe in index.css). Swap these two strings
// back to `bg-white …` to return the whole app to flat cards.
/** Elevated glass card (radius 20, frosted, specular edge). */
export const card = "glass-card";
/** Card with standard inner padding. */
export const cardP = card + " p-5";
/** Small/secondary glass surface (toolbars, pills). */
export const cardSm = "glass-sm";
/** Section heading. */
export const h2 = "text-[22px] font-bold tracking-tight text-title";
/** Section heading + first-in-page top margin. */
export const h2First = h2 + " mt-1 mb-3.5";
/** Section heading + between-section spacing. */
export const h2Mid = h2 + " mt-7 mb-3.5";
