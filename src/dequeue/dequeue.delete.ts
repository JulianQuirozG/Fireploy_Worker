import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';
import { SystemService } from 'src/Services/system.service';

@Processor('delete')
export class DeleteProcessor {
  constructor(
    private dockerfileService: DockerfileService,
    private systemService: SystemService,
  ) {}

  @Process({ name: 'delete', concurrency: 1 })
  async deleteProjectJob(job: Job) {
    try {
      const project = job.data;
      const db = project.base_de_datos;
      //Delete containers
      if (project.tipo_proyecto == 'M') {
        await this.dockerfileService.deleteContainer(`Container-${project.id}`);
      } else {
        await this.dockerfileService.deleteContainer(`backend_${project.id}`);
        await this.dockerfileService.deleteContainer(`frontend_${project.id}`);
      }

      //Delete project files
      await this.systemService.deleteFolder(
        `${process.env.FOLDER_ROUTE}/${project.id}`,
      );

      //Delete database;
      if (project.base_de_datos)
        await this.dockerfileService.deleteDataBase(
          db.tipo,
          db.nombre,
          db.usuario,
        );
    } catch (error) {
      throw new Error(error);
    }
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
    };
  }
}
