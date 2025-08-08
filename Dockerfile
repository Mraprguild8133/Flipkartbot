# Telegram Flipkart Bot Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001
RUN chown -R botuser:nodejs /app
USER botuser

# Expose port 5000
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Environment variables (set in deployment)
ENV NODE_ENV=production
ENV PORT=5000

# Start the bot
CMD ["node", "index.js"]

# Labels for documentation
LABEL maintainer="Telegram Bot"
LABEL description="24/7 Flipkart Shopping Assistant Bot"
LABEL version="1.0.0"
LABEL port="5000"

# Multi-stage build optimization (optional)
# FROM node:18-alpine AS base
# ... (can be extended for larger apps)

# Production optimizations
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV NPM_CONFIG_LOGLEVEL=warn