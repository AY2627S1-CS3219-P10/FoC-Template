import {
  type SupplierValidationField,
  SupplierValidationError,
} from './supplier-validation.error.js';

export const SUPPLIER_CATEGORIES = [
  'FOOD',
  'FOOD_COFFEE',
  'PRINTING',
  'SHOPPING',
] as const;

export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function normalizeRequiredText(
  value: string,
  field: SupplierValidationField,
  maximumLength: number,
): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new SupplierValidationError(
      field,
      `${field.toUpperCase()}_REQUIRED`,
      `${field} is required.`,
    );
  }

  if (normalized.length > maximumLength) {
    throw new SupplierValidationError(
      field,
      `${field.toUpperCase()}_TOO_LONG`,
      `${field} must contain at most ${maximumLength} characters.`,
    );
  }

  return normalized;
}

export function parseCatalogTime(
  value: string,
  field: 'closesAt' | 'opensAt',
): Date {
  if (!TIME_PATTERN.test(value)) {
    throw new SupplierValidationError(
      field,
      `${field.toUpperCase()}_INVALID_FORMAT`,
      `${field} must use 24-hour HH:mm format.`,
    );
  }

  return new Date(`1970-01-01T${value}:00.000Z`);
}

export function assertSupplierCategory(
  value: string,
): asserts value is SupplierCategory {
  if (!SUPPLIER_CATEGORIES.includes(value as SupplierCategory)) {
    throw new SupplierValidationError(
      'category',
      'CATEGORY_INVALID',
      'Supplier category is not supported.',
    );
  }
}

export function assertCoordinate(
  value: number,
  field: 'latitude' | 'longitude',
): void {
  const [minimum, maximum] = field === 'latitude' ? [-90, 90] : [-180, 180];

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new SupplierValidationError(
      field,
      `${field.toUpperCase()}_INVALID`,
      `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
}

export function assertFloor(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new SupplierValidationError(
      'floor',
      'FLOOR_INVALID',
      'floor must be a non-negative integer.',
    );
  }
}

export function normalizeOptionalImageUrl(
  value: string | undefined,
): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      normalized.length > 2048
    ) {
      throw new Error('Unsupported image URL.');
    }

    return normalized;
  } catch {
    throw new SupplierValidationError(
      'imageUrl',
      'IMAGE_URL_INVALID',
      'imageUrl must be a valid HTTP or HTTPS URL.',
    );
  }
}
