// AI-assisted implementation; review required. See the project's AI usage disclosure.
/** Canonical display text for supplier names and pickup-point identity fields. */
export function normalizeCatalogText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}
