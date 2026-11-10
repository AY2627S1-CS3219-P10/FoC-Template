/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of one-off task invocation helpers.
 * Author review: Checked OneOffTask property values and existing resource references in one-off-task.ts; edited declaration naming and TypeScript formatting.
 */

import * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface OneOffTaskProps {
  readonly family: string;
  readonly image: ecs.ContainerImage;
  readonly logGroup: logs.ILogGroup;
  readonly entryPoint?: string[];
  readonly command?: string[];
  readonly environment?: Record<string, string>;
  readonly secrets: Record<string, ecs.Secret>;
}

/**
 * A task definition with no service, started by hand or from CI with
 * `aws ecs run-task`: database bootstrap, migrations and seeds.
 */
export class OneOffTask extends Construct {
  constructor(scope: Construct, id: string, props: OneOffTaskProps) {
    super(scope, id);
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task', {
      family: props.family,
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDefinition.addContainer('main', {
      image: props.image,
      entryPoint: props.entryPoint,
      command: props.command,
      environment: props.environment,
      secrets: props.secrets,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: props.logGroup,
        streamPrefix: props.family,
      }),
    });
  }
}
