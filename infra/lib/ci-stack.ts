import { Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_ISSUER = 'token.actions.githubusercontent.com';
const GITHUB_AUDIENCE = 'sts.amazonaws.com';
const GITHUB_REPOSITORY = 'AY2627S1-CS3219-P10/FoC-Template';

/**
 * The only GitHub ref that may assume the deploy role. The repository is
 * public, so this is an exact match: fork pull requests and other branches
 * present a different subject and get no credentials.
 */
export const DEPLOY_SUBJECT = `repo:${GITHUB_REPOSITORY}:ref:refs/heads/main`;

/**
 * GitHub's OIDC provider and the role that GitHub Actions deploys with, so no
 * AWS keys are stored in GitHub.
 */
export class CiStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const provider = new iam.OidcProviderNative(this, 'GitHub', {
      url: `https://${GITHUB_ISSUER}`,
      clientIds: [GITHUB_AUDIENCE],
    });

    const role = new iam.Role(this, 'Deploy', {
      roleName: 'foc-github-deploy',
      description: 'Assumed by GitHub Actions to deploy Friend on Campus',
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_ISSUER}:aud`]: GITHUB_AUDIENCE,
          [`${GITHUB_ISSUER}:sub`]: DEPLOY_SUBJECT,
        },
      }),
    });

    // TEMPORARY: without this, the OIDC test could not tell the organization's
    // policy denying AssumeRole apart from this role simply lacking permission.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          this.formatArn({
            service: 'iam',
            region: '',
            resource: 'role',
            resourceName: `cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
          }),
        ],
      }),
    );
  }
}
