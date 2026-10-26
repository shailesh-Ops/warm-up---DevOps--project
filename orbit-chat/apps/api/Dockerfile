
    # developemt stage 
FROM node:alpine3.23 AS dev 

WORKDIR /app

ENV NODE_ENV=developemt


COPY package.*json  ./

RUN --mount=type=cache,target=/root/.npm \
        npm i

RUN npm run db:migrate

RUN rm -rf /var/lib/apt/list/*

COPY .  .

EXPOSE 4000

CMD [ "npm"  , "start" ]



FROM node:alpine-slim AS prod 

WORKDIR /app

USER node

COPY --from=dev --chown=node:node /app/dist/ /app/dist/

ENV NODE_ENV=developemt

EXPOSE 4000

CMD [ "npm", "run", "dev" ]
