import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { connect } from 'amqplib';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './api/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('Friend on Campus Credit Service')
    .setDescription(
      'Authoritative credit balances, reservations, and settlements',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: 'Internal service token for credit mutations',
      },
      'internal-service-token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'User Service access token for balance reads',
      },
      'access-token',
    )
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApi));

  const config = app.get(ConfigService);
  if (config.getOrThrow<boolean>('messaging.enabled')) {
    const rabbitmqUrl = config.getOrThrow<string>('messaging.rabbitmqUrl');
    const deadLetterExchange = config.getOrThrow<string>(
      'messaging.deadLetterExchange',
    );
    const deadLetterQueue = config.getOrThrow<string>(
      'messaging.deadLetterQueue',
    );
    const deadLetterRoutingKey = config.getOrThrow<string>(
      'messaging.deadLetterRoutingKey',
    );
    const topologyConnection = await connect(rabbitmqUrl);
    const topologyChannel = await topologyConnection.createChannel();
    await topologyChannel.assertExchange(deadLetterExchange, 'direct', {
      durable: true,
    });
    await topologyChannel.assertQueue(deadLetterQueue, { durable: true });
    await topologyChannel.bindQueue(
      deadLetterQueue,
      deadLetterExchange,
      deadLetterRoutingKey,
    );
    await topologyChannel.close();
    await topologyConnection.close();

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: config.getOrThrow<string>('messaging.queue'),
        exchange: config.getOrThrow<string>('messaging.exchange'),
        exchangeType: 'topic',
        wildcards: true,
        noAck: false,
        prefetchCount: config.getOrThrow<number>('messaging.prefetchCount'),
        queueOptions: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': deadLetterExchange,
            'x-dead-letter-routing-key': deadLetterRoutingKey,
          },
        },
      },
    });
    await app.startAllMicroservices();
  } else {
    app
      .get(Logger)
      .warn(
        'CREDIT_EVENTS_ENABLED=false: errand.completed.v1 and user.verified.v1 are not consumed, so completed errands are not settled',
      );
  }
  await app.listen(config.getOrThrow<number>('app.port'), '0.0.0.0');
}

void bootstrap();
