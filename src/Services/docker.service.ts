/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import { SystemService } from './system.service';

@Injectable()
export class DockerfileService {
  private readonly logger = new Logger(DockerfileService.name);
  private readonly systemService = new SystemService();
  private readonly prefixMap = {
    vite: 'VITE_',
    NextJs: 'NEXT_PUBLIC_',
    React: 'REACT_APP_',
  };

  /**
   * Generates a Dockerfile template based on the specified technology and port.
   *
   * This method provides predefined Dockerfile templates for different technologies,
   * such as Node.js, Python, and PHP. It dynamically inserts the specified port number
   * into the template before returning it.
   *
   * @param tech The technology stack for which the Dockerfile is generated.
   *             Supported values: 'node', 'python', 'php'.
   * @param port The port number that the container should expose.
   * @returns A string containing the corresponding Dockerfile content.
   */
  private getDockerFile(
    tech: string,
    port: number,
    env: any[],
    id_project: string,
  ): string {
    const envLines = Object.entries(env[0])
      .map(([key, value]) => `ENV ${key}="${value}"`)
      .join('\n');

    const templates = {
      Nextjs: `
      FROM node:20-alpine AS builder

      # Copia las variables de entorno si las necesitas
      ${envLines}

      WORKDIR /app

      # Copiar los archivos necesarios para instalar dependencias
      COPY package*.json ./

      # Instalar dependencias
      RUN npm install

      # Copiar el código fuente
      COPY . .

      # Realiza la compilación para producción
      RUN npm run build

      # Etapa 2: Producción
      FROM node:20-alpine

      # Establecer variables de entorno para producción
      ENV NODE_ENV=production

      WORKDIR /app

      COPY --from=builder /app ./

      # Exponer el puerto para la aplicación
      EXPOSE ${port}

      # Comando para iniciar la aplicación en producción
      CMD ["sh", "-c", "PORT=${port} npm run start"]

      `,
      React: `
      # Etapa 1: Construcción
      FROM node:18 AS builder

      ${envLines}

      WORKDIR /app

      # Copiar todos los archivos, incluyendo el código fuente y configuración
      COPY . .

      # Instalar dependencias, incluyendo las de desarrollo
      RUN npm install

      # Etapa 2: Desarrollo
      FROM node:18-alpine

      ${envLines}

      WORKDIR /app

      # Copiar todos los archivos desde la etapa anterior
      COPY --from=builder /app /app

      # Instalar las dependencias de desarrollo
      RUN npm install 

      # Exponer el puerto para el servidor de desarrollo
      EXPOSE ${port}

      # Comando para iniciar Vite en modo desarrollo
      CMD ["npm", "run", "dev", "--", "--port", "${port}", "--host", "0.0.0.0"]

      `,
      node: `# Usa una versión estable de Node.js como base
      FROM node:18

      # Establece el directorio de trabajo dentro del contenedor
      WORKDIR /app

      # Copia package.json y package-lock.json antes de copiar el código fuente
      COPY package*.json ./

      # Instala dependencias sin generar archivos innecesarios
      RUN npm install 

      # Copia el código fuente al contenedor
      COPY . .

      ${envLines}

      # Detecta si hay un script de build y lo ejecuta (opcional)
      RUN if [ -f package.json ] && cat package.json | grep -q '"build"'; then npm run build; fi
      
      # Expone el puerto definido en la variable de entorno o usa 3000 por defecto
      EXPOSE ${port}

      # Usa un entrypoint flexible para adaptarse a cualquier framework
      CMD ["npm", "run", "dev"] `,

      python: `# Use Python 3.9 as the base image
      FROM python:3.9
      
      # Set the working directory inside the container
      WORKDIR /app
      
      # Copy the requirements file
      COPY requirements.txt .
      
      # Install dependencies
      RUN pip install -r requirements.txt
      
      ${envLines}

      # Copy the entire application source code
      COPY . .
      
      # Expose the application port
      EXPOSE 3000
      
      # Start the application
      CMD ["python", "app.py"]`,

        php: `# Use PHP 8.1 with Apache
      FROM php:8.1-apache
      
      # Copy application files to the Apache server directory
      COPY . /var/www/html/
      
      ${envLines}

      # Expose the application port
      EXPOSE ${port}
      
      # Start Apache in the foreground
      CMD ["apache2-foreground"]`,

      angular: `# Etapa 1: Construcción del entorno de desarrollo
      FROM node:18-alpine AS builder

      # Instala Angular CLI globalmente
      RUN npm install -g @angular/cli

      WORKDIR /app

      COPY package*.json ./
      RUN npm install

      RUN npm install -g serve

      COPY . .

      # Reemplaza las variables de entorno de Angular
      RUN echo "export const environment = { production: false, basePath: '/app${id_project}/' };" > src/environments/environment.ts
      RUN echo "export const environment = { production: true, basePath: '/app${id_project}/' };" > src/environments/environment.development.ts

      # Construye la aplicación en producción
      RUN npm run build -- --configuration production 

      # Etapa 2: servidor de archivos estáticos
      FROM node:18-alpine

      WORKDIR /app/app${id_project}

      # Instalar serve para servir archivos
      RUN npm install -g serve

      # Copiar archivos generados del build
      
      COPY --from=builder /app/dist/*/browser .
      COPY --from=builder /app/dist/*/browser ./app${id_project}

      # Exponer el puerto
      EXPOSE ${port}

      # Comando para correr la aplicación en producción
      CMD ["sh", "-c", "serve -l ${port}"]`,
      express: `# Imagen base oficial de Node.js
FROM node:18-alpine

# Establece variable de entorno del puerto
ENV PORT=${port}
ENV BASE_PATH=/app${id_project}
${envLines}

# Establece el directorio de trabajo
WORKDIR /app

# Copia las dependencias
COPY package*.json ./

# Instala dependencias
RUN npm install

# Copia el resto de los archivos
COPY . .

# Expone el puerto (el valor de la variable ENV)
EXPOSE ${port}

# Comando para arrancar la aplicación
CMD ["npm", "start"]
`,
    };

    // Return the corresponding Dockerfile template for the given technology
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return templates[tech];
  }

  paserEnviromentFramework(
    framework: 'Vite' | 'Nextjs' | 'React',
    env: Record<string, string>,
  ): { json: Record<string, string>; envString: string } {
    const prefix = this.prefixMap[framework];
    if (!prefix) {
      // Si el framework no es compatible, no hace nada
      return { json: env, envString: '' };
    }
    const resultJson: Record<string, string> = {};
    const resultLines: string[] = [];

    for (const [key, value] of Object.entries(env)) {
      const fullKey = `${prefix}${key}`;
      resultJson[fullKey] = value;
      resultLines.push(`${fullKey}=${value}`);
    }

    return {
      json: resultJson,
      envString: resultLines.join('\n'),
    };
  }

  /**
   * Generates a Dockerfile for a given project and programming language.
   *
   * This method creates a Dockerfile inside the specified project directory based
   * on the selected language and port. It retrieves a predefined Dockerfile template
   * using the `getDockerFile` method and writes it to a file.
   *
   * @param projectPath The absolute path to the project directory where the Dockerfile should be created.
   * @param language The programming language or technology stack for which the Dockerfile is generated.
   *                 Supported values: 'node', 'python', 'php'.
   * @param port The port number that the container should expose.
   * @returns The full path of the generated Dockerfile.
   * @throws Error if the specified language is not supported.
   */
  generateDockerfile(
    id_project: string,
    projectPath: string,
    language: string,
    port: number,
    env: any[],
  ): string {
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    // Retrieve the corresponding Dockerfile template
    const dockerFile = this.getDockerFile(language, port, env, id_project);

    if (!dockerFile) {
      throw new Error(`Language ${language} is not supported.`);
    }

    // Create and write the Dockerfile

    fs.writeFileSync(dockerfilePath, dockerFile);

    return dockerfilePath;
  }

  async buildAndRunContainer(
    Name: string,
    projectPath: string,
    language: string,
    port,
    env: any,
  ) {
    try {
      const envLines = Object.entries(env[0])
        .map(([key, value]) => `-e ${key}="${value}"`)
        .join(' ');

      const networkName = process.env.DOCKER_NETWORK || 'DataBases-Network';
      const imageName = `app-${Name}`;
      const containerName = `Container-${Name}`;

      await this.executeCommand(`docker rm -f ${containerName}`);

      const buildCmd = `docker build -t ${imageName} "${projectPath}"`;

      let runCmd = ``;
      if (envLines) {
        runCmd = `docker run -d --network ${networkName} -p ${port}:${port} --name ${containerName} ${envLines} ${imageName} `;
      } else {
        runCmd = `docker run -d --network ${networkName} -p ${port}:${port} --name ${containerName} ${imageName} `;
      }

      console.log(runCmd);
      await this.executeCommand(buildCmd);
      await this.executeCommand(runCmd);

      return `Contenedor ${containerName} corriendo en el puerto ${port}`;
    } catch (error) {
      throw new Error(`Error al ejecutar Docker: ${error.message}`);
    }
  }

  private executeCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error ejecutando: ${command}`, stderr);
          reject(error);
        } else {
          console.log(`Ejecutado: ${command}`, stdout);
          resolve();
        }
      });
    });
  }

  async checkAndCreateContainer(
    containerName: string,
    image: string,
    port: number,
    volume: string,
    network: string,
    envVars?: string[],
  ) {
    try {
      // Verificar si el contenedor está corriendo
      await this.executeCommand(
        `docker ps --format "{{.Names}}" | grep -w ${containerName}`,
      );
      this.logger.log(`✅ El contenedor ${containerName} ya está corriendo.`);
    } catch {
      try {
        // Verificar si el contenedor existe pero está detenido
        await this.executeCommand(
          `docker ps -a --format "{{.Names}}" | grep -w ${containerName}`,
        );
        this.logger.log(
          `⚡ El contenedor ${containerName} existe pero está detenido. Iniciándolo...`,
        );
        await this.executeCommand(`docker start ${containerName}`);
      } catch {
        // El contenedor no existe, crearlo y ejecutarlo
        this.logger.log(`🚀 Creando contenedor ${containerName}...`);
        const envString = envVars
          ? envVars.map((env) => `-e ${env}`).join(' ')
          : '';

        const command = `docker run -d --name ${containerName} --network ${network} -p ${port}:${port} -v ${volume}:/data ${envString} ${image} --port=${port}`;

        console.log(command);
        await this.executeCommand(command);
      }
    }
  }

  async setupDatabases() {
    const networkName = process.env.DOCKER_NETWORK || 'DataBases-Network';
    this.createNetwork(networkName);
    await this.checkAndCreateContainer(
      process.env.MYSQL_CONTAINER_NAME || 'mysql_container',
      'mysql:latest',
      Number(process.env.MYSQL_PORT) || 3307,
      process.env.MYSQL_VOLUME || 'mysql_data',
      networkName,
      [`MYSQL_ROOT_PASSWORD=${process.env.MYSQL_ROOT_PASSWORD || 'root'}`],
    );

    await this.checkAndCreateContainer(
      process.env.MONGO_CONTAINER_NAME || 'mongo_container',
      'mongo:latest',
      Number(process.env.MONGO_PORT) || 27017,
      process.env.MONGO_VOLUME || 'mongo_data',
      networkName,
      [],
    );
  }

  /**
   * Creates a MySQL database and user inside a running MySQL container.
   *
   * This method executes a command inside the specified Docker container
   * to create a new database and a user with full privileges on it.
   *
   * @param containerName - The name of the running MySQL container.
   * @param dbName - The name of the database to be created.
   * @param dbUser - The username for the new database user.
   * @param dbPassword - The password for the new database user.
   * @returns A promise that resolves with the command output if successful, or rejects with an error message.
   */
  async createMySQLDatabaseAndUser(
    containerName: string,
    dbName: string,
    dbUser: string,
    dbPassword: string,
  ) {
    console.log(process.env.MYSQL_ROOT_PASSWORD);
    const command = `
  docker exec ${containerName} mysql -u root -p'${process.env.MYSQL_ROOT_PASSWORD}' -e "
    CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\`;
    CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPassword}';
    GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'%';
    FLUSH PRIVILEGES;"
`;

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error al crear DB y usuario en MySQL:`, stderr);
          throw new BadRequestException(error);
          console.log(error);
          reject(error);
        } else {
          console.log('creda');
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Creates a Docker network if it does not already exist.
   *
   * @param networkName The name of the network to create.
   * @returns The name of the created network or undefined if it already exists.
   */
  createNetwork(networkName: string): string | undefined {
    try {
      // Execute the command to list existing Docker networks
      const stdout = execSync(`docker network ls --format "{{.Name}}"`)
        .toString()
        .trim();

      if (!stdout) {
        console.error('Error: Failed to retrieve the list of Docker networks.');
        return;
      }

      const networks = stdout.split('\n');

      if (!networks.includes(networkName)) {
        console.log(`Creating Docker network: ${networkName}`);
        execSync(`docker network create ${networkName}`);
        return networkName;
      }
    } catch (error) {
      console.error('Error executing Docker command:', error);
    }
  }

  async createDockerCompose(id: number, port: number) {
    const composePath = path.join(
      process.env.FOLDER_ROUTE + `/${id}`,
      'docker-compose.yml',
    );
    await this.executeCommand(`docker rm -f frontend_${id}`);
    await this.executeCommand(`docker rm -f backend_${id}`);

    const composeContent = `
services:
  frontend:
    build:
      context: ./Frontend
      dockerfile: Dockerfile
    container_name: frontend_${id}
    ports:
      - "${port}:${port}"
    depends_on:
      - backend
    environment:
      - NEXT_PUBLIC_URL_BACKEND=http://${process.env.IP}:${port + 1}
    networks:
      - default
  backend:
    build:
      context: ./Backend
      dockerfile: Dockerfile
    container_name: backend_${id}
    ports:
      - "${port + 1}:${port + 1}"
    networks:
      - default
      - ${process.env.DOCKER_NETWORK}
    
networks:
  ${process.env.DOCKER_NETWORK}:
    external: true
  default:
    driver: bridge
`.trim();

    try {
      fs.writeFileSync(composePath, composeContent);
    } catch (error) {
      console.log('Error creando el docker compose' + error);
    }

    try {
      await this.executeCommand(
        `docker compose -f ${composePath} build --no-cache`,
      );
      await this.executeCommand(`docker compose -f ${composePath} up -d`);
    } catch (error) {
      console.log('Error ejecutando el docker compose: ' + error);
    }
    return composePath;
  }
}
