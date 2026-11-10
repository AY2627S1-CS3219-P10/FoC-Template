/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of not found rendering and interaction code (NotFound).
 * Author review: Validated NotFound rendered content, props usage in web-app/not-found.tsx; refined JSX layout and user-facing wording.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">A LITTLE DETOUR</p>
      <h1>We couldn’t find that page.</h1>
      <p>Head back to explore campus suppliers.</p>
      <Link href="/suppliers" className="button button-dark">
        Browse suppliers
      </Link>
    </div>
  );
}
