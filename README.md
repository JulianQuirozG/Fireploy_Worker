# 🔥 Fireploy Worker

Este repositorio contiene la configuración e instrucciones necesarias para desplegar el **Worker de Fireploy** en un servidor Linux con Ubuntu.  

---

## 📋 Prerrequisitos

- Servidor con **Ubuntu 20.04+**  
- Acceso con usuario con permisos **sudo**  
- Nombre de dominio configurado en **GoDaddy** (u otro proveedor de DNS)  
- Acceso al repositorio `Fireploy_Worker`  

---

## ⚙️ Configuración del Worker

### 🖥 Crear usuario

```bash
sudo adduser fireploy_worker
sudo usermod -aG sudo fireploy_worker
su fireploy_worker
```

---

### 🛠 Instalación de dependencias

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nodejs npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

### 🐳 Instalación de Docker

```bash
sudo apt install apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable"
sudo apt update
sudo apt install docker-ce
sudo usermod -aG docker fireploy_worker
su - fireploy_worker
```

---

### 🚀 Despliegue del Worker

```bash
git clone https://github.com/JulianQuirozG/Fireploy_Worker
# Copiar el archivo .env al directorio raíz del proyecto
cd Fireploy_Worker
sudo npm install
sudo npm run build
pm2 start dist/main.js --name fireploy_worker
pm2 save
pm2 startup
pm2 list
```

---

## 🔐 Certificado SSL con Certbot y DNS

Para habilitar HTTPS en el dominio, se utiliza **Certbot** con validación DNS.

```bash
sudo certbot certonly --manual --preferred-challenges=dns -d "*.proyectos.fireploy.online" -d "proyectos.fireploy.online"
```

Al ejecutar este comando, **Certbot** mostrará algo similar:

```
Please deploy a DNS TXT record under the name:
_acme-challenge.proyectos.fireploy.online

with the following value:
Xyz123Abc456
```

---

### ➡️ Configuración del servicio DNS

1. Ingresar al panel de gestión de **DNS** del dominio.  
2. Crear un nuevo **registro TXT** con:  
   - **Nombre:** `_acme-challenge.proyectos.fireploy.online`  
   - **Valor:** `Xyz123Abc456` (valor que muestra Certbot)  
3. Guardar cambios y esperar propagación de DNS.  
4. Volver a la terminal y continuar con la validación de Certbot.  

---

## ✅ Notas finales

- Asegúrate de que el usuario `fireploy_worker` tenga permisos en **Docker** y **PM2**.  
- Verifica que el archivo `.env` esté correctamente configurado en el directorio raíz del proyecto.  
- Tras instalar el certificado, configura tu servidor web o proxy (Nginx/Apache) para usarlo.  
