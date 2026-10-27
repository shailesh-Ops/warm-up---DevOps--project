
        # base common stage 
FROM node:alpine3.23 AS base 

WORKDIR /app


COPY package.*json  ./

        # development stage 

RUN --mount=type=cache,target=/root/.npm \
        npm ci


COPY .  .

ENV NODE_ENV=developemt

EXPOSE 4000

CMD [ "npm"  , "start" ]



FROM node:26-slim AS prod 

WORKDIR /app

USER node

COPY --from=dev --chown=node:node  package.*json  /dist  ./app/ 

ENV NODE_ENV=production

EXPOSE 4000

CMD [ "npm", "run", "dev" , " -- " , " --host", "0.0.0.0" ]
