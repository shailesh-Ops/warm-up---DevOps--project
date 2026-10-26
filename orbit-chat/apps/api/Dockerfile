
    # developemt stage 
FROM node:alpine3.23 AS dev 

WORKDIR /app

ENV NODE_ENV=developemt


COPY package.*json  ./

RUN npm i

RUN npm run db:migrate

COPY .  .

CMD [ "npm"  , "start" ]

