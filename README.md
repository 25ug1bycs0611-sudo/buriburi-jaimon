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

The API provides health, authentication/registration, courses, notices, admissions, contact submissions, leave applications, attendance, marks, and administrator user CRUD endpoints. Protected endpoints require a bearer token; students can only view their own attendance, marks, and leave requests, administrators approve admissions and leave, and faculty updates are limited to assigned courses. The included schema contains starting tables for users, admission applications, courses, notices, contact messages, leave, attendance, and marks. Apply it before using the database-backed routes.

## Run the tests

Run `npm test` for the Vitest unit and property-based suites, or `npm run test:coverage` to also print statement and branch coverage and create an HTML report at `coverage/index.html`. Coverage uses the V8 provider. The API tests run Express against a mocked PostgreSQL pool, so they do not write to a development or production database. Property-based tests use fast-check with reproducible seeds reported by the runner on failure.

See [TESTING.md](./TESTING.md) for the tested scope, latest results, coverage, known gaps, and recommendations.

## Demo access and scope

- The fictional institution is **Northstar College**. Replace the sample copy, image URLs, and seed data with approved college content before production.
- Public admissions, enquiry, contact, and feedback forms validate inputs and give an immediate confirmation in demo mode.
- Student and faculty dashboard schedules, assignments, attendance summaries, and marks are illustrative sample data. The student leave-request workflow and administrator review, admissions review, and student/faculty directory CRUD persist when the API is configured. Attendance/marks APIs are available for integration with institution-specific course rosters.
- Uploaded files are not sent in demo mode. The production API should be extended with authenticated storage, virus scanning, and deployment-specific file limits before accepting documents.

This starter is a customization-ready foundation, not a production student information system. Add institution-specific privacy, retention, audit, and access policies before launch.
