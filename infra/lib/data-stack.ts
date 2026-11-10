import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  SecretValue,
  Stack,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as amazonmq from 'aws-cdk-lib/aws-amazonmq';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import {
  DATABASE_OWNERS,
  DATABASES,
  INTERNAL_DOMAIN,
  RABBITMQ_CLIENTS,
  REDIS_CLIENTS,
  REDIS_DATABASES,
  pascalCase,
} from './config';
import type { DatabaseOwner, Profile } from './config';
import { bootstrapScript, passwordVariable } from './db-bootstrap';
import type { NetworkStack } from './network-stack';
import { OneOffTask } from './one-off-task';
import {
  FargateRabbitBroker,
  RABBITMQ_DISCOVERY_NAME,
  RABBITMQ_PORT,
  RABBITMQ_USER,
} from './rabbitmq-broker';

const POSTGRES_PORT = 5432;
const REDIS_PORT = 6379;
const AMAZON_MQ_PORT = 5671;
const POSTGRES_CLIENT_IMAGE =
  'public.ecr.aws/docker/library/postgres:17-alpine';

export interface DataStackProps extends StackProps {
  readonly profile: Profile;
  readonly network: NetworkStack;
}

/** The secrets application tasks read, as ECS secrets. */
export interface ApplicationSecrets {
  readonly databaseUrls: Record<DatabaseOwner, secretsmanager.ISecret>;
  readonly rabbitmqUrl: secretsmanager.ISecret;
  readonly jwtAccessToken: secretsmanager.ISecret;
  readonly emailVerificationCode: secretsmanager.ISecret;
  readonly creditUserServiceToken: secretsmanager.ISecret;
  readonly creditOrderServiceToken: secretsmanager.ISecret;
  readonly creditMonitoringToken: secretsmanager.ISecret;
  /** Keys username, password and from. Set by hand before the first deploy. */
  readonly smtp: secretsmanager.ISecret;
  /** The ADMIN_SEED_ACCOUNTS JSON. Set by hand before the admin seed runs. */
  readonly adminSeedAccounts: secretsmanager.ISecret;
  /** The TEST_ACCOUNT_SEED_ACCOUNTS JSON. Staging load tests only. */
  readonly testAccountSeedAccounts: secretsmanager.ISecret;
}

/**
 * A reference CloudFormation resolves at deploy time. The template holds only
 * this reference, never the value, and no custom resource is needed.
 */
function secretField(secret: secretsmanager.ISecret, field: string): string {
  return `{{resolve:secretsmanager:${secret.secretArn}:SecretString:${field}::}}`;
}

/**
 * Stateful resources: Postgres, the Valkey cache, RabbitMQ and the secrets.
 * They survive when the app stack is destroyed to save credits overnight.
 */
export class DataStack extends Stack {
  readonly secrets: ApplicationSecrets;
  readonly databases: rds.DatabaseInstance[] = [];
  readonly brokerService?: ecs.FargateService;
  readonly brokerBacklog: cloudwatch.IMetric;
  readonly brokerBacklogThreshold: number;

  private readonly cache: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { profile, network } = props;
    const { vpc, cluster, serviceSecurityGroups } = network;
    const isolated = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };

    const logins = Object.fromEntries(
      DATABASE_OWNERS.map((owner) => [
        owner,
        new secretsmanager.Secret(this, `${pascalCase(owner)}Login`, {
          description: `Postgres login of ${owner}`,
          generateSecretString: {
            secretStringTemplate: JSON.stringify({
              username: DATABASES[owner],
            }),
            generateStringKey: 'password',
            // Alphanumeric, so the value needs no encoding inside a URL.
            excludePunctuation: true,
            passwordLength: 32,
          },
        }),
      ]),
    ) as Record<DatabaseOwner, secretsmanager.Secret>;

    const bootstrapSecurityGroup = new ec2.SecurityGroup(this, 'BootstrapSg', {
      vpc,
      description: 'One-off database bootstrap task',
      allowAllOutbound: true,
    });
    const jobLogs = new logs.LogGroup(this, 'BootstrapLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const databaseHosts = {} as Record<DatabaseOwner, string>;
    const groups: { id: string; owners: readonly DatabaseOwner[] }[] = profile
      .postgres.perService
      ? DATABASE_OWNERS.map((owner) => ({
          id: `${pascalCase(owner)}Postgres`,
          owners: [owner],
        }))
      : [{ id: 'Postgres', owners: DATABASE_OWNERS }];

    for (const group of groups) {
      const databaseSecurityGroup = new ec2.SecurityGroup(
        this,
        `${group.id}Sg`,
        {
          vpc,
          description: `Postgres of ${group.owners.join(', ')}`,
          allowAllOutbound: false,
        },
      );
      databaseSecurityGroup.addIngressRule(
        bootstrapSecurityGroup,
        ec2.Port.tcp(POSTGRES_PORT),
        'Database bootstrap task',
      );

      const database = new rds.DatabaseInstance(this, group.id, {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_17_9,
        }),
        instanceType: new ec2.InstanceType(profile.postgres.instanceType),
        vpc,
        vpcSubnets: isolated,
        securityGroups: [databaseSecurityGroup],
        credentials: rds.Credentials.fromGeneratedSecret('foc_admin'),
        multiAz: profile.postgres.multiAz,
        allocatedStorage: profile.postgres.storageGiB,
        storageType: rds.StorageType.GP3,
        storageEncrypted: true,
        publiclyAccessible: false,
        backupRetention: Duration.days(1),
        deletionProtection: false,
        removalPolicy: RemovalPolicy.SNAPSHOT,
      });
      this.databases.push(database);

      // Services reach Postgres directly, or through RDS Proxy when there is one.
      let clientSecurityGroup = databaseSecurityGroup;
      let host = database.dbInstanceEndpointAddress;
      if (profile.postgres.proxy) {
        clientSecurityGroup = new ec2.SecurityGroup(
          this,
          `${group.id}ProxySg`,
          {
            vpc,
            description: `RDS Proxy of ${group.owners.join(', ')}`,
            allowAllOutbound: true,
          },
        );
        databaseSecurityGroup.addIngressRule(
          clientSecurityGroup,
          ec2.Port.tcp(POSTGRES_PORT),
          'RDS Proxy',
        );
        host = database.addProxy('Proxy', {
          vpc,
          vpcSubnets: isolated,
          securityGroups: [clientSecurityGroup],
          secrets: group.owners.map((owner) => logins[owner]),
          requireTLS: true,
        }).endpoint;
      }
      for (const owner of group.owners) {
        databaseHosts[owner] = host;
        clientSecurityGroup.addIngressRule(
          serviceSecurityGroups[owner],
          ec2.Port.tcp(POSTGRES_PORT),
          `${owner} connects to its database`,
        );
      }

      new OneOffTask(this, `${group.id}Bootstrap`, {
        family:
          group.owners.length > 1
            ? 'foc-db-bootstrap'
            : `foc-db-bootstrap-${group.owners[0]}`,
        image: ecs.ContainerImage.fromRegistry(POSTGRES_CLIENT_IMAGE),
        logGroup: jobLogs,
        entryPoint: ['sh', '-c'],
        command: [
          bootstrapScript(group.owners.map((owner) => DATABASES[owner])),
        ],
        environment: {
          PGHOST: database.dbInstanceEndpointAddress,
          PGPORT: String(POSTGRES_PORT),
          PGDATABASE: 'postgres',
          // libpq encrypts without checking the certificate in this mode.
          PGSSLMODE: 'require',
        },
        secrets: {
          PGUSER: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
          PGPASSWORD: ecs.Secret.fromSecretsManager(
            database.secret!,
            'password',
          ),
          ...Object.fromEntries(
            group.owners.map((owner) => [
              passwordVariable(DATABASES[owner]),
              ecs.Secret.fromSecretsManager(logins[owner], 'password'),
            ]),
          ),
        },
      });
    }

    const databaseUrls = Object.fromEntries(
      DATABASE_OWNERS.map((owner) => [
        owner,
        this.derivedSecret(
          `${pascalCase(owner)}DatabaseUrl`,
          `DATABASE_URL of ${owner}`,
          // no-verify encrypts without checking the RDS CA, which is not in
          // Node's trust store. The database sits in isolated subnets.
          `postgresql://${DATABASES[owner]}:${secretField(logins[owner], 'password')}@${databaseHosts[owner]}:${POSTGRES_PORT}/${DATABASES[owner]}?sslmode=no-verify`,
        ),
      ]),
    ) as Record<DatabaseOwner, secretsmanager.Secret>;

    this.cache = this.createCache(props);

    const brokerCredentials = new secretsmanager.Secret(
      this,
      'RabbitmqCredentials',
      {
        description: 'RabbitMQ administrator, used by every client',
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: RABBITMQ_USER }),
          generateStringKey: 'password',
          excludePunctuation: true,
          passwordLength: 32,
        },
      },
    );
    const brokerSecurityGroup = new ec2.SecurityGroup(this, 'RabbitmqSg', {
      vpc,
      description: 'RabbitMQ',
      // A Fargate broker pulls its image and writes logs through the NAT.
      allowAllOutbound: profile.broker.kind === 'fargate',
    });
    const brokerPort =
      profile.broker.kind === 'fargate' ? RABBITMQ_PORT : AMAZON_MQ_PORT;
    for (const client of RABBITMQ_CLIENTS) {
      brokerSecurityGroup.addIngressRule(
        serviceSecurityGroups[client],
        ec2.Port.tcp(brokerPort),
        `${client} connects to RabbitMQ`,
      );
    }

    const password = secretField(brokerCredentials, 'password');
    let rabbitmqUrl: string;
    if (profile.broker.kind === 'fargate') {
      const broker = new FargateRabbitBroker(this, 'Rabbitmq', {
        config: profile.broker,
        cluster,
        securityGroup: brokerSecurityGroup,
        credentials: brokerCredentials,
      });
      this.brokerService = broker.service;
      this.brokerBacklog = broker.deadLetterDepth;
      this.brokerBacklogThreshold = 0;
      // Plain AMQP: the broker has no certificate, and only the listed
      // services can reach it, inside the VPC's private subnets.
      rabbitmqUrl = `amqp://${RABBITMQ_USER}:${password}@${RABBITMQ_DISCOVERY_NAME}.${INTERNAL_DOMAIN}:${RABBITMQ_PORT}`;
    } else {
      const broker = new amazonmq.CfnBroker(this, 'Rabbitmq', {
        brokerName: 'foc-rabbitmq',
        engineType: 'RABBITMQ',
        engineVersion: profile.broker.engineVersion,
        hostInstanceType: profile.broker.instanceType,
        deploymentMode: profile.broker.deploymentMode,
        publiclyAccessible: false,
        autoMinorVersionUpgrade: true,
        subnetIds: vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
        securityGroups: [brokerSecurityGroup.securityGroupId],
        logs: { general: true },
        users: [{ username: RABBITMQ_USER, password }],
      });
      // Amazon MQ publishes no per-queue metrics on RabbitMQ 4.x, so this is
      // the whole broker's backlog rather than the dead-letter queue's depth.
      this.brokerBacklog = new cloudwatch.Metric({
        namespace: 'AWS/AmazonMQ',
        metricName: 'MessageReadyCount',
        dimensionsMap: { Broker: broker.brokerName },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: Duration.minutes(1),
      });
      this.brokerBacklogThreshold = 1000;
      // The endpoint attribute is scheme://host:port. Insert the credentials.
      const hostAndPort = Fn.select(
        1,
        Fn.split('://', Fn.select(0, broker.attrAmqpEndpoints)),
      );
      rabbitmqUrl = `amqps://${RABBITMQ_USER}:${password}@${hostAndPort}`;
    }

    const generated = (
      constructId: string,
      description: string,
    ): secretsmanager.Secret =>
      new secretsmanager.Secret(this, constructId, {
        description,
        generateSecretString: {
          excludePunctuation: true,
          passwordLength: 64,
        },
      });

    const smtp = new secretsmanager.Secret(this, 'Smtp', {
      description:
        'Gmail SMTP keys username, password and from. Replace the placeholder values before the first app deploy',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'replace-me',
          from: 'replace-me@example.invalid',
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });
    const adminSeedAccounts = generated(
      'AdminSeedAccounts',
      'ADMIN_SEED_ACCOUNTS JSON. Replace the placeholder value before running the admin seed task',
    );
    const testAccountSeedAccounts = generated(
      'TestAccountSeedAccounts',
      'TEST_ACCOUNT_SEED_ACCOUNTS JSON. Staging load tests only',
    );

    this.secrets = {
      databaseUrls,
      rabbitmqUrl: this.derivedSecret(
        'RabbitmqUrl',
        'RABBITMQ_URL of every RabbitMQ client',
        rabbitmqUrl,
      ),
      jwtAccessToken: generated(
        'JwtAccessToken',
        'JWT_ACCESS_TOKEN_SECRET of user, supplier and credit services',
      ),
      emailVerificationCode: generated(
        'EmailVerificationCode',
        'EMAIL_VERIFICATION_CODE_SECRET of user-service',
      ),
      creditUserServiceToken: generated(
        'CreditUserServiceToken',
        'CREDIT_USER_SERVICE_TOKEN of web-app and credit-service',
      ),
      creditOrderServiceToken: generated(
        'CreditOrderServiceToken',
        'CREDIT_ORDER_SERVICE_TOKEN of order-service and credit-service',
      ),
      creditMonitoringToken: generated(
        'CreditMonitoringToken',
        'CREDIT_MONITORING_TOKEN of credit-service',
      ),
      smtp,
      adminSeedAccounts,
      testAccountSeedAccounts,
    };

    new CfnOutput(this, 'SmtpSecretArn', { value: smtp.secretArn });
    new CfnOutput(this, 'AdminSeedAccountsSecretArn', {
      value: adminSeedAccounts.secretArn,
    });
    new CfnOutput(this, 'TestAccountSeedAccountsSecretArn', {
      value: testAccountSeedAccounts.secretArn,
    });
    new CfnOutput(this, 'BootstrapSecurityGroupId', {
      value: bootstrapSecurityGroup.securityGroupId,
    });
  }

  /** The Valkey URL of a service. Each service has its own logical database. */
  redisUrl(client: (typeof REDIS_CLIENTS)[number]): string {
    return `rediss://${this.cache.attrPrimaryEndPointAddress}:${this.cache.attrPrimaryEndPointPort}/${REDIS_DATABASES[client]}`;
  }

  private createCache({
    profile,
    network,
  }: DataStackProps): elasticache.CfnReplicationGroup {
    const securityGroup = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc: network.vpc,
      description: 'Valkey cache',
      allowAllOutbound: false,
    });
    for (const client of REDIS_CLIENTS) {
      securityGroup.addIngressRule(
        network.serviceSecurityGroups[client],
        ec2.Port.tcp(REDIS_PORT),
        `${client} connects to Valkey`,
      );
    }
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'CacheSubnets', {
      description: 'Isolated subnets of the Valkey cache',
      subnetIds: network.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
    });
    const parameters = new elasticache.CfnParameterGroup(
      this,
      'CacheParameters',
      {
        cacheParameterGroupFamily: 'valkey8',
        description: 'BullMQ needs noeviction',
        properties: { 'maxmemory-policy': 'noeviction' },
      },
    );
    const failover = profile.cache.nodes > 1;
    // Cluster mode stays off: services select a logical database by number.
    return new elasticache.CfnReplicationGroup(this, 'Cache', {
      replicationGroupDescription: 'FoC BullMQ queues and rate limits',
      engine: 'valkey',
      engineVersion: '8.2',
      cacheNodeType: profile.cache.nodeType,
      numCacheClusters: profile.cache.nodes,
      automaticFailoverEnabled: failover,
      multiAzEnabled: failover,
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      cacheSubnetGroupName: subnetGroup.ref,
      cacheParameterGroupName: parameters.ref,
      securityGroupIds: [securityGroup.securityGroupId],
    });
  }

  /**
   * A secret built from another secret's reference. ECS injects whole values
   * or JSON keys and cannot template a URL, so services get the full URL.
   * Despite the helper's name, the value holds only dynamic references.
   */
  private derivedSecret(
    constructId: string,
    description: string,
    value: string,
  ): secretsmanager.Secret {
    return new secretsmanager.Secret(this, constructId, {
      description,
      secretStringValue: SecretValue.unsafePlainText(value),
    });
  }
}
