"""Optional Firebase ID token verification.

Uses Application Default Credentials and FIREBASE_PROJECT_ID. No service
account key is read from the repository. When FIREBASE_PROJECT_ID is unset,
bearer tokens are rejected and the cookie session remains available.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)
_init_lock = threading.Lock()

_REJECTED_TOKEN_ERRORS = {
    "ExpiredIdTokenError",
    "InvalidIdTokenError",
    "RevokedIdTokenError",
    "UserDisabledError",
    "UserNotFoundError",
    "ValueError",
}


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip()


def _ensure_app(project_id: str) -> None:
    import firebase_admin
    from firebase_admin import credentials

    with _init_lock:
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(
                credentials.ApplicationDefault(),
                {"projectId": project_id},
            )


def verify_firebase_id_token(token: str) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado.")

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise HTTPException(status_code=401, detail="Não autenticado.")

    try:
        from firebase_admin import auth as firebase_auth
    except ImportError as error:
        raise HTTPException(status_code=503, detail="Verificação Firebase indisponível.") from error

    try:
        _ensure_app(project_id)
        decoded = firebase_auth.verify_id_token(token)
    except HTTPException:
        raise
    except Exception as error:
        if error.__class__.__name__ in _REJECTED_TOKEN_ERRORS:
            logger.info("Token Firebase rejeitado (%s).", error.__class__.__name__)
            raise HTTPException(status_code=401, detail="Não autenticado.") from error
        logger.exception("Falha ao verificar o token do Firebase.")
        raise HTTPException(status_code=503, detail="Verificação Firebase indisponível.") from error

    if not isinstance(decoded, dict):
        raise HTTPException(status_code=401, detail="Não autenticado.")
    return decoded


def user_from_id_token(token: str) -> dict[str, Any]:
    decoded = verify_firebase_id_token(token)
    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    email = decoded.get("email")
    return {
        "uid": uid,
        "email": email if isinstance(email, str) else "",
        "firebase": True,
    }
