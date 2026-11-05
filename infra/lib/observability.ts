import { Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { SERVICE_NAMES } from './config';
import type { Profile, ServiceName } from './config';

export interface ObservabilityProps {
  readonly profile: Profile;
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly targetGroup: elbv2.ApplicationTargetGroup;
  readonly services: Record<ServiceName, ecs.FargateService>;
  readonly brokerService?: ecs.FargateService;
  readonly brokerBacklog: cloudwatch.IMetric;
  readonly brokerBacklogThreshold: number;
  readonly databases: readonly rds.DatabaseInstance[];
  /** Passed with -c alarmEmail=... at deploy time, so it is not committed. */
  readonly alarmEmail?: string;
}

function liveTaskCount(service: ecs.FargateService): cloudwatch.Metric {
  // Published at no cost, unlike the Container Insights RunningTaskCount.
  return new cloudwatch.Metric({
    namespace: 'AWS/ECS',
    metricName: 'LiveTaskCount',
    dimensionsMap: {
      ClusterName: service.cluster.clusterName,
      ServiceName: service.serviceName,
    },
    statistic: cloudwatch.Stats.MINIMUM,
    period: Duration.minutes(1),
  });
}

/** The CloudWatch dashboard and alarms, which email through one SNS topic. */
export class Observability extends Construct {
  readonly alarms: cloudwatch.Alarm[] = [];

  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);
    const { profile, loadBalancer, targetGroup, services } = props;

    const topic = new sns.Topic(this, 'Alarms', { displayName: 'FoC alarms' });
    if (props.alarmEmail) {
      topic.addSubscription(
        new subscriptions.EmailSubscription(props.alarmEmail),
      );
    }
    const alarmAction = new actions.SnsAction(topic);
    const alarm = (
      name: string,
      description: string,
      options: Omit<cloudwatch.AlarmProps, 'alarmName' | 'alarmDescription'>,
    ): void => {
      const created = new cloudwatch.Alarm(this, name, {
        alarmName: `foc-${name}`,
        alarmDescription: description,
        ...options,
      });
      created.addAlarmAction(alarmAction);
      this.alarms.push(created);
    };

    const server5xx = new cloudwatch.MathExpression({
      expression: 'FILL(elb, 0) + FILL(target, 0)',
      label: '5xx responses',
      usingMetrics: {
        elb: loadBalancer.metrics.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT, {
          statistic: cloudwatch.Stats.SUM,
        }),
        target: targetGroup.metrics.httpCodeTarget(
          elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
          { statistic: cloudwatch.Stats.SUM },
        ),
      },
      period: Duration.minutes(5),
    });
    alarm('alb-5xx', 'More than 5 server errors in 5 minutes', {
      metric: server5xx,
      threshold: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const p95Latency = targetGroup.metrics.targetResponseTime({
      statistic: cloudwatch.Stats.percentile(95),
      period: Duration.minutes(1),
    });
    alarm('alb-p95-latency', 'p95 response time above 2 s for 5 minutes', {
      metric: p95Latency,
      threshold: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 5,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    for (const name of SERVICE_NAMES) {
      alarm(`${name}-cpu`, `${name} CPU above 85% for 15 minutes`, {
        metric: services[name].metricCpuUtilization({
          period: Duration.minutes(5),
        }),
        threshold: 85,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm(`${name}-tasks`, `${name} has fewer tasks than its minimum`, {
        metric: liveTaskCount(services[name]),
        threshold: profile.minTasks,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 5,
        // ECS publishes nothing for a service with no running tasks.
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      });
    }

    props.databases.forEach((database, index) => {
      alarm(
        `postgres-${index + 1}-connections`,
        `Postgres connections above ${profile.postgres.connectionsAlarmThreshold}`,
        {
          metric: database.metricDatabaseConnections({
            period: Duration.minutes(1),
            statistic: cloudwatch.Stats.MAXIMUM,
          }),
          threshold: profile.postgres.connectionsAlarmThreshold,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          evaluationPeriods: 3,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        },
      );
    });

    alarm(
      'rabbitmq-backlog',
      props.brokerService
        ? 'A message reached the credit-service dead-letter queue'
        : 'RabbitMQ has a large backlog of ready messages',
      {
        metric: props.brokerBacklog,
        threshold: props.brokerBacklogThreshold,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );
    if (props.brokerService) {
      alarm('rabbitmq-tasks', 'The RabbitMQ task is not running', {
        metric: liveTaskCount(props.brokerService),
        threshold: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      });
    }

    const brokerTaskMetrics = props.brokerService
      ? [liveTaskCount(props.brokerService)]
      : [];
    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'foc',
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Requests through the load balancer',
            left: [
              loadBalancer.metrics.requestCount({
                statistic: cloudwatch.Stats.SUM,
                period: Duration.minutes(1),
              }),
            ],
            right: [server5xx],
          }),
          new cloudwatch.GraphWidget({
            title: 'p95 response time (seconds)',
            left: [p95Latency],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Running tasks per service',
            left: [
              ...SERVICE_NAMES.map((name) =>
                liveTaskCount(services[name]).with({
                  label: name,
                  statistic: cloudwatch.Stats.MAXIMUM,
                }),
              ),
              ...brokerTaskMetrics,
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'CPU per service (%)',
            left: SERVICE_NAMES.map((name) =>
              services[name].metricCpuUtilization({
                label: name,
                period: Duration.minutes(1),
              }),
            ),
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Postgres connections',
            left: props.databases.map((database) =>
              database.metricDatabaseConnections({
                period: Duration.minutes(1),
                statistic: cloudwatch.Stats.MAXIMUM,
              }),
            ),
          }),
          new cloudwatch.GraphWidget({
            title: props.brokerService
              ? 'Messages in the credit-service dead-letter queue'
              : 'RabbitMQ ready messages',
            left: [props.brokerBacklog],
          }),
        ],
      ],
    });
  }
}
