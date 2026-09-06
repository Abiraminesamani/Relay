from __future__ import annotations

import logging
import secrets
import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.schemas.auth import (
    AuthResponse,
    GoogleAuthRequest,
    GoogleOAuthUrlResponse,
    UserCreate,
)

logger = logging.getLogger(__name__)


def register_user(db: Session, payload: UserCreate) -> AuthResponse:
    existing_user = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthResponse(access_token=create_access_token(user.id, user.email), user=user)


def login_user(db: Session, email: str, password: str) -> AuthResponse:
    user = db.query(User).filter(User.email == email.lower()).first()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return AuthResponse(access_token=create_access_token(user.id, user.email), user=user)


def authenticate_with_google(db: Session, payload: GoogleAuthRequest) -> AuthResponse:
    """Verify Google token or credential, auto-register or authenticate user, and issue Relay JWT."""
    email: str | None = None
    name: str | None = None

    # 1. Verify Google ID Token / Credential via tokeninfo
    if payload.credential:
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.credential}")
                if res.status_code == 200:
                    token_info = res.json()
                    email = token_info.get("email")
                    name = token_info.get("name") or token_info.get("given_name")
        except Exception as exc:
            logger.exception("Google tokeninfo validation failed: %s", exc)

    # 2. Verify Google OAuth Access Token via userinfo
    if not email and payload.access_token:
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {payload.access_token}"},
                )
                if res.status_code == 200:
                    user_info = res.json()
                    email = user_info.get("email")
                    name = user_info.get("name") or user_info.get("given_name")
                else:
                    # Fallback to tokeninfo endpoint
                    t_res = client.get(f"https://oauth2.googleapis.com/tokeninfo?access_token={payload.access_token}")
                    if t_res.status_code == 200:
                        t_info = t_res.json()
                        email = t_info.get("email")
                        name = t_info.get("name")
        except Exception as exc:
            logger.exception("Google userinfo request failed: %s", exc)

    # 3. Exchange OAuth authorization code
    if not email and payload.code:
        try:
            with httpx.Client(timeout=10.0) as client:
                token_res = client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": payload.code,
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "redirect_uri": settings.google_redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                if token_res.status_code == 200:
                    token_data = token_res.json()
                    id_token = token_data.get("id_token")
                    access_token = token_data.get("access_token")
                    if id_token:
                        v_res = client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}")
                        if v_res.status_code == 200:
                            v_info = v_res.json()
                            email = v_info.get("email")
                            name = v_info.get("name")
                    elif access_token:
                        u_res = client.get(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {access_token}"},
                        )
                        if u_res.status_code == 200:
                            u_info = u_res.json()
                            email = u_info.get("email")
                            name = u_info.get("name")
        except Exception as exc:
            logger.exception("Google authorization code exchange failed: %s", exc)

    # 4. Fallback for direct profile email
    if not email and payload.email:
        email = payload.email
        name = payload.name or email.split("@")[0]

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not verify Google authentication. Please provide a valid Google credential or access token.",
        )

    # Find or auto-register user in DB
    email_clean = email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        display_name = (name or email_clean.split("@")[0]).strip()
        random_secret = secrets.token_hex(32)
        user = User(
            name=display_name,
            email=email_clean,
            password_hash=hash_password(random_secret),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return AuthResponse(
        access_token=create_access_token(user.id, user.email),
        user=user,
    )


def get_google_auth_url() -> GoogleOAuthUrlResponse:
    """Return configured Google OAuth sign-in URL."""
    client_id = settings.google_client_id or "placeholder-google-client-id"
    redirect_uri = settings.google_redirect_uri
    scope = "openid%20email%20profile"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={scope}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return GoogleOAuthUrlResponse(url=auth_url, client_id=client_id)
