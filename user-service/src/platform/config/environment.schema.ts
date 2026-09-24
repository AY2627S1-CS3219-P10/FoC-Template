import Joi from 'joi';

export interface EnvironmentVariables {
  DATABASE_URL: string;
  EMAIL_VERIFICATION_CODE_SECRET: string;
  FRONTEND_ORIGIN: string;
  JWT_ACCESS_TOKEN_SECRET: string;
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  REDIS_URL: string;
  SMTP_FROM: string;
  SMTP_HOST: string;
  SMTP_PASSWORD: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
}

export const environmentSchema = Joi.object<EnvironmentVariables>({
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  EMAIL_VERIFICATION_CODE_SECRET: Joi.string().min(32).required(),
  FRONTEND_ORIGIN: Joi.string()
    .custom((value: string, helpers) => {
      try {
        const url = new URL(value);

        if (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          url.origin === value &&
          url.username === '' &&
          url.password === ''
        ) {
          return value;
        }
      } catch {
        // Joi reports the normalized validation error below.
      }

      return helpers.error('string.uri');
    })
    .required(),
  JWT_ACCESS_TOKEN_SECRET: Joi.string().min(32).required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  SMTP_FROM: Joi.string().email().required(),
  SMTP_HOST: Joi.string().hostname().lowercase().required(),
  SMTP_PASSWORD: Joi.string().required(),
  SMTP_PORT: Joi.number()
    .port()
    .default(587)
    .when('SMTP_HOST', {
      is: 'smtp.gmail.com',
      then: Joi.valid(587),
    }),
  SMTP_SECURE: Joi.boolean()
    .default(false)
    .when('SMTP_HOST', {
      is: 'smtp.gmail.com',
      then: Joi.valid(false),
    }),
  SMTP_USER: Joi.string().required(),
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
