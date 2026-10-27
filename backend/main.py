"""FastAPI 엔트리 — 라우터 조립 + CORS + 프론트 정적 서빙."""
from __future__ import annotations

import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db import close_pool, open_pool
from routers import admin, auth, folders, generate, refs, settings as settings_router, templates, usage

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

for r in (auth.router, generate.router, refs.router, usage.router, folders.router, templates.router, admin.router, settings_router.router):
    app.include_router(r)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# 프론트 빌드가 있으면 정적 서빙(SPA 폴백). Render에서 백엔드가 프론트까지 서빙.
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    # index.html은 늘 새로 확인하게 한다(no-cache = 매번 서버에 물어보고 안 바뀌었으면 304).
    # 지정이 없으면 브라우저가 예전 index.html을 재사용해, 배포 후 새로고침해도 예전 화면이 뜰 수 있다.
    # (assets/ 파일은 이름에 해시가 붙어 바뀌면 이름이 달라지므로 그대로 둔다)
    _NO_CACHE = {"Cache-Control": "no-cache"}

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file() and candidate.name != "index.html":
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html", headers=_NO_CACHE)
