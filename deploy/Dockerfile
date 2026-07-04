# マルチステージ:web をビルド → FastAPI の StaticFiles で同一オリジン配信(docs/03 CD)。
# ビルドコンテキストはリポジトリルート(deploy/docker-compose.yml の context: ..)。

# 1) web をビルド
FROM node:20-slim AS front
WORKDIR /front
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build            # → /front/dist

# 2) server + 静的配信
FROM python:3.12-slim AS app
WORKDIR /app
COPY apps/server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/server/ ./
COPY --from=front /front/dist ./static      # FastAPI StaticFiles で配信
EXPOSE 8000
# 位置状態はインメモリのため 1 ワーカー固定(docs/02 §9)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
