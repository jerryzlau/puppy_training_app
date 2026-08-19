import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Biru Diaries",
  description: "A scrapbook of one very small dog — diary + puppy school.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Biru" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#F7F1E3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Kalam:wght@300;400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="mx-auto max-w-[560px] min-h-dvh relative">
          <SessionProvider>{children}</SessionProvider>
        </div>
      </body>
    </html>
  );
}
