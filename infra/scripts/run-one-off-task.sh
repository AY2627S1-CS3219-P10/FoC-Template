#!/usr/bin/env bash
# Runs a one-off ECS task (a migration or seed) to completion and fails unless
# its container exits 0. Used by deploy.yml; works from a laptop too.
#
#   infra/scripts/run-one-off-task.sh <task-family> <FocNetwork security group output>
#   infra/scripts/run-one-off-task.sh foc-migrate-user UserSecurityGroupId
#
# Prints no account IDs or ARNs, because Actions logs are public.
set -euo pipefail

family="$1"
security_group_output="$2"
cluster=foc

output() {
  aws cloudformation describe-stacks --stack-name FocNetwork \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
subnets=$(output PrivateSubnetIds)
security_group=$(output "$security_group_output")
if [ -z "$subnets" ] || [ -z "$security_group" ] || [ "$security_group" = None ]; then
  echo "Could not read the subnets or $security_group_output from FocNetwork." >&2
  exit 1
fi

echo "Starting $family"
task=$(aws ecs run-task --cluster "$cluster" --task-definition "$family" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$security_group],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
if [ -z "$task" ] || [ "$task" = None ]; then
  echo "$family did not start." >&2
  exit 1
fi

# The waiter gives up after 10 minutes; migrations take well under that.
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"

read -r code reason < <(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" \
  --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)
echo "$family stopped with exit code $code ($reason)"
if [ "$code" != 0 ]; then
  echo "$family failed. Its logs are in the FocJobs log group, stream prefix $family." >&2
  exit 1
fi
