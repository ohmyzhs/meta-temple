FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# 서버 코드 전부 (테스트는 .dockerignore 로 뺀다)
COPY *.js ./
COPY payments ./payments
USER node
EXPOSE 8080
CMD ["node", "server.js"]
