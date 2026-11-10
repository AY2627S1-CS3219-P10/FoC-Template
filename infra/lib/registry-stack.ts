/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of image registry declarations.
 * Author review: Checked RegistryStack property values and existing resource references in registry-stack.ts; edited declaration naming and TypeScript formatting.
 */

import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { Construct } from 'constructs';
import { SERVICE_NAMES, pascalCase } from './config';

export const REPOSITORY_NAMES = [
  ...SERVICE_NAMES,
  'migrate-user',
  'migrate-supplier',
] as const;
export type RepositoryName = (typeof REPOSITORY_NAMES)[number];

/**
 * Image of a repository, found by its fixed name. Going through a repository
 * object from this stack would build the URI with Fn::Split around a
 * cross-stack reference, a position Fn::GetStackOutput does not document.
 */
export function imageOf(
  scope: Construct,
  name: RepositoryName,
  tag: string,
): ecs.ContainerImage {
  return ecs.ContainerImage.fromEcrRepository(
    ecr.Repository.fromRepositoryName(
      scope,
      `${pascalCase(name)}Repository`,
      `foc/${name}`,
    ),
    tag,
  );
}

/**
 * ECR repositories, in their own stack because images must be pushed before
 * the stacks that run them are deployed, and must outlive the app stack.
 */
export class RegistryStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    for (const name of REPOSITORY_NAMES) {
      new ecr.Repository(this, pascalCase(name), {
        repositoryName: `foc/${name}`,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        imageScanOnPush: true,
        lifecycleRules: [{ maxImageCount: 10 }],
        removalPolicy: RemovalPolicy.DESTROY,
        emptyOnDelete: true,
      });
    }
  }
}
