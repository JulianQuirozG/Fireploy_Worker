import { Process, Processor } from '@nestjs/bull';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';
import { GitService } from 'src/Services/git.service';
import { NginxConfigGenerator } from 'src/Services/nginx.service';

@Processor('system')
export class systemProcessor {
  constructor(
    private dockerfileService: DockerfileService,
    private gitService: GitService,
    private nginxService: NginxConfigGenerator,
  ) {}
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
    if (!job.data.proyect || !job.data.repositorios)
      throw new BadRequestException(
        `No se ha enviado la url, el path, el id del proyecto o el tipo de repositorio`,
      );
    console.log('⚙️ Procesando trabajo desde la cola system:', job.data);
    console.log(
      'Credencales de la base de datos',
      job.data.proyect.base_de_datos,
    );
    const proyect = job.data.proyect;
    const repositorios = job.data.repositorios;

    const dockerfiles: any[] = [];

    //Assign data base variables
    let db_Port = process.env.MYSQL_PORT;
    let db_Host = process.env.MYSQL_CONTAINER_NAME;
    if (proyect.base_de_datos && proyect.base_de_datos.tipo != 'S') {
      db_Port = process.env.MONGO_PORT;
      db_Host = process.env.MONGO_CONTAINER_NAME;
    }

    //Prepare repositorios
    for (const [index, repositorio] of repositorios.entries()) {
      if (
        !repositorio.tecnologia ||
        !repositorio.url ||
        !repositorio.version ||
        !repositorio.framework
      )
        throw new NotFoundException(
          `El repositorio con id ${repositorio.id} no posee 'tecnologia', 'url', 'version' o 'framework'`,
        );

      //Clone repositorio
      const rute = await this.gitService.cloneRepositorio(
        repositorio.url,
        process.env.FOLDER_ROUTE as string,
        proyect.id as unknown as string,
        repositorio.tipo,
      );

      // Set env repositorio DB_DATABASE, DB_PORT, DB_HOST, DB_USER, DB_PASSWORD, PORT
      // Set project port
      let puertos: number = proyect.puerto;
      let env_repositorio = {};
      if (repositorio.tipo === 'B') {
        puertos++;
      }

      // Set data base variables
      if (
        (proyect.base_de_datos && proyect.tipo_proyecto == 'M') ||
        repositorio.tipo == 'B'
      ) {
        env_repositorio = {
          DB_DATABASE: proyect.base_de_datos.nombre,
          DB_PORT: db_Port,
          DB_HOST: db_Host,
          DB_USER: proyect.base_de_datos.usuario,
          DB_PASSWORD: proyect.base_de_datos.contrasenia,
        };
      }

      env_repositorio = {
        PORT: puertos,
        HOST: process.env.HOST,
        ...env_repositorio,
      };
      if (repositorio.tipo === 'B') {
        env_repositorio = {
          BASE_PATH: `/api${proyect.id}`,
          ...env_repositorio,
        };
      } else {
        env_repositorio = {
          BASE_PATH: `/app${proyect.id}`,
          ...env_repositorio,
        };
      }

      //formating env by framework
      env_repositorio = this.dockerfileService.paserEnviromentFramework(
        repositorio.framework,
        env_repositorio,
      ).json;

      //Formating custom env
      if (repositorio.variables_de_entorno) {
        const custom_varaibles_de_entorno = repositorios[
          index
        ].variables_de_entorno
          .split('\n')
          .filter(Boolean)
          .reduce(
            (acc, line) => {
              const [key, ...valueParts] = line.split('=');
              if (key && valueParts.length > 0) {
                acc[key.trim()] = valueParts.join('=').trim();
              }
              return acc;
            },
            {} as Record<string, string>,
          );

        //add custom env
        env_repositorio = {
          ...env_repositorio,
          ...custom_varaibles_de_entorno,
        };
      }

      //Create Dockerfile
      const dockerfilePath = this.dockerfileService.generateDockerfile(
        proyect.id,
        rute,
        repositorio.tecnologia,
        puertos,
        [env_repositorio],
      );

      // Add dockerfiles
      dockerfiles.push({
        proyect_id: proyect.id,
        rute: `${process.env.APP_HOST}/${repositorio.tipo == 'B' ? 'api' : 'app'}${proyect.id}`,
        type: repositorio.tipo,
        port: puertos,
        language: repositorio.tecnologia,
      });

      //Generate image if is type All
      if (proyect.tipo_proyecto == 'M') {
        await this.dockerfileService.buildAndRunContainer(
          proyect.id as unknown as string,
          rute,
          repositorio.tecnologia,
          puertos,
          [env_repositorio],
        );
      }
    }

    let responseNginx: any;
    if (repositorios.length > 1) {
      const doker_compose_file =
        await this.dockerfileService.createDockerCompose(
          proyect.id,
          proyect.puerto,
        );

      console.log(
        '⚙️ Procesando trabajo desde la cola system:',
        doker_compose_file,
      );
      console.log('dos');
      const configureNginx = new NginxConfigGenerator(`${proyect.id}`, [
        {
          path: `app${proyect.id as string}`,
          target: `${process.env.IP}:${proyect.puerto++}`,
        },
        {
          path: `api${proyect.id as string}`,
          target: `${process.env.IP}:${proyect.puerto++}`,
        },
      ]);
      responseNginx = await configureNginx.generate();

      //const configureNginx = await this.nginxService.generate();
    } else {
      console.log('uno');
      const configureNginx = new NginxConfigGenerator(`${proyect.id}`, [
        {
          path: `app${proyect.id as string}`,
          target: `${process.env.IP}:${proyect.puerto}`,
        },
      ]);
      responseNginx = await configureNginx.generate();
      //const configureNginx = await this.nginxService.generate();
    }

    console.log(1);
    return {
      status: 'ok',
      message: 'Trabajo de deploy del sistema recibido y procesado',
      dockerfiles: dockerfiles,
      nginx: responseNginx,
    };
  }
}
