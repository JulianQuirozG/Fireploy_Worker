import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';

@Processor('project_manager')
export class projectProcessor {
  constructor(private dockerfileService: DockerfileService) {}

  @Process({ name: 'changeStatus', concurrency: 1 })
  async changeProjectStatusJob(job: Job) {
    console.log(job.data);
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
    };
  }
}
