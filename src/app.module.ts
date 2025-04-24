import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { BullModule } from '@nestjs/bull';
import { WorkerProcessor } from './dequeue/dequeue.processor';
import { systemProcessor } from './dequeue/dequeue.system.processor';
import { DockerfileService } from './Services/docker.service';
import { ConfigModule } from '@nestjs/config';
import { GitService } from './Services/git.service';
import { NginxConfigGenerator } from './Services/nginx.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST, // donde está Redis
        port: +process.env.REDIS_PORT,
      },
    }),
    BullModule.registerQueue(
      { name: 'deploy' }, // Cola para deploy
      { name: 'system' },
    ),
  ],
  providers: [AppService, WorkerProcessor, systemProcessor, DockerfileService, GitService, NginxConfigGenerator],
})
export class AppModule {}
