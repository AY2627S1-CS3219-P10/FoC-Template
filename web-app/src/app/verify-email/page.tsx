/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, VerifyPage).
 * Author review: Validated metadata, VerifyPage rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording.
 */

import { AuthForm } from "@/features/auth/auth-form";
export const metadata = { title: "Verify your email" };
export default function VerifyPage() {
  return <AuthForm mode="verify" />;
}
