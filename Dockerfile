FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY database ./database
COPY scripts ./scripts
COPY src ./src

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]