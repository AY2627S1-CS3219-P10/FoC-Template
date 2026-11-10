import { resources, synthesize } from './support';

const ISSUER = 'token.actions.githubusercontent.com';

interface TrustStatement {
  readonly Action: string;
  readonly Effect: string;
  readonly Principal: { readonly Federated?: unknown };
  readonly Condition: Record<string, Record<string, unknown>>;
}

describe('GitHub deploy role', () => {
  const { ci } = synthesize('demo');
  const roles = resources(ci, 'AWS::IAM::Role');
  const [role] = roles;
  const document = role?.AssumeRolePolicyDocument as {
    Statement: TrustStatement[];
  };
  const statements = document.Statement;
  const [trust] = statements;

  it('is the only role, with one trust statement', () => {
    expect(roles).toHaveLength(1);
    expect(role?.RoleName).toBe('foc-github-deploy');
    expect(statements).toHaveLength(1);
  });

  it('trusts only the GitHub provider, through web identity', () => {
    expect(trust?.Effect).toBe('Allow');
    expect(trust?.Action).toBe('sts:AssumeRoleWithWebIdentity');
    expect(JSON.stringify(trust?.Principal.Federated)).toContain('GitHub');
  });

  it('matches conditions exactly, never with StringLike', () => {
    expect(Object.keys(trust?.Condition ?? {})).toEqual(['StringEquals']);
  });

  it('requires the audience sts.amazonaws.com', () => {
    expect(trust?.Condition.StringEquals?.[`${ISSUER}:aud`]).toBe(
      'sts.amazonaws.com',
    );
  });

  it('allows only the main branch of this repository, by immutable subject', () => {
    expect(trust?.Condition.StringEquals?.[`${ISSUER}:sub`]).toBe(
      'repo:AY2627S1-CS3219-P10@324971253/FoC-Template@1357325846:ref:refs/heads/main',
    );
  });

  it('has no managed policies, so never AdministratorAccess', () => {
    expect(role?.ManagedPolicyArns).toBeUndefined();
  });
});

interface PolicyStatement {
  readonly Sid?: string;
  readonly Effect: string;
  readonly Action: string | string[];
  readonly Resource: string | string[];
  readonly Condition?: Record<string, Record<string, string>>;
}

const asList = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

describe('GitHub deploy role permissions', () => {
  const { ci } = synthesize('demo');
  const policies = resources(ci, 'AWS::IAM::Policy');
  const statements = policies.flatMap(
    (policy) =>
      (policy.PolicyDocument as { Statement: PolicyStatement[] }).Statement,
  );
  const withAction = (action: string): PolicyStatement[] =>
    statements.filter((s) => asList(s.Action).includes(action));
  const resourcesFor = (action: string): string[] =>
    withAction(action).flatMap((s) => asList(s.Resource));

  it('is one inline policy that only allows', () => {
    expect(policies).toHaveLength(1);
    expect(statements.every((s) => s.Effect === 'Allow')).toBe(true);
  });

  it('never assumes other roles, such as CDK bootstrap roles', () => {
    const actions = statements.flatMap((s) => asList(s.Action));
    expect(actions.filter((a) => a.startsWith('sts:'))).toEqual([]);
  });

  it('has no wildcard actions', () => {
    const actions = statements.flatMap((s) => asList(s.Action));
    expect(actions.filter((a) => a.includes('*'))).toEqual([]);
  });

  it('uses Resource * only for actions without resource-level permissions', () => {
    const unscoped = statements
      .filter((s) => asList(s.Resource).includes('*'))
      .flatMap((s) => asList(s.Action))
      .sort();
    expect(unscoped).toEqual([
      'ecr:GetAuthorizationToken',
      'ecs:DescribeTaskDefinition',
    ]);
  });

  it('changes only the FocJobs and FocApp stacks', () => {
    for (const action of [
      'cloudformation:CreateChangeSet',
      'cloudformation:ExecuteChangeSet',
      'cloudformation:DeleteChangeSet',
    ]) {
      expect(resourcesFor(action).sort()).toEqual([
        'arn:aws:cloudformation:ap-southeast-1:111111111111:stack/FocApp/*',
        'arn:aws:cloudformation:ap-southeast-1:111111111111:stack/FocJobs/*',
      ]);
    }
    const writes = statements.filter((s) =>
      asList(s.Action).some((a) =>
        /^cloudformation:(Create|Update|Delete|Execute)/.test(a),
      ),
    );
    const written = writes.flatMap((s) => asList(s.Resource)).join(' ');
    expect(written).not.toMatch(/FocNetwork|FocRegistry|FocData|FocCi/);
  });

  it('passes only the cfn-exec role to CloudFormation and migration roles to ECS', () => {
    const passes = withAction('iam:PassRole');
    expect(
      passes.map((s) => [
        asList(s.Resource),
        s.Condition?.StringEquals?.['iam:PassedToService'],
      ]),
    ).toEqual(
      expect.arrayContaining([
        [
          [
            'arn:aws:iam::111111111111:role/cdk-hnb659fds-cfn-exec-role-111111111111-ap-southeast-1',
          ],
          'cloudformation.amazonaws.com',
        ],
        [
          ['arn:aws:iam::111111111111:role/FocJobs-Migrate*'],
          'ecs-tasks.amazonaws.com',
        ],
      ]),
    );
    expect(passes).toHaveLength(2);
  });

  it('runs only the migration tasks, only in the foc cluster', () => {
    const [runTask] = withAction('ecs:RunTask');
    expect(asList(runTask?.Resource ?? []).sort()).toEqual([
      'arn:aws:ecs:ap-southeast-1:111111111111:task-definition/foc-migrate-supplier:*',
      'arn:aws:ecs:ap-southeast-1:111111111111:task-definition/foc-migrate-user:*',
    ]);
    expect(runTask?.Condition?.ArnEquals?.['ecs:cluster']).toBe(
      'arn:aws:ecs:ap-southeast-1:111111111111:cluster/foc',
    );
  });

  it('pushes images only to the foc repositories', () => {
    expect(resourcesFor('ecr:PutImage')).toEqual([
      'arn:aws:ecr:ap-southeast-1:111111111111:repository/foc/*',
    ]);
  });

  it('writes only to the CDK assets bucket', () => {
    expect(resourcesFor('s3:PutObject')).toContain(
      'arn:aws:s3:::cdk-hnb659fds-assets-111111111111-ap-southeast-1/*',
    );
    const s3 = statements.filter((s) =>
      asList(s.Action).some((a) => a.startsWith('s3:')),
    );
    for (const resource of s3.flatMap((s) => asList(s.Resource))) {
      expect(resource).toMatch(
        /^arn:aws:s3:::cdk-hnb659fds-assets-111111111111-ap-southeast-1(\/\*)?$/,
      );
    }
  });
});

describe('GitHub OIDC provider', () => {
  const { ci } = synthesize('demo');

  it('uses the native resource, so no custom resource Lambda', () => {
    const [provider] = resources(ci, 'AWS::IAM::OIDCProvider');
    expect(provider?.Url).toBe(`https://${ISSUER}`);
    expect(provider?.ClientIdList).toEqual(['sts.amazonaws.com']);
    expect(resources(ci, 'AWS::Lambda::Function')).toEqual([]);
  });
});
