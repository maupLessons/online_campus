import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';

const logger = new Logger('DemoSeedCommand');

async function run(): Promise<void> {
  process.env.SEED_DEMO_DATA = 'true';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  await app.close();
  logger.log('Demo seed command completed.');
}

void run().catch((error: unknown) => {
  logger.error('Demo seed command failed.', error);
  process.exitCode = 1;
});
