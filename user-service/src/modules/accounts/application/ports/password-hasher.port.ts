/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of password hasher port code (PasswordHasherPort).
 * Author review: Checked existing PasswordHasherPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
}
