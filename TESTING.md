# Test report

## Application and test setup

This repository is a JavaScript application, not a Python project: React 18/Vite provides the frontend, and Express/PostgreSQL provides the optional API. The suite uses Vitest, Testing Library, and fast-check. API tests start the real Express app with a mocked `pg.Pool`; they never connect to or mutate a college database.

Run:

```sh
npm test
npm run test:coverage
npm run build
```

The coverage command prints statement and branch percentages and generates `coverage/index.html`. The coverage report is local output and is ignored by Git.

## Test coverage

The suite covers registration/password boundaries, login/session behavior, application and contact form validation, profile persistence, student dashboard access, leave requests, faculty directory searching, API authentication and role restrictions, password hashing/verification, student ID generation, attendance upserts/status validation, marks boundaries, admissions review, contact ratings, notices, leave review, and administrative user operations.

Property-based coverage uses generated password lengths and strings plus varied faculty-search queries. Existing workflows have no implemented fee/payment calculation, grade calculation, admissions document storage, or real attendance-percentage calculation to exercise. These are not simulated with invented business rules.

## Results

Latest complete run:

- Test files: 4 passed.
- Tests: 47 passed; 0 failed, 0 skipped, 0 errors.
- Statement coverage: 55.65% (453/814).
- Branch coverage: 47.42% (359/757).
- Function coverage: 46.22% (104/225).
- Line coverage: 62.12% (333/536).
- Production build: passed.

The current coverage target is below 80%; see the specific product and coverage gaps below. Coverage figures describe the instrumented files in `src/` and `server/`, not the test files or database schema. The largest uncovered areas are the monolithic frontend's mostly static public pages and illustrative dashboard sections; the coverage command lists uncovered source lines.

## Identified gaps and risks

- **Admission duplicate prevention is absent.** The admissions route inserts each valid submission, and `admission_applications` has no unique constraint. Repeated applications for one email can be stored.
- **Admission course validation is incomplete.** The API checks that `preferredCourse` is a string but not that it is non-empty or corresponds to a published course. The database's `NOT NULL` constraint does not reject an empty string.
- **Malformed attendance records need stronger guards.** The route validates record fields by dereferencing each item before checking its shape; malformed record values may bypass the intended controlled validation response.
- **Fees and payments are not implemented.** There is no fee/payment schema or API, transaction idempotency, payment-status lifecycle, or remaining-balance calculation.
- **Exam results are partial.** Marks can be stored and range-checked, but the application has no aggregate totals, percentages, or grade calculation policy.
- **Several dashboard areas are illustrative.** Faculty attendance/marks actions and student attendance/results are sample UI data; only the backend attendance and marks endpoints are available for integration.
- **Demo sign-in is intentionally not authentication.** The documented fallback accepts arbitrary credentials when using demo mode and supports local-only simulated roles. Do not treat this mode as suitable for production authorization.
- **No live PostgreSQL integration test ran.** SQL behavior is verified through mocked pool/client responses; constraints, migrations, and transaction behavior still need a disposable test database validation.

## Recommendations

1. Add server-side validation for required admissions fields, actual calendar dates, and course membership; prevent duplicates with a database-backed idempotency/uniqueness policy.
2. Guard attendance record types before reading properties and use async error forwarding compatible with the Express version.
3. Add a documented grading policy before implementing total/percentage/grade properties; implement fee/payment rules only after agreeing on currency, overpayment, and idempotency semantics.
4. Add integration tests against an isolated PostgreSQL database to validate constraints, transaction rollback, and duplicate handling.
5. Expand frontend tests across remaining public pages, admin CRUD interactions, and faculty dashboard states to raise the current coverage toward the 80% target.
