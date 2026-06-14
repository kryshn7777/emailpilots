FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Set environment variable to let the app know it's running in Docker
ENV DOCKER=true

# Start the headless scheduler service
CMD ["npx", "ts-node", "src/index.ts"]
