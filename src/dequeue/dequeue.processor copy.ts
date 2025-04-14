import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('system')
export class systemProcessor {
  @Process('deploy-system')
  async handleSystemDeployJob(job: Job) {
    console.log('⚙️ Procesando trabajo desde la cola system:', job.data);
    return { status: 'ok', message: 'Trabajo de deploy del sistema recibido y procesado' };
  }
}