# 🔧 Remote Server Deployment Setup Guide

## 📋 Prerequisites

### 1. SSH Key Setup
You need to set up SSH key authentication between GitHub Actions and your remote server.

#### Generate SSH Key (if you don't have one):
```bash
ssh-keygen -t ed25519 -C "github-actions@yourdomain.com" -f ~/.ssh/github_actions_key
```

#### Add Public Key to Remote Server:
```bash
# Copy your public key to the remote server
ssh-copy-id -i ~/.ssh/github_actions_key.pub haloadmin@172.191.51.123

# Or manually add to authorized_keys
cat ~/.ssh/github_actions_key.pub | ssh haloadmin@172.191.51.123 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 2. GitHub Secrets Configuration
Go to your repository → Settings → Secrets and variables → Actions

#### Required Secrets:
```
SSH_PRIVATE_KEY          # Your private SSH key content
```

#### Optional Secrets (for notifications):
```
SLACK_WEBHOOK_URL        # For Slack notifications
DISCORD_WEBHOOK_URL      # For Discord notifications
```

### 3. Environment Variables Setup
Create environment files on your remote server:

#### For Staging (`~/sabyBackend/.env.staging`):
```bash
# Database Configuration
MONGODB_URL=mongodb://mongodb:27017/halo-staging
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_staging_password
POSTGRES_DB=halo-staging
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Application Configuration
NODE_ENV=staging
PORT=4000
JWT_SECRET=your_staging_jwt_secret

# Storage Configuration
STORAGE_PROVIDER=aws-s3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your_staging_bucket

# Email Configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USERNAME=your_smtp_username
SMTP_PASSWORD=your_smtp_password
EMAIL_FROM=noreply@yourdomain.com

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook/telegram

# WhatsApp Configuration
PHONE_NUMBER_ID=your_phone_number_id
VERIFY_TOKEN=your_verify_token
WHATSAPP_TOKEN=your_whatsapp_token
```

#### For Production (`~/sabyBackend/.env.production`):
```bash
# Database Configuration
MONGODB_URL=mongodb://mongodb:27017/halo-prod
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_production_password
POSTGRES_DB=halo-prod
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_production_redis_password

# Application Configuration
NODE_ENV=production
PORT=4000
JWT_SECRET=your_production_jwt_secret

# Storage Configuration
STORAGE_PROVIDER=aws-s3
AWS_ACCESS_KEY_ID=your_production_aws_access_key
AWS_SECRET_ACCESS_KEY=your_production_aws_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your_production_bucket

# Email Configuration
SMTP_HOST=your_production_smtp_host
SMTP_PORT=587
SMTP_USERNAME=your_production_smtp_username
SMTP_PASSWORD=your_production_smtp_password
EMAIL_FROM=noreply@yourdomain.com

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_production_telegram_bot_token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook/telegram

# WhatsApp Configuration
PHONE_NUMBER_ID=your_production_phone_number_id
VERIFY_TOKEN=your_production_verify_token
WHATSAPP_TOKEN=your_production_whatsapp_token
```

## 🚀 Deployment Workflow

### Automatic Deployments:
- **Staging**: Push to `develop` branch → Auto-deploy to staging
- **Production**: Create version tag (e.g., `v1.0.0`) → Auto-deploy to production

### Manual Deployments:
1. Go to GitHub Actions tab
2. Select "Remote Server Deployment" workflow
3. Click "Run workflow"
4. Choose environment and image tag
5. Click "Run workflow"

## 🔧 Server Setup Commands

Run these commands on your remote server to prepare it:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo apt install git -y

# Clone repository
git clone https://github.com/yourusername/sabyBackend.git
cd sabyBackend

# Make scripts executable
chmod +x docker-build.sh

# Create environment files
touch .env.staging .env.production

# Add your environment variables to the files (see above)
```

## 🔒 Security Best Practices

1. **Use strong passwords** for all services
2. **Rotate secrets regularly**
3. **Limit SSH access** to specific IPs if possible
4. **Use environment-specific secrets**
5. **Enable firewall** on your server
6. **Keep system updated**

## 🐛 Troubleshooting

### SSH Connection Issues:
```bash
# Test SSH connection
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no haloadmin@172.191.51.123

# Check SSH key permissions
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

### Docker Issues:
```bash
# Check Docker status
sudo systemctl status docker

# Check Docker Compose
docker-compose --version

# Check running containers
docker ps
```

### Deployment Issues:
```bash
# Check deployment logs
./docker-build.sh logs staging
./docker-build.sh logs production

# Check service health
./docker-build.sh health staging
./docker-build.sh health production
```

## 📞 Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Check server logs using `./docker-build.sh logs`
3. Verify environment variables are set correctly
4. Test SSH connection manually
