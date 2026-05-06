# Events API — NestJS feature enhancement

A small NestJS service that manages users and events on PostgreSQL, and
exposes a `mergeAll` operation that collapses every overlapping event a
given user is invited to into a single event.

Stack: NestJS 11, TypeScript 5.7, TypeORM 0.3 on PostgreSQL 16, validated
with `class-validator` + `joi`, documented with `@nestjs/swagger`, tested
with Jest + `supertest` + `@testcontainers/postgresql`.

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker (for the local Postgres and the e2e Testcontainers)

## Run the project

```bash
cp .env.example .env
npm install

docker compose up -d        # local Postgres on port 5432
npm run seed                # optional: demo users + overlapping events
npm run start:dev
```

Then open:

- `http://localhost:3000`     — landing page with the endpoint list
- `http://localhost:3000/api` — **Swagger UI** (try every endpoint here)

The seed script is idempotent. It truncates `users` and `events`, inserts
3 users and 4 events for Ada (the first 3 overlap so the merge endpoint
has something to do), and prints a ready-to-paste `curl` command.

### Environment

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

The `joi` schema in `src/config/env.validation.ts` rejects boot if any of
these is missing or has the wrong type.

## Run the tests

```bash
npm test            # unit tests (with the merge.ts coverage gate)
npm run test:cov    # unit tests + full coverage report
npm run test:e2e    # boots an isolated Postgres via Testcontainers
npm run lint
```

Three layers:

1. **Pure unit tests** for the merge algorithm — table-driven cases for
   empty input, singletons, non-overlap, touching boundaries, strict
   overlap, nested, chained, mixed, every tie-breaker, idempotency, and
   input immutability.
2. **Service unit tests** — mocked repositories + DataSource for
   `UsersService` and `EventsService`, including the merge flow (404,
   no-op, save+remove path, lock acquisition).
3. **E2E tests** — bootstrap the full Nest app against a real Postgres
   in a throw-away container, asserting both response shapes **and**
   post-call DB state (deleted rows are gone, merged rows exist with the
   right invitees, etc.).

`npm run test:cov` enforces **100% statements / branches / functions /
lines on `src/events/merge/merge.ts`** via Jest's `coverageThreshold`.

CI (`.github/workflows/ci.yml`) runs lint, build, the unit suite with
coverage, and the e2e suite on every push and pull request.

## Endpoints

Use Swagger UI at `/api` for the full request/response schema, examples,
and an interactive "Try it out" panel. Summary:

| Method | Path                                  | Purpose                                   |
| ------ | ------------------------------------- | ----------------------------------------- |
| POST   | `/users`                              | Create a user                             |
| GET    | `/users/:id`                          | Retrieve a user with their event ids      |
| POST   | `/events`                             | Create an event (with optional invitees)  |
| GET    | `/events/:id`                         | Retrieve an event with its invitees       |
| DELETE | `/events/:id`                         | Delete an event (returns 204)             |
| POST   | `/users/:userId/events/merge`         | Merge overlapping events for the user     |

All endpoints accept and return JSON. Validation errors return `400`
with an array of human-readable messages; missing resources return `404`.

## Merge semantics

Two events overlap when **`next.startTime < current.endTime`** (strict
inequality, so back-to-back events that only touch at a boundary are NOT
merged — `[14:00–15:00]` and `[15:00–16:00]` stay as two events).

Each connected component of overlapping events is replaced by a single new
event with these tie-breakers:

| Field         | Rule                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `startTime`   | Minimum of the source `startTime`s                                   |
| `endTime`     | Maximum of the source `endTime`s                                     |
| `title`       | Source titles joined with ` \| `, in original chronological order    |
| `description` | Non-empty source descriptions joined with ` \| `; null if all empty  |
| `status`      | Highest priority wins: `IN_PROGRESS` > `TODO` > `COMPLETED`          |
| `invitees`    | Set union of the source invitee user IDs                             |

The algorithm is a pure function in
[`src/events/merge/merge.ts`](src/events/merge/merge.ts) with no NestJS or
TypeORM coupling, which makes it trivially unit-testable. The service
layer ([`EventsService.mergeAllForUser`](src/events/events.service.ts))
wraps it in a single transaction with a `pessimistic_write` lock on the
user row to serialize concurrent merges, then deletes source rows and
inserts the merged ones. The operation is idempotent.

## Design notes

- **Why `repository.remove` instead of `delete` for events?** TypeORM
  only cascades the M2M join rows when the entity is materialised in
  memory. `remove(entity)` clears `event_invitees` rows automatically;
  `delete({ id })` would leave orphans.
- **Why a pessimistic lock on the user row during merge?** Two concurrent
  merge calls for the same user could otherwise read the same source
  events, both insert "merged" rows, and double-count invitees. Locking
  the user row serialises them without taking a table-wide lock.
- **Why is the merge algorithm a pure function?** Trivial to unit-test
  exhaustively, and the tie-breaker rules become a single readable
  artefact instead of being scattered through the service.
- **Why Testcontainers for e2e?** Each run starts from a clean schema,
  so tests are order-independent and reproducible on any machine and on
  CI without coordinating a shared dev DB.
