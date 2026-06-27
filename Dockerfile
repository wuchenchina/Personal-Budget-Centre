FROM node:26-alpine AS frontend
WORKDIR /src/code/frontend
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG all_proxy
ARG no_proxy
RUN (corepack enable && corepack prepare yarn@1.22.22 --activate) || npm install -g yarn@1.22.22
COPY code/frontend/package.json code/frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY code/frontend ./
RUN yarn build

FROM golang:1.26-alpine AS backend
WORKDIR /src/code/backend
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG all_proxy
ARG no_proxy
COPY code/backend/go.mod code/backend/go.sum ./
RUN go mod download
COPY code/backend ./
RUN go build -o /out/budgetcentre-api ./cmd/api

FROM nginx:1.29-alpine AS web
COPY code/deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend /src/code/frontend/dist /usr/share/nginx/html

FROM nginx:1.29-alpine AS web-prebuilt
COPY code/deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY build/deploy/frontend /usr/share/nginx/html

FROM alpine:3.22 AS api-runtime
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG all_proxy
ARG no_proxy
RUN apk add --no-cache ca-certificates fontconfig tzdata
WORKDIR /app
RUN mkdir -p /app/storage/exports /app/storage/tmp/pdf /app/storage/logs
ENV LISTEN_ADDR=:8080 \
    DATABASE_DIR=/app/database \
    FONT_DIR=/app/font \
    EXPORT_STORAGE_DIR=/app/storage/exports \
    EXPORT_TEMP_DIR=/app/storage/tmp/pdf \
    APP_LOG_FILE=/app/storage/logs/app.log
EXPOSE 8080
CMD ["/app/budgetcentre-api"]

FROM api-runtime AS api
COPY --from=backend /out/budgetcentre-api /app/budgetcentre-api
COPY code/database /app/database
COPY code/font /app/font
RUN test -f /app/font/PingFang-HK-Regular.ttf \
    && test -f /app/font/PingFang-SC-Regular.ttf \
    && test -f /app/font/Songti-SC-Regular.ttf \
    && test -f /app/font/Songti-TC-Regular.ttf
RUN chmod +x /app/budgetcentre-api

FROM api-runtime AS api-prebuilt
COPY build/deploy/backend/budgetcentre-api /app/budgetcentre-api
COPY code/database /app/database
COPY code/font /app/font
RUN test -f /app/font/PingFang-HK-Regular.ttf \
    && test -f /app/font/PingFang-SC-Regular.ttf \
    && test -f /app/font/Songti-SC-Regular.ttf \
    && test -f /app/font/Songti-TC-Regular.ttf
RUN chmod +x /app/budgetcentre-api
