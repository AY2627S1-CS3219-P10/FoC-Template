/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of existing application deployment definitions.
 * Author review: Checked AppStack property values and existing resource references in app-stack.ts; edited declaration naming and TypeScript formatting.
 */

import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';
import {
  EVENTS,
  INTERNAL_DOMAIN,
  JWT_AUDIENCE,
  JWT_ISSUER,
  SERVICE_NAMES,
  SERVICES,
  pascalCase,
} from './config';
import type { Profile, ServiceName } from './config';
import type { DataStack } from './data-stack';
import { FocService } from './foc-service';
import type { NetworkStack } from './network-stack';
import { Observability } from './observability';
import { imageOf } from './registry-stack';
import type { RegistryStack } from './registry-stack';

const SMTP_SETTINGS = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
};

export interface AppStackProps extends StackProps {
  readonly profile: Profile;
  readonly network: NetworkStack;
  readonly registry: RegistryStack;
  readonly data: DataStack;
  readonly imageTag: string;
  readonly alarmEmail?: string;
}

function internalUrl(name: ServiceName): string {
  return `http://${name}.${INTERNAL_DOMAIN}:${SERVICES[name].port}`;
}

/**
 * The five application services, the load balancer, CloudFront and monitoring.
 * This stack holds no data, so it can be destroyed when idle and recreated.
 */
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { profile, network, registry, data, imageTag } = props;
    const { secrets } = data;
    this.addDependency(registry);

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: network.vpc,
      internetFacing: true,
      vpcSubnets: { subnets: network.vpc.publicSubnets },
      securityGroup: network.albSecurityGroup,
      dropInvalidHeaderFields: true,
    });
    const listener = loadBalancer.addListener('Http', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      // The security group already limits this to CloudFront.
      open: false,
    });

    // There is no custom domain, so CloudFront reaches the ALB over HTTP and
    // browsers get HTTPS from the default *.cloudfront.net certificate.
    const origin = new origins.HttpOrigin(loadBalancer.loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
    });
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'Friend on Campus web app',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    });
    const publicOrigin = `https://${distribution.distributionDomainName}`;

    const secret = (
      source: secretsmanager.ISecret,
      field?: string,
    ): ecs.Secret => ecs.Secret.fromSecretsManager(source, field);
    const databasePoolMax = String(profile.databasePoolMax);
    const definitions: Record<
      ServiceName,
      {
        environment: Record<string, string>;
        secrets: Record<string, ecs.Secret>;
      }
    > = {
      'web-app': {
        environment: {
          USER_SERVICE_URL: internalUrl('user-service'),
          SUPPLIER_SERVICE_URL: internalUrl('supplier-service'),
          CREDIT_SERVICE_URL: internalUrl('credit-service'),
          ORDER_SERVICE_URL: internalUrl('order-service'),
          APP_ORIGIN: publicOrigin,
        },
        secrets: {
          CREDIT_USER_SERVICE_TOKEN: secret(secrets.creditUserServiceToken),
        },
      },
      'user-service': {
        environment: {
          NODE_ENV: 'production',
          PORT: String(SERVICES['user-service'].port),
          FRONTEND_ORIGIN: publicOrigin,
          REDIS_URL: data.redisUrl('user-service'),
          USER_EVENTS_ENABLED: 'true',
          USER_EVENTS_EXCHANGE: EVENTS.exchange,
          ...SMTP_SETTINGS,
        },
        secrets: {
          DATABASE_URL: secret(secrets.databaseUrls['user-service']),
          RABBITMQ_URL: secret(secrets.rabbitmqUrl),
          JWT_ACCESS_TOKEN_SECRET: secret(secrets.jwtAccessToken),
          EMAIL_VERIFICATION_CODE_SECRET: secret(secrets.emailVerificationCode),
          SMTP_USER: secret(secrets.smtp, 'username'),
          SMTP_PASSWORD: secret(secrets.smtp, 'password'),
          SMTP_FROM: secret(secrets.smtp, 'from'),
        },
      },
      'supplier-service': {
        environment: {
          NODE_ENV: 'production',
          PORT: String(SERVICES['supplier-service'].port),
          JWT_ISSUER,
          JWT_AUDIENCE,
        },
        secrets: {
          DATABASE_URL: secret(secrets.databaseUrls['supplier-service']),
          JWT_ACCESS_TOKEN_SECRET: secret(secrets.jwtAccessToken),
        },
      },
      'credit-service': {
        environment: {
          PORT: String(SERVICES['credit-service'].port),
          DATABASE_POOL_MAX: databasePoolMax,
          JWT_ISSUER,
          JWT_AUDIENCE,
          CREDIT_EVENTS_ENABLED: 'true',
          CREDIT_EVENTS_QUEUE: EVENTS.creditQueue,
          CREDIT_EVENTS_EXCHANGE: EVENTS.exchange,
          CREDIT_EVENTS_DEAD_LETTER_EXCHANGE: EVENTS.deadLetterExchange,
          CREDIT_EVENTS_DEAD_LETTER_QUEUE: EVENTS.deadLetterQueue,
          CREDIT_EVENTS_DEAD_LETTER_ROUTING_KEY: EVENTS.deadLetterRoutingKey,
          LOG_LEVEL: 'info',
        },
        secrets: {
          DATABASE_URL: secret(secrets.databaseUrls['credit-service']),
          RABBITMQ_URL: secret(secrets.rabbitmqUrl),
          JWT_ACCESS_TOKEN_SECRET: secret(secrets.jwtAccessToken),
          CREDIT_USER_SERVICE_TOKEN: secret(secrets.creditUserServiceToken),
          CREDIT_ORDER_SERVICE_TOKEN: secret(secrets.creditOrderServiceToken),
          CREDIT_MONITORING_TOKEN: secret(secrets.creditMonitoringToken),
        },
      },
      'order-service': {
        environment: {
          PORT: String(SERVICES['order-service'].port),
          DATABASE_POOL_MAX: databasePoolMax,
          REDIS_URL: data.redisUrl('order-service'),
          USER_SERVICE_URL: internalUrl('user-service'),
          SUPPLIER_SERVICE_URL: internalUrl('supplier-service'),
          CREDIT_SERVICE_URL: internalUrl('credit-service'),
          // Couriers are never paid when this is off.
          ORDER_EVENTS_ENABLED: 'true',
          ORDER_EVENTS_EXCHANGE: EVENTS.exchange,
          LOG_LEVEL: 'info',
        },
        secrets: {
          DATABASE_URL: secret(secrets.databaseUrls['order-service']),
          RABBITMQ_URL: secret(secrets.rabbitmqUrl),
          CREDIT_ORDER_SERVICE_TOKEN: secret(secrets.creditOrderServiceToken),
        },
      },
    };

    const focServices = Object.fromEntries(
      SERVICE_NAMES.map((name) => [
        name,
        new FocService(this, pascalCase(name), {
          name,
          profile,
          cluster: network.cluster,
          image: imageOf(this, name, imageTag),
          size: name === 'web-app' ? profile.webTask : profile.backendTask,
          securityGroup: network.serviceSecurityGroups[name],
          // The ALB reuses idle upstream connections for 60 seconds. Keep the
          // Next.js side open slightly longer so it cannot close a connection
          // just as the ALB sends another request, which surfaces as HTTP 502.
          command:
            name === 'web-app'
              ? [
                  'node',
                  'node_modules/next/dist/bin/next',
                  'start',
                  '--hostname',
                  '0.0.0.0',
                  '--port',
                  '3000',
                  '--keepAliveTimeout',
                  '65000',
                ]
              : undefined,
          // Keep two regular web targets so scaling or replacement cannot
          // briefly leave the public ALB without a usable target.
          minimumTasks:
            name === 'web-app' ? Math.max(2, profile.minTasks) : undefined,
          healthCheckGracePeriod:
            name === 'web-app' ? Duration.minutes(2) : undefined,
          ...definitions[name],
        }),
      ]),
    ) as Record<ServiceName, FocService>;

    const webApp = focServices['web-app'];
    const targetGroup = listener.addTargets('WebApp', {
      port: SERVICES['web-app'].port,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webApp.service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: SERVICES['web-app'].healthPath,
        healthyHttpCodes: '200',
        interval: Duration.seconds(30),
      },
    });
    webApp.scaling.scaleOnRequestCount('Requests', {
      targetGroup,
      requestsPerTarget: profile.webRequestsPerTargetPerMinute,
      scaleOutCooldown: Duration.minutes(1),
      scaleInCooldown: Duration.minutes(2),
    });

    if (profile.waf) {
      const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'foc-web-acl',
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: 'aws-common-rules',
            priority: 0,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: 'foc-aws-common-rules',
              sampledRequestsEnabled: true,
            },
          },
        ],
      });
      new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
        resourceArn: loadBalancer.loadBalancerArn,
        webAclArn: webAcl.attrArn,
      });
    }

    new Observability(this, 'Observability', {
      profile,
      loadBalancer,
      targetGroup,
      services: Object.fromEntries(
        SERVICE_NAMES.map((name) => [name, focServices[name].service]),
      ) as Record<ServiceName, ecs.FargateService>,
      brokerService: data.brokerService,
      brokerBacklog: data.brokerBacklog,
      brokerBacklogThreshold: data.brokerBacklogThreshold,
      databases: data.databases,
      alarmEmail: props.alarmEmail,
    });

    new CfnOutput(this, 'AppUrl', { value: publicOrigin });
  }
}
