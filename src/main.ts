import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DockerfileService } from './services/docker.service';

async function bootstrap() {
  const dockerfileService = new DockerfileService();
  await dockerfileService.setupDatabases();
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
