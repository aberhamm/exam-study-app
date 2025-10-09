# Multi-stage build for production Next.js application

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Enable corepack and install specific pnpm version
RUN corepack enable && corepack prepare pnpm@8.10.2 --activate
ENV PNPM_HOME=/usr/local/bin

# Install dependencies based on the preferred package manager
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Enable corepack and install specific pnpm version
RUN corepack enable && corepack prepare pnpm@8.10.2 --activate
ENV PNPM_HOME=/usr/local/bin

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Install all dependencies including devDependencies for build
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_ENABLE_DEV_FEATURES
ENV NEXT_PUBLIC_ENABLE_DEV_FEATURES=${NEXT_PUBLIC_ENABLE_DEV_FEATURES}

# Build the Next.js application
# Note: Turbopack is currently development-only, so we build without it for production
RUN pnpm exec next build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

# Set to production environment
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy data directory (for seed scripts)

# Change ownership to nextjs user
RUN chown -R nextjs:nodejs /app

# Switch to nextjs user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Set hostname to accept connections from any IP
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
