FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
COPY prisma7.config.ts ./
COPY tsconfig.json ./
COPY src ./src

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npx prisma generate

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]