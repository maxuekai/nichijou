FROM node:22-slim AS base
RUN corepack enable pnpm

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY packages/agent/package.json packages/agent/
COPY packages/core/package.json packages/core/
COPY packages/channel-wechat/package.json packages/channel-wechat/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/*/node_modules/
COPY . .
RUN pnpm build

FROM base AS runner
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/ai/dist ./packages/ai/dist
COPY --from=builder /app/packages/ai/package.json ./packages/ai/
COPY --from=builder /app/packages/agent/dist ./packages/agent/dist
COPY --from=builder /app/packages/agent/package.json ./packages/agent/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/channel-wechat/dist ./packages/channel-wechat/dist
COPY --from=builder /app/packages/channel-wechat/package.json ./packages/channel-wechat/
COPY --from=builder /app/packages/plugin-sdk/dist ./packages/plugin-sdk/dist
COPY --from=builder /app/packages/plugin-sdk/package.json ./packages/plugin-sdk/
COPY --from=builder /app/packages/web/dist ./packages/web/dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

EXPOSE 3000
VOLUME ["/root/.nichijou"]

CMD ["node", "packages/core/dist/cli.js", "start"]
