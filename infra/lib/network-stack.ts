import { CfnOutput, Fn, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { Construct } from 'constructs';
import {
  CALLERS,
  CLOUDFRONT_ORIGIN_PREFIX_LIST,
  INTERNAL_DOMAIN,
  SERVICE_NAMES,
  SERVICES,
  pascalCase,
} from './config';
import type { Profile, ServiceName } from './config';

export interface NetworkStackProps extends StackProps {
  readonly profile: Profile;
}

/**
 * The VPC, the ECS cluster and the service-to-service security groups. The
 * cluster lives here because both the broker (data stack) and the application
 * services (app stack) run in it, and the app stack can be destroyed when idle.
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly cluster: ecs.Cluster;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly serviceSecurityGroups: Record<ServiceName, ec2.SecurityGroup>;

  private readonly zones: readonly string[];

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { profile } = props;
    this.zones = profile.availabilityZones;

    const natInstance =
      profile.nat.kind === 'instance'
        ? ec2.NatProvider.instanceV2({
            instanceType: new ec2.InstanceType(profile.nat.instanceType),
            // The default also opens every port to the whole internet.
            defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
          })
        : undefined;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.40.0.0/16'),
      availabilityZones: [...profile.availabilityZones],
      natGatewayProvider: natInstance ?? ec2.NatProvider.gateway(),
      natGateways: profile.natCount,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 20,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      // Free, and keeps ECR image layers (stored in S3) off the NAT instance.
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
    });

    natInstance?.connections.allowFrom(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Traffic from inside the VPC to forward',
    );

    // Resizing must replace the instance: its forwarding setup is user data,
    // which runs only on first boot, so a stop and start would not repeat it.
    natInstance?.gatewayInstances.forEach((gateway, index) => {
      const size = (gateway.instance.instanceType ?? '').replace(/\W/g, '');
      gateway.instance.overrideLogicalId(`NatInstance${index}${size}`);
    });

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
      clusterName: 'foc',
      enableFargateCapacityProviders: true,
      containerInsightsV2: profile.containerInsights
        ? ecs.ContainerInsights.ENABLED
        : ecs.ContainerInsights.DISABLED,
      defaultCloudMapNamespace: {
        name: INTERNAL_DOMAIN,
        vpc: this.vpc,
      },
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'Application load balancer, reachable only from CloudFront',
      allowAllOutbound: false,
    });
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(CLOUDFRONT_ORIGIN_PREFIX_LIST),
      ec2.Port.tcp(80),
      'CloudFront origin-facing addresses',
    );

    this.serviceSecurityGroups = Object.fromEntries(
      SERVICE_NAMES.map((name) => [
        name,
        new ec2.SecurityGroup(this, `${pascalCase(name)}Sg`, {
          vpc: this.vpc,
          description: `ECS tasks of ${name}`,
          // Tasks reach ECR, Secrets Manager, CloudWatch Logs and Gmail SMTP.
          allowAllOutbound: true,
        }),
      ]),
    ) as Record<ServiceName, ec2.SecurityGroup>;

    for (const name of SERVICE_NAMES) {
      for (const caller of CALLERS[name]) {
        this.serviceSecurityGroups[name].addIngressRule(
          this.serviceSecurityGroups[caller],
          ec2.Port.tcp(SERVICES[name].port),
          `${caller} calls ${name}`,
        );
      }
    }

    // What `aws ecs run-task` needs for the bootstrap, migrate and seed tasks.
    new CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName });
    new CfnOutput(this, 'PrivateSubnetIds', {
      value: Fn.join(
        ',',
        this.vpc.privateSubnets.map((subnet) => subnet.subnetId),
      ),
    });
    new CfnOutput(this, 'UserSecurityGroupId', {
      value: this.serviceSecurityGroups['user-service'].securityGroupId,
    });
    new CfnOutput(this, 'SupplierSecurityGroupId', {
      value: this.serviceSecurityGroups['supplier-service'].securityGroupId,
    });
  }

  /** Fixed zones, so that synth needs no context lookup for the account. */
  override get availabilityZones(): string[] {
    return [...this.zones];
  }
}
