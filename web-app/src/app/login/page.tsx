/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, LoginPage).
 * Author review: Validated metadata, LoginPage rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording.
 */

import { AuthForm } from "@/features/auth/auth-form";
export const metadata = { title: "Log in" };
export default function LoginPage() {
  return <AuthForm mode="login" />;
}
