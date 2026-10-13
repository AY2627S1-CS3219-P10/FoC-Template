import { Injectable } from '@nestjs/common';

export type CreditOperation =
  | 'initialize'
  | 'reserve'
  | 'adjust'
  | 'settle'
  | 'release';

export type RetryCause = 'serialization' | 'unique_conflict';

type MetricName =
  | 'credit_transaction_retries_total'
  | 'credit_transaction_failures_total'
  | 'credit_operation_conflicts_total'
  | 'credit_operations_total';

@Injectable()
export class CreditMetricsService {
  private readonly values = new Map<string, number>();

  recordRetry(operation: CreditOperation, cause: RetryCause): void {
    this.increment('credit_transaction_retries_total', operation, cause);
  }

  recordFailure(operation: CreditOperation, cause: string): void {
    this.increment('credit_transaction_failures_total', operation, cause);
  }

  recordConflict(operation: CreditOperation, type: string): void {
    this.increment('credit_operation_conflicts_total', operation, type);
  }

  recordOperation(operation: CreditOperation, outcome: string): void {
    this.increment('credit_operations_total', operation, outcome);
  }

  render(): string {
    return [
      '# HELP credit_transaction_retries_total Retried serializable credit transactions.',
      '# TYPE credit_transaction_retries_total counter',
      ...this.samples('credit_transaction_retries_total', 'cause'),
      '# HELP credit_transaction_failures_total Credit transactions that ended in failure.',
      '# TYPE credit_transaction_failures_total counter',
      ...this.samples('credit_transaction_failures_total', 'cause'),
      '# HELP credit_operation_conflicts_total Credit operations rejected because of a state or identity conflict.',
      '# TYPE credit_operation_conflicts_total counter',
      ...this.samples('credit_operation_conflicts_total', 'type'),
      '# HELP credit_operations_total Completed credit operation outcomes.',
      '# TYPE credit_operations_total counter',
      ...this.samples('credit_operations_total', 'outcome'),
      '',
    ].join('\n');
  }

  private increment(
    metric: MetricName,
    operation: CreditOperation,
    classification: string,
  ): void {
    const key = `${metric}|${operation}|${classification}`;
    this.values.set(key, (this.values.get(key) ?? 0) + 1);
  }

  private samples(metric: MetricName, classificationLabel: string): string[] {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(`${metric}|`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        const [, operation, classification] = key.split('|');
        return `${metric}{operation="${operation}",${classificationLabel}="${classification}"} ${value}`;
      });
  }
}
