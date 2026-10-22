# syntax=docker/dockerfile:1
# kappa-docs — Next.js standalone server (API routes: sitemap.xml, llms.txt, raw-markdown, resolve-path).
# kappa-docs deploys as an independent pnpm workspace package (see .github/dependabot.yml note).
#   docker build packages/kappa-docs
# Deploys behind traefik on kappa.mildlyawesome.com (see dedicated-server-ops config/services/kappa-docs.json).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "./server.js"]