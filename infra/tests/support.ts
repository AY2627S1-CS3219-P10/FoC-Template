import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PROFILES, REGION } from '../lib/config';
import type { ProfileName } from '../lib/config';
import { createFocStacks } from '../lib/stacks';

export interface Templates {
  readonly network: Template;
  readonly registry: Template;
  readonly data: Template;
  readonly jobs: Template;
  readonly app: Template;
  readonly ci: Template;
}

export interface Container {
  readonly Name: string;
  readonly Image: unknown;
  readonly User?: string;
  readonly Essential?: boolean;
  readonly EntryPoint?: string[];
  readonly Command?: string[];
  readonly Environment?: { Name: string; Value: unknown }[];
  readonly Secrets?: { Name: string; ValueFrom: unknown }[];
  readonly HealthCheck?: { Command: string[] };
}

export type Properties = Record<string, unknown>;

interface CfnResource {
  readonly Properties: Properties;
}

const cache = new Map<string, Templates>();

/** Synthesizes with cdk.json's feature flags, as `cdk synth` does. */
export function synthesize(
  profile: ProfileName,
  alarmEmail: string | undefined = 'alarms@example.invalid',
): Templates {
  const key = `${profile}:${alarmEmail}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { context } = JSON.parse(
    readFileSync(join(__dirname, '..', 'cdk.json'), 'utf8'),
  ) as { context: Record<string, unknown> };
  const stacks = createFocStacks(new App({ context }), {
    profile: PROFILES[profile],
    env: { account: '111111111111', region: REGION },
    imageTag: 'test-tag',
    alarmEmail,
  });
  const templates = {
    network: Template.fromStack(stacks.network),
    registry: Template.fromStack(stacks.registry),
    data: Template.fromStack(stacks.data),
    jobs: Template.fromStack(stacks.jobs),
    app: Template.fromStack(stacks.app),
    ci: Template.fromStack(stacks.ci),
  };
  cache.set(key, templates);
  return templates;
}

export function resources(template: Template, type: string): Properties[] {
  const found = template.findResources(type) as Record<string, CfnResource>;
  return Object.values(found).map((resource) => resource.Properties);
}

export function containersOf(template: Template, family: string): Container[] {
  const definition = resources(template, 'AWS::ECS::TaskDefinition').find(
    (properties) => properties.Family === family,
  );
  if (!definition) throw new Error(`No task definition ${family}`);
  return definition.ContainerDefinitions as Container[];
}

export function mainContainer(template: Template, family: string): Container {
  const [container] = containersOf(template, family);
  if (!container) throw new Error(`No container in ${family}`);
  return container;
}

export function environmentOf(container: Container): Record<string, unknown> {
  return Object.fromEntries(
    (container.Environment ?? []).map(({ Name, Value }) => [Name, Value]),
  );
}

export function secretNames(container: Container): string[] {
  return (container.Secrets ?? []).map(({ Name }) => Name).sort();
}

export function secretSource(container: Container, name: string): string {
  const secret = (container.Secrets ?? []).find((s) => s.Name === name);
  if (!secret) throw new Error(`${container.Name} has no secret ${name}`);
  return JSON.stringify(secret.ValueFrom);
}

const SECURITY_GROUP_NAMES =
  /(WebApp|UserService|SupplierService|CreditService|OrderService|Bootstrap|Alb)/;

/**
 * Who may reach a security group: names of the source groups, taken from the
 * references in each rule, and any CIDR or prefix list given instead.
 */
export function ingressSources(template: Template, group: string): string[] {
  const rules = resources(template, 'AWS::EC2::SecurityGroupIngress').filter(
    (rule) => JSON.stringify(rule.GroupId).includes(group),
  );
  return rules
    .map((rule) => {
      if (rule.CidrIp) return `cidr:${JSON.stringify(rule.CidrIp)}`;
      if (rule.SourcePrefixListId) {
        return `prefix:${JSON.stringify(rule.SourcePrefixListId)}`;
      }
      const source = JSON.stringify(rule.SourceSecurityGroupId);
      const match = SECURITY_GROUP_NAMES.exec(source);
      return `${match?.[1] ?? source}:${String(rule.FromPort)}`;
    })
    .sort();
}

/** Every inbound rule of a template, inline or a separate resource. */
export function allIngressRules(template: Template): Properties[] {
  const inline = resources(template, 'AWS::EC2::SecurityGroup').flatMap(
    (group) => (group.SecurityGroupIngress as Properties[] | undefined) ?? [],
  );
  return [...inline, ...resources(template, 'AWS::EC2::SecurityGroupIngress')];
}
