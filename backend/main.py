from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Iterator, Literal, Protocol

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from backend import firebase_auth

logger = logging.getLogger(__name__)
app = FastAPI(title="TraceLayer Decision Engine")
app.state.decision_provider = None

COOKIE_NAME = "mkt_saas_session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
_login_attempts: dict[str, tuple[int, float]] = {}
_login_attempts_lock = threading.Lock()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginInput(StrictModel):
    email: str
    password: str


class ProjectInput(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    product: str = Field(min_length=1)
    audience: str = Field(min_length=1)
    objective: str = Field(min_length=1)
    offer: str = ""
    channel: str = ""
    objections: str = ""
    stage: str = ""


class DecisionProvider(Protocol):
    async def generate_decision(self, project: dict[str, Any]) -> dict[str, Any]: ...


class DecisionRepository(Protocol):
    def list_projects(self) -> tuple[list[dict[str, Any]], int]: ...

    def create_project(self, values: ProjectInput) -> dict[str, Any]: ...

    def get_project(self, project_id: str) -> dict[str, Any] | None: ...

    def save_run(
        self,
        run_id: str,
        project_id: str,
        input_json: str,
        output_json: str,
        model: str,
        created_at: str,
    ) -> None: ...


class GenerateInput(StrictModel):
    projectId: str = Field(min_length=1)


class Briefing(StrictModel):
    contexto: str = Field(min_length=1)
    objetivo: str = Field(min_length=1)
    restricoes: list[str]
    partes_interessadas: list[str]


class FactExtraction(StrictModel):
    fatos_confirmados: list[str] = Field(min_length=1)
    evidencias_usadas: list[str]
    lacunas: list[str]


class Hypothesis(StrictModel):
    hipotese: str = Field(min_length=1)
    confianca: Literal["baixa", "media", "alta"]
    como_validar: str = Field(min_length=1)


class Criterion(StrictModel):
    criterio: str = Field(min_length=1)
    peso: Literal["LOW", "MEDIUM", "HIGH"]
    motivo: str = Field(min_length=1)


class Decision(StrictModel):
    recomendacao: str = Field(min_length=1)
    tipo: str = Field(min_length=1)
    confianca: Literal["baixa", "media", "alta"]
    requer_aprovacao_humana: bool


class PlanStep(StrictModel):
    passo: str = Field(min_length=1)
    prioridade: Literal["LOW", "MEDIUM", "HIGH"]
    dono: str = Field(min_length=1)
    prazo_sugerido: str = Field(min_length=1)


class AuditTrail(StrictModel):
    regras_aplicadas: list[str] = Field(min_length=1)
    riscos: list[str]
    versao_decisao: str = Field(min_length=1)
    hash_referencia: str = Field(min_length=1)


class DecisionTrace(StrictModel):
    briefing: Briefing
    extracao_de_fatos: FactExtraction
    hipoteses: list[Hypothesis]
    criterios: list[Criterion] = Field(min_length=1)
    decisao: Decision
    plano: list[PlanStep] = Field(min_length=1)
    trilha_auditavel: AuditTrail


def _database_path() -> Path:
    return Path(os.getenv("DATABASE_PATH", "./data/tracelayer.sqlite3")).expanduser()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            product TEXT NOT NULL,
            audience TEXT NOT NULL,
            objective TEXT NOT NULL,
            offer TEXT NOT NULL DEFAULT '',
            channel TEXT NOT NULL DEFAULT '',
            objections TEXT NOT NULL DEFAULT '',
            stage TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            input_json TEXT NOT NULL,
            output_json TEXT,
            model TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def configure_decision_provider(provider: DecisionProvider) -> None:
    app.state.decision_provider = provider


def configure_repository(repository: DecisionRepository) -> None:
    app.state.repository = repository


def _repository(request: Request) -> DecisionRepository:
    repository: DecisionRepository | None = request.app.state.repository
    if repository is None:
        raise HTTPException(status_code=503, detail="Armazenamento não configurado.")
    return repository


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "product": row["product"],
        "audience": row["audience"],
        "objective": row["objective"],
        "offer": row["offer"],
        "channel": row["channel"],
        "objections": row["objections"],
        "stage": row["stage"],
        "createdAt": row["created_at"],
    }


class SQLiteDecisionRepository:
    def list_projects(self) -> tuple[list[dict[str, Any]], int]:
        with _connect() as connection:
            rows = connection.execute(
                """
                SELECT p.*,
                    (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS run_count
                FROM projects p ORDER BY p.created_at DESC
                """
            ).fetchall()
            run_count = connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
        projects = [
            {**_project_dict(row), "runCount": row["run_count"]} for row in rows
        ]
        return projects, run_count

    def create_project(self, values: ProjectInput) -> dict[str, Any]:
        project = {
            "id": uuid.uuid4().hex,
            **values.model_dump(),
            "createdAt": _now(),
        }
        with _connect() as connection:
            connection.execute(
                """
                INSERT INTO projects
                    (id, name, product, audience, objective, offer, channel, objections, stage, created_at)
                VALUES
                    (:id, :name, :product, :audience, :objective, :offer, :channel, :objections, :stage, :createdAt)
                """,
                project,
            )
        return project

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with _connect() as connection:
            project_row = connection.execute(
                "SELECT * FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
            if project_row is None:
                return None
            run_rows = connection.execute(
                "SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC",
                (project_id,),
            ).fetchall()
        runs = [
            {
                "id": row["id"],
                "inputJson": row["input_json"],
                "outputJson": row["output_json"],
                "outputText": row["output_json"],
                "model": row["model"],
                "status": row["status"],
                "createdAt": row["created_at"],
                "responseId": None,
            }
            for row in run_rows
        ]
        return {**_project_dict(project_row), "runs": runs}

    def save_run(
        self,
        run_id: str,
        project_id: str,
        input_json: str,
        output_json: str,
        model: str,
        created_at: str,
    ) -> None:
        with _connect() as connection:
            connection.execute(
                """
                INSERT INTO runs (id, project_id, input_json, output_json, model, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    project_id,
                    input_json,
                    output_json,
                    model,
                    "completed",
                    created_at,
                ),
            )


app.state.repository = SQLiteDecisionRepository()


def _session_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="SESSION_SECRET não configurado.")
    return secret.encode()


def _build_session(email: str, now: int | None = None) -> str:
    payload = json.dumps(
        {"email": email, "t": now if now is not None else int(time.time())},
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(_session_secret(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _read_session(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        encoded, signature = value.split(".", 1)
        expected = hmac.new(
            _session_secret(), encoded.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = encoded + "=" * (-len(encoded) % 4)
        session = json.loads(base64.urlsafe_b64decode(payload))
        if not isinstance(session.get("email"), str) or not isinstance(session.get("t"), int):
            return None
        age = int(time.time()) - session["t"]
        if age < 0 or age > SESSION_MAX_AGE_SECONDS:
            return None
        return session
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _require_session(request: Request) -> dict[str, Any]:
    session = _read_session(request.cookies.get(COOKIE_NAME))
    if session is None:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    return session


def get_current_user(request: Request) -> dict[str, Any]:
    token = firebase_auth.bearer_token(request)
    if token is not None:
        return firebase_auth.user_from_id_token(token)
    return _require_session(request)


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


def _login_rate_limit(client_ip: str) -> int:
    now = time.monotonic()
    with _login_attempts_lock:
        for key, (_, reset_at) in list(_login_attempts.items()):
            if now >= reset_at:
                del _login_attempts[key]
        count, reset_at = _login_attempts.get(client_ip, (0, now + LOGIN_WINDOW_SECONDS))
        if now >= reset_at:
            count, reset_at = 0, now + LOGIN_WINDOW_SECONDS
        if count >= LOGIN_MAX_ATTEMPTS:
            return max(1, int(reset_at - now))
        _login_attempts[client_ip] = (count + 1, reset_at)
    return 0


@app.get("/api/ai/health")
def provider_health(request: Request) -> dict[str, Any]:
    return {"configured": request.app.state.decision_provider is not None}


@app.get("/api/session")
def session_status(user: CurrentUser) -> dict[str, Any]:
    return {"email": user["email"]}


@app.post("/api/login")
def login(body: LoginInput, request: Request, response: Response) -> dict[str, bool]:
    client_ip = request.client.host if request.client else "unknown"
    retry_after = _login_rate_limit(client_ip)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas de login. Tente novamente mais tarde.",
            headers={"Retry-After": str(retry_after)},
        )

    email = os.getenv("ADMIN_EMAIL", "")
    password = os.getenv("ADMIN_PASSWORD", "")
    if not email or not password:
        raise HTTPException(status_code=503, detail="Credenciais administrativas não configuradas.")
    if not (
        hmac.compare_digest(body.email.encode(), email.encode())
        and hmac.compare_digest(body.password.encode(), password.encode())
    ):
        raise HTTPException(status_code=401, detail="Credenciais inválidas.")

    response.set_cookie(
        COOKIE_NAME,
        _build_session(body.email),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="lax",
        path="/",
    )
    return {"success": True}


@app.post("/api/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return {"success": True}


@app.get("/api/projects")
def list_projects(request: Request, _user: CurrentUser) -> dict[str, Any]:
    projects, run_count = _repository(request).list_projects()
    return {"projects": projects, "runCount": run_count}


@app.post("/api/projects", status_code=201)
def create_project(body: ProjectInput, request: Request, _user: CurrentUser) -> dict[str, Any]:
    project = _repository(request).create_project(body)
    return {"project": project}


@app.get("/api/projects/{project_id}")
def get_project(project_id: str, request: Request, _user: CurrentUser) -> dict[str, Any]:
    project = _repository(request).get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return {"project": project}


@app.post("/api/generate")
async def generate_decision(request: Request, body: GenerateInput, _user: CurrentUser) -> dict[str, Any]:
    project_id = body.projectId.strip()
    if not project_id:
        raise HTTPException(status_code=422, detail="projectId é obrigatório.")

    project = _repository(request).get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    provider: DecisionProvider | None = request.app.state.decision_provider
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail="Integre um DecisionProvider usando as credenciais gerenciadas pela plataforma.",
        )

    project = {key: value for key, value in project.items() if key != "runs"}
    trace_input = {key: value for key, value in project.items() if key != "createdAt"}
    try:
        output = DecisionTrace.model_validate(await provider.generate_decision(project))
    except Exception as error:
        logger.exception("O provedor de decisão falhou ou retornou uma saída inválida.")
        raise HTTPException(status_code=502, detail="Falha ao gerar uma decisão válida.") from error

    output_dict = output.model_dump()
    canonical = json.dumps(
        {"input": trace_input, "output": output_dict},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    output_dict["trilha_auditavel"]["versao_decisao"] = "decision-output.v2"
    output_dict["trilha_auditavel"]["hash_referencia"] = hashlib.sha256(
        canonical.encode()
    ).hexdigest()[:16]
    output_dict = DecisionTrace.model_validate(output_dict).model_dump()

    run_id = uuid.uuid4().hex
    created_at = _now()
    model_name = os.getenv("DECISION_MODEL", "managed-provider")
    serialized = json.dumps(output_dict, ensure_ascii=False)
    _repository(request).save_run(
        run_id,
        project_id,
        json.dumps(trace_input, ensure_ascii=False),
        serialized,
        model_name,
        created_at,
    )
    return {"success": True, "runId": run_id, "responseId": None, "output": output_dict}


@app.post("/api/analyze")
def discontinued_analyze() -> None:
    raise HTTPException(
        status_code=410,
        detail="Este endpoint foi descontinuado. Use /api/generate.",
    )
