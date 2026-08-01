import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/config/env";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: "Bartr — campus barter & resale",
    template: "%s · Bartr",
  },
  description:
    "Shopify for campus barter and resale marketplaces. Buy, sell and trade with people on your campus.",
  openGraph: {
    title: "Bartr — campus barter & resale",
    description:
      "Buy, sell and trade with people on your campus. Textbooks, bikes, fridges, tickets and everything in between.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables belong on <html>: Tailwind's preflight sets
    // `font-family` there, so declaring them on <body> would leave it
    // unresolved and fall back to the browser's serif default.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <Providers>
          <div className="flex min-h-screen flex-col">
            {/* The header reads `useSearchParams`, so it needs its own
                boundary to keep pages statically renderable. */}
            <Suspense fallback={<div className="h-16 border-b" />}>
              <SiteHeader />
            </Suspense>
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
