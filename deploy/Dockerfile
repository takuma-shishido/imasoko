# マルチステージ:web をビルド → FastAPI の StaticFiles で同一オリジン配信(docs/03 CD)。
# ビルドコンテキストはリポジトリルート(deploy/docker-compose.yml の context: ..)。

# 1) web をビルド
FROM node:20-slim AS front
WORKDIR /front
COPY apps/web/package*.json ./
RUN npm install
COPY apps/web/ ./
# 配信オリジン(OGP の og:url / og:image 用。未指定なら vite.config.ts の既定=本番)
ARG PUBLIC_ORIGIN=""
ENV VITE_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
# web をビルド → /front/dist
RUN npm run build

# 2) server + 静的配信
FROM python:3.12-slim AS app
WORKDIR /app
COPY apps/server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/server/ ./
# web の dist を static へ配置(FastAPI StaticFiles で同一オリジン配信)
# ※ Dockerfile では COPY 行の行末コメントは引数扱いになるため、コメントは必ず独立行にする
COPY --from=front /front/dist ./static
EXPOSE 8000
# 位置状態はインメモリのため 1 ワーカー固定(docs/02 §9)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
