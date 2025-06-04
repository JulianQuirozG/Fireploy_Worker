import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { logTask } from 'simple-git/dist/src/lib/tasks/log';
import { DockerfileService } from 'src/Services/docker.service';

@Processor('project_manager')
export class ProjectProcessor {
  constructor(private dockerfileService: DockerfileService) {}

  @Process({ name: 'changeStatus', concurrency: 1 })
  async changeProjectStatusJob(job: Job) {
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

  @Process({ name: 'getProjectLogs', concurrency: 1 })
  async getProjectLogsJob(job: Job) {
    const project = job.data;
    const repositories = project.repositorios;
    const logs = [];
    try {
      for (const repository of repositories) {
        if (project.tipo_proyecto == 'M') {
          logs.push({
            repository_id: repository.id,
            log: await this.dockerfileService.getDockerLog(
              `Container-${project.id}`,
            ),
          });
        } else {
          const containerName =
            repository.tipo === 'F'
              ? `frontend_${project.id}`
              : `backend_${project.id}`;
          logs.push({
            repository_id: repository.id,
            log: await this.dockerfileService.getDockerLog(containerName),
          });
        }
      }
    } catch (error) {
      throw new Error(error);
    }
    return logs;
  }
}
