# DevCopilot (scoped MVP)

GitHub + GitHub Actions only. One agent answers questions about the codebase (RAG),
one agent explains why a CI run failed by correlating logs against the responsible diff.

## What's already scaffolded

- `docker-compose.yml` — Postgres + FastAPI backend
- `backend/app/webhooks.py` — **working** `/webhooks/github` endpoint (push + workflow_run),
  writes to Postgres, verifies the GitHub signature
- `backend/app/db/models.py` — Commit, CIRun, RawWebhookEvent tables
- `backend/app/chat.py` — stub `/chat` endpoint (returns a placeholder reply)
- `backend/app/ingestion/index_repo.py` — RAG indexing, **not implemented yet**
- `backend/app/agents/code_rag_agent.py` — Code/RAG agent, **not implemented yet**
- `backend/app/agents/ci_correlation_agent.py` — CI correlation agent, **not implemented yet**
- `backend/app/agents/orchestrator.py` — LangGraph routing, **not implemented yet**
- `frontend/` — Next.js chat UI, already wired to call `/chat`

## Getting it running (today)

1. Copy the env file and fill in real values:
   ```
   cp .env.example .env
   ```
   You need: a GitHub personal access token with repo access, a webhook secret
   (any random string — must match what you register on GitHub), the target
   `owner/repo`, and an OpenAI API key.

2. Start Postgres + backend:
   ```
   docker-compose up --build
   ```
   Check it's alive: `curl http://localhost:8000/health`

3. Expose your local backend so GitHub can reach it, and register the webhook:
   ```
   ngrok http 8000
   ```
   Then in your GitHub repo → Settings → Webhooks → Add webhook:
   - Payload URL: `https://<your-ngrok-domain>/webhooks/github`
   - Content type: `application/json`
   - Secret: same value as `GITHUB_WEBHOOK_SECRET` in `.env`
   - Events: select "Pushes" and "Workflow runs"

4. Push a commit to the repo and confirm it lands in Postgres:
   ```
   docker exec -it devcopilot-db-1 psql -U devcopilot -d devcopilot -c "select * from commits;"
   ```
   If a row shows up, step 1 (webhook ingestion) is done. Don't move on until this works.

5. Start the frontend:
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Visit `http://localhost:3000`. It'll hit the `/chat` stub until the orchestrator is wired up.

## Build order (do these in sequence)

1. **Webhook ingestion** — already scaffolded, get it verified against your real repo (step 4 above)
2. **RAG pipeline** — implement `app/ingestion/index_repo.py`: pull repo contents, chunk with
   tree-sitter, embed, upsert into Chroma. Test standalone before wiring to an agent.
3. **Code/RAG agent** — implement `app/agents/code_rag_agent.py`, test with direct questions
   about the indexed repo.
4. **CI correlation agent** — implement `app/agents/ci_correlation_agent.py`. This is the hard,
   differentiating piece — budget the most time here. The correlation logic (matching stack
   trace lines to diff hunks) should be real Python, not just an LLM prompt.
5. **Orchestrator + streaming** — implement `app/agents/orchestrator.py`, wire it into
   `app/chat.py`, add WebSocket streaming, connect the frontend.

Each stub file has a docstring with the specific plan for that piece.
