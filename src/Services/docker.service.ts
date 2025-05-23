/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, execSync } from 'child_process';

@Injectable()
export class DockerfileService {
  private readonly logger = new Logger(DockerfileService.name);
  private readonly prefixMap = {
    Vite: 'VITE_',
    Nextjs: 'NEXT_PUBLIC_',
    React: 'VITE_',
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
    const envLinesAngular = Object.entries(env[0])
      .map(([key, value]) => `${key}:'${value}'`)
      .join(', ');

    const templates = {
      Nextjs: `
      FROM node:22-alpine AS builder

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
      FROM node:22-alpine

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
      FROM node:22 AS builder

      ${envLines}

      WORKDIR /app

      # Copiar todos los archivos, incluyendo el código fuente y configuración
      COPY . .

      # Instalar dependencias, incluyendo las de desarrollo
      RUN npm install
      RUN npm i --save-dev @types/node

      RUN npm run build

      # Etapa 2: Desarrollo
      FROM node:22-alpine

      ${envLines}

      WORKDIR /app/app${id_project}

      # Copiar todos los archivos desde la etapa anterior
      COPY --from=builder /app /app

      # Instalar las dependencias de desarrollo
      RUN npm install 

      # Exponer el puerto para el servidor de desarrollo
      EXPOSE ${port}

      # Comando para iniciar Vite en modo desarrollo
      CMD ["npm", "run", "preview", "--", "--port", "${port}", "--host", "0.0.0.0"]

      `,
      Nodejs: `# Usa una versión estable de Node.js como base
      FROM node:22

      # Establece el directorio de trabajo dentro del contenedor
      WORKDIR /app

      # Copia package.json y package-lock.json antes de copiar el código fuente
      COPY package*.json ./

      # Instala dependencias sin generar archivos innecesarios
      RUN npm install 

      # Copia el código fuente al contenedor
      COPY . .
      COPY . /app/app${id_project}

      ${envLines}

      # Detecta si hay un script de build y lo ejecuta (opcional)
      RUN echo "Checking for build script..." && \
        node -e "..." && echo 'Build script found. Building...' && npm run build || echo 'No build script found. Skipping.'
      
      # Expone el puerto definido en la variable de entorno o usa 3000 por defecto
      EXPOSE ${port}

      # Usa un entrypoint flexible para adaptarse a cualquier framework
      CMD ["npm", "run", "start", "--", "--port=${port}", "--host", "0.0.0.0"] `,

      Python: `# Use Python 3.9 as the base image
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

      Php: `# Use PHP 8.1 with Apache
      FROM php:8.1-apache
      
      # Copy application files to the Apache server directory
      COPY . /var/www/html/
      
      ${envLines}

      # Expose the application port
      EXPOSE ${port}
      
      # Start Apache in the foreground
      CMD ["apache2-foreground"]`,

      Angular: `
      # Etapa 1: Construcción del entorno de desarrollo
      FROM node:22-alpine AS builder

      # Instala Angular CLI globalmente
      RUN npm install -g @angular/cli

      WORKDIR /app

      COPY package*.json ./
      RUN npm install

      RUN npm install -g serve

      COPY . .

      # Reemplaza las variables de entorno de Angular
      RUN echo "export const environment = { production: false, basePath: '/app${id_project}/', ${envLinesAngular} };" > src/environments/environment.ts
      RUN echo "export const environment = { production: true, basePath: '/app${id_project}/', ${envLinesAngular} };" > src/environments/environment.development.ts
    
      # Construye la aplicación en producción
      RUN npm run build -- --configuration production --base-href /app${id_project}/  --deploy-url /app${id_project}/

      # Etapa 2: servidor de archivos estáticos
      FROM node:22-alpine

      WORKDIR /app

      # Instalar serve para servir archivos
      RUN npm install -g serve

      # Copiar archivos generados del build
      
      ##COPY --from=builder /app/dist/*/browser ./app${id_project}
      COPY --from=builder /app/dist/*/browser ./app${id_project}

      # Exponer el puerto
      EXPOSE ${port}

      # Comando para correr la aplicación en producción
      CMD ["sh", "-c", "serve -l ${port}", "--single"]
      ##CMD ["serve -l ${port}", ".", "--base", "app${id_project}"]
      `,

      Expressjs: `# Imagen base oficial de Node.js
      FROM node:22-alpine

      # Establece variable de entorno del puerto

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
      Symfony: `# Etapa 1: imagen base con PHP y extensiones necesarias
      FROM php:8.2-cli

      # Instala dependencias del sistema
      RUN apt-get update && apt-get install -y \
          git unzip zip curl libicu-dev libonig-dev libxml2-dev libzip-dev libpq-dev \
          libpng-dev libjpeg-dev libfreetype6-dev libssl-dev libcurl4-openssl-dev \
          zlib1g-dev libxrender1 libfontconfig1 libxext6 libx11-dev \
          && docker-php-ext-install intl pdo pdo_mysql opcache zip xml mbstring bcmath

      # Instala Composer desde la imagen oficial
      COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

      # Establece el directorio de trabajo
      WORKDIR /app${id_project}

      # Copia los archivos del proyecto
      COPY . .

      RUN mkdir -p config && \
      echo 'controllers:' > config/routes.yaml && \
      echo "  resource: '../src/Controller/'" >> config/routes.yaml && \
      echo "  type: attribute" >> config/routes.yaml && \
      echo "  prefix: /app${id_project}" >> config/routes.yaml

      RUN echo "APP_ENV=dev" > .env 


      # Ejecuta composer install para que funcione el autoload
      RUN composer install --no-interaction --prefer-dist --optimize-autoloader

      # Instala Symfony CLI
      RUN curl -sS https://get.symfony.com/cli/installer | bash && \
          mv /root/.symfony*/bin/symfony /usr/local/bin/symfony

      # Expone el puerto
      EXPOSE ${port}

      # Comando por defecto: iniciar servidor web embebido de PHP
      CMD ["symfony", "server:start", "--no-tls", "--allow-http", "--port=${port}", "--allow-all-ip"]


      `,
      Laravel: `# Etapa 1: imagen base con PHP y extensiones necesarias
      FROM php:8.2-cli

      # Instala dependencias del sistema
      RUN apt-get update && apt-get install -y \
          git unzip zip curl libicu-dev libonig-dev libxml2-dev libzip-dev libpq-dev \
          libpng-dev libjpeg-dev libfreetype6-dev libssl-dev libcurl4-openssl-dev \
          zlib1g-dev libxrender1 libfontconfig1 libxext6 libx11-dev \
          && docker-php-ext-install intl pdo pdo_mysql opcache zip xml mbstring bcmath

      # Instala Composer desde la imagen oficial
      COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

      # Copia el proyecto Laravel al contenedor
      COPY . app${id_project}

      # Establece directorio de trabajo
      WORKDIR app${id_project}

      # Instalar Node.js LTS y npm
      RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
          apt-get install -y nodejs && \
          npm install -g npm

      RUN npm install

      RUN docker-php-ext-install pcntl

      # Ejecuta composer install para que funcione el autoload
      RUN composer install --no-interaction --prefer-dist --optimize-autoloader


      # Expone el puerto donde Laravel servirá (por default 8000)
      EXPOSE ${port}

      # Comando de inicio: php artisan serve
      CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=${port}"]
      `,
      Springboot: `
      # Etapa 1: Construcción del proyecto con Maven y Java 17
        FROM maven:3.9.4-eclipse-temurin-21 AS builder
        WORKDIR /app
        COPY . .
        ${envLines}
        RUN mvn clean package -DskipTests

        # Etapa 2: Imagen de producción con JDK 17 ligero
        FROM eclipse-temurin:21-jdk-alpine
        WORKDIR /app
        COPY --from=builder /app/target/*.jar app.jar
        ${envLines}
        EXPOSE ${port}
        
        # Variable para pasar flags de JVM si se desea
        ENV JAVA_OPTS=""

        ENTRYPOINT exec java $JAVA_OPTS -jar app.jar
      `,
      Html: `FROM node:22-alpine

      WORKDIR /app

      # Copiamos el contenido de app/app1 al contenedor
      COPY . /app/app${id_project}
      COPY . /app

      RUN find /app -name "*.html" -exec sed -i 's|<head>|<head><base href="/app${id_project}/" />|' {} +
      RUN find /app/app${id_project} -name "*.html" -exec sed -i 's|<head>|<head><base href="/app${id_project}/" />|' {} +

      # Instala serve
      RUN npm install -g serve
      ${envLines}
      # Expone el puerto donde se servirá el contenido
      EXPOSE ${port}

      # Sirve todo desde /app
      CMD ["serve", "/app", "-l", "${port}"]
      `,

    };

    // Return the corresponding Dockerfile template for the given technology
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return templates[tech];
  }

  /**
   * Parses and formats environment variables according to the framework's convention.
   *
   * This method adds a framework-specific prefix to each environment variable
   * (e.g., VITE_, NEXT_PUBLIC_, or REACT_APP_) based on the selected frontend framework.
   * If the framework is not supported, it returns the variables unchanged.
   *
   * @param framework The frontend framework being used ('Vite', 'Nextjs', or 'React').
   * @param env A record of environment variables to be transformed.
   * @returns An object containing the transformed JSON and a string representation of the variables.
   */
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
  async generateDockerfile(
    id_project: string,
    projectPath: string,
    language: string,
    port: number,
    env: any[],
  ): Promise<string> {
    const dockerfilePath = path.join(projectPath, 'Dockerfile');

    const envFile = this.getEnvFile(language, id_project, port);
    if (envFile) {
      await fs.writeFileSync(`${projectPath}/.env`, envFile);
    }
    // Retrieve the corresponding Dockerfile template
    const dockerFile = this.getDockerFile(language, port, env, id_project);

    if (!dockerFile) {
      throw new Error(`Language ${language} is not supported.  ErrorCode-002`);
    }

    // Create and write the Dockerfile

    await fs.writeFileSync(dockerfilePath, dockerFile);

    return dockerfilePath;
  }

  getEnvFile(language: string, id_project: string, port: number) {
    const templates = {
      Laravel: `
     APP_NAME=Laravel
APP_ENV=local
APP_KEY=base64:sEeLvWgOFti7RTxcWUekDqSy3ueqQnR9f+8wC4QO7HU=
APP_DEBUG=true
APP_URL=https://${process.env.APP_HOST}/app${id_project}
APP_BASE_PATH=/app${id_project}
APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=en_US
APP_MAINTENANCE_DRIVER=file
PHP_CLI_SERVER_WORKERS=4
BCRYPT_ROUNDS=12
LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug
DB_CONNECTION=msql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=template_laravel
DB_USERNAME=root
DB_PASSWORD=
SESSION_DRIVER=file
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null
BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
CACHE_STORE=file
MEMCACHED_HOST=127.0.0.1
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379
MAIL_MAILER=log
MAIL_SCHEME=null
MAIL_HOST=127.0.0.1
MAIL_PORT=2525
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_FROM_ADDRESS=hello@example.com
MAIL_FROM_NAME="Laravel"
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=
AWS_USE_PATH_STYLE_ENDPOINT=false
VITE_APP_NAME="Laravel"
      `,
    };
    return templates[language];
  }

  /**
   * Builds and runs a Docker container for the given project.
   *
   * @param Name - A unique identifier for the project, used for naming the image and container.
   * @param projectPath - The absolute path to the project's directory.
   * @param language - The programming language or tech stack used (used for logging or templating).
   * @param port - The port on which the container should run.
   * @param env - An array of environment variable objects to inject into the container.
   * @returns A success message indicating the container is running.
   * @throws An error if the Docker build or run commands fail.
   */
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
      throw new Error(
        `Error al ejecutar Docker: ${error.message}  ErrorCode-003`,
      );
    }
  }

  /**
   * Executes a shell command asynchronously using the Node.js `exec` function.
   *
   * @param command - The shell command to execute.
   * @returns A Promise that resolves when the command executes successfully,
   *          or rejects with the error if it fails.
   */
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

  /**
   * Checks if a Docker container is running, and if not, starts or creates it.
   *
   * @param containerName - The name of the Docker container.
   * @param image - The Docker image to use when creating the container.
   * @param port - The port to expose from the container.
   * @param volume - The volume to mount inside the container.
   * @param network - The Docker network to connect the container to.
   * @param envVars - Optional array of environment variables (e.g., ["VAR=value"]).
   */
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

        if (containerName == process.env.MYSQL_CONTAINER_NAME) {
          volume = `${volume}:/var/lib/mysql`;
        } else if (containerName == process.env.MONGO_CONTAINER_NAME) {
          volume = `${volume}:/data/db`;
        } else if (containerName == process.env.MARIADB_CONTAINER_NAME) {
          volume = `${volume}:/backup`;
        } else if (containerName == process.env.POSTGRES_CONTAINER_NAME) {
          volume = `${volume}:/var/lib/postgresql/data`;
        }
        
        const command = `docker run -d --name ${containerName} --network ${network} -p ${port}:${port} -v ${volume}  ${envString} ${image} --port=${port}`;

        console.log(command);
        await this.executeCommand(command);
      }
    }
  }

  /**
   * Sets up the required database containers (MySQL and MongoDB).
   *
   */
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
      Number(process.env.MONGO_PORT) || 3309,
      process.env.MONGO_VOLUME || 'mongo_data',
      networkName,
      [
        `MONGO_INITDB_ROOT_USERNAME=${process.env.MONGO_INITDB_ROOT_USERNAME}`,
        `MONGO_INITDB_ROOT_PASSWORD=${process.env.MONGO_INITDB_ROOT_PASSWORD}`,
      ],
    );

    await this.checkAndCreateContainer(
      process.env.MARIADB_CONTAINER_NAME || 'mariadb_container',
      'mariadb:latest',
      Number(process.env.MARIADB_PORT) || 3310,
      process.env.MARIADB_VOLUME || 'mariadb_data',
      networkName,
      [
        `MARIADB_USER=${process.env.MARIADB_INITDB_USER_USERNAME}`,
        `MARIADB_PASSWORD=${process.env.MARIADB_INITDB_USER_PASSWORD}`,
        `MARIADB_ROOT_PASSWORD=${process.env.MARIADB_INITDB_ROOT_PASSWORD}`,
      ],
    );

    await this.checkAndCreateContainer(
      process.env.POSTGRES_CONTAINER_NAME || 'postgres_container',
      'postgres:latest',
      Number(process.env.POSTGRES_PORT) || 3311,
      process.env.POSTGRES_VOLUME || 'postgres_data',
      networkName,
      [
        `POSTGRES_PASSWORD=${process.env.POSTGRES_INITDB_ROOT_PASSWORD}`,
      ],
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
  ): Promise<string> {
    const command = `
  docker exec ${containerName} mysql -u root -p'${process.env.MYSQL_ROOT_PASSWORD}' -e "
    CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\`;
    CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPassword}';
    GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'%';
    FLUSH PRIVILEGES;"
`;

    try {
      new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error al crear DB y usuario en Sql:`, stderr);
            reject(new Error(error + ' ErrorCode-007'));
          } else {
            resolve(stdout);
          }
        });
      });
      //return conection uri
      return `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${process.env.IP_HOST}:${process.env.MYSQL_PORT}/${encodeURIComponent(dbName)}`;
    } catch (error) {
      throw new Error(error);
    }
  }

  async createMyNoSQLDatabaseAndUser(
    containerName: string,
    dbName: string,
    dbUser: string,
    dbPassword: string,
  ): Promise<string> {
    const mongoCommand = `
    docker exec ${containerName} mongosh --port ${process.env.MONGO_PORT} -u "${process.env.MONGO_INITDB_ROOT_USERNAME}" -p "${process.env.MONGO_INITDB_ROOT_PASSWORD}" --authenticationDatabase admin --eval "
      const db = db.getSiblingDB('${dbName}');
      db.createUser({
        user: '${dbUser}',
        pwd: '${dbPassword}',
        roles: [{ role: 'readWrite', db: '${dbName}' }]
      });
      db.users.insertOne({
        username: '${dbUser}',
        role: 'readWrite',
        createdAt: new Date()
      });
    "
  `;

    try {
      new Promise((resolve, reject) => {
        exec(mongoCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error al crear DB y usuario en No Sql:`, stderr);
            reject(new Error(error + ' ErrorCode-012'));
          } else {
            resolve(stdout);
          }
        });
      });
      //return conection uri
      return `mongodb://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${process.env.IP_HOST}:${process.env.MONGO_PORT}/${encodeURIComponent(dbName)}?authSource=${encodeURIComponent(dbName)}`;
    } catch (error) {
      throw new Error(error);
    }
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

  /**
   * Creates and runs a Docker Compose setup for a frontend and backend service.
   *
   * @param id The project ID used for naming containers and folders.
   * @param port The starting port number to be used by the frontend; the backend uses `port + 1`.
   * @param envBackend An array of environment variables for the backend container.
   * @param envFrontend An array of environment variables for the frontend container.
   * @returns The full path to the generated `docker-compose.yml` file.
   */
  async createDockerCompose(
    id: number,
    port: number,
    envBackend: any[],
    envFrontend: any[],
  ) {
    const envLinesBackend = Object.entries(envBackend)
      .map(([key, value]) => `- ${key}=${value}`)
      .join('\n      ');
    const envLinesFrontend = Object.entries(envFrontend)
      .map(([key, value]) => `- ${key}=${value}`)
      .join('\n      ');
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
      ${envLinesFrontend}
    networks:
      - default
  backend:
    build:
      context: ./Backend
      dockerfile: Dockerfile
    container_name: backend_${id}
    ports:
      - "${port + 1}:${port + 1}"
    environment:
      ${envLinesBackend}
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
      await fs.writeFileSync(composePath, composeContent);
    } catch (error) {
      console.log('Error creando el docker compose' + error);
    }

    try {
      await this.executeCommand(
        `docker compose -f ${composePath} build --no-cache`,
      );
      await this.executeCommand(`docker compose -f ${composePath} up -d`);
    } catch (error) {
      console.log(
        'Error ejecutando el docker compose: ' + error + ' ErrorCode-004',
      );
    }
    return composePath;
  }

  /**
   * Stops a running Docker container created with `docker run`.
   *
   * @param containerName The name of the container to be stopped.
   * @throws BadRequestException if the stop operation fails.
   */
  async stopDockerRun(containerName: string) {
    try {
      await this.executeCommand(`docker stop ${containerName}`);
    } catch (error) {
      throw new BadRequestException(error + ' ErrorCode-008');
    }
  }

  /**
   * Starts a Docker container that was previously created with `docker run`.
   *
   * @param containerName The name of the container to start.
   * @throws BadRequestException if the start operation fails.
   */
  async startDockerRun(containerName: string) {
    try {
      await this.executeCommand(`docker start ${containerName}`);
    } catch (error) {
      throw new BadRequestException(error + ' ErrorCode-009');
    }
  }

  /**
   * Stops and removes containers defined in a Docker Compose file.
   *
   * @param yml_loc The full path to the Docker Compose YAML file.
   * @throws BadRequestException if the stop operation fails.
   */
  async stopDockerCompose(yml_loc: string) {
    try {
      await this.executeCommand(`docker compose -f ${yml_loc} down`);
    } catch (error) {
      throw new BadRequestException(error + ' ErrorCode-010');
    }
  }

  /**
   * Starts containers defined in a Docker Compose file in detached mode.
   *
   * @param yml_loc The full path to the Docker Compose YAML file.
   * @throws BadRequestException if the start operation fails.
   */
  async startDockerCompose(yml_loc: string) {
    try {
      await this.executeCommand(`docker compose -f ${yml_loc} up -d`);
    } catch (error) {
      throw new BadRequestException(error + ' ErrorCode-011');
    }
  }

  async getDockerLog(containerName: string) {
    try {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          exec(`docker logs ${containerName}`, (error, stdout, stderr) => {
            if (error) {
              return reject(new Error(`Error: ${error.message}`));
            }
            resolve(`${stdout}, ${stderr}`);
          });
        }, 5000);
      });
    } catch (error) {
      throw new Error(
        `Error obteniendo logs del contenedor ${containerName}: ${error.message}`,
      );
    }
  }
}
