/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of credit metrics service test cases.
 * Author review: Validated the assertions and setup for "renders bounded Prometheus counters"; clarified test descriptions and assertion formatting.
 */

import { CreditMetricsService } from '../../src/infrastructure/credit-metrics.service';

describe('CreditMetricsService', () => {
  it('renders bounded Prometheus counters', () => {
    const metrics = new CreditMetricsService();
    metrics.recordRetry('settle', 'serialization');
    metrics.recordRetry('settle', 'serialization');
    metrics.recordFailure('settle', 'concurrent_operation');
    metrics.recordConflict('settle', 'reservation_state_conflict');
    metrics.recordOperation('settle', 'success');

    expect(metrics.render()).toContain(
      'credit_transaction_retries_total{operation="settle",cause="serialization"} 2',
    );
    expect(metrics.render()).toContain(
      'credit_transaction_failures_total{operation="settle",cause="concurrent_operation"} 1',
    );
    expect(metrics.render()).toContain(
      'credit_operation_conflicts_total{operation="settle",type="reservation_state_conflict"} 1',
    );
    expect(metrics.render()).toContain(
      'credit_operations_total{operation="settle",outcome="success"} 1',
    );
  });
});
