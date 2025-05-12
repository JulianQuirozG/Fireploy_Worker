/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';

@Injectable()
export class GitService {
  private git: SimpleGit;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.git = simpleGit(); // Inicializa simple-git
  }

  /**
   * Clones a repository into a specified directory.
   *
   * This method clones a Git repository from the given URL into a structured directory
   * based on the provided parameters. If the target directory already exists, it will be deleted first.
   *
   * @param url The URL of the repository to be cloned.
   * @param rute The base path where the repository should be cloned.
   * @param folder_name The name of the folder where the repository will be placed.
   * @param tipo The type of repository: 'F' for Frontend, 'B' for Backend, or any other value for All.
   * @returns A promise that resolves to the full path of the cloned repository.
   * @throws An error if the cloning process fails.
   */
  async cloneRepositorio(
    url: string,
    rute: string,
    folder_name: string,
    tipo: string,
  ): Promise<string> {
    if (tipo == 'F') tipo = 'Frontend';
    else if (tipo == 'B') tipo = 'Backend';
    else tipo = 'All';

    // Assign full path
    const basePath = `${rute}/${folder_name}`;
    const fullPath = path.join(basePath, tipo);

    // If the directory exists, delete it
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }

    // Create the base directory
    fs.mkdirSync(basePath, { recursive: true });

    // Clone the repository
    try {
      await this.git.clone(url, fullPath);
      return `${fullPath}`;
    } catch (error) {
      throw new Error(
        `Error cloning the repository: ${error.message}  ErrorCode-001`,
      );
    }
  }
}
