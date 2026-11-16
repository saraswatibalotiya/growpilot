import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const config = app.get(ConfigService);
  // Comma-separated list of allowed browser origins; defaults to the local dev frontend.
  const origins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);

  if (configService.get<string>('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('GrowPilot API')
        .setDescription('Auth and Instagram integration (read-only; publishing is disabled)')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('PORT') || 4000;

  await app.listen(port);
  console.log(`GrowPilot API running on http://localhost:${port}`);
}

bootstrap();