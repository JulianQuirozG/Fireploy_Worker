/**
 * generate-nginx.ts
 *
 * Ejecuta con: sudo ts-node generate-nginx.ts
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
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
  private appsDir: string;

  constructor(archieveName: string, aliases: NginxAlias[]) {
    this.domain = 'proyectos.fireploy.online';
    this.aliases = aliases;
    this.includesDir = '/etc/nginx/includes';
    this.appsDir = '/etc/nginx/apps';
    this.includeFile = join(this.includesDir, `${archieveName}`);
  }

  async generate() {
    // Asegura que exista el directorio de includes
    if (!existsSync(this.includesDir)) {
      mkdirSync(this.includesDir, { recursive: true });
    }

    if (existsSync(this.includeFile)) {
      unlinkSync(this.includeFile);
    }

    // Construye la configuración con bloques location
    let config = '';
    for (const alias of this.aliases) {
      const loc = alias.path ? `/${alias.path}` : '/';
      const proxyPass = `http://${alias.target}/${alias.path}`;

      config +=
        `
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
      console.error('❌ Error al recargar NGINX:', e, ' ErrorCode-005');
      process.exit(1);
    }
  }

  async generateSubDomain() {

    // Asegura que exista el directorio de includes
    if (!existsSync(this.appsDir)) {
      mkdirSync(this.appsDir, { recursive: true });
    }

    for (const alias of this.aliases) {

      const pathFile = join(this.appsDir, alias.path)
      if (existsSync(pathFile)) {
        unlinkSync(pathFile);
      }

      let config = '';

      config += `
server {
    listen 443 ssl;
    server_name ${alias.path}.${this.domain};

    ssl_certificate /etc/letsencrypt/live/proyectos.fireploy.online-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proyectos.fireploy.online-0001/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://${alias.target};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`.trim();

      writeFileSync(pathFile, config + '\n', 'utf8');
      console.log(`📄 Archivo principal de NGINX creado: ${pathFile}`);
    }

    // Valida y recarga NGINX
    try {
      await execSync('nginx -t', { stdio: 'inherit' });
      await execSync('systemctl reload nginx', { stdio: 'inherit' });
      console.log('🚀 NGINX recargado correctamente');
    } catch (e) {
      console.error('❌ Error al recargar NGINX:', e, ' ErrorCode-005');
      process.exit(1);
    }
  }
}
