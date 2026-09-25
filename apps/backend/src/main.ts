import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp, corsOrigins } from './bootstrap';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService);

  const ioAdapter = new RedisIoAdapter(app, config.getOrThrow('REDIS_URL'), corsOrigins(config));
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  const swagger = new DocumentBuilder()
    .setTitle('DevTrack API')
    .setDescription(
      'REST API for DevTrack. Authenticate via POST /api/auth/login, then click "Authorize" and paste the accessToken. ' +
        'Successful responses are wrapped as { data } or { data, meta } for paginated lists.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(config.get('PORT') ?? 4000);
  await app.listen(port);
  Logger.log(`API ready on http://localhost:${port}/api (docs: /api/docs)`, 'Bootstrap');
}

void bootstrap();
