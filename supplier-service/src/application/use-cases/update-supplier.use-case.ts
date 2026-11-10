/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of update supplier code (UpdateSupplierInput, UpdateSupplierUseCase).
 * Author review: Validated UpdateSupplierInput, UpdateSupplierUseCase input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import { normalizeRequiredText } from '../../domain/supplier-input.js';
import { resolveCategories } from '../../domain/supplier-categories.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';
import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export interface UpdateSupplierInput {
  confirmDistinctOutlet?: boolean;
  category?: string;
  categories?: string[];
  name?: string;
}

export class UpdateSupplierUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  async execute(
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierCatalogEntry> {
    if (
      input.name === undefined &&
      input.category === undefined &&
      input.categories === undefined
    ) {
      throw new SupplierValidationError(
        'supplier',
        'SUPPLIER_UPDATE_EMPTY',
        'At least one supplier field must be provided.',
      );
    }

    const name =
      input.name === undefined
        ? undefined
        : normalizeRequiredText(input.name, 'name', 160);

    const classification =
      input.category !== undefined || input.categories !== undefined
        ? resolveCategories(input)
        : undefined;

    return this.repository.updateSupplier({
      ...(input.confirmDistinctOutlet === true
        ? { confirmDistinctOutlet: true }
        : {}),
      category: classification?.category,
      ...(classification ? { categories: classification.categories } : {}),
      id: supplierId,
      name,
    });
  }
}
