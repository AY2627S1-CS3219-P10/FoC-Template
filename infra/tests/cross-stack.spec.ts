/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of cross stack test assertions and fixtures.
 * Author review: Checked cross stack spec test setup and assertions against the expected results; edited fixture naming and assertion formatting.
 */

import type { Template } from 'aws-cdk-lib/assertions';
import { synthesize } from './support';

const SUPPORTED_POSITIONS = new Set(['Fn::Join', 'Fn::If', 'Fn::Select']);

/** Each Fn::GetStackOutput with the intrinsics around it, outermost first. */
function positions(node: unknown, around: string[] = []): string[][] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => positions(item, around));
  }
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === 'Fn::GetStackOutput') return [around];
    const next = key.startsWith('Fn::') ? [...around, key] : around;
    return positions(value, next);
  });
}

/**
 * A wrong position passes synth and fails only at deploy, with InternalFailure.
 * See the "Known limitations" of Fn::GetStackOutput in the CloudFormation docs.
 */
describe.each(['demo', 'scale'] as const)(
  'cross-stack references (%s)',
  (profile) => {
    const templates = Object.entries(synthesize(profile));

    it.each(templates)(
      '%s has none in its Outputs',
      (_name: string, template: Template) => {
        const { Outputs } = template.toJSON() as { Outputs?: unknown };
        expect(positions(Outputs)).toEqual([]);
      },
    );

    it.each(templates)(
      '%s uses them only in documented positions',
      (_name: string, template: Template) => {
        const { Resources } = template.toJSON() as { Resources: unknown };
        const unsupported = positions(Resources).filter((around) =>
          around.some((intrinsic) => !SUPPORTED_POSITIONS.has(intrinsic)),
        );
        expect(unsupported).toEqual([]);
      },
    );
  },
);
