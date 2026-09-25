import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  // Behind a load balancer or proxy, trust N hops of X-Forwarded-For so req.ip (and so
  // rate limiting) sees the real client instead of the proxy.
  const hops = Number(config.get('TRUST_PROXY') ?? 0);
  if (hops > 0) app.getHttpAdapter().getInstance().set('trust proxy', hops);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigins(config), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}

export const corsOrigins = (config: ConfigService): string[] =>
  String(config.get('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
