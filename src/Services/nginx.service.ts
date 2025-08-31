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

  /**
 * Generates and applies an NGINX configuration file with proxy rules.
 *
 * This method:
 * - Ensures the includes directory exists.
 * - Removes the existing include file if it exists.
 * - Iterates over a list of aliases to build `location` blocks with proxy settings.
 * - Writes the constructed configuration to the include file.
 * - Validates and reloads the NGINX service to apply the changes.
 *
 * It uses `nginx -t` to validate the configuration and `systemctl reload nginx`
 * to reload the service. If any error occurs during validation or reload,
 * it logs the error and terminates the process.
 *
 * @throws Will terminate the process if NGINX fails to reload or configuration is invalid.
 */
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

    }

    // Escribe el archivo de inclusión
    writeFileSync(this.includeFile, config.trim() + '\n', 'utf8');

    // Valida y recarga NGINX
    try {
      await execSync('nginx -t', { stdio: 'inherit' });
      await execSync('systemctl reload nginx', { stdio: 'inherit' });
    } catch (e) {
      console.error('❌ Error al recargar NGINX:', e, ' ErrorCode-005');
      process.exit(1);
    }
  }

  /**
 * Generates NGINX configuration files for subdomains and reloads the server.
 *
 * This method:
 * - Ensures the directory for subdomain configurations exists.
 * - Iterates through `this.aliases`, which contain subdomain identifiers and target addresses.
 * - For each alias, it creates an individual NGINX server block that:
 *    - Listens on port 443 (HTTPS).
 *    - Uses Let's Encrypt SSL certificates.
 *    - Proxies requests to the specified target server.
 * - Writes the configuration file to the appropriate directory.
 * - Validates the full NGINX configuration using `nginx -t`.
 * - Reloads NGINX to apply the changes using `systemctl reload nginx`.
 *
 * If validation or reload fails, the process will log the error and exit immediately.
 *
 * @throws Terminates the process if NGINX validation or reload fails.
 */
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
    }

    // Valida y recarga NGINX
    try {
      await execSync('nginx -t', { stdio: 'inherit' });
      await execSync('systemctl reload nginx', { stdio: 'inherit' });
    } catch (e) {
      console.error('❌ Error al recargar NGINX:', e, ' ErrorCode-005');
      process.exit(1);
    }
  }
}
