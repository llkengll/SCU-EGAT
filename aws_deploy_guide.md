# SCU-EGAT Deployment Guide (AWS EC2)

This guide provides step-by-step instructions for deploying the **SCU-EGAT** system (Web Frontend, Backend API, and ML Engine) to an AWS EC2 instance using Docker.

## 1. Prerequisites (EC2 Instance Setup)

### Instance Type
Recommended: **t3.medium** or higher (ML engine requires at least 4GB of RAM for stable inference).
Architecture: **x86_64** (Ubuntu 22.04 LTS recommended).

### Security Group Settings (Inbound Rules)
Ensure the following ports are open in your AWS Management Console:
- `80` (HTTP)
- `443` (HTTPS)
- `9000` (MinIO API - Optional)
- `9001` (MinIO Console - Optional, for management)
- `22` (SSH for access)

---

## 2. Server Preparation

Connect to your instance via SSH and install Docker + Docker Compose:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose V2
sudo apt-get install docker-compose-plugin -y

# Add user to docker group
sudo usermod -aG docker $USER
# (Log out and log back in for group changes to take effect)
```

---

## 3. Clone and Configure

### Clone Repository
```bash
git clone <your-repository-url>
cd SCU-EGAT
```

### Environment Configuration
Create a `.env` file in the root directory:

```bash
# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=scu_db

# MinIO Storage
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=minio_secure_password
MINIO_BUCKET_NAME=scu-data

# Security
JWT_SECRET=your_random_secret_hash
```

---

## 4. SSL Certificate Setup

The `nginx` configuration expects SSL certificates in `./web-server/nginx/ssl/`.

### Option A: Self-Signed (For Testing)
```bash
mkdir -p web-server/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout web-server/nginx/ssl/server.key \
  -out web-server/nginx/ssl/server.crt \
  -subj "/CN=your-ec2-public-ip"
```

### Option B: Certbot (Recommended for Production)
If you have a domain name pointing to the EC2 IP:
1. Temporarily use a simple Nginx container to verify domain.
2. Run `certbot` to get certificates.
3. Map the `/etc/letsencrypt/` directory into the `nginx` container volumes in `docker-compose.yml`.

---

## 5. Deployment

Build and start the services in detached mode:

```bash
# Fresh build
docker compose build --no-cache

# Start all services
docker compose up -d
```

### Verification
Check if all containers are healthy:
```bash
docker compose ps
```

Services should be available at:
- **Frontend/API:** `https://your-ec2-public-ip/`
- **MinIO Console:** `http://your-ec2-public-ip:9001`

---

## 6. Post-Deployment (Initializing)

1. **MinIO Buckets:** Log into MinIO Console (port 9001) and ensure the `scu-data` bucket exists.
2. **Database:** The `init.sql` script will automatically create the required tables on the first run.
3. **ML Methods:** The system will automatically seed the `ml_methods` table (AE, PCA, VAE) on startup.

---

## Troubleshooting

### Check Logs
```bash
docker compose logs web-backend -f  # API Logs
docker compose logs ml-server -f    # ML Inference Logs
```

### Memory Issues
If the ML server crashes during training or prediction, ensure the EC2 instance has sufficient swap space:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```
