# SCU Web App Deployment Guide (Production)

This guide provides instructions for deploying the SCU Web App in a production environment.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [SSL Certificate Setup](#ssl-certificate-setup)
4. [Deployment Scenarios](#deployment-scenarios)
   - [Single-Server (Standard)](#scenario-1-single-server)
   - [Three-Server (Distributed)](#scenario-2-three-server)
5. [Maintenance & Commands](#maintenance)

---

## 1. Prerequisites <a name="prerequisites"></a>
- **Docker** and **Docker Compose** installed on all target servers.
- Domain name or static IPs for the servers.
- Access to the EGAT network if deploying internally.

---

## 2. Environment Configuration <a name="prerequisites"></a>
1. Copy `.env.example` to `.env`.
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and update the following:
   - `JWT_SECRET`: Generate a random long string.
   - `POSTGRES_PASSWORD`: Use a strong password.
   - `MINIO_ROOT_PASSWORD`: Use a strong password.
   - `VITE_API_BASE_URL`: For Single-Server, use `/api`. For Multi-Server, use the IP/Domain of the Web Server.

---

## 3. SSL Certificate Setup <a name="ssl-certificate-setup"></a>
The Nginx configuration requires SSL certificates in `web-server/nginx/ssl/`.
To generate a self-signed certificate for testing:
```bash
mkdir -p web-server/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout web-server/nginx/ssl/nginx.key \
  -out web-server/nginx/ssl/nginx.crt
```
*Note: For production, use certificates from a trusted CA (e.g., Let's Encrypt or EGAT's IT Dept).*

---

## 4. Deployment Scenarios <a name="deployment-scenarios"></a>

### Scenario 1: Single-Server (Standard) <a name="scenario-1-single-server"></a>
Best for trial or moderate load. Everything runs on one machine.
1. Run the deployment:
   ```bash
   docker-compose up -d --build
   ```
2. Access the app via `https://<server-ip>`.

### Scenario 2: Three-Server (Distributed) <a name="scenario-2-three-server"></a>
Best for heavy load or high isolation (Computer 1: Web, Computer 2: ML, Computer 3: Data).

#### Computer 3: Data & Storage
1. Move `infra` folder and `.env` to this server.
2. Run:
   ```bash
   cd infra
   docker-compose up -d
   ```

#### Computer 2: ML Engine
1. Move `ml-server` folder and `.env` to this server.
2. Edit `.env`: Set `DB_HOST` and `MINIO_ENDPOINT` to Computer 3's IP.
3. Run:
   ```bash
   cd ml-server
   docker-compose up -d --build
   ```

#### Computer 1: Web Interface
1. Move `web-server` folder and `.env` to this server.
2. Edit `.env`: 
   - Set `DB_HOST` and `MINIO_ENDPOINT` to Computer 3's IP.
   - Set `ML_SERVER_URL` to Computer 2's IP (`http://<comp2-ip>:5005`).
3. Run:
   ```bash
   cd web-server
   docker-compose up -d --build
   ```

---

## 5. Maintenance & Commands <a name="maintenance"></a>

### View Logs
```bash
docker-compose logs -f [service_name]
```

### Restart Services
```bash
docker-compose restart
```

### Database Backup
```bash
docker exec scu-postgres pg_dump -U admin scu_db > backup.sql
```

### Accessing Database (pgAdmin)
You can connect to the PostgreSQL database using pgAdmin or any SQL client:
- **Host**: `localhost` (or server IP)
- **Port**: `5432`
- **Username**: Use `POSTGRES_USER` from `.env` (default: `admin`)
- **Password**: Use `POSTGRES_PASSWORD` from `.env` (default: `admin123`)
- **Database**: Use `POSTGRES_DB` from `.env` (default: `scu_db`)

### Accessing MinIO Console
The MinIO console is available for managing files and buckets:
- **URL**: `http://<server-ip>:9001`
- **Credentials**: Use `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` defined in your `.env`.

### Update the App
1. Pull latest code.
2. Rebuild: `docker-compose up -d --build`.
