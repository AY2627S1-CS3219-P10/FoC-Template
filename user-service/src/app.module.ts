import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountsModule } from './modules/accounts/accounts.module.js';
import { validateEnvironment } from './platform/config/environment.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AccountsModule,
  ],
})
export class AppModule {}
