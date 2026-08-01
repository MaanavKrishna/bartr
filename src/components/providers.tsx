"use client";

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { SavedListingsProvider } from "@/components/saved-listings-provider";

/** Every client-side provider the app needs, mounted once in the root layout. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SavedListingsProvider>
        {children}
        <Toaster />
      </SavedListingsProvider>
    </ThemeProvider>
  );
}
