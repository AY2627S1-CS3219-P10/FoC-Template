/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, RegisterPage).
 * Author review: Validated metadata, RegisterPage rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording.
 */

import { AuthForm } from "@/features/auth/auth-form";
export const metadata = { title: "Create an account" };
export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
