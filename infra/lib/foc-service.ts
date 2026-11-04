import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { SERVICES } from './config';
import type { Profile, ServiceName, TaskSize } from './config';

export interface FocServiceProps {
  readonly name: ServiceName;
  readonly profile: Profile;
  readonly cluster: ecs.ICluster;
  readonly image: ecs.ContainerImage;
  readonly size: TaskSize;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly environment: Record<string, string>;
  readonly secrets: Record<string, ecs.Secret>;
  /** Only for a service behind a load balancer. */
  readonly healthCheckGracePeriod?: Duration;
}

/**
 * One FoC application service on Fargate: private subnets, a Cloud Map name,
 * a health check, rollback on a failed deployment, and CPU autoscaling.
 */
export class FocService extends Construct {
  readonly service: ecs.FargateService;
  readonly scaling: ecs.ScalableTaskCount;

  constructor(scope: Construct, id: string, props: FocServiceProps) {
    super(scope, id);
    const { name, profile } = props;
    const { port, healthPath } = SERVICES[name];

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'Task', {
      family: `foc-${name}`,
      cpu: props.size.cpu,
      memoryLimitMiB: props.size.memoryMiB,
      // The images are built for linux/amd64.
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDefinition.addContainer('app', {
      image: props.image,
      environment: props.environment,
      secrets: props.secrets,
      portMappings: [{ containerPort: port }],
      healthCheck: {
        command: [
          'CMD-SHELL',
          `wget --spider --quiet http://127.0.0.1:${port}${healthPath} || exit 1`,
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        // order-service and credit-service migrate before they listen.
        startPeriod: Duration.seconds(120),
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: new logs.LogGroup(this, 'Logs', {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        streamPrefix: name,
      }),
    });

    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      serviceName: name,
      taskDefinition,
      securityGroups: [props.securityGroup],
      vpcSubnets: { subnets: props.cluster.vpc.privateSubnets },
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: props.healthCheckGracePeriod,
      // The minimum runs on regular Fargate, and copies above it on Spot.
      capacityProviderStrategies: [
        { capacityProvider: 'FARGATE', base: profile.minTasks, weight: 0 },
        { capacityProvider: 'FARGATE_SPOT', weight: 1 },
      ],
      cloudMapOptions: { name, dnsTtl: Duration.seconds(10) },
    });

    this.scaling = this.service.autoScaleTaskCount({
      minCapacity: profile.minTasks,
      maxCapacity: profile.maxTasks,
    });
    this.scaling.scaleOnCpuUtilization('Cpu', {
      targetUtilizationPercent: profile.cpuTargetPercent,
      scaleOutCooldown: Duration.minutes(1),
      scaleInCooldown: Duration.minutes(2),
    });
  }
}
