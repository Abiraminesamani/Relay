# Relay

**An engineering intelligence platform that gives developers a single place to work with repository, GitHub, CI/CD, documentation, and code information.**

![Status](https://img.shields.io/badge/status-week%203%20vertical%20slice-yellow)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688)
![Frontend](https://img.shields.io/badge/frontend-Next.js-black)
![Database](https://img.shields.io/badge/database-PostgreSQL-336791)
![License](https://img.shields.io/badge/license-unspecified-lightgrey)

This repository contains the Week 3 core-development vertical slice: a FastAPI backend with
PostgreSQL persistence, token authentication, protected repository and query APIs, a GitHub
integration foundation, and a LangGraph agent-routing boundary.

---

## Table of Contents

- [Week 3 Status](#week-3-status)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Setup](#setup)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [GitHub Integration](#github-integration)
- [Testing and Validation](#testing-and-validation)
- [Workflow Documentation](#workflow-documentation)
- [Security and Git History](#security-and-git-history)

---

## Week 3 Status

### ✅ Implemented

| Area | Detail |
| --- | --- |
| Infrastructure | Docker Compose development setup for PostgreSQL and FastAPI |
| Data models | SQLAlchemy models for users, repositories, queries, responses, agents, commits, CI runs, and raw GitHub webhook events |
| Auth | User registration, login, password hashing, and signed access tokens |
| Auth | Authenticated current-user endpoint |
| Repositories | Authenticated repository CRUD with user-ownership checks |
| Queries | Authenticated query and response persistence |
| GitHub | Repository metadata, branches, recent commits, and pull request retrieval |
| GitHub | Webhook signature verification and persistence for push and workflow-run events |
| Agents | LangGraph routing between GitHub, Code, and CI/CD agent boundaries |
| Retrieval | Chroma-compatible retrieval foundation used by the Code agent when indexed data exists |
| Frontend | Next.js chat screen connected to the `/chat` API |
| Docs | FastAPI OpenAPI documentation at `/docs` |

### 🚧 Planned or Incomplete

- Login and registration screens in the frontend
- Authenticated dashboard and repository-management UI
- Automated authentication, repository, and query tests
- Alembic migrations — startup currently initializes tables with SQLAlchemy `create_all`
- Complete repository ingestion, chunking, embedding, and incremental RAG indexing
- Complete CI failure correlation and production LLM workflow
- Jira, Slack, monitoring, and other specialized integrations
- WebSocket streaming and full conversation history UI

> **Note:** The project does not present incomplete agents or RAG ingestion as finished functionality.

---

## Architecture

```text
Next.js / React / TypeScript frontend
                |
                v
FastAPI REST API and OpenAPI documentation
                |
                v
Authentication and service layer
                |
                +--> PostgreSQL structured data
                +--> GitHub REST API and webhooks
                +--> LangGraph orchestrator
                          |
                          +--> GitHub Agent
                          +--> Code/RAG Agent
                          +--> CI/CD Agent foundation
                |
                +--> Chroma vector-store foundation
```

---

## Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS |
| **Backend** | Python, FastAPI, SQLAlchemy, Pydantic |
| **Data** | PostgreSQL, Chroma-compatible persistent vector store |
| **AI foundation** | LangGraph, LangChain, OpenAI-compatible configuration |
| **Integrations** | GitHub REST API and GitHub webhooks |
| **Development** | Docker Compose, Uvicorn, npm |

---

## Setup

### Prerequisites

- Docker Desktop with Compose support
- Node.js and npm
- Python 3.10 or newer for running the backend outside Docker

### 1. Environment

Copy the example file and set local values:

```powershell
Copy-Item .env.example .env
```

The `.env.example` file contains placeholders and local development defaults only. Configure
these variables in `.env`; **never commit that file or place credentials in frontend source code:**

```env
DATABASE_URL=postgresql+psycopg://devcopilot:devcopilot@localhost:5432/devcopilot
AUTH_SECRET_KEY=replace-with-a-long-random-value
GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=
GITHUB_REPO=owner/repository
OPENAI_API_KEY=
CHROMA_PERSIST_DIR=./chroma_store
```

GitHub and OpenAI credentials are optional for the core authentication and repository APIs.
GitHub features return a clear configuration error when GitHub settings are missing.

### 2. Run with Docker

From the repository root:

```powershell
docker compose up --build
```

This starts PostgreSQL on port `5432` and the backend on port `8000`.

Check the backend:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/health
```

Start the frontend in a second terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open `http://localhost:3000`. If that port is already in use, Next.js reports another local
port, such as `http://localhost:3001`.

Stop the services with:

```powershell
docker compose down
```

### 3. Run the Backend Locally (Alternative)

Use Docker only for PostgreSQL, then run these commands from `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

---

## API Reference

Interactive API documentation is available at:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Authentication

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | No | Create a user and return an access token |
| `POST` | `/auth/login` | No | Verify credentials and return an access token |
| `GET` | `/auth/me` | Bearer | Return the authenticated user |

### Repositories

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/repositories` | Bearer | Create a repository |
| `GET` | `/repositories` | Bearer | List the user's repositories |
| `GET` | `/repositories/{repository_id}` | Bearer | Retrieve an owned repository |
| `PUT` | `/repositories/{repository_id}` | Bearer | Update an owned repository |
| `DELETE` | `/repositories/{repository_id}` | Bearer | Delete an owned repository |

> Repository URLs are validated, and a repository URL can only be registered once per user.

### Queries

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/queries` | Bearer | Create a query and persist its response |
| `GET` | `/queries` | Bearer | List the user's queries |
| `GET` | `/queries/{query_id}` | Bearer | Retrieve an owned query and responses |
| `GET` | `/queries/{query_id}/responses` | Bearer | List responses for an owned query |
| `POST` | `/chat` | No | Compatibility endpoint for the frontend chat screen |

### GitHub and System Endpoints

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Check backend availability |
| `GET` | `/github/repository` | Bearer | Retrieve configured GitHub repository activity |
| `POST` | `/webhooks/github` | GitHub signature | Receive push and workflow-run events |

---

## Database Schema

The backend currently creates these tables at startup:

| Table | Purpose |
| --- | --- |
| `users` | Registered users and password hashes |
| `repositories` | Repositories owned by users |
| `queries` | Developer questions and ownership metadata |
| `responses` | Responses associated with queries |
| `agents` | Registered agent names, types, and descriptions |
| `commits` | Commit data received from GitHub push events |
| `ci_runs` | GitHub Actions workflow-run data |
| `raw_webhook_events` | Raw received webhook payloads for troubleshooting |

Primary keys, foreign keys, indexes, ownership filters, uniqueness constraints, and useful
length checks are defined in `backend/app/db/models.py`. Passwords are stored as hashes, and
external API secrets are not stored in these tables.

To inspect the running PostgreSQL schema:

```powershell
docker compose exec db psql -U devcopilot -d devcopilot -c "\dt"
docker compose exec db psql -U devcopilot -d devcopilot -c "\d users"
docker compose exec db psql -U devcopilot -d devcopilot -c "\d repositories"
```

---

## GitHub Integration

The GitHub client reads `GITHUB_TOKEN` and `GITHUB_REPO` from the backend environment. It
retrieves repository metadata, branches, recent commits, and pull requests through the GitHub
REST API. Missing configuration, authentication failures, and missing repositories produce
explicit API errors — fake GitHub data is never returned.

The `/webhooks/github` endpoint verifies `X-Hub-Signature-256` when `GITHUB_WEBHOOK_SECRET` is
configured, and persists push and workflow-run payloads.

To expose a local webhook endpoint for testing, use a tunneling tool such as ngrok and register:

```text
https://YOUR-DOMAIN/webhooks/github
```

with **Push** and **Workflow runs** events enabled in GitHub.

---

## Testing and Validation

Available checks:

```powershell
Set-Location backend
python -m compileall -q app
python -m pytest

Set-Location ..\frontend
npm run build
```

The frontend production build and backend Python compilation currently pass. The repository
still needs the Week 3 automated test suite for authentication, repository ownership/CRUD, and
query behavior.

> The first `npm run lint` invocation may ask Next.js to create an ESLint configuration.

---

## Workflow Documentation

**Authenticated request flow:**

```text
User
  -> register or login
  -> receive bearer token
  -> call protected repository/query APIs
  -> service layer validates ownership
  -> PostgreSQL persists the data
```

**Query flow:**

```text
Developer query
  -> FastAPI query service
  -> LangGraph intent routing
  -> GitHub, Code, or CI/CD agent boundary
  -> persisted response
```

Advanced RAG ingestion, full CI correlation, and additional engineering-system agents remain
planned for later milestones.

---

## Security and Git History

- Do not commit `.env`, API keys, tokens, passwords, `node_modules`, `.next`, virtual
  environments, or Python caches.
- Rotate any credential that has been exposed and replace it only in local `.env`.
- Keep GitHub and LLM credentials on the backend — never in frontend source.
- Use focused commits for completed work, for example:

```text
feat: configure PostgreSQL database foundation
feat: implement authentication APIs
feat: add protected repository CRUD APIs
feat: add query and response API
feat: add GitHub integration foundation
feat: add LangGraph routing foundation
docs: document Week 3 workflow and API
test: add authentication and repository tests
```
