/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of existing CI resource definitions.
 * Author review: Checked CiStack property values and existing resource references in ci-stack.ts; edited declaration naming and TypeScript formatting.
 */

import { Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_ISSUER = 'token.actions.githubusercontent.com';
const GITHUB_AUDIENCE = 'sts.amazonaws.com';
/**
 * The repository as GitHub names it in OIDC subjects. Repositories created
 * after July 15, 2026 get GitHub's immutable subject format, which adds the
 * numeric owner and repository IDs, so a deleted and re-created repository of
 * the same name can't match. Check the format with
 * `gh api repos/AY2627S1-CS3219-P10/FoC-Template/actions/oidc/customization/sub`.
 */
const GITHUB_REPOSITORY =
  'AY2627S1-CS3219-P10@324971253/FoC-Template@1357325846';

/**
 * The only GitHub ref that may assume the deploy role. The repository is
 * public, so this is an exact match: fork pull requests and other branches
 * present a different subject and get no credentials.
 */
export const DEPLOY_SUBJECT = `repo:${GITHUB_REPOSITORY}:ref:refs/heads/main`;

/** The only stacks CI deploys. */
export const DEPLOYED_STACKS = ['FocJobs', 'FocApp'];
/** Read for outputs (subnets, security groups) and weak cross-stack references. */
const READ_STACKS = ['FocNetwork', 'FocRegistry', 'FocData', 'CDKToolkit'];
/** One-off tasks deploy.yml runs before rolling out the app. */
export const MIGRATION_TASKS = ['foc-migrate-user', 'foc-migrate-supplier'];

/**
 * GitHub's OIDC provider and the role that GitHub Actions deploys with, so no
 * AWS keys are stored in GitHub.
 */
export class CiStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const provider = new iam.OidcProviderNative(this, 'GitHub', {
      url: `https://${GITHUB_ISSUER}`,
      clientIds: [GITHUB_AUDIENCE],
    });

    const role = new iam.Role(this, 'Deploy', {
      roleName: 'foc-github-deploy',
      description: 'Assumed by GitHub Actions to deploy Friend on Campus',
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_ISSUER}:aud`]: GITHUB_AUDIENCE,
          [`${GITHUB_ISSUER}:sub`]: DEPLOY_SUBJECT,
        },
      }),
    });

    for (const statement of deployStatements(this)) role.addToPolicy(statement);
  }
}

/**
 * What deploy.yml needs, and no more. The organization denies assuming CDK's
 * bootstrap roles, so CDK falls back to this role's own credentials for
 * assets and change sets. CloudFormation still changes resources through
 * CDK's cfn-exec role, which the stacks already use, so this role never needs
 * rights to the resources themselves. It may change only FocJobs and FocApp:
 * the network, registry, data and CI stacks stay manual.
 */
function deployStatements(stack: Stack): iam.PolicyStatement[] {
  const arn = (
    service: string,
    resource: string,
    resourceName: string,
    global = false,
  ): string =>
    stack.formatArn({
      service,
      resource,
      resourceName,
      region: global ? '' : undefined,
    });
  const stackArn = (name: string): string =>
    arn('cloudformation', 'stack', `${name}/*`);
  const qualifier = 'hnb659fds';
  const assetsBucket = `cdk-${qualifier}-assets-${stack.account}-${stack.region}`;
  const cluster = arn('ecs', 'cluster', 'foc');

  return [
    new iam.PolicyStatement({
      sid: 'DeployJobsAndApp',
      actions: [
        'cloudformation:CreateChangeSet',
        'cloudformation:DeleteChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResources',
        'cloudformation:ListStackResources',
        'cloudformation:GetTemplate',
      ],
      resources: DEPLOYED_STACKS.map(stackArn),
    }),
    new iam.PolicyStatement({
      sid: 'ReadStacks',
      actions: ['cloudformation:DescribeStacks'],
      resources: [...DEPLOYED_STACKS, ...READ_STACKS].map(stackArn),
    }),
    new iam.PolicyStatement({
      sid: 'PassExecutionRoleToCloudFormation',
      actions: ['iam:PassRole'],
      resources: [
        arn(
          'iam',
          'role',
          `cdk-${qualifier}-cfn-exec-role-${stack.account}-${stack.region}`,
          true,
        ),
      ],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' },
      },
    }),
    new iam.PolicyStatement({
      sid: 'ReadBootstrapVersion',
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        arn('ssm', 'parameter', `cdk-bootstrap/${qualifier}/version`),
      ],
    }),
    new iam.PolicyStatement({
      sid: 'PublishTemplates',
      actions: [
        's3:GetBucketLocation',
        's3:GetEncryptionConfiguration',
        's3:ListBucket',
        's3:GetObject',
        's3:PutObject',
      ],
      resources: [
        `arn:${stack.partition}:s3:::${assetsBucket}`,
        `arn:${stack.partition}:s3:::${assetsBucket}/*`,
      ],
    }),
    new iam.PolicyStatement({
      sid: 'SignInToEcr',
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }),
    new iam.PolicyStatement({
      sid: 'PushImages',
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:CompleteLayerUpload',
        'ecr:DescribeImages',
        'ecr:GetDownloadUrlForLayer',
        'ecr:InitiateLayerUpload',
        'ecr:PutImage',
        'ecr:UploadLayerPart',
      ],
      resources: [arn('ecr', 'repository', 'foc/*')],
    }),
    new iam.PolicyStatement({
      sid: 'RunMigrations',
      actions: ['ecs:RunTask'],
      resources: MIGRATION_TASKS.map((family) =>
        arn('ecs', 'task-definition', `${family}:*`),
      ),
      conditions: { ArnEquals: { 'ecs:cluster': cluster } },
    }),
    new iam.PolicyStatement({
      sid: 'PassMigrationRolesToEcs',
      actions: ['iam:PassRole'],
      resources: [arn('iam', 'role', 'FocJobs-Migrate*', true)],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' },
      },
    }),
    new iam.PolicyStatement({
      sid: 'WatchTasksAndServices',
      actions: ['ecs:DescribeTasks', 'ecs:DescribeServices'],
      resources: [arn('ecs', 'task', 'foc/*'), arn('ecs', 'service', 'foc/*')],
    }),
    new iam.PolicyStatement({
      // DescribeTaskDefinition has no resource-level permissions.
      sid: 'ReadTaskDefinitions',
      actions: ['ecs:DescribeTaskDefinition'],
      resources: ['*'],
    }),
  ];
}
