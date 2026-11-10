import { OrderService } from '../../src/application/order.service';
import type {
  ErrandServices,
  OperationRecord,
  OrderRepository,
} from '../../src/application/ports';

const payload = {
  pickupLocationId: 'pickup',
  pickupSupplierName: 'Supplier',
  pickupLocationLabel: 'Location',
  description: 'Errand',
  deliveryDestination: 'Destination',
  instructions: 'Instructions',
  offeredCredits: 20,
};

describe('dispute application workflow', () => {
  const repository = {
    openDispute: jest.fn(),
    respondToDispute: jest.fn(),
    resolveDisputeIntent: jest.fn(),
    execute: jest.fn(),
    find: jest.fn(),
  };
  const clients = {
    isAdministrator: jest.fn(),
    username: jest.fn(),
    refundDispute: jest.fn(),
    settleDispute: jest.fn(),
  };
  const service = new OrderService(
    repository as unknown as OrderRepository,
    clients as unknown as ErrandServices,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repository.find.mockResolvedValue({
      id: 'errand',
      requesterId: 'requester',
      courierId: 'courier',
      status: 'RESOLVED',
    });
    clients.username.mockResolvedValue('User');
  });

  it('normalizes required requester and courier statements', async () => {
    repository.find.mockResolvedValue({
      id: 'errand',
      requesterId: 'requester',
      courierId: 'courier',
      status: 'DISPUTED',
    });
    await service.dispute('errand', 'requester', 'token', '  explanation  ');
    expect(repository.openDispute).toHaveBeenCalledWith(
      'errand',
      'requester',
      'explanation',
    );
    await service.respondToDispute(
      'errand',
      'courier',
      'token',
      '  response  ',
    );
    expect(repository.respondToDispute).toHaveBeenCalledWith(
      'errand',
      'courier',
      'response',
    );
    await expect(
      service.dispute('errand', 'requester', 'token', '   '),
    ).rejects.toMatchObject({ code: 'INVALID_DISPUTE_STATEMENT', status: 400 });
  });

  it.each([
    ['REFUND_REQUESTER', 'RESOLVE_REFUND', 'refundDispute'],
    ['PAY_COURIER', 'RESOLVE_PAY', 'settleDispute'],
  ] as const)(
    'runs %s through the durable credit operation before success',
    async (outcome, kind, clientMethod) => {
      clients.isAdministrator.mockResolvedValue(true);
      const operation: OperationRecord = {
        id: 'operation',
        errandId: 'errand',
        requesterId: 'administrator',
        kind,
        status: 'PENDING',
        inputDigest: 'digest',
        payload,
        expectedVersion: 4,
        previousAmount: 20,
        errorCode: null,
        errorStatus: null,
        courierId: 'courier',
      };
      repository.resolveDisputeIntent.mockResolvedValue(operation);
      repository.execute.mockImplementation(
        async (_id: string, credit: (op: OperationRecord) => Promise<void>) => {
          await credit(operation);
          return { ...operation, status: 'SUCCEEDED' as const };
        },
      );
      await expect(
        service.resolveDispute(
          'errand',
          'administrator',
          'token',
          'key',
          outcome,
        ),
      ).resolves.toMatchObject({ status: 'SUCCEEDED' });
      expect(clients[clientMethod]).toHaveBeenCalled();
    },
  );

  it('rejects resolution before creating an operation for a non-admin', async () => {
    clients.isAdministrator.mockResolvedValue(false);
    await expect(
      service.resolveDispute(
        'errand',
        'student',
        'token',
        'key',
        'REFUND_REQUESTER',
      ),
    ).rejects.toMatchObject({ code: 'ADMINISTRATOR_REQUIRED', status: 403 });
    expect(repository.resolveDisputeIntent).not.toHaveBeenCalled();
  });
});
