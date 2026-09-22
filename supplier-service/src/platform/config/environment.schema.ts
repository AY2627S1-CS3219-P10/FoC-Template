import Joi from 'joi';

export interface EnvironmentVariables {
  DATABASE_URL: string;
  JWT_ACCESS_TOKEN_SECRET: string;
  JWT_AUDIENCE: string;
  JWT_ISSUER: string;
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
}

export const environmentSchema = Joi.object<EnvironmentVariables>({
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  JWT_ACCESS_TOKEN_SECRET: Joi.string().min(32).required(),
  JWT_AUDIENCE: Joi.string().min(1).required(),
  JWT_ISSUER: Joi.string().min(1).required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3002),
});

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables & Record<string, unknown> {
  const result = environmentSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (result.error) {
    throw result.error;
  }

  return result.value as EnvironmentVariables & Record<string, unknown>;
}
