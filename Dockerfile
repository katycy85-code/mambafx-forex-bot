FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server ./server
COPY client ./client
COPY *.js ./

# Expose port
EXPOSE 3000

# Start the bot
CMD ["node", "server/index.js"]
