import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SuppliersModule } from './suppliers/suppliers.module.js';
import { validateEnvironment } from './platform/config/environment.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SuppliersModule,
  ],
})
export class AppModule {}
