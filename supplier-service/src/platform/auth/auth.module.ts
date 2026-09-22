import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { EnvironmentVariables } from '../config/environment.schema.js';
import { JwtAuthenticationGuard } from './jwt-authentication.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  exports: [JwtAuthenticationGuard, JwtModule, RolesGuard],
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_ACCESS_TOKEN_SECRET', { infer: true }),
        verifyOptions: {
          algorithms: ['HS256'],
          audience: config.get('JWT_AUDIENCE', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
        },
      }),
    }),
  ],
  providers: [JwtAuthenticationGuard, RolesGuard],
})
export class AuthModule {}
