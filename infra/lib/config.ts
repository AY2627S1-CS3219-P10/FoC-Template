export const REGION = 'ap-southeast-1';

/** Private DNS zone for service discovery: `<service>.foc.internal`. */
export const INTERNAL_DOMAIN = 'foc.internal';

/**
 * AWS-managed prefix list com.amazonaws.global.cloudfront.origin-facing in
 * ap-southeast-1. Hard-coded so synth needs no context lookup, which would
 * write the account ID into cdk.context.json.
 */
export const CLOUDFRONT_ORIGIN_PREFIX_LIST = 'pl-31a34658';

export const SERVICE_NAMES = [
  'web-app',
  'user-service',
  'supplier-service',
  'credit-service',
  'order-service',
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export const DATABASE_OWNERS = [
  'user-service',
  'supplier-service',
  'credit-service',
  'order-service',
] as const;
export type DatabaseOwner = (typeof DATABASE_OWNERS)[number];

/** The health paths match each Dockerfile HEALTHCHECK where one exists. */
export const SERVICES: Record<
  ServiceName,
  { readonly port: number; readonly healthPath: string }
> = {
  'web-app': { port: 3000, healthPath: '/login' },
  'user-service': { port: 3001, healthPath: '/api/health/ready' },
  'supplier-service': { port: 3002, healthPath: '/api/health/ready' },
  'credit-service': { port: 3003, healthPath: '/health/ready' },
  'order-service': { port: 3004, healthPath: '/health/ready' },
};

/** Each service has its own database, and a login of the same name. */
export const DATABASES: Record<DatabaseOwner, string> = {
  'user-service': 'foc_user',
  'supplier-service': 'foc_supplier',
  'credit-service': 'foc_credit',
  'order-service': 'foc_order',
};

/** The services each service accepts calls from. web-app is the public entry. */
export const CALLERS: Record<ServiceName, readonly ServiceName[]> = {
  'web-app': [],
  'user-service': ['web-app', 'order-service'],
  'supplier-service': ['web-app', 'order-service'],
  'credit-service': ['web-app', 'order-service'],
  'order-service': ['web-app'],
};

export const REDIS_CLIENTS = ['user-service', 'order-service'] as const;
export const REDIS_DATABASES = { 'user-service': 0, 'order-service': 1 };

export const RABBITMQ_CLIENTS = [
  'user-service',
  'credit-service',
  'order-service',
] as const;

/** The values credit-service and the publishers use by default. */
export const EVENTS = {
  exchange: 'foc.events',
  creditQueue: 'credit-service.events',
  deadLetterExchange: 'foc.events.dlx',
  deadLetterQueue: 'credit-service.events.dlq',
  deadLetterRoutingKey: 'credit-service.events.dead',
} as const;

export const JWT_ISSUER = 'foc-user-service';
export const JWT_AUDIENCE = 'foc-api';

export interface TaskSize {
  readonly cpu: number;
  readonly memoryMiB: number;
}

export interface FargateBrokerConfig extends TaskSize {
  readonly kind: 'fargate';
  readonly image: string;
  /** Publishers block at this level instead of the task being OOM-killed. */
  readonly memoryWatermark: string;
}

export interface AmazonMqBrokerConfig {
  readonly kind: 'amazon-mq';
  readonly instanceType: string;
  readonly engineVersion: string;
  readonly deploymentMode: 'SINGLE_INSTANCE' | 'CLUSTER_MULTI_AZ';
}

export interface Profile {
  readonly name: ProfileName;
  readonly availabilityZones: readonly string[];
  readonly nat:
    | { readonly kind: 'instance'; readonly instanceType: string }
    | { readonly kind: 'gateway' };
  readonly natCount: number;
  readonly backendTask: TaskSize;
  readonly webTask: TaskSize;
  /** Tasks up to this count run on Fargate, tasks above it on Fargate Spot. */
  readonly minTasks: number;
  readonly maxTasks: number;
  readonly cpuTargetPercent: number;
  readonly webRequestsPerTargetPerMinute: number;
  readonly postgres: {
    readonly instanceType: string;
    readonly multiAz: boolean;
    /** One instance per service instead of one shared instance. */
    readonly perService: boolean;
    readonly proxy: boolean;
    readonly storageGiB: number;
    readonly connectionsAlarmThreshold: number;
  };
  /**
   * DATABASE_POOL_MAX for order-service and credit-service. user-service and
   * supplier-service have no setting and use node-postgres's default of 10.
   */
  readonly databasePoolMax: number;
  readonly cache: { readonly nodeType: string; readonly nodes: number };
  readonly broker: FargateBrokerConfig | AmazonMqBrokerConfig;
  readonly waf: boolean;
  readonly containerInsights: boolean;
}

export type ProfileName = 'demo' | 'scale';

/** The pool size user-service and supplier-service get from node-postgres. */
export const DEFAULT_POOL_SIZE = 10;

export const PROFILES: Record<ProfileName, Profile> = {
  demo: {
    name: 'demo',
    availabilityZones: ['ap-southeast-1a', 'ap-southeast-1b'],
    nat: { kind: 'instance', instanceType: 't4g.nano' },
    natCount: 1,
    backendTask: { cpu: 256, memoryMiB: 512 },
    webTask: { cpu: 512, memoryMiB: 1024 },
    minTasks: 1,
    maxTasks: 3,
    cpuTargetPercent: 60,
    webRequestsPerTargetPerMinute: 300,
    postgres: {
      instanceType: 't4g.small',
      multiAz: false,
      perService: false,
      proxy: false,
      storageGiB: 20,
      // max_connections is LEAST(DBInstanceClassMemory/9531392, 5000), so at
      // most 225 on this 2 GiB class. Worst case is 3 tasks x (order 10 +
      // credit 10 + user 10 + supplier 10) = 120 connections.
      connectionsAlarmThreshold: 150,
    },
    databasePoolMax: 10,
    cache: { nodeType: 'cache.t4g.micro', nodes: 1 },
    broker: {
      kind: 'fargate',
      image: 'public.ecr.aws/docker/library/rabbitmq:4.2.9-management-alpine',
      cpu: 256,
      memoryMiB: 1024,
      memoryWatermark: '512MB',
    },
    waf: false,
    containerInsights: false,
  },
  scale: {
    name: 'scale',
    availabilityZones: [
      'ap-southeast-1a',
      'ap-southeast-1b',
      'ap-southeast-1c',
    ],
    nat: { kind: 'gateway' },
    natCount: 3,
    backendTask: { cpu: 512, memoryMiB: 1024 },
    webTask: { cpu: 1024, memoryMiB: 2048 },
    minTasks: 2,
    maxTasks: 20,
    cpuTargetPercent: 60,
    webRequestsPerTargetPerMinute: 600,
    postgres: {
      instanceType: 'm7g.large',
      multiAz: true,
      perService: true,
      proxy: true,
      storageGiB: 100,
      connectionsAlarmThreshold: 600,
    },
    // RDS Proxy multiplexes these onto far fewer database connections.
    databasePoolMax: 10,
    cache: { nodeType: 'cache.m7g.large', nodes: 3 },
    broker: {
      kind: 'amazon-mq',
      instanceType: 'mq.m7g.large',
      engineVersion: '4.2',
      deploymentMode: 'CLUSTER_MULTI_AZ',
    },
    waf: true,
    containerInsights: true,
  },
};

export function getProfile(name: string | undefined): Profile {
  const profileName = name ?? 'demo';
  if (profileName !== 'demo' && profileName !== 'scale') {
    throw new Error(`Unknown profile "${profileName}": use demo or scale`);
  }
  return PROFILES[profileName];
}

/** `user-service` becomes `UserService`, for construct IDs. */
export function pascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
