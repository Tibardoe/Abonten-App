# 1
# # syntax=docker/dockerfile:1

# # Comments are provided throughout this file to help you get started.
# # If you need more help, visit the Dockerfile reference guide at
# # https://docs.docker.com/go/dockerfile-reference/

# # Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

# ARG NODE_VERSION=22.12.0

# FROM node:${NODE_VERSION}-alpine

# # Use production node environment by default.
# # ENV NODE_ENV production
# ENV NODE_ENV=development

# WORKDIR /app

# # Copy dependencies to docker image
# COPY package*.json ./

# # # Download dependencies as a separate step to take advantage of Docker's caching.
# # # Leverage a cache mount to /root/.npm to speed up subsequent builds.
# # # Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# # # into this layer.
# # RUN --mount=type=bind,source=package.json,target=package.json \
# #     --mount=type=bind,source=package-lock.json,target=package-lock.json \
# #     --mount=type=cache,target=/root/.npm \
# #     npm ci --omit=dev

# # Install dependencies
# RUN npm install --legacy-peer-deps

# # # Create and set permissions for .next before switching user
# # RUN mkdir -p .next && chown -R node:node /usr/src/app

# # # Run the application as a non-root user.
# # USER node

# # Copy the rest of the source files into the image.
# COPY . .

# # Expose the port that the application listens on.
# EXPOSE 3000

# # Run the application.
# CMD ["npm", "run", "dev"]

# 2
# # syntax=docker/dockerfile:1

# # Stage 1: Builder
# FROM node:22.12.0-alpine AS builder
# WORKDIR /app
# COPY package*.json ./
# RUN npm ci --omit=dev
# COPY . .

# # Build for production
# FROM builder AS prod-builder
# ENV NODE_ENV=production
# RUN npm run build

# # Stage 2: Runner (Production)
# FROM node:22.12.0-alpine AS runner
# WORKDIR /app
# ENV NODE_ENV=production
# COPY --from=prod-builder /app/package*.json ./
# COPY --from=prod-builder /app/node_modules ./node_modules
# COPY --from=prod-builder /app/.next ./.next
# COPY --from=prod-builder /app/public ./public
# COPY --from=prod-builder /app/next.config.js ./

# RUN addgroup -g 1001 -S nodejs && \
#     adduser -S nextjs -u 1001 -G nodejs && \
#     chown -R nextjs:nodejs /app
# USER nextjs

# EXPOSE 3000
# CMD ["npm", "start"]

# # Stage 3: Dev (Optional)
# FROM builder AS dev
# ENV NODE_ENV=development
# CMD ["npm", "run", "dev"]



# 3
# syntax=docker/dockerfile:1

# Stage 1: Base (shared for both environments)
FROM node:22.12.0-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
# RUN npm ci --omit=dev
COPY . .

# Stage 2: Production Builder
FROM base AS prod-builder
RUN npm run build

# Stage 3: Production Runner (optimized)
FROM node:22.12.0-alpine AS prod-runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-builder /app/package*.json ./
COPY --from=prod-builder /app/node_modules ./node_modules
COPY --from=prod-builder /app/.next/standalone ./
COPY --from=prod-builder /app/.next/static ./.next/static
COPY --from=prod-builder /app/public ./public

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]

# Stage 4: Development
FROM base AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]
