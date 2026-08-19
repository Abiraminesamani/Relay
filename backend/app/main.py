from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.github import router as github_router
from app.api.routes.queries import router as queries_router
from app.api.routes.repositories import router as repositories_router
from app.db.session import Base, SessionLocal, engine
from app.db import models  # noqa: F401 - ensures models are registered before create_all
from app.config import settings
from app.services.agent_registry import seed_agents
from app.webhooks import router as webhooks_router
from app.chat import router as chat_router

app = FastAPI(
    title=settings.app_name,
    description="Relay Week 3 API foundation for authentication, repositories, queries, and integrations.",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_agents(db)
    finally:
        db.close()


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(repositories_router)
app.include_router(queries_router)
app.include_router(github_router)
app.include_router(webhooks_router)
app.include_router(chat_router)
