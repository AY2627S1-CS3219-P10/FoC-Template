// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import { SupplierValidationError } from '../../../src/domain/supplier-validation.error.js';
import {
  categoriesFromLegacy,
  normaliseCategories,
  resolveCategories,
} from '../../../src/domain/supplier-categories.js';

describe('supplier category tags', () => {
  it('maps the old combined category to two independent tags', () => {
    expect(categoriesFromLegacy('FOOD_COFFEE')).toEqual(['FOOD', 'BEVERAGES']);
    expect(categoriesFromLegacy('FOOD')).toEqual(['FOOD']);
    expect(categoriesFromLegacy('PRINTING')).toEqual(['PRINTING']);
    expect(categoriesFromLegacy('SHOPPING')).toEqual(['SHOPPING']);
  });

  it('normalises order and supports drinks-only suppliers', () => {
    expect(normaliseCategories(['BEVERAGES', 'FOOD'])).toEqual([
      'FOOD',
      'BEVERAGES',
    ]);
    expect(resolveCategories({ categories: ['BEVERAGES'] })).toEqual({
      category: 'FOOD_COFFEE',
      categories: ['BEVERAGES'],
    });
  });

  it.each([
    null,
    [],
    'FOOD',
    ['FOOD', 'FOOD'],
    ['FOOD_COFFEE'],
    ['OTHER'],
    [null],
  ])('rejects invalid tags: %j', (categories) => {
    expect(() => normaliseCategories(categories)).toThrow(
      SupplierValidationError,
    );
  });

  it('requires a classification and rejects ambiguous old and new inputs', () => {
    expect(() => resolveCategories({})).toThrow();
    expect(() =>
      resolveCategories({ category: 'FOOD', categories: ['BEVERAGES'] }),
    ).toThrow(SupplierValidationError);
  });
});
