#!/usr/bin/env node
import { Annotations, App } from 'aws-cdk-lib';
import { REGION, getProfile } from '../lib/config';
import { createFocStacks } from '../lib/stacks';

const app = new App();
const context = (key: string): string | undefined =>
  app.node.tryGetContext(key) as string | undefined;

const imageTag = context('imageTag');

const stacks = createFocStacks(app, {
  profile: getProfile(context('profile')),
  // The CLI sets the account from --profile. Region is fixed by the sandbox.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION },
  imageTag: imageTag ?? 'unset',
  alarmEmail: context('alarmEmail'),
});

if (!imageTag) {
  Annotations.of(stacks.app).addWarning(
    'No imageTag context: tasks would fail to pull. Deploy with -c imageTag=<git sha>.',
  );
}
