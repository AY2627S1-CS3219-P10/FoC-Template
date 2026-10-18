import { Job } from 'bullmq';
import { timerJob } from '../../src/infrastructure/timer.worker';

const errandId = '00000000-0000-4000-8000-000000000001';
/** BullMQ's own option check, which `Queue.add` runs before talking to Redis. */
function validate(job: { name: string; data: object; opts: object }) {
  const check = (
    Job.prototype as unknown as {
      validateOptions(this: object, json: { data: string }): void;
    }
  ).validateOptions;
  check.call(
    { name: job.name, opts: job.opts },
    { data: JSON.stringify(job.data) },
  );
}

describe('lifecycle timer jobs', () => {
  it.each(['auto-complete', 'reopen', 'expire'] as const)(
    '%s jobs pass BullMQ validation with one stable id per errand',
    (name) => {
      const job = timerJob(name, errandId);
      expect(() => validate(job)).not.toThrow();
      expect(job.opts.jobId).toBe(`${name}-${errandId}`);
      expect(job.data).toEqual({ errandId });
    },
  );

  it('regression: the earlier "name:id" job id is rejected by BullMQ', () =>
    expect(() =>
      validate({
        ...timerJob('auto-complete', errandId),
        opts: { jobId: `auto-complete:${errandId}` },
      }),
    ).toThrow('Custom Id cannot contain :'));
});
