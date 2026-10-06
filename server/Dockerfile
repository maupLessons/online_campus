FROM node:24.21.0-alpine AS build

RUN npm install --global npm@11.21.0

WORKDIR /app

COPY package*.json .npmrc ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:24.21.0-alpine AS production

RUN npm install --global npm@11.21.0

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json .npmrc ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "dist/main.js"]
