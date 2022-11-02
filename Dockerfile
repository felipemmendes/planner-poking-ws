FROM node:16

WORKDIR .

COPY package.json .
COPY package-lock.json .

RUN npm install --production

COPY . .

ENV PORT=8080
ENV APP_URL=https://planner-poking.fmmendes.com
ENV REDIS_URL=redis://default:42e031d6c3314edba674a8f319fdbcce@fly-damp-grass-4721.upstash.io

CMD [ "npm","start" ]