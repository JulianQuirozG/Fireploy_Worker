import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('deploy')
export class WorkerProcessor {
  @Process('desplegar')
  async handleDeployJob(job: Job) {
    console.log('🛠️ Procesando trabajo:', job.data);
    return { status: 'ok', message: 'Trabajo recibido y procesado' };
  }
}