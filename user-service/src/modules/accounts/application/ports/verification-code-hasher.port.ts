/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of verification code hasher port code (VerificationCodeHasherPort).
 * Author review: Checked existing VerificationCodeHasherPort parameter and return types against their callers; edited type declaration layout and member naming.
 */

export interface VerificationCodeHasherPort {
  hash(code: string): string;
}
