FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
COPY backend/package*.json ./backend/

RUN npm ci --workspace=backend

COPY backend/ ./backend/

RUN npm run build --workspace=backend

FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
COPY backend/package*.json ./backend/

RUN npm ci --workspace=backend --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
