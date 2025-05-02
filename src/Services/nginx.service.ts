/**
 * generate-nginx.ts
 * 
 * Ejecuta con: sudo ts-node generate-nginx.ts
 */

import { writeFileSync, mkdirSync, existsSync, appendFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export interface NginxAlias {
  path: string;
  target: string;
}

export class NginxConfigGenerator {
  private domain: string;
  private aliases: NginxAlias[];
  private includesDir: string;
  private includeFile: string;

  constructor(archieveName: string, aliases: NginxAlias[]) {
    this.domain = 'proyectos.fireploy.online';
    this.aliases = aliases;
    this.includesDir = '/etc/nginx/includes';
    this.includeFile = join(this.includesDir, `app${archieveName}`);
  }

  async generate() {
    // Asegura que exista el directorio de includes
    if (!existsSync(this.includesDir)) {
      mkdirSync(this.includesDir, { recursive: true });
      console.log(`📁 Directorio creado: ${this.includesDir}`);
    }

    if (existsSync(this.includeFile)) {
      unlinkSync(this.includeFile);
      console.log(`🗑️ Archivo anterior eliminado: ${this.includeFile}`);
    }

    // Construye la configuración con bloques location
    let config = '';
    for (const alias of this.aliases) {
      const loc = alias.path ? `/${alias.path}` : '/';
      const proxyPass = `https://${alias.target}/${alias.path}`;

      config += `
location ${loc} {
    proxy_pass ${proxyPass};
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
`.trim() + '\n\n';

      console.log(`✅ Alias generado: location ${loc} → ${proxyPass}`);
    }

    // Escribe el archivo de inclusión
    writeFileSync(this.includeFile, config.trim() + '\n', 'utf8');
    console.log(`📄 Archivo de rutas actualizado: ${this.includeFile}`);

    // Valida y recarga NGINX
    try {
      await execSync('nginx -t', { stdio: 'inherit' });
      await execSync('systemctl reload nginx', { stdio: 'inherit' });
      console.log('🚀 NGINX recargado correctamente');
    } catch (e) {
      console.error('❌ Error al recargar NGINX:', e);
      process.exit(1);
    }
  }
}
