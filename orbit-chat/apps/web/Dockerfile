        # Development stage use npm install entire dependencies and compile TypeScript

FROM  node:22.23-alpine3.24  AS builder    
        # image pull from DockerHub.io

WORKDIR /app
        # notify correct path 
RUN pwd

COPY package.*json  ./
RUN --mount=type=cache,target=/root/.npm \
        npm i
        # copy souce of app that need for build  onside container  . first is local  . second is container inside copy
COPY . .

        # production grade build frontend 
RUN npm run build
RUN rm -rf /var/lib/apt/list/*

# port expose on container side 
EXPOSE 4000



FROM nginx:1.31.8-alpine3.24-slim AS runner

COPY --from=builder  /app/dist/ /usr/share/nginx/html/

RUN rm /etc/nginx/conf.d/default.conf

COPY ./nginx.conf /etc/nginx/conf.d/default.conf:ro


VOLUME [ "/etc/nginx" ]

EXPOSE 80


CMD [ "nginx", "-g" , "daemon off;" ]

# , mainline-alpine3.24-slim, 1-alpine3.24-slim, 1.31-alpine3.24-slim, 