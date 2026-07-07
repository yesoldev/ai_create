# ai_create — 프론트 빌드 + 백엔드 런타임 단일 이미지 (Render 무료 웹서비스)

# --- 1) 프론트엔드 빌드 ---
FROM node:24-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2) 백엔드 런타임 (프론트 dist 포함) ---
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /fe/dist ./frontend/dist
WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1
# Render는 $PORT 를 주입한다.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
