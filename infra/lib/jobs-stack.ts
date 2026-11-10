/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of existing background-job resource definitions.
 * Author review: Checked JobsStack property values and existing resource references in jobs-stack.ts; edited declaration naming and TypeScript formatting.
 */

import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { DataStack } from './data-stack';
import { OneOffTask } from './one-off-task';
import { imageOf } from './registry-stack';
import type { RegistryStack } from './registry-stack';

export interface JobsStackProps extends StackProps {
  readonly registry: RegistryStack;
  readonly data: DataStack;
  readonly imageTag: string;
}

/**
 * Migration and seed tasks for user-service and supplier-service, which do not
 * migrate at startup. A separate stack, because migrations of a new image must
 * run before the app stack rolls that image out.
 */
export class JobsStack extends Stack {
  constructor(scope: Construct, id: string, props: JobsStackProps) {
    super(scope, id, props);
    const { registry, data, imageTag } = props;
    this.addDependency(registry);
    const { databaseUrls, adminSeedAccounts, testAccountSeedAccounts } =
      data.secrets;
    const logGroup = new logs.LogGroup(this, 'Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userUrl = ecs.Secret.fromSecretsManager(databaseUrls['user-service']);
    const supplierUrl = ecs.Secret.fromSecretsManager(
      databaseUrls['supplier-service'],
    );
    const migrateSupplierImage = imageOf(this, 'migrate-supplier', imageTag);
    const userServiceImage = imageOf(this, 'user-service', imageTag);

    new OneOffTask(this, 'MigrateUser', {
      family: 'foc-migrate-user',
      image: imageOf(this, 'migrate-user', imageTag),
      logGroup,
      secrets: { DATABASE_URL: userUrl },
    });
    new OneOffTask(this, 'MigrateSupplier', {
      family: 'foc-migrate-supplier',
      image: migrateSupplierImage,
      logGroup,
      secrets: { DATABASE_URL: supplierUrl },
    });
    new OneOffTask(this, 'SeedSupplierLocations', {
      family: 'foc-seed-supplier-locations',
      image: migrateSupplierImage,
      logGroup,
      command: ['node', 'scripts/seed-csv-locations.mjs'],
      secrets: { DATABASE_URL: supplierUrl },
    });
    new OneOffTask(this, 'SeedAdministrators', {
      family: 'foc-seed-administrators',
      image: userServiceImage,
      logGroup,
      command: ['node', 'dist/seed-administrators.js'],
      secrets: {
        DATABASE_URL: userUrl,
        ADMIN_SEED_ACCOUNTS: ecs.Secret.fromSecretsManager(adminSeedAccounts),
      },
    });
    new OneOffTask(this, 'SeedTestAccounts', {
      family: 'foc-seed-test-accounts',
      image: userServiceImage,
      logGroup,
      command: ['node', 'dist/seed-test-accounts.js'],
      environment: {
        ALLOW_TEST_ACCOUNT_SEED: 'true',
        NODE_ENV: 'staging',
      },
      secrets: {
        DATABASE_URL: userUrl,
        TEST_ACCOUNT_SEED_ACCOUNTS: ecs.Secret.fromSecretsManager(
          testAccountSeedAccounts,
        ),
      },
    });
  }
}
