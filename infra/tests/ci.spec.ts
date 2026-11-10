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

  it('allows only the main branch of this repository', () => {
    expect(trust?.Condition.StringEquals?.[`${ISSUER}:sub`]).toBe(
      'repo:AY2627S1-CS3219-P10/FoC-Template:ref:refs/heads/main',
    );
  });

  it('has no managed policies, so never AdministratorAccess', () => {
    expect(role?.ManagedPolicyArns).toBeUndefined();
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
