FROM node:24.17.0-alpine AS build

WORKDIR /app

COPY package*.json .npmrc ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:24.17.0-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json .npmrc ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "dist/main.js"]
