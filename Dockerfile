FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@10.15.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV DATABASE_URL=postgres://otprema:otprema@db:5432/otprema
RUN pnpm build
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
