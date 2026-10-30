import express from "express";
import bcrypt from "bcryptjs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validText = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.length <= max;
const validDate = (value) => typeof value === "string" && datePattern.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
export const gradeFor = (percentage) => percentage >= 90 ? "A" : percentage >= 80 ? "B" : percentage >= 70 ? "C" : percentage >= 60 ? "D" : "F";

export function registerManagementRoutes(app, { pool, requireDatabase, authenticate, allowRoles }) {
  const router = express.Router();

  router.get("/departments", requireDatabase, async (_req, res, next) => {
    try {
      const { rows } = await pool.query("SELECT id, name FROM departments ORDER BY name");
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get("/dashboard/stats", requireDatabase, authenticate, allowRoles("admin"), async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT
          (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
          (SELECT COUNT(*) FROM users WHERE role = 'faculty') AS faculty,
          (SELECT COUNT(*) FROM courses WHERE published = true) AS courses,
          (SELECT COUNT(*) FROM departments) AS departments,
          COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('present', 'late')) /
            NULLIF(COUNT(*), 0)) FROM attendance), 0) AS attendance_percent,
          COALESCE((SELECT SUM(total_fee) FROM student_fees), 0) AS total_fees,
          COALESCE((SELECT SUM(amount) FROM payments), 0) AS collected_fees,
          COALESCE((SELECT SUM(sf.total_fee) - COALESCE(SUM(p.amount), 0)
            FROM student_fees sf LEFT JOIN payments p ON p.student_id = sf.student_id), 0) AS pending_fees`,
      );
      res.json(rows[0]);
    } catch (error) { next(error); }
  });

  router.post("/departments", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { name } = req.body || {};
    if (!validText(name, 2, 120)) return res.status(400).json({ message: "Department name must be between 2 and 120 characters." });
    try {
      const { rows } = await pool.query("INSERT INTO departments (name) VALUES ($1) RETURNING id, name", [name.trim()]);
      res.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ message: "That department already exists." });
      next(error);
    }
  });

  router.get("/schedule", requireDatabase, authenticate, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.id, s.course_id, c.title AS course, c.department, s.faculty_id,
                u.name AS faculty_name, s.starts_at, s.location
         FROM scheduled_classes s JOIN courses c ON c.id = s.course_id
         JOIN users u ON u.id = s.faculty_id
         WHERE s.starts_at >= NOW() AND (
           $1::text = 'admin' OR
           ($1::text = 'faculty' AND s.faculty_id = $2) OR
           ($1::text = 'student' AND EXISTS (
             SELECT 1 FROM student_courses sc WHERE sc.student_id = $2 AND sc.course_id = s.course_id
           ))
         )
         ORDER BY s.starts_at LIMIT 100`,
        [req.user.role, req.user.sub],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.post("/schedule", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { courseId, facultyId, startsAt, location } = req.body || {};
    if (!validId(courseId) || !validId(facultyId) || typeof startsAt !== "string" ||
      Number.isNaN(Date.parse(startsAt)) || Date.parse(startsAt) <= Date.now() ||
      !validText(location, 2, 180)) return res.status(400).json({ message: "Choose an assigned course and faculty member, a future date and time, and a location." });
    try {
      const { rows } = await pool.query(
        `INSERT INTO scheduled_classes (course_id, faculty_id, starts_at, location, created_by)
         SELECT cf.course_id, cf.faculty_id, $3, $4, $5 FROM course_faculty cf
         WHERE cf.course_id = $1 AND cf.faculty_id = $2
         RETURNING id, course_id, faculty_id, starts_at, location`,
        [courseId, facultyId, startsAt, location.trim(), req.user.sub],
      );
      if (!rows.length) return res.status(400).json({ message: "Assign the faculty member to this course before scheduling a class." });
      res.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ message: "That class is already scheduled for this faculty member." });
      next(error);
    }
  });

  router.delete("/schedule/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid class ID." });
    try {
      const { rows } = await pool.query("DELETE FROM scheduled_classes WHERE id = $1 RETURNING id", [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: "Scheduled class was not found." });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  router.delete("/departments/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid department ID." });
    try {
      const { rows } = await pool.query(
        `DELETE FROM departments d WHERE d.id = $1 AND NOT EXISTS (
          SELECT 1 FROM courses c WHERE c.department = d.name OR c.department_id = d.id
        ) RETURNING id`,
        [req.params.id],
      );
      if (!rows.length) return res.status(409).json({ message: "Department was not found or is still used by a course." });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  router.get("/students", requireDatabase, authenticate, allowRoles("admin", "faculty"), async (req, res, next) => {
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if (courseId !== null && (!Number.isSafeInteger(courseId) || courseId < 1)) return res.status(400).json({ message: "Provide a valid course ID." });
    if (req.user.role === "faculty") {
      if (!courseId) return res.status(400).json({ message: "Faculty must select an assigned course." });
      try {
        const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
        if (!assigned.rowCount) return res.status(403).json({ message: "You may only view students in your assigned courses." });
      } catch (error) { return next(error); }
    }
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.student_id, u.department, u.year, u.phone, u.date_of_birth,
                u.address, u.status, u.created_at, sp.gender, sp.admission_date, sp.guardian_name, sp.guardian_phone,
                COALESCE(json_agg(DISTINCT jsonb_build_object('id', c.id, 'title', c.title, 'semester', sc.semester,
                  'course_code', c.course_code, 'degree', c.degree))
                  FILTER (WHERE c.id IS NOT NULL), '[]') AS courses
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN student_courses sc ON sc.student_id = u.id
         LEFT JOIN courses c ON c.id = sc.course_id
         WHERE u.role = 'student'
           AND ($1::bigint IS NULL OR EXISTS (SELECT 1 FROM student_courses sx WHERE sx.student_id = u.id AND sx.course_id = $1))
           AND ($2::text IS NULL OR u.department = $2)
           AND ($3::text IS NULL OR u.name ILIKE $3 OR u.student_id ILIKE $3 OR u.email ILIKE $3)
         GROUP BY u.id, sp.user_id ORDER BY u.name LIMIT 500`,
        [courseId, typeof req.query.department === "string" ? req.query.department : null,
          typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim().slice(0, 100)}%` : null],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get("/students/me", requireDatabase, authenticate, allowRoles("student"), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.student_id, u.department, u.year, u.phone, u.date_of_birth, u.address, u.status,
                sp.gender, sp.admission_date, sp.guardian_name, sp.guardian_phone,
                COALESCE(json_agg(DISTINCT jsonb_build_object('id', c.id, 'title', c.title, 'semester', sc.semester,
                         'academicYear', sc.academic_year, 'course_code', c.course_code, 'degree', c.degree))
                  FILTER (WHERE c.id IS NOT NULL), '[]') AS courses
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN student_courses sc ON sc.student_id = u.id
         LEFT JOIN courses c ON c.id = sc.course_id
         WHERE u.id = $1 AND u.role = 'student'
         GROUP BY u.id, sp.user_id`,
        [req.user.sub],
      );
      if (!rows.length) return res.status(404).json({ message: "Student profile was not found." });
      res.json(rows[0]);
    } catch (error) { next(error); }
  });

  router.post("/students", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const body = req.body || {};
    const { name, email, password, department, year, studentId, phone, address, dateOfBirth, gender, admissionDate, guardianName, guardianPhone, courseId, semester = 1 } = body;
    if (!validText(name, 2, 160) || typeof email !== "string" || !emailPattern.test(email) || email.length > 254 ||
      typeof password !== "string" || password.length < 8 || password.length > 128 ||
      (studentId != null && (!validText(studentId, 3, 24) || !/^[A-Z0-9-]+$/i.test(studentId))) ||
      (phone != null && phone !== "" && (typeof phone !== "string" || phone.replace(/\D/g, "").length < 7 || phone.length > 32)) ||
      (dateOfBirth != null && dateOfBirth !== "" && !validDate(dateOfBirth)) ||
      (admissionDate != null && admissionDate !== "" && !validDate(admissionDate)) ||
      (gender != null && gender !== "" && !validText(gender, 1, 24)) ||
      (guardianName != null && (typeof guardianName !== "string" || guardianName.length > 160)) ||
      (guardianPhone != null && (typeof guardianPhone !== "string" || guardianPhone.length > 32)) ||
      (year != null && (typeof year !== "string" || year.length > 24)) ||
      (address != null && (typeof address !== "string" || address.length > 1000)) ||
      !validText(department, 2, 120) ||
      !Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 12 ||
      (courseId != null && !validId(courseId))) return res.status(400).json({ message: "Check the student name, email, password, ID, phone, course, and semester." });
    try {
      const departmentRow = await pool.query("SELECT 1 FROM departments WHERE name = $1", [department.trim()]);
      if (!departmentRow.rowCount) return res.status(400).json({ message: "Choose an existing department." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const hash = await bcrypt.hash(password, 12);
        const inserted = await client.query(
          `INSERT INTO users (name, email, password_hash, role, student_id, department, year, phone, date_of_birth, address)
           VALUES ($1, lower($2), $3, 'student', $4, $5, $6, $7, $8, $9)
           RETURNING id, name, email, student_id, department, year, phone, date_of_birth, address, status`,
          [name.trim(), email.trim(), hash, studentId?.trim() || null, department || null, year || null, phone || null, dateOfBirth || null, address || null],
        );
        const user = inserted.rows[0];
        if (!user.student_id) {
          user.student_id = `NS${new Date().getFullYear()}${String(user.id).padStart(5, "0")}`;
          await client.query("UPDATE users SET student_id = $1 WHERE id = $2", [user.student_id, user.id]);
        }
        await client.query(
          "INSERT INTO student_profiles (user_id, gender, admission_date, guardian_name, guardian_phone) VALUES ($1, $2, $3, $4, $5)",
          [user.id, gender || null, admissionDate || null, guardianName || null, guardianPhone || null],
        );
        if (courseId) await client.query(
          "INSERT INTO student_courses (student_id, course_id, academic_year, semester) VALUES ($1, $2, $3, $4)",
          [user.id, courseId, year || "Year 1", Number(semester)],
        );
        await client.query("COMMIT");
        res.status(201).json({ ...user, courses: [] });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") return res.status(409).json({ message: "That email, student ID, or enrollment already exists." });
        if (error.code === "23503") return res.status(400).json({ message: "The selected course does not exist." });
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.patch("/students/:id", requireDatabase, authenticate, allowRoles("admin", "student"), async (req, res, next) => {
    if (!validId(req.params.id) || (req.user.role === "student" && Number(req.params.id) !== Number(req.user.sub))) return res.status(403).json({ message: "You may only update your own student profile." });
    const body = req.body || {};
    const { name, department, year, phone, address, dateOfBirth, gender, guardianName, guardianPhone } = body;
    if (req.user.role === "student" && (department !== undefined || year !== undefined)) return res.status(403).json({ message: "Students may update contact details, but not their department or academic year." });
    if ((name !== undefined && !validText(name, 2, 160)) ||
      (phone !== undefined && phone !== null && (typeof phone !== "string" || phone.length > 32)) ||
      (address !== undefined && address !== null && (typeof address !== "string" || address.length > 1000)) ||
      (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== "" && !validDate(dateOfBirth)) ||
      (gender !== undefined && gender !== null && gender !== "" && !validText(gender, 1, 24)) ||
      (guardianName !== undefined && guardianName !== null && (typeof guardianName !== "string" || guardianName.length > 160)) ||
      (guardianPhone !== undefined && guardianPhone !== null && (typeof guardianPhone !== "string" || guardianPhone.length > 32))) return res.status(400).json({ message: "Check the profile fields and their length." });
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          `UPDATE users SET name = COALESCE($1, name), department = COALESCE($2, department), year = COALESCE($3, year),
            phone = COALESCE($4, phone), address = COALESCE($5, address), date_of_birth = COALESCE($6, date_of_birth)
           WHERE id = $7 AND role = 'student' RETURNING id, name, email, student_id, department, year, phone, date_of_birth, address`,
          [name?.trim() || null, department ?? null, year ?? null, phone ?? null, address ?? null, dateOfBirth || null, req.params.id],
        );
        if (!updated.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Student profile was not found." });
        }
        await client.query(
          `INSERT INTO student_profiles (user_id, gender, guardian_name, guardian_phone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET gender = COALESCE($2, student_profiles.gender),
             guardian_name = COALESCE($3, student_profiles.guardian_name),
             guardian_phone = COALESCE($4, student_profiles.guardian_phone)`,
          [req.params.id, gender ?? null, guardianName ?? null, guardianPhone ?? null],
        );
        await client.query("COMMIT");
        res.json(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.put("/students/:id/courses", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { courseIds, academicYear = "Year 1", semester = 1 } = req.body || {};
    if (!validId(req.params.id) || !Array.isArray(courseIds) || courseIds.some((id) => !validId(id)) ||
      !validText(academicYear, 2, 24) || !Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 12) {
      return res.status(400).json({ message: "Provide a valid student, course list, academic year, and semester." });
    }
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const student = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'student' FOR UPDATE", [req.params.id]);
        if (!student.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Student was not found." });
        }
        await client.query("DELETE FROM student_courses WHERE student_id = $1", [req.params.id]);
        for (const courseId of [...new Set(courseIds.map(Number))]) await client.query(
          "INSERT INTO student_courses (student_id, course_id, academic_year, semester) VALUES ($1, $2, $3, $4)",
          [req.params.id, courseId, academicYear, Number(semester)],
        );
        await client.query("COMMIT");
        res.json({ enrolled: [...new Set(courseIds)].length });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23503") return res.status(400).json({ message: "One of the selected courses does not exist." });
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.get("/faculty", requireDatabase, authenticate, allowRoles("admin"), async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.employee_id, u.department, u.phone, u.status,
                fp.subject, fp.qualification, fp.experience_years, fp.joining_date,
                COALESCE(array_agg(DISTINCT cf.course_id) FILTER (WHERE cf.course_id IS NOT NULL), '{}') AS course_ids
         FROM users u LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
         LEFT JOIN course_faculty cf ON cf.faculty_id = u.id
         WHERE u.role = 'faculty' GROUP BY u.id, fp.user_id ORDER BY u.name LIMIT 500`,
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get("/faculty/courses", requireDatabase, authenticate, allowRoles("faculty", "admin"), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.title, c.department_id, c.department, c.degree, c.course_code, c.semester,
          (SELECT COUNT(*) FROM student_courses sc WHERE sc.course_id = c.id) AS student_count
         FROM courses c ${req.user.role === "faculty" ? "JOIN course_faculty cf ON cf.course_id = c.id WHERE cf.faculty_id = $1" : ""}
         ORDER BY c.title`,
        req.user.role === "faculty" ? [req.user.sub] : [],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.post("/faculty", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { name, email, password, employeeId, department, phone, subject, qualification, experienceYears = 0, joiningDate, courseIds = [] } = req.body || {};
    if (!validText(name, 2, 160) || typeof email !== "string" || !emailPattern.test(email) || email.length > 254 ||
      typeof password !== "string" || password.length < 8 || password.length > 128 ||
      typeof employeeId !== "string" || !/^FAC[A-Z0-9]{3,12}$/i.test(employeeId) ||
      (phone != null && (typeof phone !== "string" || phone.length > 32)) ||
      (subject != null && (typeof subject !== "string" || subject.length > 180)) ||
      (qualification != null && (typeof qualification !== "string" || qualification.length > 180)) ||
      !validText(department, 2, 120) || (joiningDate && !validDate(joiningDate)) ||
      !Number.isFinite(Number(experienceYears)) || Number(experienceYears) < 0 ||
      !Array.isArray(courseIds) || courseIds.some((id) => !validId(id))) return res.status(400).json({ message: "Provide valid faculty details, a faculty ID, password, and course assignments." });
    try {
      const departmentRow = await pool.query("SELECT 1 FROM departments WHERE name = $1", [department.trim()]);
      if (!departmentRow.rowCount) return res.status(400).json({ message: "Choose an existing department." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const hash = await bcrypt.hash(password, 12);
        const inserted = await client.query(
          `INSERT INTO users (name, email, password_hash, role, employee_id, department, phone)
           VALUES ($1, lower($2), $3, 'faculty', $4, $5, $6)
           RETURNING id, name, email, employee_id, department, phone, status`,
          [name.trim(), email.trim(), hash, employeeId.trim().toUpperCase(), department || null, phone || null],
        );
        const facultyUser = inserted.rows[0];
        await client.query(
          "INSERT INTO faculty_profiles (user_id, subject, qualification, experience_years, joining_date) VALUES ($1, $2, $3, $4, $5)",
          [facultyUser.id, subject || null, qualification || null, Number(experienceYears), joiningDate || null],
        );
        for (const courseId of [...new Set(courseIds.map(Number))]) await client.query(
          "INSERT INTO course_faculty (course_id, faculty_id) VALUES ($1, $2)",
          [courseId, facultyUser.id],
        );
        await client.query("COMMIT");
        res.status(201).json(facultyUser);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") return res.status(409).json({ message: "That email or faculty ID already exists." });
        if (error.code === "23503") return res.status(400).json({ message: "One of the selected courses does not exist." });
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.patch("/faculty/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { name, department, phone, subject, qualification, experienceYears, joiningDate, courseIds } = req.body || {};
    if (!validId(req.params.id) || (name !== undefined && !validText(name, 2, 160)) ||
      (department !== undefined && !validText(department, 2, 120)) ||
      (joiningDate !== undefined && joiningDate !== null && joiningDate !== "" && !validDate(joiningDate)) ||
      (phone !== undefined && phone !== null && (typeof phone !== "string" || phone.length > 32)) ||
      (experienceYears !== undefined && (!Number.isFinite(Number(experienceYears)) || Number(experienceYears) < 0)) ||
      (courseIds !== undefined && (!Array.isArray(courseIds) || courseIds.some((id) => !validId(id))))) {
      return res.status(400).json({ message: "Check faculty details and course assignments." });
    }
    try {
      if (department !== undefined) {
        const departmentRow = await pool.query("SELECT 1 FROM departments WHERE name = $1", [department.trim()]);
        if (!departmentRow.rowCount) return res.status(400).json({ message: "Choose an existing department." });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          `UPDATE users SET name = COALESCE($1, name), department = COALESCE($2, department), phone = COALESCE($3, phone)
           WHERE id = $4 AND role = 'faculty' RETURNING id, name, email, employee_id, department, phone, status`,
          [name?.trim() || null, department ?? null, phone ?? null, req.params.id],
        );
        if (!updated.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Faculty record was not found." });
        }
        await client.query(
          `INSERT INTO faculty_profiles (user_id, subject, qualification, experience_years, joining_date)
           VALUES ($1, $2, $3, COALESCE($4, 0), $5)
           ON CONFLICT (user_id) DO UPDATE SET subject = COALESCE($2, faculty_profiles.subject),
             qualification = COALESCE($3, faculty_profiles.qualification),
             experience_years = COALESCE($4, faculty_profiles.experience_years),
             joining_date = COALESCE($5, faculty_profiles.joining_date)`,
          [req.params.id, subject ?? null, qualification ?? null, experienceYears ?? null, joiningDate ?? null],
        );
        if (courseIds !== undefined) {
          await client.query("DELETE FROM course_faculty WHERE faculty_id = $1", [req.params.id]);
          for (const courseId of [...new Set(courseIds.map(Number))]) await client.query(
            "INSERT INTO course_faculty (course_id, faculty_id) VALUES ($1, $2)",
            [courseId, req.params.id],
          );
        }
        await client.query("COMMIT");
        res.json(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23503") return res.status(400).json({ message: "One of the selected courses does not exist." });
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.post("/courses", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { title, department, degree = null, description = null, courseCode = null, semester = 1, facultyId } = req.body || {};
    if (!validText(title, 2, 180) || !validText(department, 2, 120) ||
      (degree !== null && (typeof degree !== "string" || degree.length > 80)) ||
      (courseCode !== null && !validText(courseCode, 2, 24)) ||
      (facultyId != null && !validId(facultyId)) ||
      !Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 12) return res.status(400).json({ message: "Provide a course title, department, and semester from 1 to 12." });
    try {
      const departmentRow = await pool.query("SELECT id FROM departments WHERE name = $1", [department.trim()]);
      if (!departmentRow.rowCount) return res.status(400).json({ message: "Choose an existing department." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO courses (title, department_id, department, degree, description, course_code, semester)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, title, department_id, department, degree, description, course_code, semester`,
          [title.trim(), departmentRow.rows[0].id, department.trim(), degree, description, courseCode?.trim() || null, Number(semester)],
        );
        if (facultyId != null) {
          const assignment = await client.query(
            "INSERT INTO course_faculty (course_id, faculty_id) SELECT $1, id FROM users WHERE id = $2 AND role = 'faculty'",
            [inserted.rows[0].id, facultyId],
          );
          if (!assignment.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Choose an existing faculty member." });
          }
        }
        await client.query("COMMIT");
        res.status(201).json(inserted.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") return res.status(409).json({ message: "That course code is already in use." });
        throw error;
      } finally { client.release(); }
    } catch (error) {
      next(error);
    }
  });

  router.patch("/courses/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { title, department, degree, description, courseCode, semester } = req.body || {};
    if (!validId(req.params.id) || (title !== undefined && !validText(title, 2, 180)) ||
      (department !== undefined && !validText(department, 2, 120)) ||
      (degree !== undefined && degree !== null && (typeof degree !== "string" || degree.length > 80)) ||
      (description !== undefined && description !== null && (typeof description !== "string" || description.length > 5000)) ||
      (courseCode !== undefined && courseCode !== null && !validText(courseCode, 2, 24)) ||
      (semester !== undefined && (!Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 12))) {
      return res.status(400).json({ message: "Check the course fields and semester." });
    }
    try {
      if (department !== undefined) {
        const departmentRow = await pool.query("SELECT id FROM departments WHERE name = $1", [department.trim()]);
        if (!departmentRow.rowCount) return res.status(400).json({ message: "Choose an existing department." });
      }
      const { rows } = await pool.query(
        `UPDATE courses SET title = COALESCE($1, title), department = COALESCE($2, department),
          department_id = COALESCE((SELECT id FROM departments WHERE name = $2), department_id),
          degree = COALESCE($3, degree), description = COALESCE($4, description),
          course_code = COALESCE($5, course_code), semester = COALESCE($6, semester)
         WHERE id = $7 RETURNING id, title, department_id, department, degree, description, course_code, semester`,
        [title?.trim() || null, department?.trim() || null, degree ?? null, description ?? null,
          courseCode?.trim() || null, semester === undefined ? null : Number(semester), req.params.id],
      );
      if (!rows.length) return res.status(404).json({ message: "Course was not found." });
      res.json(rows[0]);
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ message: "That course code is already in use." });
      next(error);
    }
  });

  router.delete("/courses/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid course ID." });
    try {
      const { rows } = await pool.query("DELETE FROM courses WHERE id = $1 RETURNING id", [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: "Course was not found." });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  router.put("/courses/:id/faculty", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { facultyIds } = req.body || {};
    if (!validId(req.params.id) || !Array.isArray(facultyIds) || facultyIds.some((id) => !validId(id))) return res.status(400).json({ message: "Provide a course and valid faculty assignments." });
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const course = await client.query("SELECT id FROM courses WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!course.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Course was not found." });
        }
        await client.query("DELETE FROM course_faculty WHERE course_id = $1", [req.params.id]);
        for (const facultyId of [...new Set(facultyIds.map(Number))]) {
          const assigned = await client.query(
          "INSERT INTO course_faculty (course_id, faculty_id) SELECT $1, id FROM users WHERE id = $2 AND role = 'faculty'",
          [req.params.id, facultyId],
          );
          if (!assigned.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "One of the selected faculty records was not found." });
          }
        }
        await client.query("COMMIT");
        res.json({ assigned: [...new Set(facultyIds)].length });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.put("/attendance", requireDatabase, authenticate, allowRoles("faculty", "admin"), async (req, res, next) => {
    const { courseId, classDate, records } = req.body || {};
    if (!validId(courseId) || !validDate(classDate) || !Array.isArray(records) || records.length < 1 || records.length > 200 ||
      records.some((item) => !validId(item.studentId) || !["present", "absent", "late", "leave"].includes(item.status)) ||
      new Set(records.map((record) => Number(record.studentId))).size !== records.length) {
      return res.status(400).json({ message: "Provide a course, class date, and up to 200 unique students with valid attendance statuses." });
    }
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (req.user.role === "faculty") {
          const assigned = await client.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
          if (!assigned.rowCount) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "You may only update attendance for your assigned courses." });
          }
        }
        for (const record of records) {
          const result = await client.query(
            `INSERT INTO attendance (student_id, course_id, class_date, status, marked_by)
             SELECT u.id, $2, $3, $4, $5 FROM users u JOIN student_courses sc ON sc.student_id = u.id AND sc.course_id = $2
             WHERE u.id = $1 AND u.role = 'student'
             ON CONFLICT (student_id, course_id, class_date)
             DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
            [record.studentId, courseId, classDate, record.status, req.user.sub],
          );
          if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Every student must be enrolled in the selected course." });
          }
        }
        await client.query("COMMIT");
        res.json({ updated: records.length });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.get("/attendance/course/:courseId", requireDatabase, authenticate, allowRoles("faculty", "admin"), async (req, res, next) => {
    const { courseId } = req.params;
    const classDate = typeof req.query.date === "string" ? req.query.date : null;
    if (!validId(courseId) || !validDate(classDate)) return res.status(400).json({ message: "Choose a valid course and class date." });
    try {
      if (req.user.role === "faculty") {
        const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
        if (!assigned.rowCount) return res.status(403).json({ message: "You may only view attendance for your assigned courses." });
      }
      const { rows } = await pool.query(
        `SELECT u.id AS student_id, u.student_id AS college_student_id, u.name, a.status
         FROM student_courses sc JOIN users u ON u.id = sc.student_id
         LEFT JOIN attendance a ON a.student_id = sc.student_id AND a.course_id = sc.course_id AND a.class_date = $2
         WHERE sc.course_id = $1 AND u.role = 'student' ORDER BY u.name LIMIT 200`,
        [courseId, classDate],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get("/results", requireDatabase, authenticate, allowRoles("student", "faculty", "admin"), async (req, res, next) => {
    const studentId = req.user.role === "student" ? Number(req.user.sub) : req.query.studentId ? Number(req.query.studentId) : null;
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if ((studentId && !validId(studentId)) || (courseId && !validId(courseId))) return res.status(400).json({ message: "Provide valid student and course IDs." });
    try {
      if (req.user.role === "faculty") {
        if (!courseId) return res.status(400).json({ message: "Faculty must select an assigned course." });
        const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
        if (!assigned.rowCount) return res.status(403).json({ message: "You may only view results for your assigned courses." });
      }
      const { rows } = await pool.query(
        `SELECT r.id, r.student_id, u.name AS student_name, u.student_id AS college_student_id,
          r.course_id, c.title AS course, r.semester, r.assignment_marks, r.internal_marks,
          r.practical_marks, r.final_marks,
          r.assignment_marks + r.internal_marks + r.practical_marks + r.final_marks AS total_marks,
          (r.assignment_marks + r.internal_marks + r.practical_marks + r.final_marks) / 4 AS percentage,
          r.updated_at
         FROM academic_results r JOIN users u ON u.id = r.student_id JOIN courses c ON c.id = r.course_id
         WHERE ($1::bigint IS NULL OR r.student_id = $1) AND ($2::bigint IS NULL OR r.course_id = $2)
         ORDER BY r.semester, c.title LIMIT 500`,
        [studentId, courseId],
      );
      res.json(rows.map((row) => ({ ...row, grade: gradeFor(Number(row.percentage)) })));
    } catch (error) { next(error); }
  });

  router.put("/results", requireDatabase, authenticate, allowRoles("faculty", "admin"), async (req, res, next) => {
    const { studentId, courseId, semester, assignmentMarks, internalMarks, practicalMarks, finalMarks } = req.body || {};
    const marks = [assignmentMarks, internalMarks, practicalMarks, finalMarks];
    if (!validId(studentId) || !validId(courseId) || !Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 12 ||
      marks.some((mark) => !Number.isFinite(Number(mark)) || Number(mark) < 0 || Number(mark) > 100)) return res.status(400).json({ message: "Each mark must be between 0 and 100, with valid student, course, and semester values." });
    try {
      if (req.user.role === "faculty") {
        const assigned = await pool.query("SELECT 1 FROM course_faculty WHERE faculty_id = $1 AND course_id = $2", [req.user.sub, courseId]);
        if (!assigned.rowCount) return res.status(403).json({ message: "You may only enter results for your assigned courses." });
      }
      const { rows } = await pool.query(
        `INSERT INTO academic_results (student_id, course_id, semester, assignment_marks, internal_marks,
          practical_marks, final_marks, entered_by)
         SELECT u.id, c.id, $3, $4, $5, $6, $7, $8 FROM users u CROSS JOIN courses c
         WHERE u.id = $1 AND u.role = 'student' AND c.id = $2
           AND EXISTS (SELECT 1 FROM student_courses sc WHERE sc.student_id = u.id AND sc.course_id = c.id)
         ON CONFLICT (student_id, course_id, semester) DO UPDATE SET
          assignment_marks = EXCLUDED.assignment_marks, internal_marks = EXCLUDED.internal_marks,
          practical_marks = EXCLUDED.practical_marks, final_marks = EXCLUDED.final_marks,
          entered_by = EXCLUDED.entered_by, updated_at = NOW()
         RETURNING id, student_id, course_id, semester, assignment_marks, internal_marks, practical_marks,
          final_marks, assignment_marks + internal_marks + practical_marks + final_marks AS total_marks,
          (assignment_marks + internal_marks + practical_marks + final_marks) / 4 AS percentage`,
        [studentId, courseId, Number(semester), ...marks.map(Number), req.user.sub],
      );
      if (!rows.length) return res.status(404).json({ message: "The student or course was not found." });
      res.json({ ...rows[0], grade: gradeFor(Number(rows[0].percentage)) });
    } catch (error) { next(error); }
  });

  router.get("/fees", requireDatabase, authenticate, allowRoles("student", "admin"), async (req, res, next) => {
    const studentId = req.user.role === "student" ? Number(req.user.sub) : req.query.studentId ? Number(req.query.studentId) : null;
    if (req.user.role === "admin" && studentId && !validId(studentId)) return res.status(400).json({ message: "Provide a valid student ID." });
    try {
      const { rows } = await pool.query(
        `SELECT sf.student_id, u.name AS student_name, u.student_id AS college_student_id, sf.total_fee,
          COALESCE(SUM(p.amount), 0) AS paid_amount,
          sf.total_fee - COALESCE(SUM(p.amount), 0) AS remaining_amount, sf.due_date,
          CASE WHEN COALESCE(SUM(p.amount), 0) >= sf.total_fee THEN 'paid'
               WHEN COALESCE(SUM(p.amount), 0) > 0 THEN 'partially_paid' ELSE 'pending' END AS status,
          COALESCE(json_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'method', p.payment_method, 'paidAt', p.paid_at))
            FILTER (WHERE p.id IS NOT NULL), '[]') AS payments
         FROM student_fees sf JOIN users u ON u.id = sf.student_id
         LEFT JOIN payments p ON p.student_id = sf.student_id
         WHERE ($1::bigint IS NULL OR sf.student_id = $1)
         GROUP BY sf.student_id, u.name, u.student_id, sf.total_fee, sf.due_date ORDER BY u.name`,
        [studentId],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.put("/fees/:studentId", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { totalFee, dueDate } = req.body || {};
    if (!validId(req.params.studentId) || !Number.isFinite(Number(totalFee)) || Number(totalFee) <= 0 ||
      Number(totalFee) > 1000000000 || (dueDate != null && dueDate !== "" && !validDate(dueDate))) return res.status(400).json({ message: "Provide a valid student, positive total fee, and optional due date." });
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const feeLock = await client.query("SELECT student_id FROM student_fees WHERE student_id = $1 FOR UPDATE", [req.params.studentId]);
        const student = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'student'", [req.params.studentId]);
        if (!student.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Student was not found." });
        }
        if (feeLock.rowCount) {
          const existingPayment = await client.query("SELECT 1 FROM payments WHERE student_id = $1 LIMIT 1", [req.params.studentId]);
          if (existingPayment.rowCount) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "The fee cannot be changed after a payment receipt has been recorded." });
          }
        }
        const { rows } = await client.query(
          `INSERT INTO student_fees (student_id, total_fee, due_date, updated_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_id) DO UPDATE SET total_fee = EXCLUDED.total_fee,
            due_date = EXCLUDED.due_date, updated_by = EXCLUDED.updated_by, updated_at = NOW()
           RETURNING student_id, total_fee, due_date`,
          [req.params.studentId, Number(totalFee), dueDate || null, req.user.sub],
        );
        await client.query("COMMIT");
        res.json(rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.post("/payments", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const { studentId, paymentMethod, idempotencyKey } = req.body || {};
    if (!validId(studentId) || !["cash", "upi", "card", "bank_transfer"].includes(paymentMethod) ||
      typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return res.status(400).json({ message: "Provide a valid student, payment method, and unique transaction key." });
    }
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const repeated = await client.query(
          "SELECT id, student_id, amount, payment_method, paid_at FROM payments WHERE idempotency_key = $1",
          [idempotencyKey],
        );
        if (repeated.rowCount) {
          await client.query("COMMIT");
          return res.json({ ...repeated.rows[0], duplicate: true });
        }
        const fee = await client.query("SELECT total_fee FROM student_fees WHERE student_id = $1 FOR UPDATE", [studentId]);
        if (!fee.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Set up the student's fee before recording payment." });
        }
        const repeatedAfterLock = await client.query(
          "SELECT id, student_id, amount, payment_method, paid_at FROM payments WHERE idempotency_key = $1",
          [idempotencyKey],
        );
        if (repeatedAfterLock.rowCount) {
          await client.query("COMMIT");
          return res.json({ ...repeatedAfterLock.rows[0], duplicate: true });
        }
        const paid = await client.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE student_id = $1", [studentId]);
        if (Number(paid.rows[0].total) > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "This fee has already been paid. Only one full payment is supported." });
        }
        const amount = Number(fee.rows[0].total_fee);
        const inserted = await client.query(
          `INSERT INTO payments (student_id, idempotency_key, amount, payment_method, received_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, student_id, amount, payment_method, paid_at`,
          [studentId, idempotencyKey, amount, paymentMethod, req.user.sub],
        );
        await client.query("COMMIT");
        res.status(201).json(inserted.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") return res.status(409).json({ message: "This transaction key was already used." });
        throw error;
      } finally { client.release(); }
    } catch (error) { next(error); }
  });

  app.use("/api", router);
}
