# 🚀 Deployment Guide

This project uses **GitHub Actions CI/CD** with automatic **build, test, and deployment**.  
There are two deployment environments: **Staging** and **Production**.

---

## 🔧 Build
Every push to `main` or `develop` will:
- Build the Docker image
- Push it to **GitHub Container Registry** (`ghcr.io/fadebowaley/halobe`)

---

## 🧪 Staging Deployment
- Triggered automatically when you **push to `develop` branch**  
- Can also be triggered manually from the **Actions tab**

**Flow:**
1. Code pushed to `develop`
2. Docker image tagged as `develop`
3. Deployed to staging server

---

## 🌟 Production Deployment
- Triggered when you **push a version tag** (e.g. `v1.0.0`)  
- Can also be triggered manually from the **Actions tab**

**Flow:**
1. Code tagged with `vX.Y.Z`
2. Docker image tagged with version (e.g. `v1.0.0`)
3. Deployed to production server

---

## 📌 Why this setup?
- `develop` → Staging (safe place to test new changes)  
- `vX.Y.Z` tag → Production (only stable releases go live)  
- Manual trigger → Emergency or custom deployment

---

## 🚀 How to Deploy

### Deploy to Staging
```bash
git checkout develop
git push origin develop

### Deploy to Production
git checkout main
git tag v1.0.0
git push origin v1.0.0
