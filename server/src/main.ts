import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { useContainer } from 'class-validator';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp, isSwaggerEnabled } from './app.config';

const logger = new Logger('Bootstrap');

function logBootstrapError(error: unknown): void {
  if (error instanceof Error) {
    logger.error(`Error during bootstrap: ${error.message}`, error.stack);
    return;
  }

  logger.error(`Error during bootstrap: ${String(error)}`);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  configureApp(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Backend API routes: http://localhost:${port}/api`);
  if (isSwaggerEnabled()) {
    logger.log(
      `Swagger documentation available on http://localhost:${port}/api/docs`,
    );
  }
}

bootstrap().catch((err: unknown) => {
  logBootstrapError(err);
  process.exit(1);
});
