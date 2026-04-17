# Repository Guidelines

## Project Structure & Module Organization
`backend/` contains the Rust service. Main entrypoints live in `src/main.rs` and `src/lib.rs`; HTTP handlers are in `src/handlers/`, business logic in `src/services/`, and schema/config support in files such as `src/routes.rs`, `src/graphql.rs`, and `src/config.rs`. Database migrations live in `backend/migrations/`, benchmarks in `backend/benches/`, and backend tests in `backend/tests/unit/` and `backend/tests/integration/`.

`frontend/` is a Vite + React + TypeScript app. Route pages live in `src/pages/`, shared UI in `src/components/`, API clients in `src/api/`, and reusable state/query hooks in `src/hooks/`. Frontend unit tests sit beside code in `__tests__/` folders; Playwright specs are in `frontend/tests/e2e/`. Shared scripts and packaging helpers live in `scripts/`.

## Build, Test, and Development Commands
Use the top-level `Makefile` for common workflows:

- `make build` builds the Rust backend in release mode and the frontend bundle.
- `make run` starts backend on `:3000` and frontend on `:5173`.
- `make test` runs backend library tests and frontend Vitest tests.
- `make test-e2e` runs Playwright browser tests.
- `make bench` runs Criterion benchmarks from `backend/benches/`.

Direct commands are also used frequently: `cd backend && cargo test`, `cd frontend && npm run dev`, `cd frontend && npm run build`.

## Coding Style & Naming Conventions
Frontend code uses TypeScript, 2-space indentation, and PascalCase component files such as `ProgressMonitor.tsx`. Hooks use `useX` names, utilities use camelCase, and tests use `*.test.ts` or `*.test.tsx`. Run `cd frontend && npm run lint` before opening a PR.

Backend code follows standard Rust formatting and naming: 4-space indentation, `snake_case` modules/functions, and focused service modules such as `scanner.rs` or `subtitle.rs`. Format Rust changes with `cargo fmt`.

## Testing Guidelines
Add or update tests with every behavior change. Backend unit coverage belongs in `backend/tests/unit/`; cross-module or API behavior belongs in `backend/tests/integration/`. Frontend component, hook, and API tests should stay close to the code they cover in `__tests__/`. Use Playwright only for user-visible flows that need browser coverage.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit prefixes such as `ci:`, `build:`, and `refactor:`. Keep that format and write imperative summaries, for example `feat: add task queue metrics endpoint`.

PRs should include a short problem statement, a summary of the change, test evidence (`make test`, targeted `cargo test`, `npm run test:e2e` when relevant), and screenshots for frontend changes. Call out migration, Docker, or config impacts explicitly.
