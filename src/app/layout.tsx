import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

/**
 * The station ships its own sans so every visitor reads the same face. The
 * design is drawn against Helvetica Now, which is a licensed Monotype family
 * and cannot be served here; without it the page fell through to Helvetica Neue
 * on macOS and Arial on Windows, so the type looked different per platform.
 * next/font self-hosts this at build time, which is also what keeps it inside
 * the "font-src 'self'" CSP.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const DESCRIPTION =
  "A browser-native 24/7 television network where every surface is programmable advertising inventory. Built on Robinhood Chain.";

/**
 * The icon and the social card are the files beside this one — Next picks up
 * icon.png, apple-icon.png, opengraph-image.png and twitter-image.png by name.
 * metadataBase is what turns them into the absolute URLs a crawler needs, so it
 * has to match the origin the station is actually served from.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "AIRTIME", template: "%s · AIRTIME" },
  description: DESCRIPTION,
  applicationName: "AIRTIME",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "AIRTIME",
    title: "AIRTIME",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "AIRTIME",
    description: DESCRIPTION,
  },
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
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-full bg-ink-950 text-ink-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
