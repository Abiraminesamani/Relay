from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import Base, engine
from app.db import models  # noqa: F401 - ensures models are registered before create_all
from app.webhooks import router as webhooks_router
from app.chat import router as chat_router

app = FastAPI(title="DevCopilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Fine for hackathon speed; swap for Alembic migrations if this ever needs to survive schema changes.
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(webhooks_router)
app.include_router(chat_router)
