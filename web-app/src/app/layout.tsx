/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of layout rendering and interaction code (metadata, RootLayout).
 * Author review: Validated metadata, RootLayout rendered content, props usage in web-app/layout.tsx; refined JSX layout and user-facing wording.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CreateErrandShortcut } from "@/components/create-errand-shortcut";
import { AuthProvider } from "@/features/auth/auth-provider";
import { CreditProvider } from "@/features/credits/credit-provider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Friend on Campus — A little help goes a long way",
    template: "%s | Friend on Campus",
  },
  description: "Discover campus errands, lend a hand, and make someone’s day.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AuthProvider>
          <CreditProvider>
            <SiteHeader />
            <main id="main" className="page-shell">
              {children}
            </main>
            <CreateErrandShortcut />
          </CreditProvider>
        </AuthProvider>
        <footer className="site-footer">
          <Link href="/">
            friend on campus<span> • </span>Small errands. Strong community.
          </Link>
          <span>Made for campus life.</span>
        </footer>
      </body>
    </html>
  );
}
