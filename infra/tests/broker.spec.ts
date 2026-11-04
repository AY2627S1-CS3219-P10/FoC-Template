import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS, PROFILES } from '../lib/config';
import {
  brokerScript,
  deadLetterDefinitions,
  sidecarScript,
} from '../lib/rabbitmq-broker';
import {
  containersOf,
  environmentOf,
  resources,
  secretNames,
  synthesize,
} from './support';

describe('demo broker: RabbitMQ on Fargate', () => {
  const { data } = synthesize('demo');
  const [broker, sidecar] = containersOf(data, 'foc-rabbitmq');

  it('does not use Amazon MQ', () => {
    data.resourceCountIs('AWS::AmazonMQ::Broker', 0);
  });

  it('runs the RabbitMQ version of local compose', () => {
    const compose = readFileSync(
      join(__dirname, '..', '..', 'compose.yaml'),
      'utf8',
    );
    const local = /image: rabbitmq:(\d+\.\d+)/.exec(compose)?.[1];
    expect(local).toBeDefined();
    expect(broker!.Image).toMatch(new RegExp(`rabbitmq:${local}\\.`));
  });

  it('runs both containers as the rabbitmq user', () => {
    // As root, a health check during boot crashes the server (eacces on the
    // cookie), which was reproduced with this image.
    expect(broker!.User).toBe('rabbitmq');
    expect(sidecar!.User).toBe('rabbitmq');
  });

  it('sets a memory watermark below the task memory', () => {
    const config = PROFILES.demo.broker;
    if (config.kind !== 'fargate') throw new Error('demo broker is on Fargate');
    expect(broker!.Command![0]).toContain(
      `vm_memory_high_watermark.absolute = ${config.memoryWatermark}`,
    );
    expect(broker!.Command![0]).toContain('exec docker-entrypoint.sh');
    expect(parseInt(config.memoryWatermark, 10)).toBeLessThan(config.memoryMiB);
  });

  it('checks health without starting an Erlang VM', () => {
    expect(broker!.HealthCheck!.Command.join(' ')).toContain('15692/metrics');
    expect(broker!.HealthCheck!.Command.join(' ')).not.toContain('rabbitmq-');
  });

  it('keeps the broker alive if the sidecar stops', () => {
    expect(broker!.Essential).toBe(true);
    expect(sidecar!.Essential).toBe(false);
  });

  it('gets its password from ECS secrets', () => {
    for (const container of [broker!, sidecar!]) {
      expect(secretNames(container)).toEqual([
        'RABBITMQ_DEFAULT_PASS',
        'RABBITMQ_DEFAULT_USER',
      ]);
    }
  });

  it('recreates the dead-letter topology credit-service declares only once', () => {
    const definitions = JSON.parse(
      environmentOf(sidecar!).RABBITMQ_DEFINITIONS_JSON as string,
    ) as {
      exchanges: { name: string; type: string; durable: boolean }[];
      queues: { name: string; durable: boolean }[];
      bindings: { routing_key: string; destination: string }[];
    };
    expect(definitions.exchanges[0]).toMatchObject({
      name: EVENTS.deadLetterExchange,
      type: 'direct',
      durable: true,
    });
    expect(definitions.queues[0]).toMatchObject({
      name: EVENTS.deadLetterQueue,
      durable: true,
    });
    expect(definitions.bindings[0]).toMatchObject({
      destination: EVENTS.deadLetterQueue,
      routing_key: EVENTS.deadLetterRoutingKey,
    });
  });

  it('never passes the broker password in a URL', () => {
    expect(sidecarScript()).not.toMatch(/https?:\/\/[^/\s]*@/);
  });

  it('stops the old broker before starting a new one', () => {
    const [service] = resources(data, 'AWS::ECS::Service');
    expect(service!.DeploymentConfiguration).toMatchObject({
      MinimumHealthyPercent: 0,
      MaximumPercent: 100,
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
    });
    expect(service!.LaunchType).toBe('FARGATE');
  });

  it('turns the printed depth into a CloudWatch metric', () => {
    data.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '[label = "dlq_depth", depth]',
      MetricTransformations: [
        {
          MetricNamespace: 'FOC/RabbitMQ',
          MetricName: 'CreditDeadLetterDepth',
          MetricValue: '$depth',
        },
      ],
    });
    expect(sidecarScript()).toContain('"dlq_depth", $NF');
    expect(sidecarScript()).toContain(`queue="${EVENTS.deadLetterQueue}"`);
  });

  it('has script helpers that use only what the image provides', () => {
    expect(brokerScript('1MB')).not.toContain('apk');
    expect(JSON.parse(deadLetterDefinitions())).toBeDefined();
  });
});

describe('scale broker: Amazon MQ', () => {
  const { data } = synthesize('scale');

  it('runs a RabbitMQ 4.2 cluster with its password as a reference', () => {
    const [broker] = resources(data, 'AWS::AmazonMQ::Broker');
    expect(broker).toMatchObject({
      EngineType: 'RABBITMQ',
      EngineVersion: '4.2',
      HostInstanceType: 'mq.m7g.large',
      DeploymentMode: 'CLUSTER_MULTI_AZ',
      AutoMinorVersionUpgrade: true,
    });
    expect(JSON.stringify(broker!.Users)).toContain('resolve:secretsmanager');
  });

  it('has no Fargate broker', () => {
    data.resourceCountIs('AWS::ECS::Service', 0);
  });
});
