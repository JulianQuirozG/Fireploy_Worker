import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { rm } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class SystemService {
  private total_ports: number = 65535;

  constructor() {}

  /**
   * Retrieves a list of available network ports.
   *
   * This method executes a Bash command to find all unoccupied ports
   * in the range 0-65535, filtering out those currently in use.
   * Only ports greater than 20000 are included in the result.
   *
   * @returns A promise that resolves to an array of available port numbers.
   * @throws An error if the command execution fails.
   */
  getAvailablePorts(): number[] {
    try {
      // Generar lista de todos los puertos y ordenarlos
      execSync(`seq 0 65535 | LC_ALL=C sort -n > /tmp/available_ports.txt`);
      execSync(
        `LC_ALL=C sort -o /tmp/available_ports.txt /tmp/available_ports.txt`,
      );

      // Obtener puertos en uso, ordenarlos y verificar
      execSync(
        `ss -tuln | awk '{print $5}' | awk -F ":" '{print $NF}' | grep -E "^[0-9]+$" | LC_ALL=C sort -n | LC_ALL=C sort -u > /tmp/open_ports.txt`,
      );
      execSync(`LC_ALL=C sort -o /tmp/open_ports.txt /tmp/open_ports.txt`);

      // **Verificar que los archivos están ordenados correctamente**
      execSync(`LC_ALL=C sort -c /tmp/available_ports.txt`);
      execSync(`LC_ALL=C sort -c /tmp/open_ports.txt`);

      // Ejecutar `comm`
      const stdout = execSync(
        `comm -23 /tmp/available_ports.txt /tmp/open_ports.txt`,
        { encoding: 'utf-8' },
      );

      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map(Number)
        .filter((port) => port > 9000); // Excluir puertos bajos
    } catch (error) {
      console.error(`Error ejecutando el comando:`, error);
      return [];
    }
  }

  async syncFilesAdd(
    rutepath: string,
    ficheros: any[],
    tipo: string,
    id_proyect: number,
  ): Promise<void> {
    if (tipo == 'F') tipo = 'Frontend';
    else if (tipo == 'B') tipo = 'Backend';
    else tipo = 'All';
    //Creo la direccion del folder
    const pat = `${rutepath}/${id_proyect}/${tipo}`;
    if (!fs.existsSync(pat)) {
      fs.mkdirSync(pat, { recursive: true });
    }
    //paso de ficheros en base 64 a buffer y les coloco el nombre de la base de datos
    for (const fichero of ficheros) {
      try {
        if (!fichero.nombre || !fichero.contenido) {
          console.warn('⚠️ Fichero omitido por falta de datos:', fichero);
          continue;
        }

        const rutaArchivo = path.join(pat, fichero.nombre);
        const buffer = Buffer.from(fichero.contenido, 'base64');

        fs.writeFileSync(rutaArchivo, buffer);
        console.log(`Archivo guardado: ${rutaArchivo}`);
      } catch (err) {
        console.error(
          `Error al guardar el archivo ${fichero.nombre}:`,
          err.message,
        );
        throw new Error(
          `Hubo un problema al crear los archivos solicitados para el repositorio`,
        );
      }
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      rm(folderPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Error eliminando la carpeta del proyecto ${error.message}  ErrorCode-017`,
      );
    }
  }
}
