import { Process, Processor } from '@nestjs/bull';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';

@Processor('data_base')
export class systemProcessor {
  constructor(private dockerfileService: DockerfileService) {}

  @Process({ name: 'create_DB', concurrency: 1 })
  async createDbJob(job: Job) {
    //Create data base
    if (
      !job.data.containerName ||
      !job.data.nombre ||
      !job.data.usuario ||
      !job.data.contrasenia
    )
      throw new BadRequestException(
        `No se ha enviado el containerName, el nombre, usuario o contrasenia de la base de datos  ErrorCode-006`,
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
}
