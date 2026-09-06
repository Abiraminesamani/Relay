from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import (
    AuthResponse,
    GoogleAuthRequest,
    GoogleOAuthUrlResponse,
    UserCreate,
    UserLogin,
    UserRead,
)
from app.services.auth_service import (
    authenticate_with_google,
    get_google_auth_url,
    login_user,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    return register_user(db, payload)


@router.post("/login", response_model=AuthResponse, summary="Authenticate an existing user")
def login(payload: UserLogin, db: Session = Depends(get_db)):
    return login_user(db, payload.email, payload.password)


@router.post(
    "/google",
    response_model=AuthResponse,
    summary="Sign in or register with Google OAuth / ID Token",
)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    return authenticate_with_google(db, payload)


@router.get(
    "/google/url",
    response_model=GoogleOAuthUrlResponse,
    summary="Get Google OAuth authorization URL",
)
def google_auth_url():
    return get_google_auth_url()


@router.get("/me", response_model=UserRead, summary="Get the current authenticated user")
def me(current_user: User = Depends(get_current_user)):
    return current_user
