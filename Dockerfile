FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev --no-audit --no-fund

COPY prisma ./prisma
COPY prisma7.config.ts ./
COPY tsconfig.json ./
COPY src ./src

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]