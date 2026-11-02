import { OrderService } from '../../src/application/order.service';
import type {
  OrderRepository,
  ErrandServices,
} from '../../src/application/ports';

describe('private bookmarks', () => {
  const repository = {
    find: jest.fn(),
    bookmark: jest.fn(),
    bookmarkedIds: jest.fn(),
    listOpen: jest.fn(),
    listStarred: jest.fn(),
    isExcluded: jest.fn(),
  };
  const service = new OrderService(
    repository as unknown as OrderRepository,
    {} as ErrandServices,
  );
  beforeEach(() => jest.resetAllMocks());

  it('does not save an inaccessible errand', async () => {
    repository.find.mockResolvedValue({
      requesterId: 'requester',
      courierId: 'someone',
      status: 'ACCEPTED',
    });
    await expect(
      service.bookmark('errand', 'courier', true),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.bookmark).not.toHaveBeenCalled();
  });

  it('can remove your bookmark after losing access', async () => {
    await expect(service.bookmark('errand', 'courier', false)).resolves.toEqual(
      { isStarred: false },
    );
    expect(repository.bookmark).toHaveBeenCalledWith(
      'errand',
      'courier',
      false,
    );
    expect(repository.find).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'EXPIRED'])(
    'rejects saving a %s errand',
    async (status) => {
      repository.find.mockResolvedValue({
        id: 'errand',
        requesterId: 'courier',
        courierId: null,
        status,
        expiresAt: new Date(),
      });
      await expect(
        service.bookmark('errand', 'courier', true),
      ).rejects.toMatchObject({ code: 'ERRAND_NOT_BOOKMARKABLE', status: 409 });
      expect(repository.bookmark).not.toHaveBeenCalled();
    },
  );

  it('uses the current viewer when restoring stars on a page', async () => {
    repository.listOpen.mockResolvedValue([{ id: 'first' }, { id: 'second' }]);
    repository.bookmarkedIds.mockResolvedValue(['second']);
    await expect(service.list(20, 40, 'oldest', 'courier')).resolves.toEqual([
      { id: 'first', isStarred: false },
      { id: 'second', isStarred: true },
    ]);
    expect(repository.bookmarkedIds).toHaveBeenCalledWith('courier', [
      'first',
      'second',
    ]);
  });
});
