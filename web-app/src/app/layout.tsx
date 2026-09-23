import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { AuthProvider } from "@/features/auth/auth-provider";
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
          <SiteHeader />
          <main id="main" className="page-shell">
            {children}
          </main>
        </AuthProvider>
        <footer className="site-footer">
          <Link href="/">
            friend on campus<span> • </span>Small errands. Stronger community.
          </Link>
          <span>Made for campus life.</span>
        </footer>
      </body>
    </html>
  );
}
