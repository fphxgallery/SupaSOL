FROM node:20-alpine AS builder
WORKDIR /app

# Build tools required by native modules pulled in by Solana packages
# (usb → Ledger wallet support, node-gyp needs python3 + make + g++)
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

# Copy workspace root files (including .npmrc for legacy-peer-deps)
COPY package*.json ./
COPY .npmrc ./
COPY frontend/package*.json ./frontend/

# Install only frontend deps
RUN npm ci --workspace=frontend

COPY frontend/ ./frontend/

# Build args for Vite env vars (baked into the JS bundle at build time)
ARG VITE_API_BASE=http://localhost:4000
ARG VITE_RPC_URL=https://api.mainnet-beta.solana.com
ARG VITE_CLUSTER=mainnet-beta

ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_RPC_URL=$VITE_RPC_URL
ENV VITE_CLUSTER=$VITE_CLUSTER

RUN npm run build --workspace=frontend

# Final stage: just nginx serving the static dist — no Node, no build tools
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
