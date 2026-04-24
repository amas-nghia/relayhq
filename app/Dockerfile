FROM oven/bun:1 AS base

WORKDIR /workspace/app

COPY app/package.json ./package.json
RUN bun install

CMD ["bun", "run", "dev"]
