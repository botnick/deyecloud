import { useState, type ReactNode } from "react";
import { cardP, cardSm } from "../lib/ui";
import { IconChevron } from "../lib/icons";

// A tap-to-expand panel. Two looks:
//  • "card" — self-contained glass card (header + body inside one card).
//  • "bare" — just a tappable header pill; the children flow below it bringing
//    their own cards (used to fold the per-metric sections, which are cards each).
export function Collapsible({
  title, subtitle, defaultOpen = false, variant = "card", children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  variant?: "card" | "bare";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Header = (
    <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2.5 text-left active:opacity-70 transition-opacity" aria-expanded={open}>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[16px] text-title leading-tight">{title}</div>
        {subtitle && <div className="text-[12.5px] text-muted mt-0.5">{subtitle}</div>}
      </div>
      <IconChevron className={`w-5 h-5 text-muted shrink-0 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
    </button>
  );

  if (variant === "bare") {
    return (
      <div className="mt-3">
        <div className={`${cardSm} px-4 py-3.5`}>{Header}</div>
        {open && <div>{children}</div>}
      </div>
    );
  }
  return (
    <section className={`${cardP} mt-3`}>
      {Header}
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
