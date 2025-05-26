import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { BullModule } from '@nestjs/bull';
import { WorkerProcessor } from './dequeue/dequeue.processor';
import { systemProcessor } from './dequeue/dequeue.system.processor';
import { DockerfileService } from './Services/docker.service';
import { ConfigModule } from '@nestjs/config';
import { GitService } from './Services/git.service';
import { NginxConfigGenerator } from './Services/nginx.service';
import { ProjectProcessor } from './dequeue/dequeue.project';
import { SystemService } from './Services/system.service';
import { DeleteProcessor } from './dequeue/dequeue.delete';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: +process.env.REDIS_PORT,
      },
    }),
    BullModule.registerQueue(
      { name: 'deploy' },
      { name: 'data_base' },
      { name: 'project_manager' },
      { name: 'delete' },
    ),
  ],
  providers: [
    AppService,
    WorkerProcessor,
    systemProcessor,
    ProjectProcessor,
    DockerfileService,
    GitService,
    NginxConfigGenerator,
    SystemService,
    DeleteProcessor,
  ],
})
export class AppModule {}
