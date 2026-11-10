/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of existing RabbitMQ deployment definitions.
 * Author review: Checked FargateRabbitBroker property values and existing resource references in rabbitmq-broker.ts; edited declaration naming and TypeScript formatting.
 */

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EVENTS } from './config';
import type { FargateBrokerConfig } from './config';

export const RABBITMQ_USER = 'foc';
export const RABBITMQ_DISCOVERY_NAME = 'rabbitmq';
export const RABBITMQ_PORT = 5672;

/**
 * credit-service declares its dead-letter exchange and queue once, at startup.
 * This broker keeps its state on task storage, so a replaced task loses them
 * and dead letters would be dropped until credit-service restarted. Its other
 * topology is declared again on reconnect.
 */
export function deadLetterDefinitions(): string {
  return JSON.stringify({
    vhosts: [{ name: '/' }],
    exchanges: [
      {
        name: EVENTS.deadLetterExchange,
        vhost: '/',
        type: 'direct',
        durable: true,
        auto_delete: false,
        internal: false,
        arguments: {},
      },
    ],
    queues: [
      {
        name: EVENTS.deadLetterQueue,
        vhost: '/',
        durable: true,
        auto_delete: false,
        arguments: {},
      },
    ],
    bindings: [
      {
        source: EVENTS.deadLetterExchange,
        vhost: '/',
        destination: EVENTS.deadLetterQueue,
        destination_type: 'queue',
        routing_key: EVENTS.deadLetterRoutingKey,
        arguments: {},
      },
    ],
  });
}

/** RabbitMQ ignored the container memory limit when tested, so set it here. */
export function brokerScript(memoryWatermark: string): string {
  return [
    `printf 'vm_memory_high_watermark.absolute = ${memoryWatermark}\\n' > /etc/rabbitmq/conf.d/20-memory.conf`,
    'exec docker-entrypoint.sh rabbitmq-server',
  ].join('\n');
}

/**
 * Imports the dead-letter topology, then prints the queue depth each minute
 * for the CloudWatch metric filter. Amazon-managed queue metrics do not exist
 * for a self-hosted broker, and this needs no AWS SDK or extra permissions.
 *
 * POST /api/definitions merges. The broker's load_definitions setting is not
 * an option: it skips creating the default user, which locks out every client.
 */
export function sidecarScript(): string {
  return [
    `auth="Authorization: Basic $(printf '%s:%s' "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS" | base64)"`,
    `until wget -qO- --header "$auth" --header 'content-type: application/json' --post-data "$RABBITMQ_DEFINITIONS_JSON" http://127.0.0.1:15672/api/definitions; do`,
    '  sleep 5',
    'done',
    'echo',
    'while true; do',
    `  body=$(wget -qO- 'http://127.0.0.1:15692/metrics/detailed?family=queue_coarse_metrics') &&`,
    `    printf '%s\\n' "$body" | awk -v q='queue="${EVENTS.deadLetterQueue}"' '`,
    `      index($0, "rabbitmq_detailed_queue_messages{") == 1 && index($0, q) { print "dlq_depth", $NF; found = 1 }`,
    `      END { if (!found) print "dlq_depth 0" }'`,
    '  sleep 60',
    'done',
  ].join('\n');
}

export interface FargateRabbitBrokerProps {
  readonly config: FargateBrokerConfig;
  readonly cluster: ecs.ICluster;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly credentials: secretsmanager.ISecret;
}

/**
 * One RabbitMQ task, the same version as local compose. Messages live on task
 * storage: those still queued are lost if the task is replaced. The order
 * outbox retries until a queue is bound, so nothing unpublished is lost.
 */
export class FargateRabbitBroker extends Construct {
  readonly service: ecs.FargateService;
  readonly deadLetterDepth: cloudwatch.Metric;

  constructor(scope: Construct, id: string, props: FargateRabbitBrokerProps) {
    super(scope, id);
    const { config } = props;

    const logGroup = new logs.LogGroup(this, 'Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const metricFilter = logGroup.addMetricFilter('DeadLetterDepth', {
      filterPattern: logs.FilterPattern.spaceDelimited(
        'label',
        'depth',
      ).whereString('label', '=', 'dlq_depth'),
      metricNamespace: 'FOC/RabbitMQ',
      metricName: 'CreditDeadLetterDepth',
      metricValue: '$depth',
    });
    this.deadLetterDepth = metricFilter.metric({
      statistic: cloudwatch.Stats.MAXIMUM,
      period: Duration.minutes(1),
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task', {
      family: 'foc-rabbitmq',
      cpu: config.cpu,
      memoryLimitMiB: config.memoryMiB,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    const image = ecs.ContainerImage.fromRegistry(config.image);
    const credentials = {
      RABBITMQ_DEFAULT_USER: ecs.Secret.fromSecretsManager(
        props.credentials,
        'username',
      ),
      RABBITMQ_DEFAULT_PASS: ecs.Secret.fromSecretsManager(
        props.credentials,
        'password',
      ),
    };

    taskDefinition.addContainer('rabbitmq', {
      image,
      // As root, a health check or exec during boot creates a root-owned
      // .erlang.cookie, and the server then crashes with eacces reading it.
      user: 'rabbitmq',
      entryPoint: ['sh', '-c'],
      command: [brokerScript(config.memoryWatermark)],
      secrets: credentials,
      portMappings: [{ containerPort: RABBITMQ_PORT }],
      stopTimeout: Duration.seconds(60),
      // The Prometheus endpoint, because a rabbitmq-diagnostics call starts a
      // whole Erlang VM, which is costly every 30 s on a quarter of a vCPU.
      healthCheck: {
        command: [
          'CMD-SHELL',
          'wget -q -O /dev/null http://127.0.0.1:15692/metrics || exit 1',
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(120),
      },
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'rabbitmq' }),
    });

    taskDefinition.addContainer('topology-and-metrics', {
      image,
      essential: false,
      user: 'rabbitmq',
      entryPoint: ['sh', '-c'],
      command: [sidecarScript()],
      environment: { RABBITMQ_DEFINITIONS_JSON: deadLetterDefinitions() },
      secrets: credentials,
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'sidecar' }),
    });

    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [props.securityGroup],
      vpcSubnets: { subnets: props.cluster.vpc.privateSubnets },
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
      // Stop the old broker first: two at once would split the messages.
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      cloudMapOptions: {
        name: RABBITMQ_DISCOVERY_NAME,
        dnsTtl: Duration.seconds(10),
      },
    });
  }
}
