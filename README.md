# Craftworld Companion (MVP)

Craftworld Companion is a full-stack MVP dashboard shell for Craft World player account data.

## Stack
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Auth: bcrypt + JWT
- Storage: file-based JSON (`users.json`)

## Setup
```bash
npm install
```

## Run locally
```bash
npm run dev
```
- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

## Environment variables
Copy `.env.example` to `.env` (and for server/client if desired).

- `PORT=3001`
- `JWT_SECRET=replace_me`
- `DATA_DIR=./data`
- `CRAFTWORLD_GRAPHQL_ENDPOINT=https://craft-world.gg/graphql`
- `CRAFTWORLD_AUTH_TOKEN=` (optional; when empty, Craft World dashboard sections return empty data instead of fake sample data)
- `VITE_API_BASE_URL=http://localhost:3001`

## DATA_DIR and Render
User data is stored in:
- `${DATA_DIR}/users.json`

Default data dir:
- `process.env.DATA_DIR || "./data"`

On Render, attach a persistent disk at `/var/data` and set:
- `DATA_DIR=/var/data`

## Craft World GraphQL
GraphQL query lives in:
- `server/src/services/craftworldGraphql.ts`

If `CRAFTWORLD_AUTH_TOKEN` is empty, the backend returns empty Craft World data arrays.
If token is set, backend calls `CRAFTWORLD_GRAPHQL_ENDPOINT` with the configured credentials.

> Do not commit real tokens or secrets.
