import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const app = express();
const port = Number(process.env.PORT || 4000);
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const jwtConfigured = typeof jwtSecret === "string" && jwtSecret.length >= 32 && !/^replace/i.test(jwtSecret);
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined }) : null;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const publicUser = ({ id, name, email, role, student_id, employee_id, department, year, status }) => ({
  id, name, email, role, ...(student_id ? { studentId: student_id } : {}),
  ...(employee_id ? { employeeId: employee_id } : {}), ...(department ? { department } : {}),
  ...(year ? { year } : {}), ...(status ? { status } : {}),
});

function requireDatabase(req, res, next) {
  if (!pool) return res.status(503).json({ message: "Backend is not configured. Set DATABASE_URL to enable persistent API features." });
  next();
}

function authenticate(req, res, next) {
  if (!jwtConfigured) return res.status(503).json({ message: "Authentication is not configured. Set a unique JWT_SECRET of at least 32 characters." });
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Sign in is required." });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ message: "Your session is invalid or has expired. Please sign in again." });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: "You do not have permission to perform this action." });
}

function validateAccount(body, { registration = false } = {}) {
  const { email, password, role } = body;
  const isEmail = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  const isCollegeId = typeof email === "string" && /^(NS\d{9}|FAC[A-Z0-9]{3,12})$/i.test(email);
  if (!isEmail && !(isCollegeId && !registration)) return "Enter a valid email address or college ID.";
  if (typeof password !== "string" || password.length < (registration ? 8 : 1) || password.length > 128) return registration ? "Password must be between 8 and 128 characters." : "Enter your password.";
  if (registration && (role !== "student" || typeof body.name !== "string" || body.name.trim().length < 2)) return "Provide a name and student account type. Faculty accounts are created by an administrator.";
  return null;
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", mode: pool ? "database" : "demo", databaseConfigured: Boolean(pool), authenticationConfigured: jwtConfigured }));

app.post("/api/auth/login", requireDatabase, async (req, res, next) => {
  try {
    const invalid = validateAccount(req.body || {});
    if (invalid) return res.status(400).json({ message: invalid });
    if (!jwtConfigured) return res.status(503).json({ message: "Authentication is not configured. Set a unique JWT_SECRET of at least 32 characters." });
    const result = await pool.query("SELECT id, name, email, role, password_hash, student_id, employee_id, department, year, status FROM users WHERE lower(email) = lower($1) OR lower(student_id) = lower($1) OR lower(employee_id) = lower($1)", [req.body.email.trim()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) return res.status(401).json({ message: "Email or password is incorrect." });
    if (req.body.role && req.body.role !== user.role) return res.status(403).json({ message: `This account is registered as ${user.role}. Choose the matching sign-in type.` });
    const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, jwtSecret, { expiresIn: "8h", issuer: "northstar-college" });
    res.json({ token, user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/register", requireDatabase, async (req, res, next) => {
  try {
    const invalid = validateAccount(req.body || {}, { registration: true });
    if (invalid) return res.status(400).json({ message: invalid });
    if (!jwtConfigured) return res.status(503).json({ message: "Authentication is not configured. Set a unique JWT_SECRET of at least 32 characters." });
    const { name, email, password, role, department, year, phone, dateOfBirth, address } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO users (name, email, password_hash, role, department, year, phone, date_of_birth, address)
         VALUES ($1, lower($2), $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, email, role, department, year`,
        [name.trim(), email.trim(), hash, role, department || null, year || null, phone || null, dateOfBirth || null, address || null],
      );
      let user = inserted.rows[0];
      if (role === "student") {
        const studentId = `NS${new Date().getFullYear()}${String(user.id).padStart(5, "0")}`;
        await client.query("UPDATE users SET student_id = $1 WHERE id = $2", [studentId, user.id]);
        user = { ...user, student_id: studentId };
      }
      await client.query("COMMIT");
      const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, jwtSecret, { expiresIn: "8h", issuer: "northstar-college" });
      res.status(201).json({ token, user: publicUser(user) });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return res.status(409).json({ message: "An account with this email already exists." });
      throw error;
    } finally { client.release(); }
  } catch (error) { next(error); }
});

app.get("/api/courses", requireDatabase, async (_req, res, next) => {
  try { const result = await pool.query("SELECT id, title, department, degree, description FROM courses WHERE published = true ORDER BY title"); res.json(result.rows); }
  catch (error) { next(error); }
});

app.get("/api/notices", requireDatabase, async (_req, res, next) => {
  try { const result = await pool.query("SELECT id, title, body, audience, created_at FROM notices WHERE published = true ORDER BY created_at DESC LIMIT 100"); res.json(result.rows); }
  catch (error) { next(error); }
});

app.post("/api/notices", requireDatabase, authenticate, allowRoles("admin", "faculty"), async (req, res, next) => {
  try {
    const { title, body, audience = "all" } = req.body || {};
    if (typeof title !== "string" || title.trim().length < 3 || title.length > 180 || typeof body !== "string" || body.trim().length < 3 || body.length > 5000) return res.status(400).json({ message: "Provide a title and announcement between 3 and 5,000 characters." });
    if (!["all", "students", "faculty"].includes(audience)) return res.status(400).json({ message: "Choose a valid notice audience." });
    const result = await pool.query("INSERT INTO notices (title, body, audience, author_id) VALUES ($1, $2, $3, $4) RETURNING id, title, body, audience, created_at", [title.trim(), body.trim(), audience, req.user.sub]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.post("/api/admissions", requireDatabase, async (req, res, next) => {
  try {
    const { applicantName, email, phone, dateOfBirth, qualification, grade, preferredCourse, preferredDepartment, address } = req.body || {};
    if (typeof applicantName !== "string" || applicantName.trim().length < 2 || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof phone !== "string" || phone.replace(/\D/g, "").length < 7 || typeof preferredCourse !== "string") return res.status(400).json({ message: "Check the applicant name, email, phone, and preferred course." });
    const result = await pool.query(
      `INSERT INTO admission_applications (applicant_name, email, phone, date_of_birth, qualification, grade, preferred_course, preferred_department, address)
       VALUES ($1, lower($2), $3, $4, $5, $6, $7, $8, $9) RETURNING id, status, created_at`,
      [applicantName.trim(), email.trim(), phone.trim(), dateOfBirth || null, qualification || null, grade || null, preferredCourse, preferredDepartment || null, address || null],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get("/api/admissions", requireDatabase, authenticate, allowRoles("admin"), async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT id, applicant_name, email, phone, preferred_course, preferred_department, status, created_at FROM admission_applications ORDER BY created_at DESC LIMIT 500");
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.patch("/api/admissions/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["under_review", "accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Choose under review, accepted, or rejected." });
    const result = await pool.query("UPDATE admission_applications SET status = $1 WHERE id = $2 RETURNING id, applicant_name, status", [status, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "The admission application was not found." });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.post("/api/contact", requireDatabase, async (req, res, next) => {
  try {
    const { name, email, subject, message, rating } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof subject !== "string" || subject.length > 120 || typeof message !== "string" || message.trim().length < 10 || message.length > 5000) return res.status(400).json({ message: "Check your name, email, subject, and message. Messages must be between 10 and 5,000 characters." });
    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return res.status(400).json({ message: "Feedback rating must be from 1 to 5." });
    const result = await pool.query("INSERT INTO contact_messages (name, email, subject, message, rating) VALUES ($1, lower($2), $3, $4, $5) RETURNING id, created_at", [name.trim(), email.trim(), subject, message.trim(), rating ?? null]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get("/api/attendance", requireDatabase, authenticate, async (req, res, next) => {
  try {
    const requestedStudent = req.query.studentId ? Number(req.query.studentId) : Number(req.user.sub);
    if (!Number.isSafeInteger(requestedStudent) || requestedStudent < 1) return res.status(400).json({ message: "Provide a valid student ID." });
    if (req.user.role === "student" && requestedStudent !== Number(req.user.sub)) return res.status(403).json({ message: "Students may only view their own attendance." });
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if (req.user.role === "faculty" && (!Number.isSafeInteger(courseId) || courseId < 1)) return res.status(400).json({ message: "Faculty must provide a valid assigned course ID." });
    if (req.user.role === "faculty") {
      const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2 LIMIT 1", [req.user.sub, courseId]);
      if (!assigned.rowCount) return res.status(403).json({ message: "You may only view attendance for your assigned courses." });
    }
    const result = await pool.query(
      `SELECT a.id, a.student_id, a.course_id, c.title AS course, a.class_date, a.status
       FROM attendance a JOIN courses c ON c.id = a.course_id
       WHERE a.student_id = $1 AND ($2::bigint IS NULL OR a.course_id = $2)
         AND ($3::text <> 'faculty' OR EXISTS (
           SELECT 1 FROM course_faculty cf WHERE cf.faculty_id = $4 AND cf.course_id = a.course_id
         ))
       ORDER BY a.class_date DESC LIMIT 500`,
      [requestedStudent, courseId, req.user.role, req.user.sub],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.put("/api/attendance", requireDatabase, authenticate, allowRoles("faculty", "admin"), async (req, res, next) => {
  const { courseId, classDate, records } = req.body || {};
  if (!Number.isSafeInteger(Number(courseId)) || !/^\d{4}-\d{2}-\d{2}$/.test(classDate || "") || !Array.isArray(records) || records.length < 1 || records.length > 200 || records.some((item) => !Number.isSafeInteger(Number(item.studentId)) || !["present", "absent", "leave"].includes(item.status))) return res.status(400).json({ message: "Provide a course, class date, and up to 200 valid student attendance records." });
  const client = await pool.connect();
  try {
    if (req.user.role === "faculty") {
      const assigned = await client.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
      if (!assigned.rowCount) return res.status(403).json({ message: "You may only update attendance for your assigned courses." });
    }
    await client.query("BEGIN");
    for (const record of records) {
      await client.query(
        `INSERT INTO attendance (student_id, course_id, class_date, status, marked_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, course_id, class_date) DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
        [record.studentId, courseId, classDate, record.status, req.user.sub],
      );
    }
    await client.query("COMMIT");
    res.json({ updated: records.length });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

app.get("/api/marks", requireDatabase, authenticate, async (req, res, next) => {
  try {
    const requestedStudent = req.query.studentId ? Number(req.query.studentId) : Number(req.user.sub);
    if (!Number.isSafeInteger(requestedStudent) || requestedStudent < 1) return res.status(400).json({ message: "Provide a valid student ID." });
    if (req.user.role === "student" && requestedStudent !== Number(req.user.sub)) return res.status(403).json({ message: "Students may only view their own results." });
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if (req.user.role === "faculty" && (!Number.isSafeInteger(courseId) || courseId < 1)) return res.status(400).json({ message: "Faculty must provide a valid assigned course ID." });
    if (req.user.role === "faculty") {
      const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2 LIMIT 1", [req.user.sub, courseId]);
      if (!assigned.rowCount) return res.status(403).json({ message: "You may only view results for your assigned courses." });
    }
    const result = await pool.query(
      `SELECT m.id, m.student_id, m.course_id, c.title AS course, m.assessment, m.score, m.max_score, m.created_at
       FROM student_marks m JOIN courses c ON c.id = m.course_id
       WHERE m.student_id = $1 AND ($2::bigint IS NULL OR m.course_id = $2)
         AND ($3::text <> 'faculty' OR EXISTS (
           SELECT 1 FROM course_faculty cf WHERE cf.faculty_id = $4 AND cf.course_id = m.course_id
         ))
       ORDER BY m.created_at DESC LIMIT 500`,
      [requestedStudent, courseId, req.user.role, req.user.sub],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post("/api/marks", requireDatabase, authenticate, allowRoles("faculty", "admin"), async (req, res, next) => {
  try {
    const { studentId, courseId, assessment, score, maxScore } = req.body || {};
    if (![studentId, courseId, score, maxScore].every((value) => Number.isFinite(Number(value))) || Number(studentId) < 1 || Number(courseId) < 1 || Number(score) < 0 || Number(maxScore) <= 0 || Number(score) > Number(maxScore) || typeof assessment !== "string" || assessment.trim().length < 2 || assessment.length > 180) return res.status(400).json({ message: "Provide a valid student, course, assessment name, and score." });
    if (req.user.role === "faculty") {
      const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
      if (!assigned.rowCount) return res.status(403).json({ message: "You may only enter marks for your assigned courses." });
    }
    const result = await pool.query(
      "INSERT INTO student_marks (student_id, course_id, assessment, score, max_score, entered_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, student_id, course_id, assessment, score, max_score, created_at",
      [studentId, courseId, assessment.trim(), score, maxScore, req.user.sub],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get("/api/leave", requireDatabase, authenticate, async (req, res, next) => {
  try {
    if (!["student", "admin"].includes(req.user.role)) return res.status(403).json({ message: "Only students and administrators may view leave applications." });
    const result = await pool.query(
      `SELECT l.id, l.student_id, u.name AS student_name, u.email, l.start_date, l.end_date, l.reason, l.status, l.created_at
       FROM leave_applications l JOIN users u ON u.id = l.student_id
       WHERE ($1::text = 'admin' OR l.student_id = $2) ORDER BY l.created_at DESC LIMIT 500`,
      [req.user.role, req.user.sub],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post("/api/leave", requireDatabase, authenticate, allowRoles("student"), async (req, res, next) => {
  try {
    const { startDate, endDate, reason } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") || startDate > endDate || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 2000) return res.status(400).json({ message: "Choose a valid date range and provide a reason between 10 and 2,000 characters." });
    const result = await pool.query(
      "INSERT INTO leave_applications (student_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4) RETURNING id, student_id, start_date, end_date, reason, status, created_at",
      [req.user.sub, startDate, endDate, reason.trim()],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.patch("/api/leave/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Choose approved or rejected." });
    const result = await pool.query("UPDATE leave_applications SET status = $1 WHERE id = $2 AND status = 'pending' RETURNING id, status", [status, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "The pending leave application was not found." });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get("/api/users", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
  try {
    const role = req.query.role;
    if (role && !["student", "faculty", "admin"].includes(role)) return res.status(400).json({ message: "Choose a valid role filter." });
    const result = await pool.query(
      "SELECT id, name, email, role, student_id, employee_id, department, year, status, created_at FROM users WHERE ($1::text IS NULL OR role = $1) ORDER BY created_at DESC LIMIT 500",
      [role || null],
    );
    res.json(result.rows.map(publicUser));
  } catch (error) { next(error); }
});

app.post("/api/users", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
  try {
    const { name, email, role, department, year, employeeId, password } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["student", "faculty"].includes(role) || typeof password !== "string" || password.length < 8 || password.length > 128 || (role === "faculty" && (typeof employeeId !== "string" || !/^FAC[A-Z0-9]{3,12}$/i.test(employeeId)))) return res.status(400).json({ message: "Provide a valid name, email, role, and initial password of at least 8 characters. Faculty records also need a faculty ID." });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (name, email, role, department, year, employee_id, password_hash) VALUES ($1, lower($2), $3, $4, $5, $6, $7) RETURNING id, name, email, role, department, year, student_id, employee_id, status",
      [name.trim(), email.trim(), role, department || null, year || null, role === "faculty" ? employeeId.toUpperCase() : null, passwordHash],
    );
    const user = result.rows[0];
    if (role === "student") {
      user.student_id = `NS${new Date().getFullYear()}${String(user.id).padStart(5, "0")}`;
      await pool.query("UPDATE users SET student_id = $1 WHERE id = $2", [user.student_id, user.id]);
    }
    res.status(201).json(publicUser(user));
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "An account with this email or college ID already exists." });
    next(error);
  }
});

app.patch("/api/users/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
  try {
    const { name, department, year, status } = req.body || {};
    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) return res.status(400).json({ message: "Name must contain at least two characters." });
    if (status !== undefined && !["active", "inactive"].includes(status)) return res.status(400).json({ message: "Choose active or inactive status." });
    const result = await pool.query(
      `UPDATE users SET name = COALESCE($1, name), department = COALESCE($2, department), year = COALESCE($3, year), status = COALESCE($4, status)
       WHERE id = $5 AND role <> 'admin' RETURNING id, name, email, role, student_id, department, year`,
      [name?.trim() || null, department || null, year || null, status || null, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: "The requested student or faculty record was not found." });
    res.json(publicUser(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete("/api/users/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 AND role <> 'admin'", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "The requested student or faculty record was not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error("API request failed:", error.message);
  if (error.code === "23505") return res.status(409).json({ message: "A record with the provided unique value already exists." });
  res.status(500).json({ message: "The server could not complete this request." });
});

export { app };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  app.listen(port, () => {
    console.log(`Northstar API listening on http://localhost:${port} (${pool ? "database configured" : "demo mode: DATABASE_URL not set"})`);
  });

  process.on("SIGTERM", async () => { if (pool) await pool.end(); process.exit(0); });
}
