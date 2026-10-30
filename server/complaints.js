import express from "express";
import multer from "multer";

const categories = ["Academic", "Technical", "Infrastructure", "Hostel", "Transport", "Library", "Fees", "Other"];
const priorities = ["Low", "Medium", "High", "Urgent"];
const statuses = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Rejected"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, fieldSize: 10000 },
});
const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validText = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.length <= max;
const validContact = (value) => validText(value, 7, 180) &&
  (emailPattern.test(value.trim()) ||
    (/^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, "").length >= 7));
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const allowedFile = (file) => {
  const bytes = file.buffer;
  if (file.mimetype === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (file.mimetype === "application/pdf") return bytes.toString("ascii", 0, 5) === "%PDF-";
  return false;
};

function runUpload(req, res, next) {
  upload.single("evidence")(req, res, (error) => {
    if (!error) return next();
    return res.status(400).json({
      message: error.code === "LIMIT_FILE_SIZE"
        ? "Evidence files must be 5 MB or smaller."
        : "Upload one supported evidence file (JPEG, PNG, WebP, or PDF).",
    });
  });
}

export function registerComplaintRoutes(app, { pool, requireDatabase, authenticate, allowRoles }) {
  const router = express.Router();

  const readComplaint = async (id, user) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.complaint_code, c.user_id, c.title, c.description, c.category,
              c.department_id, d.name AS department, c.priority, c.location, c.complaint_date,
              c.contact_info, c.status, c.assigned_staff_id, staff.name AS assigned_staff,
              owner.name AS submitted_by, c.created_at, c.updated_at, c.resolved_at,
              a.id AS attachment_id, a.filename AS attachment_name,
              f.rating AS feedback_rating, f.comment AS feedback_comment
       FROM complaints c JOIN departments d ON d.id = c.department_id
       JOIN users owner ON owner.id = c.user_id
       LEFT JOIN users staff ON staff.id = c.assigned_staff_id
       LEFT JOIN complaint_attachments a ON a.complaint_id = c.id
       LEFT JOIN complaint_feedback f ON f.complaint_id = c.id
       WHERE c.id = $1 AND (
         $2::text = 'admin' OR c.user_id = $3 OR
         ($2::text = 'staff' AND d.name = (SELECT department FROM users WHERE id = $3 AND role = 'staff'))
       )`,
      [id, user.role, user.sub],
    );
    return rows[0] || null;
  };

  router.get("/complaints", requireDatabase, authenticate, async (req, res, next) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Choose a valid page and a page size from 1 to 50." });
    }
    const { search = "", status, category, priority, department, sort = "date", order = "desc" } = req.query;
    if (typeof search !== "string" || search.length > 180) return res.status(400).json({ message: "Search text must be 180 characters or fewer." });
    if (status && !statuses.includes(status)) return res.status(400).json({ message: "Choose a valid complaint status." });
    if (category && !categories.includes(category)) return res.status(400).json({ message: "Choose a valid complaint category." });
    if (priority && !priorities.includes(priority)) return res.status(400).json({ message: "Choose a valid complaint priority." });
    if (department && !validId(department)) return res.status(400).json({ message: "Choose a valid department." });
    if (!["date", "priority"].includes(sort) || !["asc", "desc"].includes(order)) return res.status(400).json({ message: "Choose a valid sort field and direction." });
    try {
      const filters = [req.user.role, req.user.sub, `%${search.trim()}%`, status || null, category || null, priority || null, department || null];
      const where = `($1::text = 'admin' OR c.user_id = $2 OR
          ($1::text = 'staff' AND d.name = (SELECT department FROM users WHERE id = $2 AND role = 'staff')))
        AND ($3::text = '%%' OR c.complaint_code ILIKE $3 OR c.title ILIKE $3)
        AND ($4::text IS NULL OR c.status = $4)
        AND ($5::text IS NULL OR c.category = $5)
        AND ($6::text IS NULL OR c.priority = $6)
        AND ($7::bigint IS NULL OR c.department_id = $7)`;
      const [count, rows] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total FROM complaints c JOIN departments d ON d.id = c.department_id WHERE ${where}`, filters),
        pool.query(
          `SELECT c.id, c.complaint_code, c.user_id, c.title, c.category, c.department_id,
                  d.name AS department, c.priority, c.location, c.complaint_date, c.status,
                  owner.name AS submitted_by, staff.name AS assigned_staff, c.created_at, c.updated_at
           FROM complaints c JOIN departments d ON d.id = c.department_id
           JOIN users owner ON owner.id = c.user_id
           LEFT JOIN users staff ON staff.id = c.assigned_staff_id
           WHERE ${where}
           ORDER BY ${sort === "priority" ? "CASE c.priority WHEN 'Urgent' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END" : "c.created_at"} ${order.toUpperCase()},
                    c.created_at DESC
           LIMIT $8 OFFSET $9`,
          [...filters, limit, (page - 1) * limit],
        ),
      ]);
      res.json({ complaints: rows.rows, total: count.rows[0].total, page, limit, pages: Math.ceil(count.rows[0].total / limit) });
    } catch (error) { next(error); }
  });

  router.get("/complaints/stats", requireDatabase, authenticate, async (req, res, next) => {
    try {
      const filters = [req.user.role, req.user.sub];
      const scope = `($1::text = 'admin' OR c.user_id = $2 OR
        ($1::text = 'staff' AND d.name = (SELECT department FROM users WHERE id = $2 AND role = 'staff')))`;
      const [totals, departments, months] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE c.status IN ('Submitted','Under Review','Assigned'))::int AS pending,
             COUNT(*) FILTER (WHERE c.status = 'In Progress')::int AS in_progress,
             COUNT(*) FILTER (WHERE c.status = 'Resolved')::int AS resolved,
             COUNT(*) FILTER (WHERE c.priority = 'Urgent' AND c.status <> 'Resolved')::int AS urgent
           FROM complaints c JOIN departments d ON d.id = c.department_id WHERE ${scope}`,
          filters,
        ),
        req.user.role === "admin"
          ? pool.query(
            `SELECT d.name AS department, COUNT(c.id)::int AS total
             FROM departments d LEFT JOIN complaints c ON c.department_id = d.id
             GROUP BY d.id ORDER BY total DESC, d.name`,
          )
          : Promise.resolve({ rows: [] }),
        pool.query(
          `SELECT TO_CHAR(DATE_TRUNC('month', c.created_at), 'Mon YYYY') AS month, COUNT(*)::int AS total
           FROM complaints c JOIN departments d ON d.id = c.department_id
           WHERE ${scope} AND c.created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
           GROUP BY DATE_TRUNC('month', c.created_at) ORDER BY DATE_TRUNC('month', c.created_at)`,
          filters,
        ),
      ]);
      res.json({ ...totals.rows[0], departments: departments.rows, monthly: months.rows });
    } catch (error) { next(error); }
  });

  router.post("/complaints", requireDatabase, authenticate, allowRoles("student"), runUpload, async (req, res, next) => {
    const { title, description, category, departmentId, priority = "Medium", location, complaintDate, contactInfo } = req.body || {};
    if (!validText(title, 5, 180) || !validText(description, 20, 10000) || !categories.includes(category) ||
      !validId(Number(departmentId)) || !priorities.includes(priority) || !validText(location, 2, 180) ||
      !validDate(complaintDate) || complaintDate > new Date().toISOString().slice(0, 10) ||
      !validContact(contactInfo)) {
      return res.status(400).json({ message: "Check the required complaint fields and use valid contact information." });
    }
    if (req.file && !allowedFile(req.file)) return res.status(400).json({ message: "Evidence must be a genuine JPEG, PNG, WebP image, or PDF." });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO complaints (user_id, title, description, category, department_id, priority, location, complaint_date, contact_info)
         SELECT $1, $2, $3, $4, d.id, $5, $6, $7, $8 FROM departments d WHERE d.id = $9
         RETURNING id, status, created_at`,
        [req.user.sub, title.trim(), description.trim(), category, priority, location.trim(), complaintDate, contactInfo.trim(), Number(departmentId)],
      );
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Choose a department that exists." });
      }
      const complaint = inserted.rows[0];
      const code = `CMP-${new Date().getFullYear()}-${String(complaint.id).padStart(6, "0")}`;
      await client.query("UPDATE complaints SET complaint_code = $1 WHERE id = $2", [code, complaint.id]);
      await client.query(
        "INSERT INTO complaint_updates (complaint_id, actor_id, status, message) VALUES ($1, $2, $3, $4)",
        [complaint.id, req.user.sub, complaint.status, "Complaint submitted."],
      );
      if (req.file) {
        const safeName = req.file.originalname.replace(/[^\w.-]/g, "_").slice(-180) || "evidence";
        await client.query(
          "INSERT INTO complaint_attachments (complaint_id, filename, mime_type, content) VALUES ($1, $2, $3, $4)",
          [complaint.id, safeName, req.file.mimetype, req.file.buffer],
        );
      }
      await client.query(
        `INSERT INTO complaint_notifications (user_id, complaint_id, message)
         SELECT id, $1, $2 FROM users WHERE role = 'admin'`,
        [complaint.id, `New complaint ${code} requires review.`],
      );
      await client.query("COMMIT");
      res.status(201).json({ id: complaint.id, complaint_code: code, status: complaint.status, created_at: complaint.created_at });
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      next(error);
    } finally { client?.release(); }
  });

  router.get("/complaints/notifications", requireDatabase, authenticate, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT n.id, n.complaint_id, c.complaint_code, n.message, n.read_at, n.created_at
         FROM complaint_notifications n JOIN complaints c ON c.id = n.complaint_id
         WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 100`,
        [req.user.sub],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.patch("/complaints/notifications/:id", requireDatabase, authenticate, async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid notification ID." });
    try {
      const { rows } = await pool.query(
        "UPDATE complaint_notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id, read_at",
        [req.params.id, req.user.sub],
      );
      if (!rows.length) return res.status(404).json({ message: "Notification was not found." });
      res.json(rows[0]);
    } catch (error) { next(error); }
  });

  router.get("/complaints/staff", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    const departmentId = Number(req.query.departmentId);
    if (!validId(departmentId)) return res.status(400).json({ message: "Choose a valid department." });
    try {
      const { rows } = await pool.query(
        "SELECT id, name, email, department FROM users WHERE role = 'staff' AND department = (SELECT name FROM departments WHERE id = $1) ORDER BY name",
        [departmentId],
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get("/complaints/:id", requireDatabase, authenticate, async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid complaint ID." });
    try {
      const complaint = await readComplaint(req.params.id, req.user);
      if (!complaint) return res.status(404).json({ message: "Complaint was not found." });
      const { rows: updates } = await pool.query(
        `SELECT u.id, u.status, u.message, u.created_at, actor.name AS actor_name
         FROM complaint_updates u LEFT JOIN users actor ON actor.id = u.actor_id
         WHERE u.complaint_id = $1 ORDER BY u.created_at`,
        [req.params.id],
      );
      res.json({ ...complaint, updates });
    } catch (error) { next(error); }
  });

  router.get("/complaints/:id/evidence", requireDatabase, authenticate, async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid complaint ID." });
    try {
      const complaint = await readComplaint(req.params.id, req.user);
      if (!complaint || !complaint.attachment_id) return res.status(404).json({ message: "Evidence was not found." });
      const { rows } = await pool.query(
        "SELECT filename, mime_type, content FROM complaint_attachments WHERE id = $1 AND complaint_id = $2",
        [complaint.attachment_id, req.params.id],
      );
      if (!rows.length) return res.status(404).json({ message: "Evidence was not found." });
      const file = rows[0];
      const filename = file.filename.replace(/[^\w.-]/g, "_");
      res.set({ "Content-Type": file.mime_type, "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff" });
      res.send(file.content);
    } catch (error) { next(error); }
  });

  router.patch("/complaints/:id", requireDatabase, authenticate, allowRoles("admin", "staff"), async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid complaint ID." });
    const { status, departmentId, staffId, message = "" } = req.body || {};
    if (status !== undefined && !statuses.includes(status)) return res.status(400).json({ message: "Choose a valid complaint status." });
    if (message !== "" && !validText(message, 2, 3000)) return res.status(400).json({ message: "Response must be between 2 and 3,000 characters." });
    if (req.user.role === "staff" && (departmentId !== undefined || staffId !== undefined ||
      (status !== undefined && !["Under Review", "In Progress", "Resolved"].includes(status)))) {
      return res.status(403).json({ message: "Staff may update progress only for their own department." });
    }
    if (departmentId !== undefined && !validId(Number(departmentId))) return res.status(400).json({ message: "Choose a valid department." });
    if (staffId !== undefined && staffId !== null && !validId(Number(staffId))) return res.status(400).json({ message: "Choose a valid staff member." });
    if (status === undefined && departmentId === undefined && staffId === undefined && !message) return res.status(400).json({ message: "Provide an assignment, status, or response to save." });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT c.id, c.user_id, c.status, c.department_id, c.assigned_staff_id, d.name AS department
         FROM complaints c JOIN departments d ON d.id = c.department_id
         WHERE c.id = $1 AND ($2::text = 'admin' OR
           ($2::text = 'staff' AND d.name = (SELECT department FROM users WHERE id = $3 AND role = 'staff')))
         FOR UPDATE`,
        [req.params.id, req.user.role, req.user.sub],
      );
      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Complaint was not found in your department." });
      }
      const current = existing.rows[0];
      const newDepartment = departmentId === undefined ? current.department_id : Number(departmentId);
      if (departmentId !== undefined) {
        const department = await client.query("SELECT id FROM departments WHERE id = $1", [newDepartment]);
        if (!department.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Choose a department that exists." });
        }
      }
      const departmentChanged = departmentId !== undefined && Number(departmentId) !== Number(current.department_id);
      let newStaff = staffId === undefined ? (departmentChanged ? null : undefined) : (staffId === null ? null : Number(staffId));
      if (req.user.role === "admin" && staffId !== undefined && staffId !== null) {
        const staff = await client.query(
          "SELECT id FROM users WHERE id = $1 AND role = 'staff' AND department = (SELECT name FROM departments WHERE id = $2)",
          [newStaff, newDepartment],
        );
        if (!staff.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Assign a staff account from the selected department." });
        }
      }
      const nextStatus = status ?? (staffId !== undefined || departmentId !== undefined ? "Assigned" : current.status);
      if (req.user.role === "staff" && current.assigned_staff_id && Number(current.assigned_staff_id) !== Number(req.user.sub)) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "This complaint is assigned to another staff member." });
      }
      const updated = await client.query(
        `UPDATE complaints
         SET status = $1, department_id = $2, assigned_staff_id = CASE WHEN $5 THEN $3 ELSE assigned_staff_id END,
             updated_at = NOW(), resolved_at = CASE WHEN $1 = 'Resolved' THEN COALESCE(resolved_at, NOW()) ELSE NULL END
         WHERE id = $4
         RETURNING id, complaint_code, status, department_id, assigned_staff_id, updated_at`,
        [nextStatus, newDepartment, newStaff === undefined ? null : newStaff, req.params.id, newStaff !== undefined],
      );
      const activity = message.trim() || (status && status !== current.status
        ? `Status updated to ${status}.`
        : departmentId !== undefined || staffId !== undefined ? "Complaint assignment updated." : "Complaint updated.");
      await client.query(
        "INSERT INTO complaint_updates (complaint_id, actor_id, status, message) VALUES ($1, $2, $3, $4)",
        [req.params.id, req.user.sub, status ?? null, activity],
      );
      await client.query(
        "INSERT INTO complaint_notifications (user_id, complaint_id, message) VALUES ($1, $2, $3)",
        [current.user_id, req.params.id, `${updated.rows[0].complaint_code}: ${activity}`],
      );
      if (newStaff) {
        await client.query(
          "INSERT INTO complaint_notifications (user_id, complaint_id, message) VALUES ($1, $2, $3)",
          [newStaff, req.params.id, `Complaint ${updated.rows[0].complaint_code} was assigned to you.`],
        );
      }
      await client.query("COMMIT");
      res.json(updated.rows[0]);
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      next(error);
    } finally { client?.release(); }
  });

  router.post("/complaints/:id/feedback", requireDatabase, authenticate, allowRoles("student"), async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid complaint ID." });
    const { rating, comment = "" } = req.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || (comment !== "" && !validText(comment, 2, 1000))) {
      return res.status(400).json({ message: "Choose a rating from 1 to 5 and keep feedback under 1,000 characters." });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO complaint_feedback (complaint_id, user_id, rating, comment)
         SELECT c.id, c.user_id, $3, $4 FROM complaints c
         WHERE c.id = $1 AND c.user_id = $2 AND c.status = 'Resolved'
         RETURNING id, complaint_id, rating, comment, created_at`,
        [req.params.id, req.user.sub, rating, comment.trim() || null],
      );
      if (!rows.length) return res.status(409).json({ message: "Feedback is available only for your resolved complaints, and can be sent once." });
      res.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ message: "Feedback has already been submitted for this complaint." });
      next(error);
    }
  });

  router.delete("/complaints/:id", requireDatabase, authenticate, allowRoles("admin"), async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Provide a valid complaint ID." });
    try {
      const { rows } = await pool.query("DELETE FROM complaints WHERE id = $1 RETURNING id", [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: "Complaint was not found." });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.use("/api", router);
}
