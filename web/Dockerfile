FROM node:20-alpine AS base

WORKDIR /workspace/web

COPY web/package.json ./package.json
RUN npm install

CMD ["npm", "run", "dev"]
