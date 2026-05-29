import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { useContainer } from 'class-validator';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  app.setGlobalPrefix('api');

  // Захист: Довіра проксі (nginx, docker) для коректного req.ip
  app.set('trust proxy', 1);

  // Захист: Ліміт на розмір тіла запиту (захист від DDoS великими payload)
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Захист: Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  app.use(compression());

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.method === 'GET' &&
      (req.path === '/' || req.path === '/api' || req.path === '/api/')
    ) {
      res.status(200).json({
        message: 'API is running',
        ...(isSwaggerEnabled() ? { swagger: '/api/docs' } : {}),
      });
      return;
    }

    next();
  });

  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-CSRF-Token',
    ],
  });

  // Захист: Сувора валідація
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false }, // Не зливати дані в errors
    }),
  );

  if (isSwaggerEnabled()) {
    const config = new DocumentBuilder()
      .setTitle('Online Campus API')
      .setDescription('The Online Campus API description')
      .setVersion('1.0')
      .addBearerAuth()
      .addSecurityRequirements('bearer')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Backend API routes: http://localhost:${port}/api`);
  if (isSwaggerEnabled()) {
    console.log(
      `Swagger documentation available on http://localhost:${port}/api/docs`,
    );
  }
}

function isSwaggerEnabled(): boolean {
  if (process.env.SWAGGER_ENABLED !== undefined) {
    return ['1', 'true', 'yes'].includes(
      process.env.SWAGGER_ENABLED.toLowerCase(),
    );
  }

  return process.env.NODE_ENV !== 'production';
}

bootstrap().catch((err: unknown) => {
  console.error('Error during bootstrap:', err);
  process.exit(1);
});
