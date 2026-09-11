# DoctorSATask

DoctorSA is a minimal doctor marketplace where patients request visits, doctors
submit bids, patients complete a mock payment, and successful payment assigns
the selected doctor.

## Run with Docker

### Requirement

- Docker with Docker Compose

### Start the application

```bash
docker compose up --build
```

This one command:

1. Builds the TypeScript application.
2. Starts MySQL 8.4.
3. Waits for MySQL to become healthy.
4. Applies the raw SQL migrations.
5. Seeds the demo accounts.
6. Starts DoctorSA on port 3000.

Open:

```text
http://localhost:3000/login

```

## Demo accounts

| Role               | Email                 | Password      |
| ------------------ | --------------------- | ------------- |
| Patient            | `patient@example.com` | `password123` |
| Cardiology doctor  | `doctor@example.com`  | `password123` |
| Dermatology doctor | `doctor2@example.com` | `password123` |

These credentials are for local demonstration only.

#### User flow

## Patient

1. Sign in as a patient.
2. Request a visit by selecting a specialty, location, and preferred time.
3. Open the visit to view doctor bids.
4. Select a bid.
5. Complete the mock checkout.
6. Return to the visit and see the assigned doctor.

## Doctor

1. Sign in as a doctor.
2. View open requests matching the doctor’s specialty.
3. Submit a bid containing a price and short note.
4. View visits assigned after successful patient payment.

#### Visit lifecycle

```text
OPEN → BIDDING → PAID → ASSIGNED
```

- `OPEN`: The patient submitted the request.
- `BIDDING`: At least one doctor submitted a bid.
- `PAID`: The payment webhook confirmed payment.
- `ASSIGNED`: The selected doctor was assigned.

`PAID` is intentionally recorded before `ASSIGNED`, even though both transitions
happen in one webhook transaction. `VisitStatusHistory` preserves the complete
lifecycle.

#### Architecture

DoctorSA is implemented as a modular monolith with feature-first modules.

```text
doctorsa/
├── database/
│   └── migrations/
├── scripts/
│   ├── migrate-mysql.ts
│   └── seed-mysql.ts
├── src/
│   ├── config/
│   ├── infrastructure/
│   │   ├── database/
│   │   └── session/
│   ├── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── payments/
│   │   └── visits/
│   ├── public/
│   ├── shared/
│   ├── views/
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── integration/
│   └── unit/
├── Dockerfile
└── docker-compose.yml
```

Each business module is separated into:

```text
domain/
application/
infrastructure/
presentation/
```

### Domain

Contains business-facing types and repository contracts. It does not depend on
Express or MySQL

### Application

Contains use cases such as creating visits, submitting bids, selecting bids, and
processing payment webhooks.

### Infrastructure

Implements repository contracts with raw parameterised MySQL queries. It also
contains connection pooling, transactions, session persistence, HMAC signing,
and the mock payment infrastructure

### Presentation

Contains Express routes, controllers, request validation, JSON API responses,
and Mustache page controllers.

## Architecture decisions

### Modular monolith

A modular monolith keeps deployment simple while maintaining clear feature
boundaries. Microservices would add unnecessary complexity to the project hence
my decisiion to go with modular monolith.

### Raw MySQL with repository interfaces

The application uses MySQL directly through mysql2/promise. SQL is kept in the
infrastructure layer, while application services depend on repository
interfaces. This keeps business rules separate from persistence and allows the
services to be unit-tested without a database.

Raw SQL was chosen to make the locking, transaction boundaries, constraints,
and idempotency behaviour explicit. The trade-off is more manual row mapping
and less compile-time query safety.

All queries containing user-controlled values use placeholders rather than
string interpolation.

### SQL migrations

Migration files live in database/migrations and are applied by
scripts/migrate-mysql.ts.

The migration runner:

1. Applies .sql files in filename order.
2. Records applied migrations in schema_migrations.
3. Stores a SHA-256 checksum for each migration.
4. Rejects an applied migration if its contents have changed.
5. Uses MySQL GET_LOCK to prevent two application instances from migrating the
database at the same time.

MySQL DDL statements can commit implicitly, so migrations should be small,
forward-only, and safe to diagnose if a statement fails.

### Database-backed sessions

Authentication uses an HTTP-only session cookie with session data stored in
PostgreSQL.

Sessions fit the server-rendered application because:

- The browser only stores an opaque session identifier.
- Sessions can be revoked server-side.
- No JWT refresh-token workflow is required.
- Authentication state is immediately invalidated on logout.


### Mock payment provider

The payment workflow behaves like an external payment provider without requiring
real payment keys.

The mock confirmation:

1. Creates a provider-style event.
2. Serializes the event.
3. Signs it using HMAC-SHA256.
4. Delivers it to the webhook endpoint.
5. Lets the webhook perform the assignment.

### Idempotent webhook processing

Every provider event has a unique provider event ID. Webhook processing runs in
a MySQL transaction and uses row locks around the relevant visit and payment.

The event is stored in webhook_events, where provider_event_id is unique.
INSERT IGNORE safely handles concurrent delivery of the same event. A duplicate
event returns success without repeating the payment update, assignment, or
status-history transitions.

Duplicate events return success without repeating state transitions.

### Scheduling

Every visit has a 1hour interval:

```text
[preferredAt, scheduledEndAt]
```

This permits consecutive appointments:

```text
12:00–13:00
13:00–14:00
```

but rejects overlapping appointments:

```text
12:00–13:00
12:30–13:30
```

Patient scheduling is protected by locking the patient's stable users row
before checking and creating a visit. Doctor scheduling is protected by locking
the doctor's stable doctor_profiles row before checking and creating a
reservation. This serialises concurrent attempts for the same patient or doctor
without introducing an application queue.

The overlap queries run in READ COMMITTED transactions so a request that
waited for a lock sees the reservation committed by the preceding transaction.
Integration tests exercise these concurrent cases against a real MySQL database.

Doctors may bid on overlapping requests because a bid is only an offer. The
doctor's schedule is reserved when the patient selects a bid and a pending
payment is created.

## API overview

### Authentication

```text
POST /auth/login
GET  /auth/me
POST /auth/logout
```

### Visits

```text
GET  /specialties
POST /visits
GET  /visits/open
GET  /visits/assigned
GET  /visits/:visitId
POST /visits/:visitId/bids
```

### Payments

```text
POST /visits/:visitId/bids/:bidId/select
POST /mock-payments/:paymentId/confirm
POST /webhooks/payments
```

## Testing

### Unit tests

npm test

or:

npm run test:unit

Unit tests cover application-level rules such as authentication failures,
request validation, bid submission, payment creation, webhook result handling,
and HMAC signature verification.

### Integration tests

Integration tests require a separate MySQL database whose name contains
doctorsa_test. This guard reduces the risk of accidentally cleaning a
development or production database.

Configure .env.test, apply migrations, and run:

npm run test:integration

The integration suite covers:

The complete patient request to doctor assignment flow.

Successful and duplicate payment webhooks.

Payment and status-history idempotency.

Patient scheduling conflicts.

Doctor reservation conflicts.

Concurrent attempts to reserve the same doctor.

Overlapping visits for different doctors.

Consecutive non-overlapping appointments.

Run every test:

npm run test:all

Run all local quality checks:

npm run check
npm run test:integration
npm run build

## Local development without Docker

### Requirements

1. Node.js 24
2. MySQL 8.4 or a compatible MySQL 8 release

```env
DATABASE_URL="postgresql://doctorsa_user:doctorsa_dev_password@localhost:5432/doctorsa"
NODE_ENV="development"
PORT="3000"
SHADOW_DATABASE_URL="postgresql://doctorsa_user:doctorsa_dev_password@localhost:5432/doctorsa_shadow"
SESSION_SECRET="10e016c9c47244037ebd79f22fffe8008f53d8c708242a14cc62f29c290320b5"
WEBHOOK_SECRET="124a0cb39bf99acf74cab9f3cb9d311a7b818c24dc28af258aa5234318bf4ca3"
APP_BASE_URL="http://127.0.0.1:3000"
```

Install dependencies and then create the database and run:

```bash
npm install
npm run db:mysql:migrate
npm run db:mysql:seed
```

Start development mode:

```bash
npm run dev
```

## Trade-offs

### One payment attempt per visit

The current schema permits one payment per visit and bid. Multiple retries and
replacement payment attempts were omitted to keep the payment lifecycle focused.

### Reservation expiry not activated

The schema includes `doctorReservationExpiresAt`, but automatic expiry is not
active because safely expiring a reservation should be implemented together with
multiple payment attempts and payment cancellation.

For now, a patient can return to a pending checkout using the **Continue
payment** action.

### Fixed one-hour duration

Every visit occupies one hour. Per-specialty or doctor-defined durations were
omitted.

### Lagos timezone assumption

The SSR form interprets `datetime-local` values as `Africa/Lagos` time. A
production marketplace would store each user’s timezone and submit an explicit
UTC offset.

### Minimal authentication scope

The project provides seeded accounts, password hashing, PostgreSQL sessions, and
role authorization. Registration, password reset, email verification, and
account management were omitted.

### Mock payment only

No real card details or provider keys are used. Real provider initialization,
verification APIs, refunds, and reconciliation were intentionally excluded.

### Minimal SSR interface

The Mustache interface prioritizes completion of the booking workflow. Advanced
accessibility audits, design-system components, and client-side interactivity
were omitted.

## With more time

I would prioritise:

1. Add per-specialty visit durations and doctor availability windows.
2. Add CI to run linting, type-checking, unit tests, integration tests, and the
Docker build.
3. Supporting reservation expiry and multiple payment attempts.
4. Adding CSRF protection and login rate limiting.
5. Adding cancellation and rescheduling.
6. Implement logging with Pino/Winston.
7. Add retry handling for transient MySQL deadlocks and network errors.
