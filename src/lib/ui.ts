// Solurna design tokens — single source of truth for shared surface styles.
// Tune here to restyle the whole app at once.

/** Elevated white card (radius 20, soft shadow). */
export const card = "bg-white rounded-[20px] shadow-[0_8px_24px_rgba(17,17,17,0.06)]";
/** Card with standard inner padding. */
export const cardP = card + " p-5";
/** Small/secondary surface (toolbars, pills). */
export const cardSm = "bg-white rounded-[16px] shadow-[0_2px_10px_rgba(17,17,17,0.04)]";
/** Section heading. */
export const h2 = "text-[22px] font-bold tracking-tight text-title";
/** Section heading + first-in-page top margin. */
export const h2First = h2 + " mt-1 mb-3.5";
/** Section heading + between-section spacing. */
export const h2Mid = h2 + " mt-7 mb-3.5";
