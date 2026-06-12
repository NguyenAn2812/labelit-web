# Labelit — Agent instructions

## Quick start

Two terminals needed:

```sh
# Terminal 1: Backend (Python 3.12+, auto-creates .venv)
./run-server.sh              # http://127.0.0.1:5000

# Terminal 2: Frontend
npm install && npm run dev   # http://localhost:5173
```

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint on JS/JSX |
| `python3 app.py` | Start FastAPI directly (port 5000) |
| `python3 file_handle.py --mode split` | Split dataset into chunks |
| `python3 file_handle.py --mode merge` | Merge chunk files |

No tests exist in this repo.

## Architecture

- **Frontend**: Single `App.jsx` (833 lines, no component splitting, no router, no state lib — just `useState`)
- **Backend**: `app.py` — FastAPI with JSON file I/O (no database)
- **Stack**: React 19 + Vite 7 + SWC + Tailwind CSS 4 / FastAPI + Pydantic + Uvicorn
- **Vite proxy**: `/api` → `http://127.0.0.1:5000` (configured in `vite.config.js`)

## Data paths (hardcoded in `app.py`)

- Input: `data/annotated/split_0001.json`
- Output: `data/checked/split_0001.json`
- `data/` is in `.gitignore`

The source dataset (`../ViFABSA/data/raw/merged.json` per README) must exist for a full run, but the app works with just the annotated split files.

## Key endpoints

`GET /api/config`, `GET /api/data`, `POST /api/update`, `POST /api/update-scope`, `GET /api/annotated-count`, `GET /api/no-aspect-count`, `POST /api/reset-all`, `GET /api/stats`.

## Annotator identity

`annotator_id` is read from `.env` (`annotator_id=nguyenquanghuy`) or env var. Vite exposes this via `import.meta.env.annotator_id` (configured with `envPrefix: ["VITE_", "annotator_"]` in `vite.config.js`).

## Ontology

Entities with attributes are defined in `app.py:ENTITY_ATTRIBUTES` (7 entity types). Sentiments: `POSITIVE`, `NEGATIVE`, `NEUTRAL`. Scopes: `MICRO`, `MACRO`.

## MCP

CodeGraphContext MCP server (`cgc`) is configured in `opencode.json` for code graph queries. Index the current repo with `cgc index .` after install. Restart OpenCode after changing MCP config.

## Notes

- Only `npm run lint` for frontend; no Python linting, typechecking, or CI workflows
- No test framework or test files
- `file_handle.py` has hardcoded machine-specific paths; update before using
- `.env` is **not** gitignored (contains an annotator ID)
- Tailwind CSS 4 uses `@tailwindcss/vite` plugin, not PostCSS
- ESLint config: flat config (`eslint.config.js`) with JS recommended + react-hooks + react-refresh
