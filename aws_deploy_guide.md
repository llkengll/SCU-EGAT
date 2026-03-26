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

## 7. Advanced Infrastructure & Security

### Security Group Inbound Rules (Detail)
| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP | Admin Access |
| HTTP | 80 | 0.0.0.0/0 | Nginx Proxy (Redirect) |
| HTTPS | 443 | 0.0.0.0/0 | Web/API Traffic |
| Custom | 9001 | Your IP | MinIO Web Console (Private) |

### IAM Role (If using AWS Services)
If your system eventually moves from local MinIO to **AWS S3** or from local Postgres to **AWS RDS**, attach an IAM Role to the EC2 instance instead of hardcoding credentials in `.env`:
1. Create Role with `AmazonS3FullAccess`.
2. Attach to Instance: `Actions -> Security -> Modify IAM Role`.
3. Use `boto3` in Python or `aws-sdk` in Node WITHOUT credentials (it uses the instance metadata).

### Persistent Storage (EBS Volumes)
Since Docker containers are ephemeral, all critical data MUST be stored in the mapped volumes.
- **Backups**: Enable **EBS Snapshots** in the AWS console to back up the entire instance disk on a daily schedule.
- **Resize**: If MinIO runs out of space, you can increase the EBS volume size in AWS without stopping the instance. Then run:
  `sudo resize2fs /dev/xvda1` (or your device name).

---

## 8. CI/CD with GitHub Actions

To automate deployments when you push new code:

1. Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to EC2
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH and Deploy
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd SCU-EGAT
            git pull origin main
            docker compose build
            docker compose up -d
```

---

## 9. Monitoring & Performance

### Instance Logs
View real-time traffic logs filtered by service:
```bash
docker compose logs -f nginx
```

### Resource Management
The ML server uses significant RAM during inference. Monitor usage with:
```bash
docker stats
```
If memory usage hits >90%, consider upgrading to a **t3.large** (8GB) or adding a larger **swapfile** (as described in the Troubleshooting section).

### CloudWatch (Optional)
Install the **Amazon CloudWatch Agent** on the EC2 host to push your Docker logs directly to the AWS CloudWatch Console for long-term retention and alerting.

---

## 10. Summary Checklist for Production
1. [ ] Domain name configured (Route 53 or other DNS).
2. [ ] Valid SSL certificate from Certbot/Let's Encrypt.
3. [ ] Strict Security Group (Only 80/443 open to world).
4. [ ] `.env` file contains strong, non-default passwords.
5. [ ] Daily EBS snapshots enabled in AWS Console.
