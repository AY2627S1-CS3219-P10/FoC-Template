import { SERVICE_NAMES } from '../lib/config';
import { resources, synthesize } from './support';

describe('alarms', () => {
  const { app } = synthesize('demo');
  const alarms = resources(app, 'AWS::CloudWatch::Alarm');
  const alarm = (name: string): Record<string, unknown> => {
    const found = alarms.find((candidate) => candidate.AlarmName === name);
    if (!found) throw new Error(`No alarm ${name}`);
    return found;
  };

  it('covers the load balancer, services, Postgres and the broker', () => {
    const names = alarms.map((candidate) => candidate.AlarmName);
    expect(names).toEqual(
      expect.arrayContaining([
        'foc-alb-5xx',
        'foc-alb-p95-latency',
        ...SERVICE_NAMES.flatMap((name) => [
          `foc-${name}-cpu`,
          `foc-${name}-tasks`,
        ]),
        'foc-postgres-1-connections',
        'foc-rabbitmq-backlog',
        'foc-rabbitmq-tasks',
      ]),
    );
  });

  it('sends every alarm to the SNS topic', () => {
    for (const candidate of alarms) {
      expect(candidate.AlarmActions).toHaveLength(1);
    }
  });

  it('fires on the first message in the dead-letter queue', () => {
    expect(alarm('foc-rabbitmq-backlog')).toMatchObject({
      Namespace: 'FOC/RabbitMQ',
      MetricName: 'CreditDeadLetterDepth',
      Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });

  it('treats a service with no metrics as down', () => {
    expect(alarm('foc-order-service-tasks')).toMatchObject({
      Namespace: 'AWS/ECS',
      MetricName: 'LiveTaskCount',
      Threshold: 1,
      ComparisonOperator: 'LessThanThreshold',
      TreatMissingData: 'breaching',
    });
  });

  it('watches the whole broker backlog in scale, as per-queue metrics are gone', () => {
    const scale = resources(synthesize('scale').app, 'AWS::CloudWatch::Alarm');
    expect(
      scale.find((candidate) => candidate.AlarmName === 'foc-rabbitmq-backlog'),
    ).toMatchObject({
      Namespace: 'AWS/AmazonMQ',
      MetricName: 'MessageReadyCount',
    });
    expect(
      scale.find((candidate) => candidate.AlarmName === 'foc-rabbitmq-tasks'),
    ).toBeUndefined();
    expect(
      scale.filter((candidate) =>
        String(candidate.AlarmName).endsWith('-connections'),
      ),
    ).toHaveLength(4);
  });
});

describe('alarm email', () => {
  it('subscribes the address given at deploy time', () => {
    synthesize('demo').app.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alarms@example.invalid',
    });
  });
});

describe('dashboard', () => {
  it('exists in both profiles', () => {
    for (const profile of ['demo', 'scale'] as const) {
      synthesize(profile).app.hasResourceProperties(
        'AWS::CloudWatch::Dashboard',
        { DashboardName: 'foc' },
      );
    }
  });
});
