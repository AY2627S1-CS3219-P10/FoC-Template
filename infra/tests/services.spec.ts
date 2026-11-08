import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATABASES,
  DATABASE_OWNERS,
  DEFAULT_POOL_SIZE,
  PROFILES,
  SERVICE_NAMES,
  SERVICES,
  pascalCase,
} from '../lib/config';
import type { ServiceName } from '../lib/config';
import {
  environmentOf,
  mainContainer,
  resources,
  secretNames,
  secretSource,
  synthesize,
} from './support';
import type { Container, Templates } from './support';

const SECRET_LOOKING_NAME =
  /PASSWORD|PASS$|SECRET|TOKEN|DATABASE_URL|RABBITMQ_URL/;

function allContainers(templates: Templates): Container[] {
  return [templates.data, templates.jobs, templates.app].flatMap((template) =>
    resources(template, 'AWS::ECS::TaskDefinition').flatMap(
      (definition) => definition.ContainerDefinitions as Container[],
    ),
  );
}

describe('autoscaling', () => {
  it.each([
    ['demo', 1, 3],
    ['scale', 2, 20],
  ] as const)('%s runs %i to %i tasks per service', (profile, min, max) => {
    const { app } = synthesize(profile);
    const targets = resources(
      app,
      'AWS::ApplicationAutoScaling::ScalableTarget',
    );
    expect(targets).toHaveLength(SERVICE_NAMES.length);
    for (const target of targets) {
      expect(target).toMatchObject({ MinCapacity: min, MaxCapacity: max });
    }
  });

  it('scales every service on CPU, and web-app on requests too', () => {
    const { app } = synthesize('demo');
    const metricTypes = resources(
      app,
      'AWS::ApplicationAutoScaling::ScalingPolicy',
    ).map(
      (policy) =>
        (
          policy.TargetTrackingScalingPolicyConfiguration as {
            PredefinedMetricSpecification: { PredefinedMetricType: string };
          }
        ).PredefinedMetricSpecification.PredefinedMetricType,
    );
    expect(
      metricTypes.filter((type) => type === 'ECSServiceAverageCPUUtilization'),
    ).toHaveLength(SERVICE_NAMES.length);
    expect(
      metricTypes.filter((type) => type === 'ALBRequestCountPerTarget'),
    ).toHaveLength(1);
  });

  it.each(['demo', 'scale'] as const)(
    'keeps the minimum on Fargate and extra copies on Spot (%s)',
    (profile) => {
      const { app } = synthesize(profile);
      const base = PROFILES[profile].minTasks;
      for (const service of resources(app, 'AWS::ECS::Service')) {
        expect(service.CapacityProviderStrategy).toEqual([
          { CapacityProvider: 'FARGATE', Base: base, Weight: 0 },
          { CapacityProvider: 'FARGATE_SPOT', Weight: 1 },
        ]);
      }
    },
  );
});

describe('secrets reach tasks as ECS secrets', () => {
  const expected: Record<ServiceName, string[]> = {
    'web-app': ['CREDIT_USER_SERVICE_TOKEN'],
    'user-service': [
      'DATABASE_URL',
      'EMAIL_VERIFICATION_CODE_SECRET',
      'JWT_ACCESS_TOKEN_SECRET',
      'RABBITMQ_URL',
      'SMTP_FROM',
      'SMTP_PASSWORD',
      'SMTP_USER',
    ],
    'supplier-service': ['DATABASE_URL', 'JWT_ACCESS_TOKEN_SECRET'],
    'credit-service': [
      'CREDIT_MONITORING_TOKEN',
      'CREDIT_ORDER_SERVICE_TOKEN',
      'CREDIT_USER_SERVICE_TOKEN',
      'DATABASE_URL',
      'JWT_ACCESS_TOKEN_SECRET',
      'RABBITMQ_URL',
    ],
    'order-service': [
      'CREDIT_ORDER_SERVICE_TOKEN',
      'DATABASE_URL',
      'RABBITMQ_URL',
    ],
  };

  it.each(SERVICE_NAMES)('%s gets exactly its secrets', (name) => {
    const { app } = synthesize('demo');
    expect(secretNames(mainContainer(app, `foc-${name}`))).toEqual(
      expected[name],
    );
  });

  it.each(['demo', 'scale'] as const)(
    'puts no secret in a plain environment variable (%s)',
    (profile) => {
      for (const container of allContainers(synthesize(profile))) {
        for (const { Name, Value } of container.Environment ?? []) {
          expect(Name).not.toMatch(SECRET_LOOKING_NAME);
          expect(JSON.stringify(Value)).not.toContain('resolve:secretsmanager');
        }
      }
    },
  );

  it.each(DATABASE_OWNERS)('%s reads its own database URL', (owner) => {
    const { app } = synthesize('demo');
    expect(
      secretSource(mainContainer(app, `foc-${owner}`), 'DATABASE_URL'),
    ).toContain(`${pascalCase(owner)}DatabaseUrl`);
  });

  it('shares each internal token between the two services that use it', () => {
    const { app } = synthesize('demo');
    const web = mainContainer(app, 'foc-web-app');
    const credit = mainContainer(app, 'foc-credit-service');
    const order = mainContainer(app, 'foc-order-service');
    expect(secretSource(web, 'CREDIT_USER_SERVICE_TOKEN')).toBe(
      secretSource(credit, 'CREDIT_USER_SERVICE_TOKEN'),
    );
    expect(secretSource(order, 'CREDIT_ORDER_SERVICE_TOKEN')).toBe(
      secretSource(credit, 'CREDIT_ORDER_SERVICE_TOKEN'),
    );
    const tokens = [
      'CREDIT_USER_SERVICE_TOKEN',
      'CREDIT_ORDER_SERVICE_TOKEN',
      'CREDIT_MONITORING_TOKEN',
    ].map((name) => secretSource(credit, name));
    expect(new Set(tokens).size).toBe(3);
  });

  it('shares the JWT secret between user, supplier and credit', () => {
    const { app } = synthesize('demo');
    const sources = ['user', 'supplier', 'credit'].map((name) =>
      secretSource(
        mainContainer(app, `foc-${name}-service`),
        'JWT_ACCESS_TOKEN_SECRET',
      ),
    );
    expect(new Set(sources).size).toBe(1);
  });

  it('reads SMTP values from one secret, by key', () => {
    const user = mainContainer(synthesize('demo').app, 'foc-user-service');
    expect(secretSource(user, 'SMTP_USER')).toContain(':username::');
    expect(secretSource(user, 'SMTP_PASSWORD')).toContain(':password::');
    expect(secretSource(user, 'SMTP_FROM')).toContain(':from::');
    expect(environmentOf(user)).toMatchObject({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
    });
  });
});

describe('secret values', () => {
  const secretsOf = (profile: 'demo' | 'scale'): Record<string, unknown>[] =>
    resources(synthesize(profile).data, 'AWS::SecretsManager::Secret');
  const derived = (profile: 'demo' | 'scale'): string[] =>
    secretsOf(profile)
      .filter((secret) => secret.SecretString !== undefined)
      .map((secret) => JSON.stringify(secret.SecretString));

  it.each(['demo', 'scale'] as const)(
    'are either generated or built only from references (%s)',
    (profile) => {
      for (const secret of secretsOf(profile)) {
        if (secret.SecretString === undefined) {
          expect(secret.GenerateSecretString).toBeDefined();
        } else {
          expect(JSON.stringify(secret.SecretString)).toContain(
            '{{resolve:secretsmanager:',
          );
        }
      }
    },
  );

  it('build one sslmode=no-verify URL for each database', () => {
    const urls = derived('demo').filter((url) => url.includes('postgresql://'));
    expect(urls).toHaveLength(DATABASE_OWNERS.length);
    for (const owner of DATABASE_OWNERS) {
      const database = DATABASES[owner];
      const url = urls.find((candidate) =>
        candidate.includes(`postgresql://${database}:`),
      );
      expect(url).toContain(`/${database}?sslmode=no-verify`);
      expect(url).toContain(`${pascalCase(owner)}Login`);
    }
  });

  it('build the RabbitMQ URL for each kind of broker', () => {
    const urlOf = (profile: 'demo' | 'scale'): string | undefined =>
      derived(profile).find((url) => url.includes('amqp'));
    expect(urlOf('demo')).toContain('amqp://foc:');
    expect(urlOf('demo')).toContain('@rabbitmq.foc.internal:5672');
    expect(urlOf('scale')).toContain('amqps://foc:');
  });

  it('totals 19 in demo, for the cost estimate', () => {
    expect(secretsOf('demo')).toHaveLength(19);
  });
});

describe('database connections', () => {
  it.each(['credit-service', 'order-service'] as const)(
    'sets DATABASE_POOL_MAX on %s',
    (name) => {
      for (const profile of ['demo', 'scale'] as const) {
        const container = mainContainer(synthesize(profile).app, `foc-${name}`);
        expect(environmentOf(container).DATABASE_POOL_MAX).toBe(
          String(PROFILES[profile].databasePoolMax),
        );
      }
    },
  );

  it('keeps the demo worst case below the alarm and max_connections', () => {
    const { maxTasks, databasePoolMax, postgres } = PROFILES.demo;
    const worstCase = maxTasks * (2 * databasePoolMax + 2 * DEFAULT_POOL_SIZE);
    expect(worstCase).toBe(120);
    expect(worstCase).toBeLessThan(postgres.connectionsAlarmThreshold);
    // 2 GiB / 9531392 bytes, the RDS default for max_connections.
    expect(postgres.connectionsAlarmThreshold).toBeLessThan(225);
  });
});

describe('service configuration', () => {
  const { app } = synthesize('demo');

  it('uses Valkey TLS with a separate logical database per service', () => {
    const redisUrl = (name: string): string =>
      JSON.stringify(
        environmentOf(mainContainer(app, `foc-${name}`)).REDIS_URL,
      );
    expect(redisUrl('user-service')).toContain('rediss://');
    expect(redisUrl('user-service')).toMatch(/\/0"/);
    expect(redisUrl('order-service')).toContain('rediss://');
    expect(redisUrl('order-service')).toMatch(/\/1"/);
  });

  it('turns events on, or couriers are never paid', () => {
    const value = (service: string, name: string): unknown =>
      environmentOf(mainContainer(app, `foc-${service}`))[name];
    expect(value('order-service', 'ORDER_EVENTS_ENABLED')).toBe('true');
    expect(value('credit-service', 'CREDIT_EVENTS_ENABLED')).toBe('true');
    expect(value('user-service', 'USER_EVENTS_ENABLED')).toBe('true');
  });

  it('gives web-app and user-service the same public https origin', () => {
    const web = environmentOf(mainContainer(app, 'foc-web-app'));
    const user = environmentOf(mainContainer(app, 'foc-user-service'));
    expect(web.APP_ORIGIN).toEqual(user.FRONTEND_ORIGIN);
    expect(JSON.stringify(web.APP_ORIGIN)).toContain('https://');
    expect(JSON.stringify(web.APP_ORIGIN)).toContain('DomainName');
  });

  it('points services at each other through Cloud Map names', () => {
    const web = environmentOf(mainContainer(app, 'foc-web-app'));
    expect(web).toMatchObject({
      USER_SERVICE_URL: 'http://user-service.foc.internal:3001',
      SUPPLIER_SERVICE_URL: 'http://supplier-service.foc.internal:3002',
      CREDIT_SERVICE_URL: 'http://credit-service.foc.internal:3003',
      ORDER_SERVICE_URL: 'http://order-service.foc.internal:3004',
    });
    const names = resources(app, 'AWS::ServiceDiscovery::Service')
      .map((service) => service.Name as string)
      .sort();
    expect(names).toEqual([...SERVICE_NAMES].sort());
  });

  it('gives supplier-service the issuer and audience user-service uses', () => {
    const contract = readFileSync(
      join(
        __dirname,
        '../../user-service/src/modules/accounts/application/contracts/access-token.contract.ts',
      ),
      'utf8',
    );
    const supplier = environmentOf(mainContainer(app, 'foc-supplier-service'));
    expect(contract).toContain(`ISSUER = '${String(supplier.JWT_ISSUER)}'`);
    expect(contract).toContain(`AUDIENCE = '${String(supplier.JWT_AUDIENCE)}'`);
  });

  it.each(SERVICE_NAMES)('checks the health of %s on its path', (name) => {
    const { port, healthPath } = SERVICES[name];
    const container = mainContainer(app, `foc-${name}`);
    expect(container.HealthCheck!.Command.join(' ')).toContain(
      `http://127.0.0.1:${port}${healthPath}`,
    );
  });

  it.each(['web-app', 'user-service', 'supplier-service'] as const)(
    'uses the same health path as the %s Dockerfile',
    (name) => {
      const dockerfile = readFileSync(
        join(__dirname, '..', '..', name, 'Dockerfile'),
        'utf8',
      );
      const { port, healthPath } = SERVICES[name];
      expect(dockerfile).toContain(`http://127.0.0.1:${port}${healthPath}`);
    },
  );

  it('rolls back failed deployments, in private subnets, with no public IP', () => {
    for (const service of resources(app, 'AWS::ECS::Service')) {
      expect(service.DeploymentConfiguration).toMatchObject({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      });
      expect(service.NetworkConfiguration).toMatchObject({
        AwsvpcConfiguration: { AssignPublicIp: 'DISABLED' },
      });
      expect(JSON.stringify(service.NetworkConfiguration)).toContain(
        'PrivateSubnet',
      );
    }
  });

  it('runs tasks on linux/amd64, which is how the images are built', () => {
    for (const definition of resources(app, 'AWS::ECS::TaskDefinition')) {
      expect(definition.RuntimePlatform).toEqual({
        CpuArchitecture: 'X86_64',
        OperatingSystemFamily: 'LINUX',
      });
    }
  });

  it('pulls application images by the given tag', () => {
    const container = mainContainer(app, 'foc-order-service');
    expect(JSON.stringify(container.Image)).toContain(':test-tag');
  });

  it('sizes tasks as the plan says', () => {
    const task = (family: string): unknown =>
      resources(app, 'AWS::ECS::TaskDefinition').find(
        (definition) => definition.Family === family,
      );
    expect(task('foc-web-app')).toMatchObject({ Cpu: '512', Memory: '1024' });
    expect(task('foc-order-service')).toMatchObject({
      Cpu: '256',
      Memory: '512',
    });
  });

  it('adds a WAF only in scale', () => {
    app.resourceCountIs('AWS::WAFv2::WebACL', 0);
    const { app: scale } = synthesize('scale');
    scale.resourceCountIs('AWS::WAFv2::WebACL', 1);
    scale.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
  });
});

describe('jobs', () => {
  const { jobs } = synthesize('demo');

  it('migrates user-service and supplier-service with the default command', () => {
    for (const family of ['foc-migrate-user', 'foc-migrate-supplier']) {
      const container = mainContainer(jobs, family);
      expect(secretNames(container)).toEqual(['DATABASE_URL']);
      expect(container.Command).toBeUndefined();
    }
    expect(
      JSON.stringify(mainContainer(jobs, 'foc-migrate-user').Image),
    ).toContain('foc/migrate-user:test-tag');
  });

  it('seeds supplier locations from the migrate image', () => {
    const seed = mainContainer(jobs, 'foc-seed-supplier-locations');
    expect(seed.Command).toEqual(['node', 'scripts/seed-csv-locations.mjs']);
    expect(JSON.stringify(seed.Image)).toBe(
      JSON.stringify(mainContainer(jobs, 'foc-migrate-supplier').Image),
    );
  });

  it('seeds administrators from the user-service image', () => {
    const seed = mainContainer(jobs, 'foc-seed-administrators');
    expect(seed.Command).toEqual(['node', 'dist/seed-administrators.js']);
    expect(secretNames(seed)).toEqual(['ADMIN_SEED_ACCOUNTS', 'DATABASE_URL']);
    expect(secretSource(seed, 'DATABASE_URL')).toContain(
      'UserServiceDatabaseUrl',
    );
  });

  it('seeds staging load-test accounts from the user-service image', () => {
    const seed = mainContainer(jobs, 'foc-seed-test-accounts');
    expect(seed.Command).toEqual(['node', 'dist/seed-test-accounts.js']);
    expect(environmentOf(seed)).toEqual({
      ALLOW_TEST_ACCOUNT_SEED: 'true',
      NODE_ENV: 'staging',
    });
    expect(secretNames(seed)).toEqual([
      'DATABASE_URL',
      'TEST_ACCOUNT_SEED_ACCOUNTS',
    ]);
    expect(secretSource(seed, 'DATABASE_URL')).toContain(
      'UserServiceDatabaseUrl',
    );
  });
});

describe('registry', () => {
  it('has immutable, scanned repositories for all seven images', () => {
    const { registry } = synthesize('demo');
    const repositories = resources(registry, 'AWS::ECR::Repository');
    expect(repositories.map((r) => r.RepositoryName).sort()).toEqual(
      [
        'foc/credit-service',
        'foc/migrate-supplier',
        'foc/migrate-user',
        'foc/order-service',
        'foc/supplier-service',
        'foc/user-service',
        'foc/web-app',
      ].sort(),
    );
    for (const repository of repositories) {
      expect(repository).toMatchObject({
        ImageTagMutability: 'IMMUTABLE',
        ImageScanningConfiguration: { ScanOnPush: true },
        EmptyOnDelete: true,
      });
    }
  });
});
