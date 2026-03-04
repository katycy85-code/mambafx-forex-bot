FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --legacy-peer-deps

# Copy application code
COPY server ./server
COPY client ./client
COPY *.js ./

# Set environment variables
ENV TWILIO_ACCOUNT_SID=US51086caee5617fb19454ad5bb228d18c
ENV TWILIO_AUTH_TOKEN=df934059d3b2fec4c2eb0bbaf140acf3
ENV TWILIO_PHONE_NUMBER=+18448210798
ENV USER_PHONE_NUMBER=917-972-1327
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
