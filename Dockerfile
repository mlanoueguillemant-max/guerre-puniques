FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node","server.js"]
