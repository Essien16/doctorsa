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
2. Starts PostgreSQL.
3. Waits for PostgreSQL to become healthy.
4. Applies Prisma migrations.
5. Seeds the demo accounts.
6. Starts DoctorSA.

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
src/
├── config/
├── infrastructure/
│   └── database/
├── middleware/
├── modules/
│   ├── auth/
│   ├── payments/
│   └── visits/
├── shared/
├── views/
├── public/
├── app.ts
└── server.ts
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
Express or Prisma

### Application

Contains use cases such as creating visits, submitting bids, selecting bids, and
processing payment webhooks.

### Infrastructure

Contains Prisma repository implementations, PostgreSQL transactions, HMAC
signing, and mock payment infrastructure

### Presentation

Contains Express routes, controllers, request validation, JSON API responses,
and Mustache page controllers.

## Architecture decisions

### Modular monolith

A modular monolith keeps deployment simple while maintaining clear feature
boundaries. Microservices would add unnecessary complexity to the project hence
my decisiion to go with modular monolith.

### PostgreSQL and Prisma

This implementation uses PostgreSQL with Prisma. I initially started the project
with PostgreSQL before properly noting that MySQL is part of the company’s
stack.

I decided to retain the PostgreSQL implementation for this submission because
the core flow was already stable, and PostgreSQL also gave me useful concurrency
features for preventing overlapping appointments and safely processing payments.

I understand that MySQL would be the preferred choice within the team. The
application is structured so that most database-specific code is contained in
the infrastructure layer. Moving it to MySQL would mainly involve updating the
Prisma datasource, migrations, session store, and PostgreSQL-specific locking
and scheduling logic.

Prisma provides typed database access, reproducible migrations, and a clean
separation between the business logic and database implementation.

### Database-backed sessions

Authentication uses an HTTP-only session cookie with session data stored in
PostgreSQL.

Sessions fit the server-rendered application because:

- The browser only stores an opaque session identifier.
- Sessions can be revoked server-side.
- No JWT refresh-token workflow is required.
- Authentication state is immediately invalidated on logout.

### Repository interfaces

Application services depend on repository interfaces rather than Prisma
directly. This keeps business logic separate from persistence details and makes
service-level testing straightforward.

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

Every provider event has a unique `providerEventId`.

Webhook processing:

- Executes inside a PostgreSQL transaction.
- Locks the visit and payment rows.
- Stores the provider event with a unique constraint.
- Uses `ON CONFLICT DO NOTHING` for concurrent duplicate delivery.
- Updates payment and visit state only once.

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

PostgreSQL GiST exclusion constraints prevent:

- A patient from requesting overlapping visits.
- A doctor from being reserved for overlapping visits.

Application-level checks provide meaningful conflict errors, while database
constraints protect against concurrent requests.

Doctors may bid on overlapping requests because bids are offers rather than
confirmed appointments. The doctor’s schedule is reserved when the patient
selects a bid.

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

Run:

```bash
npm test
```

The Jest tests currently cover payment webhook application behaviour, including
duplicate events and invalid payment states.

Additional manual verification was performed for:

- Session creation and logout.
- Role-based access control.
- Visit creation.
- Doctor bidding.
- Bid selection.
- Mock payment confirmation.
- Complete visit status history.
- Duplicate webhook delivery.
- Assigned-doctor retrieval.
- Scheduling conflicts.

## Local development without Docker

Create a PostgreSQL database and configure `.env`:

```env
DATABASE_URL="postgresql://doctorsa_user:doctorsa_dev_password@localhost:5432/doctorsa"
NODE_ENV="development"
PORT="3000"
SHADOW_DATABASE_URL="postgresql://doctorsa_user:doctorsa_dev_password@localhost:5432/doctorsa_shadow"
SESSION_SECRET="10e016c9c47244037ebd79f22fffe8008f53d8c708242a14cc62f29c290320b5"
WEBHOOK_SECRET="124a0cb39bf99acf74cab9f3cb9d311a7b818c24dc28af258aa5234318bf4ca3"
APP_BASE_URL="http://127.0.0.1:3000"
```

Install dependencies and prepare the database:

```bash
npm install
npx prisma migrate dev
npm run seed
```

Start development mode:

```bash
npm run dev
```

## Trade-offs

### Database choice

The exercise mentions MySQL as part of the company’s stack, but this
implementation currently uses PostgreSQL. I recognise this as a trade-off in my
submission.

If I were taking the project further within the team’s environment, aligning the
persistence layer with MySQL would be one of my first changes.

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

1. Migrating the persistence layer to MySQL.
2. Adding PostgreSQL integration tests for webhook idempotency and scheduling.
3. Supporting reservation expiry and multiple payment attempts.
4. Adding CSRF protection and login rate limiting.
5. Adding cancellation and rescheduling.
