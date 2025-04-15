import { Process, Processor } from '@nestjs/bull';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';
import { GitService } from 'src/Services/git.service';

@Processor('system')
export class systemProcessor {
  constructor(private dockerfileService: DockerfileService,
    private gitService: GitService,
  ) { }
  @Process('deploy-system')
  async handleSystemDeployJob(job: Job) {
    console.log('⚙️ Procesando trabajo desde la cola system:', job.data);
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
    };
  }

  @Process('create_DB')
  async createDbJob(job: Job) {
    //Create data base
    if (
      !job.data.containerName ||
      !job.data.nombre ||
      !job.data.usuario ||
      !job.data.contrasenia
    )
      throw new BadRequestException(
        `No se ha enviado el containerName, el nombre, usuario o contrasenia de la base de datos`,
      );
    await this.dockerfileService.createMySQLDatabaseAndUser(
      job.data.containerName,
      job.data.nombre,
      job.data.usuario,
      job.data.contrasenia,
    );
    console.log('⚙️ Procesando trabajo desde la cola system:', job.data);
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
    };
  }

  @Process('cloneRepository')
  async createRepositoryJob(job: Job) {
    //Create repository
    if (
      !job.data.url ||
      !job.data.ruta ||
      !job.data.projectId ||
      !job.data.tipo
    )
      throw new BadRequestException(
        `No se ha enviado la url, el path, el id del proyecto o el tipo de repositorio`,
      );
    const rute = await this.gitService.cloneRepositorio(
      job.data.url, 
      job.data.ruta, 
      job.data.projectId,
      job.data.tipo
    );

    console.log('⚙️ Procesando trabajo desde la cola system:', job.data);
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
      rute: rute,
    };
  }
}
