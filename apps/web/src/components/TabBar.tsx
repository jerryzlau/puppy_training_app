"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/diary", icon: "📔", label: "Diary" },
  { href: "/school", icon: "🎓", label: "School" },
  { href: "/routine", icon: "⏰", label: "Routine" },
  { href: "/family", icon: "🏠", label: "Family" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-[560px] bg-paperD border-t-2 border-dashed border-wood flex px-2 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {TABS.map((t) => {
        const on = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 text-center text-[11px] font-bold ${on ? "text-ink" : "text-inkFaint"}`}
          >
            <span
              className={`block text-[21px] mb-0.5 ${on ? "" : "grayscale opacity-50"}`}
              aria-hidden
            >
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
