FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3230 CLUEKEEPER_DATABASE_PATH=/data/cluekeeper.sqlite
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY --from=build /app/LICENSE ./LICENSE
USER node
EXPOSE 3230
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "const origin=process.env.CLUEKEEPER_ORIGIN;fetch('http://127.0.0.1:3230/api/health',{headers:origin?{host:new URL(origin).host}:{}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
