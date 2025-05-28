/* eslint-disable @typescript-eslint/no-unused-vars */
import { Process, Processor } from '@nestjs/bull';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Job } from 'bull';
import { DockerfileService } from 'src/Services/docker.service';
import { GitService } from 'src/Services/git.service';
import { NginxConfigGenerator } from 'src/Services/nginx.service';
import { SystemService } from 'src/Services/system.service';

@Processor('deploy')
export class WorkerProcessor {
  constructor(
    private dockerfileService: DockerfileService,
    private gitService: GitService,
    private nginxService: NginxConfigGenerator,
    private systemService: SystemService,
  ) {}
  @Process({ name: 'deploy', concurrency: 1 })
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
    if (proyect.base_de_datos && proyect.base_de_datos.tipo === 'M') {
      db_Port = process.env.MONGO_PORT;
      db_Host = process.env.MONGO_CONTAINER_NAME;
    } else if (proyect.base_de_datos && proyect.base_de_datos.tipo === 'P') {
      db_Port = process.env.POSTGRES_PORT;
      db_Host = process.env.POSTGRES_CONTAINER_NAME;
    } else if (proyect.base_de_datos && proyect.base_de_datos.tipo === 'M') {
      db_Port = process.env.MARIADB_PORT;
      db_Host = process.env.MARIADB_CONTAINER_NAME;
    }

    let envLinesBackend, envLinesFrontend, logFront, logBackend;

    try {
      //Prepare repositorios
      for (const [index, repositorio] of repositorios.entries()) {
        if (
          !repositorio.tecnologia ||
          !repositorio.url ||
          !repositorio.framework
        )
          throw new NotFoundException(
            `El repositorio con id ${repositorio.id} no posee 'tecnologia', 'url' o 'framework' ErrorCode-000`,
          );

        //Clone repositorio
        const rute = await this.gitService.cloneRepositorio(
          repositorio.url,
          process.env.FOLDER_ROUTE as string,
          proyect.id as unknown as string,
          repositorio.tipo,
        );
        //Create Ficheros
        if (repositorio.ficheros && repositorio.ficheros.length > 0) {
          await this.systemService.syncFilesAdd(
            process.env.FOLDER_ROUTE,
            repositorio.ficheros,
            repositorio.tipo,
            proyect.id as number,
          );
        }

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
          if (proyect.base_de_datos.tipo == process.env.SQL_DB) {
            env_repositorio = {
              DB_DATABASE: proyect.base_de_datos.nombre,
              DB_PORT: db_Port,
              DB_HOST: db_Host,
              DB_USER: proyect.base_de_datos.usuario,
              DB_PASSWORD: proyect.base_de_datos.contrasenia,
              DB_CONNECTION_URI: proyect.base_de_datos.url,
            };
          } else if(proyect.base_de_datos) {
            env_repositorio = {
              DB_CONNECTION_URI: proyect.base_de_datos.url,
              DB_DATABASE: proyect.base_de_datos.nombre,
              DB_PORT: db_Port,
              DB_HOST: db_Host,
              DB_USER: proyect.base_de_datos.usuario,
              DB_PASSWORD: proyect.base_de_datos.contrasenia,
            };
          }
        }

        env_repositorio = {
          PORT: puertos,
          FIREPLOY_HOST: `${repositorio.tipo == 'B' ? 'api' : 'app'}${proyect.id}.${process.env.APP_HOST}`,
          ...env_repositorio,
        };
        if (repositorio.tipo === 'B') {
          env_repositorio = {
            BASE_PATH: `/api${proyect.id}`,
            URL_FRONTEND: `https://app${proyect.id}.${process.env.APP_HOST}`,
            URL_BACKEND: `https://api${proyect.id}.${process.env.APP_HOST}`,
            ...env_repositorio,
          };
        } else {
          env_repositorio = {
            BASE_PATH: `/app${proyect.id}`,
            URL_BACKEND: `https://api${proyect.id}.${process.env.APP_HOST}`,
            URL_FRONTEND: `https://app${proyect.id}.${process.env.APP_HOST}`,
            ...env_repositorio,
          };
        }

        //formating env by framework
        env_repositorio = this.dockerfileService.paserEnviromentFramework(
          repositorio.framework,
          env_repositorio,
        ).json;

        //Formating custom env
        let custom_repositorio;
        if (repositorio.variables_de_entorno) {
          const custom_variables_de_entorno = repositorios[
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
          custom_repositorio = {
            ...env_repositorio,
            ...custom_variables_de_entorno,
          };
        }

        if (repositorio.tipo === 'B') {
          envLinesBackend = {
            ...env_repositorio,
          };
        } else {
          envLinesFrontend = {
            ...env_repositorio,
          };
        }

        if (
          repositorio.framework === `Django` &&
          (!custom_repositorio || !custom_repositorio.DJANGO_PROJECT)
        ) {
          throw new Error(
            'Al crear un repositorio en Django debes añadir la variable DJANGO_PROJECT en las variables de entorno con el nombre del proyecto para su ejecución.',
          );
        } else if (repositorio.framework === `Django`) {
          env_repositorio = {
            ...env_repositorio,
            DJANGO_PROJECT: custom_repositorio.DJANGO_PROJECT,
          };
        }

        //Create Dockerfile
        const dockerfilePath = await this.dockerfileService.generateDockerfile(
          proyect.id,
          rute,
          repositorio.framework,
          puertos,
          [env_repositorio],
          repositorio.variables_de_entorno,
        );

        // Add dockerfiles
        dockerfiles.push({
          proyect_id: proyect.id,
          rute: `https://${repositorio.tipo == 'B' ? 'api' : 'app'}${proyect.id}.${process.env.APP_HOST}`,
          type: repositorio.tipo,
          port: puertos,
          language: repositorio.framework,
          repositorioId: repositorio.id,
          log: '',
        });

        //Generate image if is type All
        if (proyect.tipo_proyecto == 'M') {
          logFront = await this.dockerfileService.buildAndRunContainer(
            proyect.id as unknown as string,
            rute,
            repositorio.framework,
            puertos,
            [env_repositorio],
          );
        }
      }

      let responseNginx: any;
      if (repositorios.length > 1) {
        const doker_compose_file = (logBackend =
          await this.dockerfileService.createDockerCompose(
            proyect.id,
            proyect.puerto,
            envLinesBackend,
            envLinesFrontend,
          ));
        console.log(
          '⚙️ Procesando trabajo desde la cola system:',
          doker_compose_file,
        );
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
        //responseNginx = await configureNginx.generate();
        responseNginx = await configureNginx.generateSubDomain();
        if (dockerfiles[0].type == 'F') {
          dockerfiles[0].log =
            (await this.dockerfileService.getDockerLog(
              `frontend_${dockerfiles[0].proyect_id}`,
            )) + logBackend;
          dockerfiles[1].log =
            (await this.dockerfileService.getDockerLog(
              `backend_${dockerfiles[1].proyect_id}`,
            )) + logBackend;
        } else {
          dockerfiles[1].log =
            (await this.dockerfileService.getDockerLog(
              `frontend_${dockerfiles[1].proyect_id}`,
            )) + logBackend;
          dockerfiles[0].log =
            (await this.dockerfileService.getDockerLog(
              `backend_${dockerfiles[0].proyect_id}`,
            )) + logBackend;
        }
      } else {
        const configureNginx = new NginxConfigGenerator(`${proyect.id}`, [
          {
            path: `app${proyect.id as string}`,
            target: `${process.env.IP}:${proyect.puerto}`,
          },
        ]);
        //responseNginx = await configureNginx.generate();
        responseNginx = await configureNginx.generateSubDomain();
        dockerfiles[0].log =
          (await this.dockerfileService.getDockerLog(
            `Container-${dockerfiles[0].proyect_id}`,
          )) + logFront;
      }
      return {
        status: 'ok',
        message: 'Trabajo de deploy del sistema recibido y procesado',
        dockerfiles: dockerfiles,
        nginx: responseNginx,
      };
    } catch (e) {
      throw new Error(e);
    }
  }
}
