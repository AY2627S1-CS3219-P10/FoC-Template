/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, Page).
 * Author review: Validated metadata, Page rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording.
 */

import { AccountPage } from "@/features/auth/account-page";
export const metadata = { title: "Your account" };
export default function Page() {
  return <AccountPage />;
}
