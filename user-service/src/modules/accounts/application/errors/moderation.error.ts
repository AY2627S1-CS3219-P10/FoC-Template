/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of moderation error code (ModerationError).
 * Author review: Checked ModerationError error messages and exposed properties; standardized exception naming and formatting.
 */

export class ModerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
