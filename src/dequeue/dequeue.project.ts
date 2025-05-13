import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';

@Processor('project_manager')
export class ProjectProcessor {
  constructor(private dockerfileService: DockerfileService) {}

  @Process({ name: 'changeStatus', concurrency: 1 })
  async changeProjectStatusJob(job: Job) {
    console.log(job.data);
    try {
      if (job.data.project.tipo_proyecto == 'M') {
        if (job.data.action == 'Stop') {
          this.dockerfileService.stopDockerRun(
            `Container-${job.data.project.id}`,
          );
        } else {
          this.dockerfileService.startDockerRun(
            `Container-${job.data.project.id}`,
          );
        }
      } else {
        if (job.data.action == 'Stop') {
          this.dockerfileService.stopDockerCompose(
            process.env.FOLDER_ROUTE +
              `/${job.data.project.id}/docker-compose.yml`,
          );
        } else {
          this.dockerfileService.startDockerCompose(
            process.env.FOLDER_ROUTE +
              `/${job.data.project.id}/docker-compose.yml`,
          );
        }
      }
    } catch (error) {
      throw new Error(error);
    }
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
    };
  }
}
