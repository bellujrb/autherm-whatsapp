import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WhatsappService } from './whatsapp/whatsapp.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const whatsappService = app.get(WhatsappService);
  await whatsappService.start();

  const port = process.env.PORT || 3001;
  await app.listen(port);
}

bootstrap();

