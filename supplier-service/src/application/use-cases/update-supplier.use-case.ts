import type { SupplierCatalogEntry } from '../../domain/supplier-catalog.js';
import {
  assertSupplierCategory,
  normalizeRequiredText,
} from '../../domain/supplier-input.js';
import type { SupplierCategory } from '../../domain/supplier-input.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';
import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export interface UpdateSupplierInput {
  category?: string;
  name?: string;
}

export class UpdateSupplierUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  async execute(
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierCatalogEntry> {
    if (input.name === undefined && input.category === undefined) {
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

    let category: SupplierCategory | undefined;

    if (input.category !== undefined) {
      assertSupplierCategory(input.category);
      category = input.category;
    }

    return this.repository.updateSupplier({
      category,
      id: supplierId,
      name,
    });
  }
}
