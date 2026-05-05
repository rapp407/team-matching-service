# team-matching-service

Basic Node.js project initialization for this repository.

## Requirements

- Node.js 18+ (tested on Node.js 22)

## Install

```bash
npm install
```

## Database Setup

See [migrations/README.md](migrations/README.md) for database initialization steps.

Minimal:
1. Ensure Docker containers are running: `docker compose up -d`
2. Run migration via pgAdmin or CLI (see migrations/README.md)

## Run

```bash
npm run dev
```

or

```bash
npm start
```

## Environment

Copy `.env.example` to `.env` and adjust values as needed.