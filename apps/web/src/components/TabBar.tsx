"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/diary", icon: "📔", label: "Diary" },
  { href: "/school", icon: "🎓", label: "School" },
  { href: "/routine", icon: "⏰", label: "Routine" },
  { href: "/family", icon: "🏠", label: "Family" },
];

/**
 * Bottom tab bar on phones, left sidebar from `md` up. Every desktop rule sits
 * behind a breakpoint so the mobile rendering is untouched.
 */
export function TabBar() {
  const path = usePathname();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-[560px] bg-paperD border-t-2 border-dashed border-wood flex px-2 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]
        md:inset-x-auto md:left-0 md:top-0 md:bottom-0 md:mx-0 md:w-[228px] md:max-w-none
        md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r-2 md:px-4 md:pt-8 md:pb-8"
    >
      <div className="hidden md:block px-3 mb-6">
        <div className="font-hand text-3xl leading-none">The Biru Diaries</div>
        <div className="text-xs text-inkSoft mt-1">a scrapbook of one very small dog</div>
      </div>

      {TABS.map((t) => {
        const on = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex-1 text-center text-[11px] font-bold
              md:flex-none md:flex md:items-center md:gap-3 md:text-left md:text-[15px] md:px-3 md:py-2.5 md:rounded-lg
              ${on ? "text-ink md:bg-white md:shadow-sketchSoft" : "text-inkFaint md:hover:bg-white/60"}`}
          >
            <span
              className={`block text-[21px] mb-0.5 md:mb-0 md:text-[20px] ${on ? "" : "grayscale opacity-50 md:opacity-70"}`}
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
