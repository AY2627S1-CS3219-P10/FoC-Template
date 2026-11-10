/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of loading rendering and interaction code (Loading).
 * Author review: Validated Loading rendered content, props usage in web-app/loading.tsx; refined JSX layout and user-facing wording.
 */

export default function Loading() {
  return (
    <div className="empty-state" role="status">
      <p className="eyebrow">ONE MOMENT</p>
      <h2>Finding your next good deed…</h2>
    </div>
  );
}
