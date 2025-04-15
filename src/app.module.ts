import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { BullModule } from '@nestjs/bull';
import { WorkerProcessor } from './dequeue/dequeue.processor';
import { systemProcessor } from './dequeue/dequeue.system.processor';
import { DockerfileService } from './Services/docker.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      redis: {
        host: 'localhost', // donde está Redis
        port: 6380,
      },
    }),
    BullModule.registerQueue(
      { name: 'deploy' }, // Cola para deploy
      { name: 'system' },
    ),
  ],
  providers: [AppService, WorkerProcessor, systemProcessor, DockerfileService],
})
export class AppModule {}
