import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]

bearer = HTTPBearer()


def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")


def require_manager(payload: dict = Depends(verify_jwt)) -> dict:
    role = payload.get("user_metadata", {}).get("role") or payload.get("role")
    if role != "manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return payload
