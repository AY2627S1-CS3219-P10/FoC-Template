import { DATABASES, DATABASE_OWNERS } from '../lib/config';
import { bootstrapScript, passwordVariable } from '../lib/db-bootstrap';
import {
  allIngressRules,
  containersOf,
  environmentOf,
  ingressSources,
  mainContainer,
  resources,
  secretNames,
  synthesize,
} from './support';

describe('the data tier is not public', () => {
  it.each(['demo', 'scale'] as const)(
    'keeps Postgres out of public subnets (%s)',
    (profile) => {
      const { data } = synthesize(profile);
      for (const database of resources(data, 'AWS::RDS::DBInstance')) {
        expect(database.PubliclyAccessible).toBe(false);
        expect(database.StorageEncrypted).toBe(true);
      }
      for (const group of resources(data, 'AWS::RDS::DBSubnetGroup')) {
        expect(JSON.stringify(group.SubnetIds)).toContain('Isolated');
        expect(JSON.stringify(group.SubnetIds)).not.toMatch(
          /Public|PrivateSubnet/,
        );
      }
    },
  );

  it.each(['demo', 'scale'] as const)(
    'keeps Valkey in isolated subnets (%s)',
    (profile) => {
      const { data } = synthesize(profile);
      const [subnets] = resources(data, 'AWS::ElastiCache::SubnetGroup');
      expect(JSON.stringify(subnets!.SubnetIds)).toContain('Isolated');
      expect(JSON.stringify(subnets!.SubnetIds)).not.toContain('Public');
    },
  );

  it('runs the demo broker without a public address', () => {
    const { data } = synthesize('demo');
    const [service] = resources(data, 'AWS::ECS::Service');
    expect(service!.NetworkConfiguration).toMatchObject({
      AwsvpcConfiguration: { AssignPublicIp: 'DISABLED' },
    });
    expect(JSON.stringify(service!.NetworkConfiguration)).toContain(
      'PrivateSubnet',
    );
  });

  it('keeps the scale broker private', () => {
    const { data } = synthesize('scale');
    const [broker] = resources(data, 'AWS::AmazonMQ::Broker');
    expect(broker!.PubliclyAccessible).toBe(false);
    expect(JSON.stringify(broker!.SubnetIds)).toContain('Isolated');
  });
});

describe('the data tier is reachable only from the services that own it', () => {
  const { data } = synthesize('demo');

  it('allows the four database owners and the bootstrap task into Postgres', () => {
    expect(ingressSources(data, 'PostgresSg')).toEqual([
      'Bootstrap:5432',
      'CreditService:5432',
      'OrderService:5432',
      'SupplierService:5432',
      'UserService:5432',
    ]);
  });

  it('allows only user-service and order-service into Valkey', () => {
    expect(ingressSources(data, 'CacheSg')).toEqual([
      'OrderService:6379',
      'UserService:6379',
    ]);
  });

  it('allows only the three event services into RabbitMQ', () => {
    expect(ingressSources(data, 'RabbitmqSg')).toEqual([
      'CreditService:5672',
      'OrderService:5672',
      'UserService:5672',
    ]);
  });

  it('uses no CIDR rules on any data security group', () => {
    expect(allIngressRules(data).filter((rule) => rule.CidrIp)).toEqual([]);
  });

  it('gives each scale database and proxy just its own service', () => {
    const { data: scale } = synthesize('scale');
    expect(ingressSources(scale, 'UserServicePostgresSg')).toEqual(
      expect.arrayContaining(['Bootstrap:5432']),
    );
    expect(ingressSources(scale, 'UserServicePostgresProxySg')).toEqual([
      'UserService:5432',
    ]);
    expect(ingressSources(scale, 'OrderServicePostgresProxySg')).toEqual([
      'OrderService:5432',
    ]);
  });
});

describe('Postgres', () => {
  it('runs PostgreSQL 17 on one small single-AZ instance in demo', () => {
    const { data } = synthesize('demo');
    const instances = resources(data, 'AWS::RDS::DBInstance');
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      Engine: 'postgres',
      DBInstanceClass: 'db.t4g.small',
      MultiAZ: false,
    });
    expect(instances[0]!.EngineVersion).toMatch(/^17\./);
    data.resourceCountIs('AWS::RDS::DBProxy', 0);
  });

  it('runs one Multi-AZ PostgreSQL 17 instance and proxy per service in scale', () => {
    const { data } = synthesize('scale');
    const instances = resources(data, 'AWS::RDS::DBInstance');
    expect(instances).toHaveLength(4);
    for (const instance of instances) {
      expect(instance.MultiAZ).toBe(true);
      expect(instance.EngineVersion).toMatch(/^17\./);
    }
    data.resourceCountIs('AWS::RDS::DBProxy', 4);
  });
});

describe('Valkey', () => {
  it.each(['demo', 'scale'] as const)(
    'sets noeviction and TLS, with cluster mode off (%s)',
    (profile) => {
      const { data } = synthesize(profile);
      data.hasResourceProperties('AWS::ElastiCache::ParameterGroup', {
        CacheParameterGroupFamily: 'valkey8',
        Properties: { 'maxmemory-policy': 'noeviction' },
      });
      const [cache] = resources(data, 'AWS::ElastiCache::ReplicationGroup');
      expect(cache).toMatchObject({
        Engine: 'valkey',
        EngineVersion: '8.2',
        TransitEncryptionEnabled: true,
        AtRestEncryptionEnabled: true,
      });
      expect(cache!.NumNodeGroups).toBeUndefined();
    },
  );

  it('has one micro node in demo and failover in scale', () => {
    const cacheOf = (profile: 'demo' | 'scale'): unknown =>
      resources(
        synthesize(profile).data,
        'AWS::ElastiCache::ReplicationGroup',
      )[0];
    expect(cacheOf('demo')).toMatchObject({
      CacheNodeType: 'cache.t4g.micro',
      NumCacheClusters: 1,
      AutomaticFailoverEnabled: false,
    });
    expect(cacheOf('scale')).toMatchObject({
      NumCacheClusters: 3,
      AutomaticFailoverEnabled: true,
      MultiAZEnabled: true,
    });
  });
});

describe('database bootstrap', () => {
  const logins = DATABASE_OWNERS.map((owner) => DATABASES[owner]);

  it('creates one login and one locked-down database per service', () => {
    const script = bootstrapScript(logins);
    for (const login of logins) {
      expect(script).toContain(`CREATE ROLE ${login}`);
      expect(script).toContain(`CREATE DATABASE ${login} OWNER ${login}`);
      expect(script).toContain(`REVOKE ALL ON DATABASE ${login} FROM PUBLIC`);
      expect(script).toContain(`\\getenv password ${passwordVariable(login)}`);
    }
  });

  it('gets every password and the master login from ECS secrets', () => {
    const { data } = synthesize('demo');
    const container = mainContainer(data, 'foc-db-bootstrap');
    expect(secretNames(container)).toEqual(
      [
        'PGPASSWORD',
        'PGUSER',
        ...logins.map((login) => passwordVariable(login)),
      ].sort(),
    );
    expect(environmentOf(container)).toMatchObject({
      PGSSLMODE: 'require',
      PGDATABASE: 'postgres',
    });
  });

  it('has a bootstrap task for each database in scale', () => {
    const { data } = synthesize('scale');
    for (const owner of DATABASE_OWNERS) {
      const container = mainContainer(data, `foc-db-bootstrap-${owner}`);
      expect(secretNames(container)).toContain(
        passwordVariable(DATABASES[owner]),
      );
    }
    expect(() => containersOf(data, 'foc-db-bootstrap')).toThrow();
  });
});
