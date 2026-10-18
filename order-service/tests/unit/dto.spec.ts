import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateErrandDto, EditErrandDto } from '../../src/api/dto';
import { MAX_OFFERED_CREDITS } from '../../src/domain/errand';

const create = {
  pickupLocationId: '20000000-0000-4000-8000-000000000001',
  description: 'Pick up coffee',
  deliveryDestination: 'Library entrance',
  instructions: 'Call on arrival',
};
const errorsFor = async (cls: new () => object, body: object) =>
  (await validate(plainToInstance(cls, body))).map((error) => error.property);

describe('offered credit limits (K1)', () => {
  it('accepts the credit-service maximum and rejects anything above it', async () => {
    expect(
      await errorsFor(CreateErrandDto, {
        ...create,
        offeredCredits: MAX_OFFERED_CREDITS,
      }),
    ).toEqual([]);
    expect(
      await errorsFor(CreateErrandDto, {
        ...create,
        offeredCredits: MAX_OFFERED_CREDITS + 1,
      }),
    ).toEqual(['offeredCredits']);
    expect(
      await errorsFor(EditErrandDto, {
        expectedVersion: 0,
        offeredCredits: MAX_OFFERED_CREDITS + 1,
      }),
    ).toEqual(['offeredCredits']);
  });
});
