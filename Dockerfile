# Node 24.22.1 LTS (parche de seguridad del 21-oct-2026) sobre Debian bookworm slim.
# Para fijar la imagen exacta (builds 100% reproducibles), usa el digest multiplataforma:
#   --build-arg NODE_VERSION=24.22.1-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ARG NODE_VERSION=24.22.1-slim
FROM node:${NODE_VERSION}

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Comprueba al construir que la imagen no trae un Node vulnerable
RUN node -e "const [a,b,c]=process.versions.node.split('.').map(Number); if(a<24||(a===24&&(b<22||(b===22&&c<1)))){console.error('Node '+process.version+' < 24.22.1');process.exit(1)}"

EXPOSE 3000
CMD ["node", "server.js"]
