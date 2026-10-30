# Northstar College — College management demo

A responsive React + Tailwind college website with interactive public pages, role-specific demo dashboards, and an optional Express/PostgreSQL API.

## Run the website

1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`, then open the local URL shown by Vite.

The site works immediately in **demo mode** without a database. Choose Student, Faculty, Department staff, or Administrator from the login page; demo sign-in accepts any email and password. Demo data and changes are kept in this browser's local storage and are not real college records.

## Enable the backend

1. Create a PostgreSQL database and apply `server/schema.sql`.
2. Copy `.env.example` to `.env`; set `DATABASE_URL` and a strong, unique `JWT_SECRET`.
3. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (at least 12 characters) in `.env`, then run `npm run create-admin` once. The password is hashed before it is stored.
4. Run `npm run server` in one terminal and `npm run dev` in another.
5. Vite proxies `/api` requests to `http://localhost:4000`; configured forms and sign-in use the persistent API, while unavailable/unconfigured services use clearly labeled demo mode.

The API supports student and faculty profiles, departments, course enrollment and faculty assignment, class schedules, attendance, results, fees and payment receipts, announcements, admissions, leave applications, and administrator statistics. Protected endpoints require a bearer token. Students can only access their own academic, profile, fee, schedule, and leave records; faculty attendance, roster, schedule, and results are scoped to assigned courses; administrator actions are role-protected. `server/schema.sql` creates the required tables, adds the newer fields to the original starter schema, and inserts sample departments and courses. Reapply it after pulling schema updates; its table, index, and sample-row setup is designed to be repeatable.

## Complaint management

The **Help desk** navigation and `/complaints` route provide complaint dashboards for students, administrators, and department staff. Students can submit and track complaints, attach one JPEG/PNG/WebP/PDF evidence file (maximum 5 MB), see response history, receive in-app notifications, and rate resolved complaints. Administrators can search and filter the full register, assign departments and staff, update statuses, respond, remove complaints, create department staff accounts, view statistics, and export a complete filtered CSV report. Staff accounts see complaints for their own department and can post progress and resolutions. Each update is recorded in the complaint timeline.

The complaint tables are part of `server/schema.sql`; reapply the schema to an existing database before using the complaint APIs. Evidence bytes are kept in PostgreSQL and can only be downloaded through the authenticated, access-scoped API; no public upload directory is exposed. Use a production database with an appropriate backup/retention policy for uploaded evidence. Notifications are in-app only; email/SMS delivery is not configured.

### Complaint API

All complaint endpoints except `GET /api/departments` require a bearer token. Student and staff access is scoped to the authenticated user and the staff member's department, respectively.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/departments` | Public | Get department choices |
| `GET` | `/api/complaints` | Student, staff, admin | Search, filter, and paginate permitted complaints (`page`, `limit` up to 50, `search`, `status`, `category`, `priority`, `department`; sort with `sort=date|priority` and `order=asc|desc`) |
| `POST` | `/api/complaints` | Student | Submit a complaint as multipart form data; optional `evidence` file |
| `GET` | `/api/complaints/stats` | Student, staff, admin | Get role-scoped totals, department counts, and monthly counts |
| `GET` | `/api/complaints/:id` | Owner, department staff, admin | Get complaint details and activity history |
| `PATCH` | `/api/complaints/:id` | Department staff, admin | Update status and response; admin may assign department and staff |
| `DELETE` | `/api/complaints/:id` | Admin | Delete a complaint and its attached history/evidence |
| `GET` | `/api/complaints/:id/evidence` | Owner, department staff, admin | Download private evidence |
| `POST` | `/api/complaints/:id/feedback` | Owner | Rate a resolved complaint (one rating per complaint) |
| `GET` | `/api/complaints/notifications` | Signed-in user | Get the user's complaint notifications |
| `PATCH` | `/api/complaints/notifications/:id` | Notification owner | Mark a notification read |
| `GET` | `/api/complaints/staff?departmentId=:id` | Admin | List staff for a department |
| `GET` / `POST` | `/api/users?role=staff` / `/api/users` | Admin | List users or create a hashed-password staff account |

Use the existing secure setup above: configure `DATABASE_URL` and a unique `JWT_SECRET` in `.env`, apply `server/schema.sql`, create the first administrator with `npm run create-admin`, and start the API and Vite frontend. Administrators create staff accounts from the complaint workspace's **People** section; staff sign in at `/login/staff`.

When the backend is not configured, complaint records use clearly labeled browser-local demo storage. Sign in at `/login/student`, `/login/staff`, or `/login/admin` with any email and password; the demo staff role is scoped to Computer Science. The demo creates synthetic sample complaints and allows students to submit, administrators to assign/update, and staff to manage their department's sample records. Demo uploads are not persisted, demo staff passwords are not stored, and demo records are not sent to PostgreSQL. With PostgreSQL configured, demo sign-in is disabled; use the administrator account you created and add staff through the admin workspace.

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
