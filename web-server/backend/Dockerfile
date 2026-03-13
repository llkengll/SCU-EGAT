# Dockerfile for Node.js backend
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Use npm ci for more reliable builds in production
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
