# Northstar College security review

**Review date:** 2026-10-30
**Scope:** Current repository source and configuration, including the test and documentation changes present during review.
**Overall assessment:** One confirmed medium-severity authorization flaw was identified and fixed. No other confirmed exploitable vulnerability was reported in the reviewed scope. This is not a guarantee that the application is secure.

## Project overview and methodology

The application is a React 18/Vite frontend with an Express API, PostgreSQL persistence, bcrypt password hashing, and JWT bearer authentication. The review inspected the server routes and database operations, authentication bootstrap, schema, client-side forms and rendering, security-related configuration, package manifests, environment example, and tests. The security review was read-only until its initial finding was reported; a narrowly scoped remediation and regression tests followed.

Checks included route authorization and input-validation review, inspection of database query construction, React rendering sinks, upload handling, secrets and error handling, middleware configuration, dependency audit output, and local API regression tests using synthetic data and a mocked PostgreSQL pool.

## Findings summary

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | [server/index.js](./server/index.js) | 170-189, 220-239 | Faculty could request attendance or marks without a course filter, allowing records outside their assigned courses to be returned. **Fixed.** | 9/10 |

**Severity breakdown:** 1 medium identified and fixed; 0 open confirmed findings. No critical or high-severity findings were confirmed.

## Finding 1 — Faculty academic-record scope bypass (fixed)

- **Affected routes:** `GET /api/attendance` and `GET /api/marks`.
- **Risk:** Medium — broken object-level authorization / excessive academic-record access.
- **Confidence:** 9/10.
- **Initial issue:** Faculty authorization accepted an omitted `courseId` if the instructor had any course assignment. The corresponding records query also treated an omitted course filter as unrestricted. A faculty account assigned to course A could therefore request another student's attendance or marks without a course filter and receive records from course B.
- **Potential impact:** Unauthorized disclosure of student attendance and examination data across courses.
- **Safe demonstration:** With synthetic records, assign a faculty account to course A and request a different student's records without a course filter or with course B. Before the fix, the omitted filter allowed the unrestricted query.
- **Remediation applied:** Faculty must now provide a positive integer course ID. The API checks that the requested course is assigned to the faculty member, and the attendance/marks SQL independently constrains returned rows through an `EXISTS` check against `course_faculty`. Non-faculty behavior is unchanged.
- **Regression tests:** The API tests cover missing course filters, assigned-course access, and rejection of unassigned-course access for both endpoints.

## Security review coverage

| Area | Result |
|---|---|
| SQL injection | No unsafe user-controlled SQL construction found. Supplied values are passed as PostgreSQL query parameters. |
| XSS | No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, or equivalent unsafe rendering sink found in the reviewed React source. |
| CSRF | Protected API requests use explicitly supplied bearer tokens rather than ambient authentication cookies; no exploitable cookie-based CSRF path was identified. |
| Authentication | Passwords are bcrypt-hashed and compared; API JWTs are signed with a configured secret and expire after eight hours. Authenticated API routes reject missing, invalid, and expired tokens. |
| Authorization | Role guards exist on protected routes. The faculty course-scope flaw above was fixed. Student attendance and marks queries reject requests for another student's records. |
| Demo authentication | The client intentionally permits arbitrary credentials in documented demo mode and stores a simulated role/session locally. This is not server authentication; never treat demo mode as production access control. |
| Input validation | API routes validate key account, attendance, marks, admissions, contact, and leave fields. No additional confirmed exploitable validation issue was reported by the review. |
| Sensitive data / secrets | The environment example uses placeholders; no live credentials were reported. Account queries return selected public fields, not password hashes. Admin bootstrap hashes its password and uses parameterized SQL. |
| File uploads | No API upload or file-processing implementation was found. Frontend file inputs are demonstration UI only; files are not uploaded. |
| API middleware | Helmet, JSON body limits, CORS origin configuration, and authentication rate limiting are present. Production deployments must configure `CLIENT_ORIGIN` and secrets correctly. |
| Errors and logs | API responses use a generic server-error response; server logs include an error message. Avoid including secrets or personal data in future error messages. |
| AI-specific risks | No AI model integration, prompt processing, AI-generated code execution, or AI service credential handling was identified in the reviewed application. |

## Dependency audit

`npm audit --offline` reported **0 vulnerabilities**. This uses locally available advisory data and does not establish that the advisory database was current at review time. Repeat `npm audit` with an up-to-date registry/advisory connection before release.

## Security test results

The full local suite passed after the fix: **4 test files, 50 tests passed, 0 failed**. The production build passed. The focused API suite includes regression tests verifying faculty cannot omit the course filter, cannot access an unassigned course, and can query an assigned course with the SQL result constrained to assigned courses. Tests use synthetic requests and a mocked PostgreSQL pool; they do not connect to a real database.

## Remaining risks and recommendations

1. Disable demo fallback in production deployments and ensure deployment configuration cannot silently expose demo role simulations.
2. Keep `JWT_SECRET` unique, strong, and supplied through deployment secret management; configure the production CORS origin narrowly.
3. Before adding document uploads, implement authenticated upload routes, strict size and content validation, malware scanning, and storage outside executable/static paths.
4. Add isolated PostgreSQL integration tests for database constraints and authorization query behavior, in addition to the mocked route tests.
5. Re-run dependency auditing with current advisory data and establish a routine dependency-update process.
6. Review authorization whenever new endpoints expose student records; enforce ownership/scope in the data query, not only in a separate pre-check.
