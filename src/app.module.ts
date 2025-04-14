import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BullModule } from '@nestjs/bull';
import { WorkerProcessor } from './dequeue/dequeue.processor';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost', // donde está Redis
        port: 6380,
      },
    }),
    BullModule.registerQueue({
      name: 'deploy',
    }),
    WorkerProcessor,
  ],
  providers: [AppService],
})
export class AppModule {}
