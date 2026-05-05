# Events API — NestJS feature enhancement

A small NestJS service that manages users and events, persists them in
PostgreSQL, and exposes a `mergeAll` operation that collapses every
overlapping event a given user is invited to into a single event.

Built on top of the official `nestjs/typescript-starter`. The original
`AppController` is left untouched so the boilerplate sanity check still
passes; everything else lives under `src/users` and `src/events`.

## Highlights

- TypeORM 0.3 + PostgreSQL 16, schema synced from entity metadata
- Strict request validation via `class-validator` + a custom `IsAfter` rule
- OpenAPI / Swagger UI served from `/api`
- Consistent JSON error envelope from a global `HttpExceptionFilter`
- Pure sweep-line merge algorithm with **100% statement / branch / function /
  line coverage** enforced by Jest
- Hermetic e2e suite that boots the full Nest app against an isolated
  Postgres started via `@testcontainers/postgresql` — no shared dev DB
- GitHub Actions workflow runs lint, build, unit tests with coverage, and e2e
  on every push and pull request

## Stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | NestJS 11                                           |
| Language       | TypeScript 5.7 (strict)                             |
| ORM / DB       | TypeORM 0.3 + PostgreSQL 16                         |
| Validation     | `class-validator` + `class-transformer`             |
| Config         | `@nestjs/config` with a `joi` schema for `.env`     |
| Docs           | `@nestjs/swagger` (Swagger UI at `/api`)            |
| Tests          | Jest, `supertest`, `@testcontainers/postgresql`     |
| Lint / Format  | ESLint 9 (typed) + Prettier                         |

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker (for the local Postgres container and for the e2e Testcontainers)

## Quick start

```bash
git clone <your-fork>
cd typescript-starter

cp .env.example .env
npm install

docker compose up -d
npm run seed       # optional: insert demo users + overlapping events
npm run start:dev
```

Once the server is running:

- HTTP API : `http://localhost:3000`
- Swagger  : `http://localhost:3000/api`

`npm run seed` is idempotent — it truncates `users` and `events` and prints
the demo user IDs plus a ready-to-paste `curl` command for the merge endpoint.

## Environment

| Variable          | Default       | Notes                                            |
| ----------------- | ------------- | ------------------------------------------------ |
| `NODE_ENV`        | `development` | `development`, `test`, or `production`           |
| `PORT`            | `3000`        | HTTP port                                        |
| `DB_HOST`         | `localhost`   |                                                  |
| `DB_PORT`         | `5432`        |                                                  |
| `DB_USER`         | `app`         |                                                  |
| `DB_PASSWORD`     | `app`         |                                                  |
| `DB_NAME`         | `events`      |                                                  |
| `DB_SYNCHRONIZE`  | `true`        | Auto-sync schema from entities (dev convenience) |
| `DB_LOGGING`      | `false`       | TypeORM SQL logging                              |

The validation schema in `src/config/env.validation.ts` rejects boot if any
required variable is missing or has the wrong type.

## REST API

All endpoints accept and return JSON. Validation errors return HTTP 400 with
an array of human-readable messages; missing resources return 404.

### Users

#### `POST /users` — create a user

```bash
curl -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Ada Lovelace"}'
```

Response (`201 Created`):

```json
{ "id": "<uuid>", "name": "Ada Lovelace", "eventIds": [] }
```

#### `GET /users/:id` — fetch a user with their event ids

```bash
curl http://localhost:3000/users/<user-id>
```

### Events

#### `POST /events` — create an event

```bash
curl -X POST http://localhost:3000/events \
  -H 'content-type: application/json' \
  -d '{
    "title": "Architecture review",
    "description": "Walk through the new ingestion pipeline",
    "status": "IN_PROGRESS",
    "startTime": "2026-06-01T14:00:00.000Z",
    "endTime":   "2026-06-01T15:00:00.000Z",
    "inviteeIds": ["<ada-id>", "<grace-id>"]
  }'
```

Validation rules:

- `title` — required, non-empty, max 200 chars
- `description` — optional, max 2000 chars, nullable
- `status` — one of `TODO`, `IN_PROGRESS`, `COMPLETED`
- `startTime` / `endTime` — ISO 8601 timestamps; `endTime` must be **strictly
  after** `startTime` (enforced by the custom `@IsAfter` decorator and a
  matching DB CHECK constraint)
- `inviteeIds` — array of UUIDv4s; every id must resolve to a real user or
  the request fails with 404

#### `GET /events/:id` — fetch an event with its invitees

```bash
curl http://localhost:3000/events/<event-id>
```

#### `DELETE /events/:id` — remove an event

```bash
curl -X DELETE http://localhost:3000/events/<event-id>   # -> 204 No Content
```

Deletion uses `repository.remove`, which clears the `event_invitees` join
rows along with the event so users are no longer linked to a deleted event.

### Merge

#### `POST /users/:userId/events/merge` — merge all overlapping events for a user

```bash
curl -X POST http://localhost:3000/users/<user-id>/events/merge
```

Response (`200 OK`): the user's events after merging, ordered by
`startTime`. When no overlaps exist, the user's events are returned as-is and
no DB write happens.

Returns `404` if the user does not exist, `400` if `userId` is not a UUID.

## Merge semantics

Two events overlap when **`next.startTime < current.endTime`** (strict
inequality, so back-to-back events that only touch at a boundary are NOT
merged — `[14:00–15:00]` and `[15:00–16:00]` stay as two events).

Each connected component of overlapping events is replaced by a single new
event with the following tie-breakers:

| Field         | Rule                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `startTime`   | Minimum of the source `startTime`s                                   |
| `endTime`     | Maximum of the source `endTime`s                                     |
| `title`       | Source titles joined with ` \| `, in original chronological order    |
| `description` | Non-empty source descriptions joined with ` \| `; null if all empty  |
| `status`      | Highest priority wins: `IN_PROGRESS` > `TODO` > `COMPLETED`          |
| `invitees`    | Set union of the source invitee user IDs                             |

The algorithm itself is a pure function in
[`src/events/merge/merge.ts`](src/events/merge/merge.ts) with no NestJS or
TypeORM coupling, which makes it trivially unit-testable. The service layer
([`EventsService.mergeAllForUser`](src/events/events.service.ts)) wraps it in
a single transaction with a `pessimistic_write` lock on the user row to
serialize concurrent merges for the same user, then deletes source rows and
inserts the merged ones. The operation is idempotent: re-running it on a
canonical state produces no further changes.

## Testing

```bash
npm test            # unit tests + coverage gate on merge.ts
npm run test:cov    # full coverage report
npm run test:e2e    # spins up an isolated Postgres via Testcontainers
npm run lint
```

The test pyramid:

1. **Pure unit tests** (`src/events/merge/merge.spec.ts`) — table-driven
   coverage of the merge algorithm: empty input, singletons, non-overlap,
   touching boundaries, strict overlap, nested, chained, mixed,
   tie-breakers, idempotency, and input immutability.
2. **Service unit tests** (`*.service.spec.ts`) — repository + DataSource
   mocks for `UsersService` and `EventsService` (including the merge flow:
   404, no-op, save+remove path, lock acquisition).
3. **E2E tests** (`test/*.e2e-spec.ts`) — bootstrap the full Nest app
   against a real Postgres in a throw-away container; assert response
   shapes **and** post-call DB state (deleted rows are gone, merged rows
   exist with the right invitees, etc.).

Coverage is enforced via Jest's `coverageThreshold`:
`src/events/merge/merge.ts` must hit 100% statements, branches, functions,
and lines or `npm run test:cov` (and CI) fail.

## Project structure

```
src/
  app.module.ts                    # root module, wires config + TypeORM + features
  main.ts                          # bootstrap: ValidationPipe, exception filter, Swagger
  seed.ts                          # `npm run seed` - demo data
  common/
    filters/http-exception.filter.ts
    validators/is-after.validator.ts
  config/
    configuration.ts               # typed factory for env -> AppConfig
    env.validation.ts              # joi schema for .env
  database/
    typeorm.config.ts              # TypeOrmModule.forRootAsync options
  users/
    entities/user.entity.ts        # User (id, name, events: M2M)
    dto/                           # CreateUserDto, UserResponseDto
    users.{module,service,controller}.ts
  events/
    entities/event.entity.ts       # Event (id, title, ..., invitees: M2M)
    enums/event-status.enum.ts
    dto/                           # CreateEventDto, EventResponseDto
    events.{module,service,controller}.ts
    merge/
      merge.ts                     # pure overlap-detection + merge algorithm
      merge.controller.ts          # POST /users/:userId/events/merge
test/
  helpers/                         # Testcontainers + app factory
  *.e2e-spec.ts
.github/workflows/ci.yml           # lint + build + unit (coverage) + e2e
docker-compose.yml                 # local Postgres
```

## Design notes

- **Why `repository.remove` instead of `delete` for events?** TypeORM only
  cascades the M2M join rows when the entity is materialised in memory.
  Using `remove(entity)` lets the ORM clear `event_invitees` rows
  automatically; `delete({ id })` would leave orphaned join rows.
- **Why a pessimistic lock on the user row during merge?** Two concurrent
  `POST /users/:id/events/merge` calls for the same user could otherwise
  read the same source events, both insert "merged" rows, and double-count
  invitees. Locking the user row serialises the calls without taking a
  table-wide lock.
- **Why is the merge algorithm a pure function?** It keeps the algorithm
  trivial to unit-test, makes the tie-breaker rules a single readable
  artefact, and lets the service layer focus on transaction management.
- **Why Testcontainers and not a shared dev DB for e2e?** Each e2e run
  starts from a clean schema, so tests are order-independent and can run
  in parallel locally and on CI without coordination.
