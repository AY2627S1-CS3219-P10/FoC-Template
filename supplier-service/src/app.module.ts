import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SuppliersModule } from './suppliers/suppliers.module.js';
import { validateEnvironment } from './platform/config/environment.schema.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthController } from './platform/health/health.controller.js';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SuppliersModule,
    DatabaseModule,
  ],
})
export class AppModule {}
