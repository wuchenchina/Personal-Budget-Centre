FROM node:26-alpine AS frontend
WORKDIR /src/code/frontend
COPY code/frontend/package.json code/frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY code/frontend ./
RUN yarn build

FROM golang:1.26-alpine AS backend
WORKDIR /src/code/backend
COPY code/backend/go.mod code/backend/go.sum ./
RUN go mod download
COPY code/backend ./
RUN go test ./... && go build -o /out/budgetcentre-api ./cmd/api

FROM nginx:1.29-alpine AS web
COPY code/deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend /src/code/frontend/dist /usr/share/nginx/html

FROM alpine:3.22 AS api
RUN apk add --no-cache ca-certificates chromium fontconfig tzdata
WORKDIR /app
COPY --from=backend /out/budgetcentre-api /app/budgetcentre-api
COPY code/database /app/database
COPY code/font /app/font
RUN mkdir -p /app/storage/exports
ENV LISTEN_ADDR=:8080 \
    DATABASE_DIR=/app/database \
    FONT_DIR=/app/font \
    EXPORT_STORAGE_DIR=/app/storage/exports \
    CHROME_BIN=/usr/bin/chromium-browser
EXPOSE 8080
CMD ["/app/budgetcentre-api"]
