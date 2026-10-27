
        # base common stage 
FROM node:alpine3.23 AS base 

WORKDIR /app


COPY package.*json  ./

        # development stage 
        
RUN npm i --omit=base  && mkdir -p  node_modules
RUN rm -rf /var/lib/apt/list/*

COPY .  .

ENV NODE_ENV=developemt

        # production stage 

FROM node:26-slim AS prod 

WORKDIR /app

USER node

COPY . .

        # build package's 
COPY package.*json  ./
COPY --from=base --chown=node:node  ./app/node_modules  ./node_modules 


ENV NODE_ENV=production

EXPOSE 4000

CMD [ "npm", "run", "dev"  ]
