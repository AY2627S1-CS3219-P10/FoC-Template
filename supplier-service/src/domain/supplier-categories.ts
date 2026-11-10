// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import type { SupplierCategory } from './supplier-input.js';
import { assertSupplierCategory } from './supplier-input.js';
import { SupplierValidationError } from './supplier-validation.error.js';

export const SUPPLIER_TAGS = [
  'FOOD',
  'BEVERAGES',
  'PRINTING',
  'SHOPPING',
] as const;
export type SupplierTag = (typeof SUPPLIER_TAGS)[number];

export function categoriesFromLegacy(
  category: SupplierCategory,
): SupplierTag[] {
  return category === 'FOOD_COFFEE' ? ['FOOD', 'BEVERAGES'] : [category];
}

export function normaliseCategories(value: unknown): SupplierTag[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((tag: unknown) => !SUPPLIER_TAGS.includes(tag as SupplierTag)) ||
    new Set(value).size !== value.length
  ) {
    throw new SupplierValidationError(
      'categories',
      'CATEGORIES_INVALID',
      'categories must be a nonempty array of unique supported tags.',
    );
  }
  return SUPPLIER_TAGS.filter((tag) => value.includes(tag));
}

// Compatibility for clients still reading the single category field.
export function legacyCategory(categories: SupplierTag[]): SupplierCategory {
  if (categories.includes('BEVERAGES')) return 'FOOD_COFFEE';
  if (categories.includes('FOOD')) return 'FOOD';
  return categories.includes('PRINTING') ? 'PRINTING' : 'SHOPPING';
}

export function resolveCategories(input: {
  category?: string;
  categories?: unknown;
}): {
  category: SupplierCategory;
  categories: SupplierTag[];
} {
  if (input.category !== undefined && input.categories !== undefined) {
    throw new SupplierValidationError(
      'categories',
      'CATEGORIES_CONFLICT',
      'Supply categories or legacy category, not both.',
    );
  }
  if (input.categories !== undefined) {
    const categories = normaliseCategories(input.categories);
    return { categories, category: legacyCategory(categories) };
  }
  assertSupplierCategory(input.category as string);
  const category = input.category as SupplierCategory;
  return { category, categories: categoriesFromLegacy(category) };
}
