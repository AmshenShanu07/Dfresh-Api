import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const port: number = Number(process.env.PORT ?? 5200);

  await app.listen(port);
}
bootstrap();
