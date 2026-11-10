/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of password verifier port code (PasswordVerifierPort).
 * Author review: Checked existing PasswordVerifierPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface PasswordVerifierPort {
  verify(password: string, passwordHash: string | null): Promise<boolean>;
}
