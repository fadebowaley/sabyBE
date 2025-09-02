# Use a stable node base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Switch to root to install dependencies
USER root

# Copy necessary files and install dependencies using npm
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# Now copy rest of the app
COPY --chown=node:node . .

# Expose port for backend
EXPOSE 4000

# Default command (can be overridden in docker-compose)
CMD ["npm", "run", "dev"]
