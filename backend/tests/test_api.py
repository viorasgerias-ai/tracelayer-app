import pytest
from fastapi.testclient import TestClient

from backend import firebase_auth, main


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "test-password")
    monkeypatch.setenv("SESSION_SECRET", "test-secret-with-sufficient-entropy")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    main.app.state.decision_provider = None
    with main._login_attempts_lock:
        main._login_attempts.clear()
    return TestClient(main.app)


def _login(client):
    response = client.post(
        "/api/login",
        json={"email": "admin@example.com", "password": "test-password"},
    )
    assert response.status_code == 200


def test_project_api_requires_a_session(client):
    response = client.get("/api/projects")

    assert response.status_code == 401


def test_create_and_list_projects(client):
    _login(client)
    created = client.post(
        "/api/projects",
        json={
            "name": "Decision case",
            "product": "Context",
            "audience": "Stakeholders",
            "objective": "Choose a direction",
        },
    )
    listed = client.get("/api/projects")

    assert created.status_code == 201
    assert created.json()["project"]["name"] == "Decision case"
    assert listed.json()["projects"][0]["id"] == created.json()["project"]["id"]
    assert listed.json()["runCount"] == 0


def test_generation_requires_a_registered_provider(client):
    _login(client)
    project = client.post(
        "/api/projects",
        json={
            "name": "Decision case",
            "product": "Context",
            "audience": "Stakeholders",
            "objective": "Choose a direction",
        },
    ).json()["project"]

    response = client.post("/api/generate", json={"projectId": project["id"]})

    assert response.status_code == 503
    assert "DecisionProvider" in response.json()["detail"]


def test_generation_validates_and_persists_decision_trace(client):
    class FakeProvider:
        async def generate_decision(self, project):
            return {
                "briefing": {
                    "contexto": project["product"],
                    "objetivo": project["objective"],
                    "restricoes": [],
                    "partes_interessadas": [project["audience"]],
                },
                "extracao_de_fatos": {
                    "fatos_confirmados": ["Contexto informado"],
                    "evidencias_usadas": [],
                    "lacunas": [],
                },
                "hipoteses": [],
                "criterios": [
                    {"criterio": "Aderência", "peso": "HIGH", "motivo": "Prioridade do caso"}
                ],
                "decisao": {
                    "recomendacao": "Validar a opção",
                    "tipo": "reversivel",
                    "confianca": "media",
                    "requer_aprovacao_humana": True,
                },
                "plano": [
                    {
                        "passo": "Revisar as evidências",
                        "prioridade": "HIGH",
                        "dono": "Responsável",
                        "prazo_sugerido": "Após aprovação",
                    }
                ],
                "trilha_auditavel": {
                    "regras_aplicadas": ["Separar fatos de hipóteses"],
                    "riscos": [],
                    "versao_decisao": "provider-value",
                    "hash_referencia": "provider-value",
                },
            }

    _login(client)
    project = client.post(
        "/api/projects",
        json={
            "name": "Decision case",
            "product": "Context",
            "audience": "Stakeholders",
            "objective": "Choose a direction",
        },
    ).json()["project"]
    main.configure_decision_provider(FakeProvider())

    generated = client.post("/api/generate", json={"projectId": project["id"]})
    details = client.get(f"/api/projects/{project['id']}")

    assert generated.status_code == 200
    assert generated.json()["output"]["trilha_auditavel"]["versao_decisao"] == "decision-output.v2"
    assert details.json()["project"]["runs"][0]["id"] == generated.json()["runId"]


def test_bearer_token_is_rejected_when_firebase_is_not_configured(client):
    _login(client)
    response = client.get("/api/projects", headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401


def test_empty_bearer_token_does_not_fall_back_to_the_session(client):
    _login(client)
    response = client.get("/api/projects", headers={"Authorization": "Bearer "})

    assert response.status_code == 401


def test_non_bearer_authorization_keeps_the_session(client):
    _login(client)
    response = client.get("/api/projects", headers={"Authorization": "Basic abc"})

    assert response.status_code == 200


def test_verified_firebase_id_token_authorizes_requests(client, monkeypatch):
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "compl-p-alpha")
    monkeypatch.setattr(
        firebase_auth,
        "verify_firebase_id_token",
        lambda token: {"uid": "user-1", "email": "person@example.com"} if token == "signed-token" else {},
    )

    headers = {"Authorization": "Bearer signed-token"}
    listed = client.get("/api/projects", headers=headers)
    session = client.get("/api/session", headers=headers)
    missing = client.post("/api/generate", json={"projectId": "missing"}, headers=headers)
    rejected = client.get("/api/projects", headers={"Authorization": "Bearer signed-token-without-uid"})

    assert listed.status_code == 200
    assert listed.json()["projects"] == []
    assert session.json()["email"] == "person@example.com"
    assert missing.status_code == 404
    assert rejected.status_code == 401


def test_signed_sessions_reject_tampering_and_expiration(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-secret-with-sufficient-entropy")
    monkeypatch.setattr(main.time, "time", lambda: 100)
    token = main._build_session("admin@example.com", now=100)

    assert main._read_session(token) == {"email": "admin@example.com", "t": 100}
    assert main._read_session(token + "x") is None

    monkeypatch.setattr(main.time, "time", lambda: 100 + main.SESSION_MAX_AGE_SECONDS + 1)
    assert main._read_session(token) is None
