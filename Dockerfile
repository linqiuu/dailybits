FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build the app.
COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# Default command runs web service. Scheduler uses docker-compose override.
CMD ["npm", "run", "start"]
