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
      console.log(1);
      //Delete containers
      if (project.tipo_proyecto == 'M') {
        await this.dockerfileService.deleteContainer(
          `Container-${job.data.project.id}`,
        );
      } else {
        await this.dockerfileService.deleteContainer(
          `backend_${job.data.project.id}`,
        );
        await this.dockerfileService.deleteContainer(
          `frontend_${job.data.project.id}`,
        );
      }
      console.log(2);

      //Delete project files
      await this.systemService.deleteFolder(
        `${process.env.FOLDER_ROUTE}/${project.id}`,
      );
      console.log(3);
      //Si tiene eliminar la base de datos
      if (project.base_de_datos)
        await this.dockerfileService.deleteDataBase(
          db.tipo,
          db.nombre,
          db.user,
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
