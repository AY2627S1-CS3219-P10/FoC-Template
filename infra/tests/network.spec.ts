/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of network test assertions and fixtures.
 * Author review: Checked "allows just the CloudFront prefix list into the load balancer" against the expected results; edited fixture naming and assertion formatting.
 */

import {
  CLOUDFRONT_ORIGIN_PREFIX_LIST,
  PROFILES,
  SERVICES,
} from '../lib/config';
import {
  allIngressRules,
  ingressSources,
  resources,
  synthesize,
} from './support';
import type { Properties } from './support';

describe('only CloudFront can reach the load balancer', () => {
  const { network, app } = synthesize('demo');

  it('allows just the CloudFront prefix list into the load balancer', () => {
    expect(ingressSources(network, 'AlbSg')).toEqual([
      `prefix:"${CLOUDFRONT_ORIGIN_PREFIX_LIST}"`,
    ]);
    const [rule] = resources(network, 'AWS::EC2::SecurityGroupIngress').filter(
      (candidate) => JSON.stringify(candidate.GroupId).includes('AlbSg'),
    );
    expect(rule).toMatchObject({ IpProtocol: 'tcp', FromPort: 80, ToPort: 80 });
  });

  it('allows nothing but the load balancer into web-app', () => {
    expect(ingressSources(network, 'WebAppSg')).toEqual([
      `Alb:${SERVICES['web-app'].port}`,
    ]);
  });

  it('puts the load balancer behind that security group, with no open listener', () => {
    const [loadBalancer] = resources(
      app,
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
    );
    expect(loadBalancer!.Scheme).toBe('internet-facing');
    expect(JSON.stringify(loadBalancer!.SecurityGroups)).toContain('AlbSg');
    app.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  it('caches only /_next/static and forwards everything to the origin', () => {
    const CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
    const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
    const ALL_VIEWER = '216adef6-5c7f-47e4-b989-5492eafa07d3';
    const [distribution] = resources(app, 'AWS::CloudFront::Distribution');
    const config = distribution!.DistributionConfig as {
      Origins: { CustomOriginConfig: { OriginProtocolPolicy: string } }[];
      DefaultCacheBehavior: Properties;
      CacheBehaviors: Properties[];
    };

    expect(config.Origins[0]!.CustomOriginConfig.OriginProtocolPolicy).toBe(
      'http-only',
    );
    expect(config.DefaultCacheBehavior).toMatchObject({
      ViewerProtocolPolicy: 'redirect-to-https',
      CachePolicyId: CACHING_DISABLED,
      OriginRequestPolicyId: ALL_VIEWER,
    });
    expect(config.CacheBehaviors).toEqual([
      expect.objectContaining({
        PathPattern: '/_next/static/*',
        CachePolicyId: CACHING_OPTIMIZED,
      }),
    ]);
  });
});

describe('network', () => {
  it.each(['demo', 'scale'] as const)(
    'opens nothing to the whole internet (%s)',
    (profile) => {
      const { network, data } = synthesize(profile);
      for (const template of [network, data]) {
        const open = allIngressRules(template).filter(
          (rule) => rule.CidrIp === '0.0.0.0/0' || rule.CidrIpv6 === '::/0',
        );
        expect(open).toEqual([]);
      }
    },
  );

  it('lets each service be called only by its known callers', () => {
    const { network } = synthesize('demo');
    const callers = (group: string, port: number): string[] =>
      [`WebApp:${port}`, `OrderService:${port}`].filter((source) =>
        ingressSources(network, group).includes(source),
      );

    expect(ingressSources(network, 'UserServiceSg')).toHaveLength(2);
    expect(callers('UserServiceSg', 3001)).toHaveLength(2);
    expect(ingressSources(network, 'SupplierServiceSg')).toHaveLength(2);
    expect(callers('SupplierServiceSg', 3002)).toHaveLength(2);
    expect(ingressSources(network, 'CreditServiceSg')).toHaveLength(2);
    expect(callers('CreditServiceSg', 3003)).toHaveLength(2);
    expect(ingressSources(network, 'OrderServiceSg')).toEqual(['WebApp:3004']);
  });

  it('uses one t4g.micro NAT instance and no NAT gateway in demo', () => {
    const { network } = synthesize('demo');
    network.resourceCountIs('AWS::EC2::NatGateway', 0);
    network.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.micro',
      SourceDestCheck: false,
    });
    network.resourceCountIs('AWS::EC2::Subnet', 6);
  });

  it('replaces the NAT instance when it is resized', () => {
    const { network } = synthesize('demo');
    expect(Object.keys(network.findResources('AWS::EC2::Instance'))).toEqual([
      'NatInstance0t4gmicro',
    ]);
  });

  it('uses a NAT gateway per zone across three zones in scale', () => {
    const { network } = synthesize('scale');
    network.resourceCountIs('AWS::EC2::NatGateway', 3);
    network.resourceCountIs('AWS::EC2::Instance', 0);
    network.resourceCountIs('AWS::EC2::Subnet', 9);
    expect(PROFILES.scale.availabilityZones).toHaveLength(3);
  });

  it('turns on Container Insights only in scale', () => {
    const insights = (profile: 'demo' | 'scale'): unknown =>
      resources(synthesize(profile).network, 'AWS::ECS::Cluster')[0]!
        .ClusterSettings;
    expect(insights('demo')).toEqual([
      { Name: 'containerInsights', Value: 'disabled' },
    ]);
    expect(insights('scale')).toEqual([
      { Name: 'containerInsights', Value: 'enabled' },
    ]);
  });
});
