# ---- build หน้าเว็บ (React) ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- แอป (Express API + เสิร์ฟหน้าเว็บที่ build แล้ว) ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
