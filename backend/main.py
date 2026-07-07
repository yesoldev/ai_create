"""FastAPI 엔트리 — 라우터 조립 + CORS + 프론트 정적 서빙."""
from __future__ import annotations

import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db import close_pool, open_pool
from routers import admin, auth, folders, generate, templates, usage

FRONTEND_DIST = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    open_pool()
    yield
    close_pool()


app = FastAPI(title="ai_create", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 사내용 5명 — 배포 시 도메인으로 좁힐 것
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, generate.router, usage.router, folders.router, templates.router, admin.router):
    app.include_router(r)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# 프론트 빌드가 있으면 정적 서빙(SPA 폴백). Render에서 백엔드가 프론트까지 서빙.
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
