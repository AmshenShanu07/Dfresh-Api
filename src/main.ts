import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors();

  const configService = app.get(ConfigService);

  const options = new DocumentBuilder()
    .setTitle('DFresh Api')
    .setDescription('DFresh Api Documentation')
    .setVersion('1.0')
    .addBearerAuth();

  if (configService.get('ENV') === 'PROD') {
    options.addServer('/api');
  }

  const document = SwaggerModule.createDocument(app, options.build());
  SwaggerModule.setup(`doc`, app, document);

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.PORT ?? 5200);
}
bootstrap();
