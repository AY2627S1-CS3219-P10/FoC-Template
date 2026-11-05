import { Tags } from 'aws-cdk-lib';
import type { App, Environment } from 'aws-cdk-lib';
import { AppStack } from './app-stack';
import type { Profile } from './config';
import { DataStack } from './data-stack';
import { JobsStack } from './jobs-stack';
import { NetworkStack } from './network-stack';
import { RegistryStack } from './registry-stack';

export interface FocStacksProps {
  readonly profile: Profile;
  readonly env: Environment;
  readonly imageTag: string;
  readonly alarmEmail?: string;
}

export interface FocStacks {
  readonly network: NetworkStack;
  readonly registry: RegistryStack;
  readonly data: DataStack;
  readonly jobs: JobsStack;
  readonly app: AppStack;
}

/**
 * Deploy order: network and registry, push the images, data, run the database
 * bootstrap task, jobs, run the migrate and seed tasks, then app.
 */
export function createFocStacks(app: App, props: FocStacksProps): FocStacks {
  const { profile, env, imageTag, alarmEmail } = props;
  const network = new NetworkStack(app, 'FocNetwork', {
    env,
    profile,
    description:
      'Friend on Campus VPC, ECS cluster and service security groups',
  });
  const registry = new RegistryStack(app, 'FocRegistry', {
    env,
    description: 'Friend on Campus container image repositories',
  });
  const data = new DataStack(app, 'FocData', {
    env,
    profile,
    network,
    description: 'Friend on Campus Postgres, Valkey, RabbitMQ and secrets',
    terminationProtection: profile.name === 'scale',
  });
  const jobs = new JobsStack(app, 'FocJobs', {
    env,
    registry,
    data,
    imageTag,
    description: 'Friend on Campus migration and seed tasks',
  });
  const appStack = new AppStack(app, 'FocApp', {
    env,
    profile,
    network,
    registry,
    data,
    imageTag,
    alarmEmail,
    description: 'Friend on Campus services, load balancer, CDN and monitoring',
  });

  // CDK marks this resource type as taggable, but its schema has no Tags.
  const tagOptions = { excludeResourceTypes: ['AWS::RDS::DBProxyTargetGroup'] };
  Tags.of(app).add('Project', 'friend-on-campus', tagOptions);
  Tags.of(app).add('Profile', profile.name, tagOptions);

  return { network, registry, data, jobs, app: appStack };
}
