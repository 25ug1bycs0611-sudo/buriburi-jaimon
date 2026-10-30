# Northstar College — College management demo

A responsive React + Tailwind college website with interactive public pages, role-specific demo dashboards, and an optional Express/PostgreSQL API.

## Run the website

1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`, then open the local URL shown by Vite.

The site works immediately in **demo mode** without a database. Choose Student, Faculty, or Administrator from the login page; demo sign-in accepts any email and password. Demo data and changes are kept in this browser's local storage and are not real college records.

## Enable the backend

1. Create a PostgreSQL database and apply `server/schema.sql`.
2. Copy `.env.example` to `.env`; set `DATABASE_URL` and a strong, unique `JWT_SECRET`.
3. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (at least 12 characters) in `.env`, then run `npm run create-admin` once. The password is hashed before it is stored.
4. Run `npm run server` in one terminal and `npm run dev` in another.
5. Vite proxies `/api` requests to `http://localhost:4000`; configured forms and sign-in use the persistent API, while unavailable/unconfigured services use clearly labeled demo mode.

The API supports student and faculty profiles, departments, course enrollment and faculty assignment, class schedules, attendance, results, fees and payment receipts, announcements, admissions, leave applications, and administrator statistics. Protected endpoints require a bearer token. Students can only access their own academic, profile, fee, schedule, and leave records; faculty attendance, roster, schedule, and results are scoped to assigned courses; administrator actions are role-protected. `server/schema.sql` creates the required tables, adds the newer fields to the original starter schema, and inserts sample departments and courses. Reapply it after pulling schema updates; its table, index, and sample-row setup is designed to be repeatable.

### Academic and fee rules

- The starter's existing `courses` table is retained. Each row is a teachable catalog item with a department, optional program/degree label, course code, and semester; student enrollments, faculty assignments, and class sessions attach to those rows. This schema does not model a separate degree-program hierarchy.
- Assignment, internal, practical, and final-exam marks are each entered on a 0–100 scale. Total marks are their sum out of 400; percentage is the arithmetic mean. Grades use the selected scale: **A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60**.
- Late attendance counts as attended for attendance percentages; leave and absent records do not.
- Fee totals are assigned per student. The API accepts a single full-payment receipt for that fee and rejects partial, over-, or duplicate payments. The application records a payment already confirmed by college staff; **it does not process cash, UPI, card, or bank transactions**. Connect a vetted payment provider before accepting online payments.

## Run the tests

Run `npm test` for the Vitest unit and property-based suites, or `npm run test:coverage` to also print statement and branch coverage and create an HTML report at `coverage/index.html`. Coverage uses the V8 provider. The API tests run Express against a mocked PostgreSQL pool, so they do not write to a development or production database. Property-based tests use fast-check with reproducible seeds reported by the runner on failure.

See [TESTING.md](./TESTING.md) for the tested scope, latest results, coverage, known gaps, and recommendations.

## Demo access and scope

- The fictional institution is **Northstar College**. Replace the sample copy, image URLs, and seed data with approved college content before production.
- Public admissions, enquiry, contact, and feedback forms validate inputs and give an immediate confirmation in demo mode.
- The standalone demo workspace stores sample students, faculty, courses, announcements, and user-entered changes in this browser only. No demo records are written to PostgreSQL. With the API configured, the admin, faculty, and student portals load and persist role-appropriate student, faculty, course, attendance, result, fee, announcement, admissions, and leave records.
- Database sample courses and departments have no sample user accounts or demonstration credentials. Create the first administrator with `npm run create-admin`; administrators can then register faculty and student accounts.
- Uploaded files are not sent in demo mode. The production API should be extended with authenticated storage, virus scanning, and deployment-specific file limits before accepting documents.

This starter is a customization-ready foundation, not a production student information system. Add institution-specific privacy, retention, audit, and access policies before launch.
