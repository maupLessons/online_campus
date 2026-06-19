import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import { json, urlencoded, Request, Response, NextFunction } from 'express';

type AppConfigOptions = {
  swaggerEnabled?: boolean;
};

export function configureApp(
  app: NestExpressApplication,
  options: AppConfigOptions = {},
): void {
  const swaggerEnabled = options.swaggerEnabled ?? isSwaggerEnabled();

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

  app.use(
    compression({
      filter: (req, res) => {
        const contentType = String(res.getHeader('Content-Type') ?? '');
        return contentType.includes('text/event-stream')
          ? false
          : compression.filter(req, res);
      },
    }),
  );
  app.use(apiHealthHandler(swaggerEnabled));
  app.enableCors(buildCorsOptions());

  // Захист: Сувора валідація
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false }, // Не зливати дані в errors
    }),
  );

  if (swaggerEnabled) {
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
}

export function isSwaggerEnabled(): boolean {
  if (process.env.SWAGGER_ENABLED !== undefined) {
    return ['1', 'true', 'yes'].includes(
      process.env.SWAGGER_ENABLED.toLowerCase(),
    );
  }

  return process.env.NODE_ENV !== 'production';
}

function apiHealthHandler(swaggerEnabled: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      req.method === 'GET' &&
      (req.path === '/' || req.path === '/api' || req.path === '/api/')
    ) {
      res.status(200).json({
        message: 'API is running',
        ...(swaggerEnabled ? { swagger: '/api/docs' } : {}),
      });
      return;
    }

    next();
  };
}

function buildCorsOptions() {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // The browser enforces CORS when the allow-origin header is absent.
      // Returning an application error here would turn untrusted origins into
      // noisy HTTP 500 responses and provide an easy server-log flooding path.
      callback(null, false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-CSRF-Token',
    ],
  };
}
