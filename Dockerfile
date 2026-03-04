FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --legacy-peer-deps

# Copy application code
COPY server ./server
COPY client ./client
COPY vite.config.js ./
COPY *.js ./

# Build React frontend
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm ci --only=production --legacy-peer-deps

# Set non-secret environment variables
# (Secrets like TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, etc. should be set in Railway Variables tab)
ENV TRADING_CAPITAL=100
ENV LEVERAGE=50
ENV POSITION_SIZE_PERCENT=25
ENV BOT_MODE=manual
ENV TRADING_PAIRS=EUR/USD,GBP/USD,AUD/USD
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the bot
CMD ["node", "server/index.js"]
