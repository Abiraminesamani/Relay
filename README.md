# Relay — Engineering Intelligence & AI Copilot Platform

<p align="center">
  <strong>A unified engineering intelligence copilot empowering developers with multi-agent codebase indexing, real Jira Cloud tracking, Slack notifications, GitHub insights, and semantic architectural analysis.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-production--ready-22c55e?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/backend-FastAPI%20%7C%20Python%203.10+-009688?style=for-the-badge&logo=fastapi" alt="Backend" />
  <img src="https://img.shields.io/badge/frontend-Next.js%2014%20%7C%20React%20%7C%20TypeScript-black?style=for-the-badge&logo=next.js" alt="Frontend" />
  <img src="https://img.shields.io/badge/AI%20Orchestration-LangGraph%20%7C%20LangChain-6366F1?style=for-the-badge" alt="LangGraph" />
  <img src="https://img.shields.io/badge/Vector%20Store-ChromaDB-blue?style=for-the-badge" alt="ChromaDB" />
  <img src="https://img.shields.io/badge/Jira%20Cloud-REST%20API%20v3-0052CC?style=for-the-badge&logo=jira" alt="Jira" />
  <img src="https://img.shields.io/badge/Slack-Incoming%20Webhooks-4A154B?style=for-the-badge&logo=slack" alt="Slack" />
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Agent Ecosystem](#-agent-ecosystem)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#1-environment-configuration)
  - [Running with Docker Compose](#2-running-with-docker-compose)
  - [Running Locally (Manual Setup)](#3-running-locally-manual-setup)
- [API Reference](#-api-reference)
- [Database Schema & Migrations](#-database-schema--migrations)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Security & Credential Protection](#-security--credential-protection)
- [License](#-license)

---

## 🌟 Overview

**Relay** is a full-stack, enterprise-grade AI Engineering Copilot designed to eliminate developer context switching. By bridging code repositories, issue trackers, CI/CD pipelines, and communication channels, Relay provides a single conversational command center for development teams.

Whether querying complex AST dependencies, filing prioritized Jira tickets directly from code anomalies, inspecting GitHub pull request activity, or broadcasting sprint updates to Slack channels, Relay routes each developer request to specialized intelligent agents.

---

## 🚀 Key Features

- 🧠 **Multi-Agent Orchestration**: Intelligent query classifier with LangGraph state machine routing requests across specialized agents (GitHub, Jira, Slack, Code/RAG, CI/CD).
- 🎫 **Real Jira Cloud Integration**: Bi-directional integration supporting issue creation, JQL search (`POST /rest/api/3/search/jql`), dynamic issue-type discovery (Story, Bug, Task), and sprint state analysis.
- 💬 **Repository-Aware Slack Notifications**: Broadcast pull requests, build statuses, and team announcements to custom repository-specific Slack channels or global team feeds.
- 🔍 **Semantic Code Search & RAG**: Deep codebase indexing, AST chunking, and ChromaDB vector embeddings for contextual code retrieval and architectural insights.
- 🗺️ **Interactive Architecture Visualizer**: Live component dependency graphs and module relationships visualizer.
- 🎨 **Modern Linear-Inspired Interface**: Dark graphite (`#08090A`) aesthetic with electric indigo (`#6366F1`) accents, real-time reasoning steps, and responsive layout.
- 🔒 **Enterprise Security**: JWT-based user authentication, password hashing with bcrypt, masked credential displays, and zero secret leakage.

---

## 🤖 Agent Ecosystem

Relay deploys specialized, autonomous agents orchestrated via LangGraph:

```
                      ┌─────────────────────────┐
                      │   User Intent Parser    │
                      │  (Semantic Classifier)  │
                      └────────────┬────────────┘
                                   │
         ┌──────────────┬──────────┴───────────┬──────────────┐
         ▼              ▼                      ▼              ▼
  ┌─────────────┐ ┌─────────────┐       ┌─────────────┐ ┌─────────────┐
  │ Jira Agent  │ │ Slack Agent │       │ GitHub Agent│ │ Code Agent  │
  │ (Cloud API) │ │  (Webhooks) │       │ (REST v3)   │ │ (Chroma RAG)│
  └─────────────┘ └─────────────┘       └─────────────┘ └─────────────┘
```

| Agent | Responsibilities | Supported Triggers / Actions |
|---|---|---|
| **Jira Agent** | Real-time Jira Cloud issue creation, sprint lookup, JQL queries, issue type resolution | `"Create a High Priority bug for..."`, `"What Jira tickets are open in this sprint?"` |
| **Slack Agent** | Channel messaging, incident broadcasting, notification dispatching | `"Post update to Slack: ..."` , `"Notify team about deployment..."` |
| **GitHub Agent** | Repo metadata, branch tracking, commit history, pull request status | `"Show recent commits"`, `"Summarize open PRs for smartems"` |
| **Code / RAG Agent** | Semantic code search, AST chunk retrieval, syntax and implementation queries | `"Where is JWT authentication implemented?"`, `"Explain the database models"` |
| **CI/CD Agent** | Workflow runs inspection, pipeline logs, failure diagnosis | `"Why did the latest CI run fail?"`, `"List GitHub Actions workflows"` |

---

## 🏗️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js 14 / TypeScript)                   │
│  • AI Copilot Chat (Reasoning UI)   • Repository Management & Mapping  │
│  • Visual Architecture Visualizer   • Query History & Integrations     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST / JSON / Bearer JWT
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI / Python 3.10+)                    │
│  ┌───────────────────────┐             ┌─────────────────────────────┐ │
│  │   Auth & Middleware   │             │   Repository & Event Bus    │ │
│  └───────────┬───────────┘             └──────────────┬──────────────┘ │
│              │                                        │                │
│              ▼                                        ▼                │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                     LangGraph Agent Router                        │ │
│  │   ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐   │ │
│  │   │  Jira Agent  │   │ Slack Agent  │   │ GitHub & Code Agent │   │ │
│  │   └──────┬───────┘   └──────┬───────┘   └──────────┬──────────┘   │ │
│  └──────────┼──────────────────┼──────────────────────┼──────────────┘ │
└─────────────┼──────────────────┼──────────────────────┼────────────────┘
              │                  │                      │
              ▼                  ▼                      ▼
     ┌─────────────────┐ ┌───────────────┐   ┌─────────────────────────┐
     │   Jira Cloud    │ │ Slack Webhook │   │  PostgreSQL / SQLite    │
     │  REST API v3    │ │  Dispatcher   │   │  & ChromaDB Embeddings  │
     └─────────────────┘ └───────────────┘   └─────────────────────────┘
```

---

## 💻 Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons
- **Backend API**: Python 3.10+, FastAPI, Pydantic v2, Uvicorn, AsyncIO, HTTPX
- **Orchestration & AI**: LangGraph, LangChain, OpenAI / Ollama integration
- **Databases**: SQLite (local development) / PostgreSQL (production), SQLAlchemy 2.0
- **Vector Search**: ChromaDB (persistent local & container storage)
- **Third-Party APIs**: Jira Cloud REST API v3, Slack Incoming Webhooks, GitHub REST API v3

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** >= 18.x and **npm**
- **Python** >= 3.10
- **Docker Desktop** (optional, for containerized execution)
- **Git**

---

### 1. Environment Configuration

Create a `.env` file in `backend/` (or copy `.env.example`):

```bash
cp .env.example backend/.env
```

Configure the following variables in `backend/.env`:

```ini
# ==========================================
# Database Configuration
# ==========================================
DATABASE_URL=sqlite:///./relay.db
# For PostgreSQL: postgresql+psycopg://devcopilot:devcopilot@localhost:5432/devcopilot

# ==========================================
# Security & JWT Authentication
# ==========================================
AUTH_SECRET_KEY=generate-a-strong-random-secret-key-here
AUTH_ALGORITHM=HS256
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# ==========================================
# GitHub Integration
# ==========================================
GITHUB_TOKEN=ghp_yourPersonalAccessTokenHere
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
GITHUB_REPO=owner/repository

# ==========================================
# Jira Cloud Integration (Real Cloud API)
# ==========================================
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@domain.com
JIRA_API_TOKEN=your_atlassian_api_token
JIRA_DEFAULT_PROJECT_KEY=SCRUM

# ==========================================
# Slack Integration (Default Channel Fallback)
# ==========================================
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXXXX

# ==========================================
# AI Model & Embeddings (Optional / Mockable)
# ==========================================
OPENAI_API_KEY=sk-your-openai-key-if-using-live-llm
CHROMA_PERSIST_DIR=./chroma_store
```

> ⚠️ **Important**: Never commit `backend/.env` or expose API tokens. `.gitignore` is pre-configured to block sensitive environment files and database binaries.

---

### 2. Running with Docker Compose

To start PostgreSQL and the FastAPI backend service together:

```bash
docker compose up --build
```

Access the services:
- **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)

Start the frontend in a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 3. Running Locally (Manual Setup)

#### Step 1: Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Windows:
.\.venv\Scripts\Activate.ps1
# On macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn app.main:app --reload --port 8000
```

#### Step 2: Frontend Setup
```bash
cd frontend

# Install npm dependencies
npm install

# Start Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 📖 API Reference

Interactive OpenAPI documentation is hosted locally at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc UI**: `http://localhost:8000/redoc`

### Core Endpoints

| Category | Method | Endpoint | Auth | Description |
|---|---|---|---|---|
| **Auth** | `POST` | `/auth/register` | Public | Register new user account |
| | `POST` | `/auth/login` | Public | Authenticate user & issue JWT token |
| | `GET` | `/auth/me` | Bearer | Retrieve authenticated user profile |
| **Repositories** | `GET` | `/repositories` | Bearer | List user's registered repositories |
| | `POST` | `/repositories` | Bearer | Register repository with Jira & Slack mapping |
| | `GET` | `/repositories/{id}` | Bearer | Retrieve repository details |
| | `PUT` | `/repositories/{id}` | Bearer | Update repository name, Jira key, or Slack webhook |
| | `DELETE` | `/repositories/{id}` | Bearer | Remove repository and associated mappings |
| **Copilot Chat** | `POST` | `/chat` | Public / Bearer | Execute multi-agent query with reasoning trace |
| **Queries** | `GET` | `/queries` | Bearer | Fetch historical query log |
| | `POST` | `/queries` | Bearer | Save and execute authenticated query |
| **GitHub** | `GET` | `/github/repository` | Bearer | Get live repository status & branches |
| **Webhooks** | `POST` | `/webhooks/github` | Signature | Ingest GitHub push and workflow events |
| **System** | `GET` | `/health` | Public | Service health and uptime check |

---

## 🗄️ Database Schema & Migrations

Relay features automated additive migrations on server startup. The underlying relational schema tracks:

- `users`: User identity, email, hashed credentials.
- `repositories`: Codebases with optional `jira_project_key` and encrypted `slack_webhook_url`.
- `queries` & `responses`: Historical agent interactions, execution steps, and token counts.
- `agents`: Available agent descriptors and capabilities.
- `commits` & `ci_runs`: Ingested GitHub commit logs and workflow runs.
- `raw_webhook_events`: Audit trail for third-party webhook payloads.

---

## 🧪 Testing & Quality Assurance

Relay includes an extensive automated unit and integration testing suite verifying agent routing, Jira API integration, credential masking, and repository-specific routing.

### Running Backend Unit Tests

```bash
cd backend
python -m unittest discover -s app/tests
```

**Test Coverage Highlights**:
- ✅ **60 Unit Tests Passing**:
  - `test_slack_jira_agents.py`: Jira issue generation, fallback resolution, Slack message formats, token masking.
  - `test_repository_aware_integrations.py`: Multi-repository routing, database CRUD, webhook masking, priority overrides.
  - `test_auth.py`, `test_repositories.py`, `test_queries.py`: Core user security and access control.

### Running Frontend Validation

```bash
cd frontend
npx tsc --noEmit
npm run build
```

---

## 🛡️ Security & Credential Protection

- **No Secret Leakage**: API tokens (Jira, GitHub, Slack) are masked in API responses (e.g. `https://hooks.slack.com/services/...****`) and sanitized from error messages and logs.
- **Stateless Authentication**: JWT tokens signed with HMAC-SHA256 with strict expiration timestamps.
- **Repository Isolation**: All repository modifications and query histories are scoped to the authenticated user ID.
- **Pre-configured Git Hygiene**: All sensitive configuration files (`.env`, `.env.*`, `relay.db`, `*.sqlite3`, `chroma_store/`) are strictly ignored.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
