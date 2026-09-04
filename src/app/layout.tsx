import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AIRTIME", template: "%s · AIRTIME" },
  description: "A browser-native 24/7 television network where every surface is programmable advertising inventory. Built on Robinhood Chain.",
  applicationName: "AIRTIME",
  robots: { index: true, follow: true },
};

/**
 * Every response is rendered per request so the per-request CSP nonce set by
 * src/proxy.ts is applied to Next's own script tags. A statically prerendered
 * shell cannot carry a nonce, and `strict-dynamic` would then block hydration.
 * Nothing here benefits from a prerendered shell: the station is live data.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#050607",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${jetbrains.variable}`}>
      <body className="min-h-full bg-ink-950 text-ink-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
