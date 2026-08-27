import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Development identity headers are temporary; keep CORS permissive only for this prototype slice.
  // No cookie-based authentication is used, so credentialed CORS is intentionally disabled.
  app.enableCors({ origin: true });
  app.enableShutdownHooks();

  await app.listen(resolvePort(process.env['PORT']), '0.0.0.0');
}

function resolvePort(value: string | undefined): number {
  if (!value) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

void bootstrap();
