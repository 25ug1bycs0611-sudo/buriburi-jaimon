// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { mockPool, mockClient } = vi.hoisted(() => ({
  mockPool: { query: vi.fn(), connect: vi.fn(), end: vi.fn() },
  mockClient: { query: vi.fn(), release: vi.fn() },
}));

vi.mock("pg", () => ({ default: { Pool: vi.fn(function Pool() { return mockPool; }) } }));

const secret = "test-only-jwt-secret-with-at-least-thirty-two-characters";
const previousEnvironment = {};
let app;
let httpServer;
let baseUrl;
let storedPasswordHash;

const tokenFor = (role, sub = 7, expiresIn = "1h") => jwt.sign(
  { sub, role, email: `${role}@example.com` },
  secret,
  { expiresIn, issuer: "northstar-college" },
);

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    response,
    body: response.status === 204 ? null : await response.json(),
  };
}

async function requestForm(path, { method = "POST", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  return {
    response,
    body: response.status === 204 ? null : await response.json(),
  };
}

beforeAll(async () => {
  for (const key of ["DATABASE_URL", "JWT_SECRET"]) previousEnvironment[key] = process.env[key];
  process.env.DATABASE_URL = "postgres://test.invalid/northstar";
  process.env.JWT_SECRET = secret;
  ({ app } = await import("../../server/index.js"));
  storedPasswordHash = await bcrypt.hash("correct-password", 4);
  httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

afterAll(async () => {
  if (httpServer) {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
  for (const key of ["DATABASE_URL", "JWT_SECRET"]) {
    if (previousEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnvironment[key];
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });
  mockPool.connect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("authentication and authorization API", () => {
  it("reports configured health without querying the database", async () => {
    const { response, body } = await request("/api/health");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      mode: "database",
      databaseConfigured: true,
      authenticationConfigured: true,
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("rejects missing, invalid, and expired bearer tokens", async () => {
    const missing = await request("/api/users");
    const invalid = await request("/api/users", { token: "not-a-token" });
    const expired = await request("/api/users", { token: tokenFor("admin", 7, "-1h") });

    expect(missing.response.status).toBe(401);
    expect(invalid.response.status).toBe(401);
    expect(expired.response.status).toBe(401);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("blocks students from administrator user records", async () => {
    const { response, body } = await request("/api/users", { token: tokenFor("student") });

    expect(response.status).toBe(403);
    expect(body.message).toMatch(/permission/i);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("prevents students from reading another student's attendance and marks", async () => {
    const token = tokenFor("student", 7);
    const attendance = await request("/api/attendance?studentId=8", { token });
    const marks = await request("/api/marks?studentId=8", { token });

    expect(attendance.response.status).toBe(403);
    expect(marks.response.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("requires faculty course filters for attendance and marks", async () => {
    const token = tokenFor("faculty", 9);
    const attendance = await request("/api/attendance?studentId=8", { token });
    const marks = await request("/api/marks?studentId=8", { token });

    expect(attendance.response.status).toBe(400);
    expect(marks.response.status).toBe(400);
    expect(attendance.body.message).toMatch(/assigned course ID/i);
    expect(marks.body.message).toMatch(/assigned course ID/i);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("restricts faculty attendance and marks to courses they are assigned", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ course_id: 2, status: "present" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ course_id: 2, score: 80 }], rowCount: 1 });
    const token = tokenFor("faculty", 9);
    const attendance = await request("/api/attendance?studentId=8&courseId=2", { token });
    const marks = await request("/api/marks?studentId=8&courseId=2", { token });

    expect(attendance.response.status).toBe(200);
    expect(attendance.body).toEqual([{ course_id: 2, status: "present" }]);
    expect(marks.response.status).toBe(200);
    expect(marks.body).toEqual([{ course_id: 2, score: 80 }]);
    expect(mockPool.query.mock.calls[0][1]).toEqual([9, 2]);
    expect(mockPool.query.mock.calls[1][0]).toContain("cf.course_id = a.course_id");
    expect(mockPool.query.mock.calls[1][1]).toEqual([8, 2, "faculty", 9]);
    expect(mockPool.query.mock.calls[2][1]).toEqual([9, 2]);
    expect(mockPool.query.mock.calls[3][0]).toContain("cf.course_id = m.course_id");
    expect(mockPool.query.mock.calls[3][1]).toEqual([8, 2, "faculty", 9]);
  });

  it("rejects faculty requests for courses outside their assignments", async () => {
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const token = tokenFor("faculty", 9);
    const attendance = await request("/api/attendance?studentId=8&courseId=3", { token });
    const marks = await request("/api/marks?studentId=8&courseId=3", { token });

    expect(attendance.response.status).toBe(403);
    expect(marks.response.status).toBe(403);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("rejects expired authentication before accessing protected API routes", async () => {
    const { response } = await request("/api/admissions/4", {
      method: "PATCH",
      token: tokenFor("admin", 7, "-1h"),
      body: { status: "accepted" },
    });

    expect(response.status).toBe(401);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe("complaint management API", () => {
  it("requires authentication and blocks faculty from submitting student complaints", async () => {
    const anonymous = await request("/api/complaints");
    const faculty = await request("/api/complaints", {
      method: "POST",
      token: tokenFor("faculty"),
      body: { title: "Not a student complaint" },
    });

    expect(anonymous.response.status).toBe(401);
    expect(faculty.response.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("rejects malformed complaint submissions before database access", async () => {
    const { response, body } = await request("/api/complaints", {
      method: "POST",
      token: tokenFor("student"),
      body: { title: "Too short" },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/required complaint fields/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("rejects invalid complaint contact details", async () => {
    const form = new FormData();
    form.append("title", "A valid complaint title");
    form.append("description", "A sufficiently detailed complaint description.");
    form.append("category", "Technical");
    form.append("departmentId", "1");
    form.append("priority", "Medium");
    form.append("location", "Main building");
    form.append("complaintDate", new Date().toISOString().slice(0, 10));
    form.append("contactInfo", "123-456");

    const { response } = await requestForm("/api/complaints", {
      token: tokenFor("student"),
      body: form,
    });

    expect(response.status).toBe(400);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("rejects evidence whose content signature does not match the claimed image type", async () => {
    const form = new FormData();
    form.append("title", "A valid complaint title");
    form.append("description", "A sufficiently detailed complaint description.");
    form.append("category", "Technical");
    form.append("departmentId", "1");
    form.append("priority", "Medium");
    form.append("location", "Main building");
    form.append("complaintDate", "2026-10-30");
    form.append("contactInfo", "student@example.com");
    form.append("evidence", new Blob(["not an image"], { type: "image/png" }), "evidence.png");

    const { response, body } = await requestForm("/api/complaints", {
      token: tokenFor("student"),
      body: form,
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/genuine JPEG, PNG, WebP image, or PDF/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("creates a complaint transactionally and generates a unique tracking code", async () => {
    mockClient.query.mockImplementation(async (query) => query.includes("INSERT INTO complaints")
      ? { rows: [{ id: 42, status: "Submitted", created_at: "2026-10-30T00:00:00.000Z" }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
    const form = new FormData();
    form.append("title", "A valid complaint title");
    form.append("description", "A sufficiently detailed complaint description.");
    form.append("category", "Technical");
    form.append("departmentId", "1");
    form.append("priority", "High");
    form.append("location", "Main building");
    form.append("complaintDate", new Date().toISOString().slice(0, 10));
    form.append("contactInfo", "student@example.com");

    const { response, body } = await requestForm("/api/complaints", {
      token: tokenFor("student"),
      body: form,
    });

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ id: 42, complaint_code: `CMP-${new Date().getFullYear()}-000042`, status: "Submitted" });
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO complaints (user_id"),
      expect.arrayContaining([7, "A valid complaint title", "Technical", "High"]),
    );
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("prevents department staff from reassigning a complaint or changing its department", async () => {
    const { response, body } = await request("/api/complaints/3", {
      method: "PATCH",
      token: tokenFor("staff"),
      body: { departmentId: 2, staffId: 9, status: "In Progress" },
    });

    expect(response.status).toBe(403);
    expect(body.message).toMatch(/staff may update progress/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("restricts complaint list queries to the authenticated student and validates filters", async () => {
    const invalid = await request("/api/complaints?status=Unknown", { token: tokenFor("student") });
    const invalidSort = await request("/api/complaints?sort=created_at%3Bdrop", { token: tokenFor("student") });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const listing = await request("/api/complaints?status=Submitted", { token: tokenFor("student") });

    expect(invalid.response.status).toBe(400);
    expect(invalidSort.response.status).toBe(400);
    expect(listing.response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query.mock.calls[0][0]).toContain("c.user_id = $2");
    expect(mockPool.query.mock.calls[0][1].slice(0, 2)).toEqual(["student", 7]);
    expect(mockPool.query.mock.calls[0][0]).toContain("role = 'staff'");
  });

  it("uses the current database department to scope staff complaint access", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const staffToken = jwt.sign(
      { sub: 9, role: "staff", department: "A stale department claim" },
      secret,
      { expiresIn: "1h", issuer: "northstar-college" },
    );
    const { response } = await request("/api/complaints", { token: staffToken });

    expect(response.status).toBe(200);
    expect(mockPool.query.mock.calls[0][0]).toContain("SELECT department FROM users WHERE id = $2 AND role = 'staff'");
    expect(mockPool.query.mock.calls[0][1]).not.toContain("A stale department claim");
  });

  it("requires complaint access before evidence can be fetched", async () => {
    const { response } = await request("/api/complaints/3/evidence");

    expect(response.status).toBe(401);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe("student management API", () => {
  it("keeps the student directory restricted to administrators and assigned faculty", async () => {
    const student = await request("/api/students", { token: tokenFor("student", 7) });
    const unfilteredFaculty = await request("/api/students", { token: tokenFor("faculty", 9) });

    expect(student.response.status).toBe(403);
    expect(unfilteredFaculty.response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("prevents students from changing their department or academic year", async () => {
    const { response, body } = await request("/api/students/7", {
      method: "PATCH",
      token: tokenFor("student", 7),
      body: { department: "Law & Public Policy", year: "Year 5" },
    });

    expect(response.status).toBe(403);
    expect(body.message).toMatch(/department or academic year/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("rejects result marks above the permitted range before database access", async () => {
    const { response, body } = await request("/api/results", {
      method: "PUT",
      token: tokenFor("admin"),
      body: {
        studentId: 7, courseId: 2, semester: 1,
        assignmentMarks: 101, internalMarks: 80, practicalMarks: 70, finalMarks: 90,
      },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/between 0 and 100/i);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("calculates a persisted result grade from the configured percentage scale", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 21, student_id: 7, course_id: 2, semester: 1,
        assignment_marks: 90, internal_marks: 90, practical_marks: 90, final_marks: 90,
        total_marks: 360, percentage: 90,
      }],
      rowCount: 1,
    });
    const { response, body } = await request("/api/results", {
      method: "PUT",
      token: tokenFor("admin"),
      body: {
        studentId: 7, courseId: 2, semester: 1,
        assignmentMarks: 90, internalMarks: 90, practicalMarks: 90, finalMarks: 90,
      },
    });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ total_marks: 360, percentage: 90, grade: "A" });
    expect(mockPool.query.mock.calls[0][0]).toContain("ON CONFLICT (student_id, course_id, semester)");
  });

  it("rejects duplicate student entries in one attendance batch", async () => {
    const { response, body } = await request("/api/attendance", {
      method: "PUT",
      token: tokenFor("admin"),
      body: {
        courseId: 2, classDate: "2026-11-02",
        records: [{ studentId: 7, status: "present" }, { studentId: 7, status: "absent" }],
      },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/unique students/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("rejects unsupported or malformed payment requests before acquiring a transaction", async () => {
    const { response, body } = await request("/api/payments", {
      method: "POST",
      token: tokenFor("admin"),
      body: { studentId: 7, paymentMethod: "crypto", idempotencyKey: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/payment method/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("forces student fee queries to use the authenticated student's ID", async () => {
    await request("/api/fees?studentId=99", { token: tokenFor("student", 7) });

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0][1]).toEqual([7]);
  });

  it("does not allow students to create class schedule entries", async () => {
    const { response } = await request("/api/schedule", {
      method: "POST",
      token: tokenFor("student"),
      body: { courseId: 2, facultyId: 3, startsAt: "2099-01-01T10:00:00.000Z", location: "Room 1" },
    });

    expect(response.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("does not schedule faculty that are not assigned to a course", async () => {
    const { response, body } = await request("/api/schedule", {
      method: "POST",
      token: tokenFor("admin"),
      body: { courseId: 2, facultyId: 3, startsAt: "2099-01-01T10:00:00.000Z", location: "Room 1" },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/assign the faculty member/i);
    expect(mockPool.query.mock.calls[0][0]).toContain("FROM course_faculty");
  });
});

describe("student registration and login API", () => {
  it("rejects malformed registration before opening a database connection", async () => {
    const { response, body } = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Taylor Example", email: "not-an-email", password: "long-password", role: "student" },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/valid email/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("stores a password hash and assigns a student ID on registration", async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO users")) {
        return { rows: [{ id: 17, name: "Taylor Example", email: "taylor@example.com", role: "student", department: "Computer Science", year: "Year 1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const { response, body } = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Taylor Example",
        email: "Taylor@Example.com",
        password: "correct-password",
        role: "student",
      },
    });

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({ name: "Taylor Example", email: "taylor@example.com", role: "student" });
    expect(body.user.studentId).toMatch(/^NS\d{9}$/);
    expect(body.user).not.toHaveProperty("password");
    const insert = mockClient.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO users"));
    expect(insert[1][2]).not.toBe("correct-password");
    expect(await bcrypt.compare("correct-password", insert[1][2])).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(jwt.verify(body.token, secret, { issuer: "northstar-college" })).toMatchObject({ role: "student", email: "taylor@example.com" });
  });

  it("authenticates with a verified password and rejects an incorrect password", async () => {
    mockPool.query.mockResolvedValue({
      rows: [{
        id: 7,
        name: "Taylor Example",
        email: "student@example.com",
        role: "student",
        password_hash: storedPasswordHash,
        student_id: "NS202600007",
        status: "active",
      }],
      rowCount: 1,
    });
    const incorrect = await request("/api/auth/login", {
      method: "POST",
      body: { email: "student@example.com", password: "wrong-password", role: "student" },
    });
    const correct = await request("/api/auth/login", {
      method: "POST",
      body: { email: "student@example.com", password: "correct-password", role: "student" },
    });

    expect(incorrect.response.status).toBe(401);
    expect(correct.response.status).toBe(200);
    expect(correct.body.user.studentId).toBe("NS202600007");
    expect(jwt.verify(correct.body.token, secret, { issuer: "northstar-college" })).toMatchObject({ sub: 7, role: "student" });
  });

  it("rejects sign-in with a role that differs from the stored account", async () => {
    mockPool.query.mockResolvedValue({
      rows: [{
        id: 7,
        name: "Taylor Example",
        email: "student@example.com",
        role: "student",
        password_hash: storedPasswordHash,
      }],
      rowCount: 1,
    });
    const { response, body } = await request("/api/auth/login", {
      method: "POST",
      body: { email: "student@example.com", password: "correct-password", role: "admin" },
    });

    expect(response.status).toBe(403);
    expect(body.message).toMatch(/registered as student/i);
  });
});

describe("attendance, marks, admissions, and leave API validation", () => {
  it("rejects unsupported attendance states", async () => {
    const { response } = await request("/api/attendance", {
      method: "PUT",
      token: tokenFor("admin"),
      body: { courseId: 2, classDate: "2026-10-30", records: [{ studentId: 8, status: "excused" }] },
    });

    expect(response.status).toBe(400);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("upserts attendance records within one transaction", async () => {
    const records = [{ studentId: 8, status: "present" }, { studentId: 9, status: "absent" }];
    const { response, body } = await request("/api/attendance", {
      method: "PUT",
      token: tokenFor("admin"),
      body: { courseId: 2, classDate: "2026-10-30", records },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ updated: 2 });
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO attendance"))).toHaveLength(2);
    expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("ON CONFLICT"))).toBe(true);
  });

  it("rejects marks outside the assessment range", async () => {
    const { response } = await request("/api/marks", {
      method: "POST",
      token: tokenFor("admin"),
      body: { studentId: 8, courseId: 2, assessment: "Midterm", score: 101, maxScore: 100 },
    });

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("accepts zero marks at the lower boundary", async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ id: 1, student_id: 8, course_id: 2, assessment: "Midterm", score: 0, max_score: 100 }],
      rowCount: 1,
    });
    const { response, body } = await request("/api/marks", {
      method: "POST",
      token: tokenFor("admin"),
      body: { studentId: 8, courseId: 2, assessment: "Midterm", score: 0, maxScore: 100 },
    });

    expect(response.status).toBe(201);
    expect(body.score).toBe(0);
    expect(mockPool.query.mock.calls[0][1].slice(0, 5)).toEqual([8, 2, "Midterm", 0, 100]);
  });

  it("validates admission applicant details before database inserts", async () => {
    const { response } = await request("/api/admissions", {
      method: "POST",
      body: { applicantName: "T", email: "bad-email", phone: "12", preferredCourse: "" },
    });

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("rejects reversed leave date ranges", async () => {
    const { response } = await request("/api/leave", {
      method: "POST",
      token: tokenFor("student"),
      body: { startDate: "2026-11-05", endDate: "2026-11-04", reason: "Family commitment" },
    });

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe("public content and administrative workflows", () => {
  it("serves published course and notice lists without authentication", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, title: "Computer Science" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 2, title: "Registration is open" }], rowCount: 1 });
    const courses = await request("/api/courses");
    const notices = await request("/api/notices");

    expect(courses.response.status).toBe(200);
    expect(courses.body).toEqual([{ id: 1, title: "Computer Science" }]);
    expect(notices.response.status).toBe(200);
    expect(notices.body).toEqual([{ id: 2, title: "Registration is open" }]);
  });

  it("stores contact messages with valid rating boundaries", async () => {
    mockPool.query.mockResolvedValue({ rows: [{ id: 4, created_at: "2026-10-30T00:00:00Z" }], rowCount: 1 });
    const { response, body } = await request("/api/contact", {
      method: "POST",
      body: {
        name: "  Taylor Example ",
        email: "Taylor@Example.com",
        subject: "Admissions",
        message: "I would like to learn about your programs.",
        rating: 5,
      },
    });

    expect(response.status).toBe(201);
    expect(body.id).toBe(4);
    expect(mockPool.query.mock.calls[0][1]).toEqual([
      "Taylor Example",
      "Taylor@Example.com",
      "Admissions",
      "I would like to learn about your programs.",
      5,
    ]);
  });

  it("rejects out-of-range feedback ratings", async () => {
    const { response } = await request("/api/contact", {
      method: "POST",
      body: {
        name: "Taylor Example",
        email: "taylor@example.com",
        subject: "Admissions",
        message: "I would like to learn about your programs.",
        rating: 6,
      },
    });

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("allows faculty to publish validated notices and blocks students", async () => {
    const invalidRole = await request("/api/notices", {
      method: "POST",
      token: tokenFor("student"),
      body: { title: "Class update", body: "Reading for next week is available." },
    });
    mockPool.query.mockResolvedValue({ rows: [{ id: 5, title: "Class update", audience: "students" }], rowCount: 1 });
    const created = await request("/api/notices", {
      method: "POST",
      token: tokenFor("faculty"),
      body: { title: " Class update ", body: " Reading for next week is available. ", audience: "students" },
    });

    expect(invalidRole.response.status).toBe(403);
    expect(created.response.status).toBe(201);
    expect(created.body.title).toBe("Class update");
    expect(mockPool.query.mock.calls[0][1]).toEqual(["Class update", "Reading for next week is available.", "students", 7]);
  });

  it("lets administrators update admission status and rejects unknown statuses", async () => {
    const invalid = await request("/api/admissions/4", {
      method: "PATCH",
      token: tokenFor("admin"),
      body: { status: "enrolled" },
    });
    mockPool.query.mockResolvedValue({ rows: [{ id: 4, applicant_name: "Taylor Example", status: "accepted" }], rowCount: 1 });
    const accepted = await request("/api/admissions/4", {
      method: "PATCH",
      token: tokenFor("admin"),
      body: { status: "accepted" },
    });

    expect(invalid.response.status).toBe(400);
    expect(accepted.response.status).toBe(200);
    expect(accepted.body.status).toBe("accepted");
    expect(mockPool.query.mock.calls[0][1]).toEqual(["accepted", "4"]);
  });

  it("permits administrators to review pending leave requests only", async () => {
    const denied = await request("/api/leave/10", {
      method: "PATCH",
      token: tokenFor("faculty"),
      body: { status: "approved" },
    });
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const missing = await request("/api/leave/10", {
      method: "PATCH",
      token: tokenFor("admin"),
      body: { status: "approved" },
    });

    expect(denied.response.status).toBe(403);
    expect(missing.response.status).toBe(404);
    expect(mockPool.query.mock.calls[0][0]).toContain("status = 'pending'");
  });

  it("lists users only through the administrator role and validates the role filter", async () => {
    const invalidFilter = await request("/api/users?role=visitor", { token: tokenFor("admin") });
    mockPool.query.mockResolvedValue({
      rows: [{ id: 7, name: "Taylor Example", email: "taylor@example.com", role: "student", student_id: "NS202600007", password_hash: "not-selected" }],
      rowCount: 1,
    });
    const listing = await request("/api/users?role=student", { token: tokenFor("admin") });

    expect(invalidFilter.response.status).toBe(400);
    expect(listing.response.status).toBe(200);
    expect(listing.body[0]).toMatchObject({ name: "Taylor Example", studentId: "NS202600007" });
    expect(listing.body[0]).not.toHaveProperty("password_hash");
    expect(mockPool.query.mock.calls[0][1]).toEqual(["student"]);
  });

  it("creates faculty records with a hashed password and valid faculty ID", async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ id: 11, name: "Jordan Lee", email: "jordan@example.com", role: "faculty", employee_id: "FAC0007", status: "active" }],
      rowCount: 1,
    });
    const { response, body } = await request("/api/users", {
      method: "POST",
      token: tokenFor("admin"),
      body: {
        name: "Jordan Lee",
        email: "jordan@example.com",
        role: "faculty",
        employeeId: "fac0007",
        password: "initial-password",
      },
    });

    expect(response.status).toBe(201);
    expect(body.employeeId).toBe("FAC0007");
    const insertedValues = mockPool.query.mock.calls[0][1];
    expect(insertedValues[6]).not.toBe("initial-password");
    expect(await bcrypt.compare("initial-password", insertedValues[6])).toBe(true);
  });

  it("creates department staff accounts with hashed passwords and a department", async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ id: 12, name: "Jordan Lee", email: "jordan@example.com", role: "staff", department: "Computer Science", status: "active" }],
      rowCount: 1,
    });
    const { response, body } = await request("/api/users", {
      method: "POST",
      token: tokenFor("admin"),
      body: {
        name: "Jordan Lee",
        email: "jordan@example.com",
        role: "staff",
        department: "Computer Science",
        password: "initial-password",
      },
    });

    expect(response.status).toBe(201);
    expect(body.role).toBe("staff");
    const insertedValues = mockPool.query.mock.calls[0][1];
    expect(insertedValues[6]).not.toBe("initial-password");
    expect(await bcrypt.compare("initial-password", insertedValues[6])).toBe(true);
  });

  it("requires a department for staff accounts", async () => {
    const { response, body } = await request("/api/users", {
      method: "POST",
      token: tokenFor("admin"),
      body: {
        name: "Jordan Lee",
        email: "jordan@example.com",
        role: "staff",
        password: "initial-password",
      },
    });

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/department/i);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("rejects short profile names and does not update the database", async () => {
    const { response } = await request("/api/users/7", {
      method: "PATCH",
      token: tokenFor("admin"),
      body: { name: " " },
    });

    expect(response.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("does not allow administrator accounts to be deleted through user management", async () => {
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const { response, body } = await request("/api/users/7", {
      method: "DELETE",
      token: tokenFor("admin"),
    });

    expect(response.status).toBe(404);
    expect(body.message).toMatch(/record was not found/i);
    expect(mockPool.query.mock.calls[0][0]).toContain("role <> 'admin'");
  });
});
