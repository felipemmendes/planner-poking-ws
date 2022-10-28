FROM node:16

WORKDIR .

COPY package.json .
COPY package-lock.json .

RUN npm install --production

COPY . .

ENV PORT=8080
ENV APP_URL=https://planner-poking.fmmendes.com

CMD [ "npm","start" ]