import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, Check, ChevronDown, CircleHelp,
  ClipboardList, Clock3, FileText, Filter, LayoutDashboard, LogOut, MessageSquare, Plus, Search,
  ShieldCheck, Star, Users, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import "./complaints.css";

const categories = ["Academic", "Technical", "Infrastructure", "Hostel", "Transport", "Library", "Fees", "Other"];
const priorities = ["Low", "Medium", "High", "Urgent"];
const statuses = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Rejected"];
const statusColors = { Submitted: "#7294bc", "Under Review": "#d2a34a", Assigned: "#8065bb", "In Progress": "#3988aa", Resolved: "#4b9b74", Rejected: "#c76161" };
const localKey = "northstar-complaints-demo";
const dateToday = () => new Date().toISOString().slice(0, 10);
const emptyStats = { total: 0, pending: 0, in_progress: 0, resolved: 0, urgent: 0, departments: [], monthly: [] };
const seedDepartments = [
  { id: "Computer Science", name: "Computer Science" },
  { id: "Business & Economics", name: "Business & Economics" },
  { id: "Architecture & Design", name: "Architecture & Design" },
  { id: "Life Sciences", name: "Life Sciences" },
  { id: "Liberal Arts", name: "Liberal Arts" },
  { id: "Law & Public Policy", name: "Law & Public Policy" },
];

function readDemoData() {
  try {
    const saved = JSON.parse(localStorage.getItem(localKey) || "{}");
    return {
      complaints: Array.isArray(saved.complaints) ? saved.complaints : [],
      notifications: Array.isArray(saved.notifications) ? saved.notifications : [],
      staff: Array.isArray(saved.staff) ? saved.staff : [],
      seededEmails: Array.isArray(saved.seededEmails) ? saved.seededEmails : [],
      seededWorkspace: Boolean(saved.seededWorkspace),
    };
  } catch {
    return { complaints: [], notifications: [], staff: [], seededEmails: [], seededWorkspace: false };
  }
}

function csvSafe(value) {
  const text = String(value ?? "").replace(/^[\t\r ]*[=+\-@]/, (match) => `'${match.trimStart()}`);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadReport(rows) {
  const columns = ["Complaint ID", "Title", "Category", "Department", "Priority", "Status", "Date", "Submitted by"];
  const csv = [columns, ...rows.map((row) => [
    row.complaint_code, row.title, row.category, row.department, row.priority, row.status,
    row.complaint_date, row.submitted_by,
  ])].map((row) => row.map(csvSafe).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "northstar-complaints-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function visibleComplaints(rows, session) {
  if (session.role === "admin") return rows;
  if (session.role === "staff") return rows.filter((item) => item.department === session.department);
  return rows.filter((item) => item.user_email === session.email || item.user_id === session.id);
}

function makeStats(rows, departments) {
  const months = Array.from({ length: 6 }, (_value, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    return { date, label: date.toLocaleDateString("en", { month: "short", year: "numeric" }), total: 0 };
  });
  rows.forEach((item) => {
    const created = new Date(item.created_at);
    const month = months.find(({ date }) => date.getMonth() === created.getMonth() && date.getFullYear() === created.getFullYear());
    if (month) month.total += 1;
  });
  return {
    total: rows.length,
    pending: rows.filter((item) => ["Submitted", "Under Review", "Assigned"].includes(item.status)).length,
    in_progress: rows.filter((item) => item.status === "In Progress").length,
    resolved: rows.filter((item) => item.status === "Resolved").length,
    urgent: rows.filter((item) => item.priority === "Urgent" && item.status !== "Resolved").length,
    departments: departments.map((department) => ({
      department: department.name,
      total: rows.filter((item) => item.department === department.name).length,
    })),
    monthly: months.map(({ label, total }) => ({ month: label, total })),
  };
}

function seedDemoComplaints(session, offset = 0) {
  const submittedAt = new Date().toISOString();
  const seedOwner = (session.email || "sample").replace(/[^a-z0-9]/gi, "");
  const examples = [
    { suffix: 1, title: "Campus Wi-Fi disconnects in the study area", description: "The wireless network drops frequently in the second-floor study area, especially during afternoon classes. It has been happening this week.", category: "Technical", department: "Computer Science", priority: "High", status: "In Progress" },
    { suffix: 2, title: "Request for quieter library study space", description: "The group study area is often noisy during exam preparation. Could the quiet-zone signs and study room booking rules be reviewed?", category: "Library", department: "Liberal Arts", priority: "Medium", status: "Resolved" },
  ];
  return examples.map((item) => {
    const id = `demo-seed-${seedOwner}-${item.suffix}`;
    const code = `CMP-2026-${String(offset + item.suffix).padStart(6, "0")}`;
    return {
      ...item, id, complaint_code: code,
      user_id: session.role === "student" ? session.id : `demo-student-${item.suffix}`,
      user_email: session.role === "student" ? session.email : `student${item.suffix}@northstar.edu`,
      submitted_by: session.role === "student" ? session.name : `Student ${item.suffix}`,
      department_id: item.department, location: item.suffix === 1 ? "Innovation Center, Level 2" : "Central Library",
      complaint_date: dateToday(), contact_info: session.role === "student" ? session.email : `student${item.suffix}@northstar.edu`,
      created_at: submittedAt, updated_at: submittedAt, resolved_at: item.status === "Resolved" ? submittedAt : null,
      updates: [
        { id: `${id}-1`, status: "Submitted", message: "Complaint submitted.", created_at: submittedAt, actor_name: session.role === "student" ? session.name : `Student ${item.suffix}` },
        ...(item.status !== "Submitted" ? [{ id: `${id}-2`, status: item.status, message: item.status === "Resolved" ? "The library team reviewed the quiet-zone signage and updated the room booking guidance." : "The department is investigating this report.", created_at: submittedAt, actor_name: "Department team" }] : []),
      ],
    };
  });
}

function DetailModal({ complaint, role, departments, staff, onClose, onUpdate, onFeedback, onEvidence, loading }) {
  const [status, setStatus] = useState(complaint.status);
  const [departmentId, setDepartmentId] = useState(String(complaint.department_id || ""));
  const [staffId, setStaffId] = useState(complaint.assigned_staff_id ? String(complaint.assigned_staff_id) : "");
  const [response, setResponse] = useState("");
  const [rating, setRating] = useState(complaint.feedback_rating || 0);
  const [feedback, setFeedback] = useState(complaint.feedback_comment || "");
  const [formError, setFormError] = useState("");
  const isManager = role === "admin" || role === "staff";
  const canRate = role === "student" && complaint.status === "Resolved" && !complaint.feedback_rating;

  const submitUpdate = async (event) => {
    event.preventDefault();
    setFormError("");
    try {
      await onUpdate(complaint.id, {
        status,
        ...(role === "admin" ? { departmentId, staffId: staffId || null } : {}),
        message: response.trim(),
      });
      setResponse("");
    } catch (error) {
      setFormError(error.message);
    }
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    setFormError("");
    try {
      await onFeedback(complaint.id, { rating, comment: feedback });
    } catch (error) {
      setFormError(error.message);
    }
  };

  return <div className="complaint-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="complaint-detail" role="dialog" aria-modal="true" aria-labelledby="complaint-detail-title">
      <header className="complaint-detail-head">
        <div><span className="complaint-eyebrow">{complaint.complaint_code}</span><h2 id="complaint-detail-title">{complaint.title}</h2></div>
        <button className="complaint-icon-button" onClick={onClose} aria-label="Close complaint details"><X size={19} /></button>
      </header>
      <div className="complaint-detail-scroll">
        <div className="complaint-detail-badges">
          <span className="complaint-status" style={{ "--status-color": statusColors[complaint.status] }}>{complaint.status}</span>
          <span className={`complaint-priority priority-${complaint.priority?.toLowerCase()}`}>{complaint.priority} priority</span>
          <span>{complaint.category}</span>
        </div>
        <div className="complaint-detail-grid">
          <section className="complaint-detail-main">
            <article className="complaint-detail-card">
              <h3>Complaint details</h3>
              <p className="complaint-description">{complaint.description}</p>
              <div className="complaint-meta-grid">
                <span><small>Department</small>{complaint.department}</span>
                <span><small>Location</small>{complaint.location}</span>
                <span><small>Submitted</small>{complaint.complaint_date}</span>
                {complaint.submitted_by && <span><small>Submitted by</small>{complaint.submitted_by}</span>}
                {complaint.assigned_staff && <span><small>Assigned staff</small>{complaint.assigned_staff}</span>}
                <span><small>Contact</small>{complaint.contact_info}</span>
              </div>
              {complaint.attachment_id && <button className="complaint-evidence" onClick={() => onEvidence(complaint)}><FileText size={17} />{complaint.attachment_name || "Download evidence"}<ArrowDownToLine size={15} /></button>}
            </article>
            <article className="complaint-detail-card">
              <h3>Progress history</h3>
              <ol className="complaint-timeline">
                {(complaint.updates || []).map((update) => <li key={update.id || `${update.created_at}-${update.message}`} className={update.status ? "has-status" : ""}>
                  <span className="timeline-dot" />
                  <div><div className="timeline-line-title">{update.status && <strong>{update.status}</strong>}<time>{new Date(update.created_at).toLocaleString()}</time></div><p>{update.message}</p>{update.actor_name && <small>by {update.actor_name}</small>}</div>
                </li>)}
              </ol>
            </article>
          </section>
          <aside className="complaint-detail-side">
            {isManager && <form className="complaint-detail-card complaint-action-form" onSubmit={submitUpdate}>
              <h3>Manage complaint</h3>
              {role === "admin" && <>
                <label>Department<select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setStaffId(""); }} required>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>Assign staff<select value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Unassigned</option>{staff.filter((item) => item.department === departments.find((department) => String(department.id) === departmentId)?.name).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              </>}
              <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{(role === "staff" ? [...new Set([status, "Under Review", "In Progress", "Resolved"])] : statuses).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Response or internal update<textarea value={response} onChange={(event) => setResponse(event.target.value)} maxLength={3000} rows={4} placeholder="Share an update or a resolution…" /></label>
              {formError && <p className="complaint-error" role="alert">{formError}</p>}
              <button className="complaint-button primary" disabled={loading}>{loading ? "Saving…" : "Save update"} <ArrowRight size={15} /></button>
            </form>}
            {canRate && <form className="complaint-detail-card complaint-feedback-form" onSubmit={submitFeedback}>
              <h3>Rate this resolution</h3><p>Tell us whether your concern was addressed.</p>
              <div className="complaint-stars" role="group" aria-label="Rating from one to five">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= rating ? "selected" : ""} onClick={() => setRating(value)} aria-label={`${value} stars`}><Star size={23} fill={value <= rating ? "currentColor" : "none"} /></button>)}</div>
              <label>Comment <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={1000} rows={3} placeholder="Optional feedback" /></label>
              {formError && <p className="complaint-error" role="alert">{formError}</p>}
              <button className="complaint-button primary" disabled={loading || !rating}>{loading ? "Submitting…" : "Send feedback"}</button>
            </form>}
            {complaint.feedback_rating && <div className="complaint-detail-card"><h3>Your feedback</h3><div className="complaint-stars read-only">{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={19} fill={value <= complaint.feedback_rating ? "currentColor" : "none"} />)}</div><p>{complaint.feedback_comment || "Thanks for rating the resolution."}</p></div>}
          </aside>
        </div>
      </div>
    </section>
  </div>;
}

export default function ComplaintPortal({ session, logout }) {
  const navigate = useNavigate();
  const role = session?.role || "student";
  const isDemo = !session?.token;
  const [active, setActive] = useState("Overview");
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [departments, setDepartments] = useState(seedDepartments);
  const [staff, setStaff] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!session) navigate("/login/student");
  }, [session, navigate]);

  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${session?.token}` } }), [session?.token]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    if (isDemo) {
      const local = readDemoData();
      local.seededEmails = Array.isArray(local.seededEmails) ? local.seededEmails : [];
      let seeded = false;
      if (role === "student" && !local.seededEmails.includes(session.email)) {
        local.complaints = [...local.complaints, ...seedDemoComplaints(session, local.complaints.length)];
        local.seededEmails.push(session.email);
        seeded = true;
      } else if (role !== "student" && !local.seededWorkspace) {
        local.complaints = [...local.complaints, ...seedDemoComplaints({ role: "admin", id: "demo-admin", email: "student@northstar.edu", name: "Sample Student" }, local.complaints.length)];
        local.seededWorkspace = true;
        seeded = true;
      }
      if (seeded) {
        localStorage.setItem(localKey, JSON.stringify(local));
      }
      const owned = visibleComplaints(local.complaints, session);
      setComplaints(owned);
      setTotal(owned.length);
      setPages(Math.max(1, Math.ceil(owned.length / 10)));
      setNotifications(local.notifications.filter((item) =>
        role === "admin" || item.user_email === session.email || item.department === session.department,
      ));
      setStaff(local.staff);
      const demoStudents = [...new Map(local.complaints.map((item) => [item.user_email, {
        id: item.user_id, name: item.submitted_by, email: item.user_email, role: "student", department: item.department,
      }])).values()];
      setUsers([...demoStudents, ...local.staff.map((person, index) => ({ id: `demo-staff-${index}`, ...person, role: "staff" }))]);
      setStats(makeStats(owned, seedDepartments));
      setDepartments(seedDepartments);
      setLoading(false);
      return;
    }
    try {
      const params = { page, limit: 10, sort: sortBy, order: sortOrder, ...(search ? { search } : {}), ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterCategory ? { category: filterCategory } : {}), ...(filterPriority ? { priority: filterPriority } : {}),
        ...(filterDepartment ? { department: filterDepartment } : {}) };
      const calls = [
        axios.get("/api/complaints", { ...auth, params }),
        axios.get("/api/complaints/stats", auth),
        axios.get("/api/departments", auth),
        axios.get("/api/complaints/notifications", auth),
        ...(role === "admin" ? [axios.get("/api/users", auth), axios.get("/api/users?role=staff", auth)] : []),
      ];
      const results = await Promise.all(calls);
      const list = results[0].data;
      setComplaints(list.complaints);
      setTotal(list.total);
      setPages(Math.max(1, list.pages || 1));
      setStats(results[1].data);
      setDepartments(results[2].data);
      setNotifications(results[3].data);
      if (role === "admin") {
        setUsers(results[4].data);
        setStaff(results[5].data.map((person) => ({ ...person, department: person.department })));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Complaint records could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [session, isDemo, role, auth, page, search, filterStatus, filterCategory, filterPriority, filterDepartment, sortBy, sortOrder]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateDemo = (updater) => {
    const local = readDemoData();
    const next = updater(local);
    localStorage.setItem(localKey, JSON.stringify(next));
    return next;
  };

  const refreshDetail = async (id) => {
    if (isDemo) {
      const item = readDemoData().complaints.find((complaint) => String(complaint.id) === String(id));
      if (!item) throw new Error("Complaint was not found.");
      setDetail(item);
      return;
    }
    const result = await axios.get(`/api/complaints/${id}`, auth);
    setDetail(result.data);
  };

  const openDetail = async (item) => {
    try {
      await refreshDetail(item.id);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message);
    }
  };

  const submitComplaint = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const department = departments.find((item) => String(item.id) === String(form.get("departmentId")));
    const data = Object.fromEntries(form.entries());
    const evidence = form.get("evidence");
    try {
      if (isDemo) {
        const local = readDemoData();
        const id = `demo-${Date.now()}`;
        const code = `CMP-${new Date().getFullYear()}-${String(local.complaints.length + 1).padStart(6, "0")}`;
        const created = {
          ...data, id, complaint_code: code, user_id: session.id, user_email: session.email,
          submitted_by: session.name, department_id: department?.id, department: department?.name,
          priority: data.priority || "Medium", status: "Submitted", created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(), updates: [{ id: `${id}-1`, status: "Submitted", message: "Complaint submitted.", created_at: new Date().toISOString(), actor_name: session.name }],
          attachment_name: evidence?.size ? evidence.name : "",
        };
        updateDemo((previous) => ({
          ...previous,
          complaints: [created, ...previous.complaints],
          notifications: previous.notifications,
        }));
        setNotice(`Complaint ${code} was submitted.`);
      } else {
        const payload = new FormData();
        for (const [key, value] of form.entries()) if (key !== "evidence") payload.append(key, value);
        if (evidence?.size) payload.append("evidence", evidence);
        const result = await axios.post("/api/complaints", payload, auth);
        setNotice(`Complaint ${result.data.complaint_code} was submitted.`);
      }
      formElement.reset();
      setActive("All complaints");
      setPage(1);
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Complaint could not be submitted.");
    } finally {
      setSaving(false);
    }
  };

  const saveUpdate = async (id, body) => {
    setSaving(true);
    try {
      if (isDemo) {
        let updated;
        updateDemo((previous) => {
          const current = previous.complaints.find((item) => String(item.id) === String(id));
          if (!current) throw new Error("Complaint was not found.");
          const message = body.message || (body.status !== current.status ? `Status updated to ${body.status}.` : "Complaint assignment updated.");
          updated = {
            ...current, status: body.status || current.status, updated_at: new Date().toISOString(),
            department_id: body.departmentId || current.department_id,
            department: departments.find((item) => String(item.id) === String(body.departmentId))?.name || current.department,
            assigned_staff_id: body.staffId || current.assigned_staff_id,
            assigned_staff: staff.find((item) => String(item.id) === String(body.staffId))?.name || current.assigned_staff,
            resolved_at: body.status === "Resolved" ? new Date().toISOString() : current.resolved_at,
            updates: [...(current.updates || []), { id: `${id}-${Date.now()}`, status: body.status, message, created_at: new Date().toISOString(), actor_name: session.name }],
          };
          return {
            ...previous,
            complaints: previous.complaints.map((item) => String(item.id) === String(id) ? updated : item),
            notifications: [{ id: `demo-notification-${Date.now()}`, complaint_id: id, complaint_code: current.complaint_code, message, created_at: new Date().toISOString(), user_email: current.user_email, department: current.department }, ...previous.notifications],
          };
        });
        setDetail(updated);
        setNotice("Complaint update saved.");
        return;
      }
      await axios.patch(`/api/complaints/${id}`, body, auth);
      await refreshDetail(id);
      setNotice("Complaint update saved.");
    } catch (requestError) {
      throw new Error(requestError.response?.data?.message || requestError.message || "The update could not be saved.");
    } finally {
      setSaving(false);
      await refresh();
    }
  };

  const submitFeedback = async (id, body) => {
    setSaving(true);
    try {
      if (isDemo) {
        const updated = updateDemo((previous) => ({
          ...previous,
          complaints: previous.complaints.map((item) => String(item.id) === String(id)
            ? { ...item, feedback_rating: body.rating, feedback_comment: body.comment } : item),
        })).complaints.find((item) => String(item.id) === String(id));
        setDetail(updated);
      } else {
        await axios.post(`/api/complaints/${id}/feedback`, body, auth);
        await refreshDetail(id);
      }
      setNotice("Thanks for sharing your feedback.");
    } catch (requestError) {
      throw new Error(requestError.response?.data?.message || requestError.message);
    } finally {
      setSaving(false);
      await refresh();
    }
  };

  const downloadEvidence = async (item) => {
    if (isDemo) {
      setNotice("Evidence file downloads are available when the database API is configured.");
      return;
    }
    try {
      const response = await axios.get(`/api/complaints/${item.id}/evidence`, { ...auth, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.attachment_name || "complaint-evidence";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Evidence could not be downloaded.");
    }
  };

  const markNotificationRead = async (item) => {
    try {
      if (isDemo) {
        updateDemo((previous) => ({
          ...previous,
          notifications: previous.notifications.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row),
        }));
      } else {
        await axios.patch(`/api/complaints/notifications/${item.id}`, {}, auth);
      }
      setNotifications((previous) => previous.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Notification could not be updated.");
    }
  };

  const deleteComplaint = async (item) => {
    if (!window.confirm(`Permanently delete ${item.complaint_code}? This also removes its history and evidence.`)) return;
    try {
      if (isDemo) updateDemo((previous) => ({ ...previous, complaints: previous.complaints.filter((row) => row.id !== item.id) }));
      else await axios.delete(`/api/complaints/${item.id}`, auth);
      setNotice(`${item.complaint_code} was deleted.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Complaint could not be deleted.");
    }
  };

  const exportReport = async () => {
    if (isDemo) {
      downloadReport(complaints.filter((item) =>
        (!search || `${item.complaint_code} ${item.title}`.toLowerCase().includes(search.toLowerCase())) &&
        (!filterStatus || item.status === filterStatus) &&
        (!filterCategory || item.category === filterCategory) &&
        (!filterPriority || item.priority === filterPriority) &&
        (!filterDepartment || String(item.department_id) === String(filterDepartment)),
      ));
      return;
    }
    setSaving(true);
    try {
      const filters = { limit: 50, ...(search ? { search } : {}), ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterCategory ? { category: filterCategory } : {}), ...(filterPriority ? { priority: filterPriority } : {}),
        ...(filterDepartment ? { department: filterDepartment } : {}) };
      const first = await axios.get("/api/complaints", { ...auth, params: { ...filters, page: 1 } });
      const rows = [...first.data.complaints];
      for (let index = 2; index <= first.data.pages; index += 1) {
        const next = await axios.get("/api/complaints", { ...auth, params: { ...filters, page: index } });
        rows.push(...next.data.complaints);
      }
      downloadReport(rows);
      setNotice(`Exported ${rows.length} complaint records.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Complaint report could not be downloaded.");
    } finally {
      setSaving(false);
    }
  };

  const createStaff = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (isDemo) {
        const person = { name: values.name, email: values.email, department: values.department, id: `staff-${Date.now()}`, role: "staff" };
        updateDemo((previous) => ({ ...previous, staff: [person, ...previous.staff] }));
      } else {
        await axios.post("/api/users", { ...values, role: "staff" }, auth);
      }
      formElement.reset();
      setShowStaffForm(false);
      setNotice("Department staff account created.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Staff account could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const filteredLocal = isDemo ? complaints.filter((item) =>
    (!search || `${item.complaint_code} ${item.title}`.toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || item.status === filterStatus) &&
    (!filterCategory || item.category === filterCategory) &&
    (!filterPriority || item.priority === filterPriority) &&
    (!filterDepartment || String(item.department_id) === String(filterDepartment)),
  ) : complaints;
  const sortedLocal = [...filteredLocal].sort((left, right) => {
    const result = sortBy === "priority"
      ? priorities.indexOf(left.priority) - priorities.indexOf(right.priority)
      : new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return sortOrder === "asc" ? result : -result;
  });
  const visibleRows = isDemo ? sortedLocal.slice((page - 1) * 10, page * 10) : filteredLocal;
  const pendingNotificationList = notifications;
  const metricCards = [
    { title: "Total complaints", value: stats.total, label: role === "student" ? "Submitted by you" : "In your workspace", icon: ClipboardList, tone: "blue" },
    ...(role === "admin" ? [{ title: "Registered users", value: users.length, label: "Student and staff accounts", icon: Users, tone: "violet" }] : []),
    { title: "Awaiting action", value: stats.pending, label: "Submitted, review or assigned", icon: Clock3, tone: "amber" },
    { title: "In progress", value: stats.in_progress, label: "Being actively handled", icon: Activity, tone: "violet" },
    { title: "Resolved", value: stats.resolved, label: "Closed with a resolution", icon: Check, tone: "green" },
    ...(role !== "student" ? [{ title: "Urgent", value: stats.urgent, label: "Needs priority attention", icon: AlertCircle, tone: "red" }] : []),
  ];

  if (!session) return null;

  const menuItems = [
    { label: "Overview", icon: LayoutDashboard },
    { label: role === "student" ? "My complaints" : "All complaints", icon: ClipboardList },
    ...(role === "student" ? [{ label: "New complaint", icon: Plus }] : []),
    { label: "Notifications", icon: Bell, count: unreadCount },
    ...(role === "admin" ? [{ label: "People", icon: Users }] : []),
  ];
  const title = role === "admin" ? "Complaint control center" : role === "staff" ? "Department workbench" : "Your support space";
  const openNewComplaint = () => {
    if (role !== "student") return;
    setActive("New complaint");
    setError("");
  };

  return <main className="complaint-app">
    <aside className={`complaint-sidebar ${drawer ? "drawer-open" : ""}`}>
      <Link to="/" className="complaint-brand"><span className="complaint-brand-mark"><CircleHelp size={22} /></span><span>Northstar<span>STUDENT SUPPORT</span></span></Link>
      <div className="complaint-workspace"><span className="complaint-avatar">{session.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{session.name}</strong><small>{role === "admin" ? "Administrator" : role === "staff" ? session.department || "Department staff" : "Student"}</small></span><ChevronDown size={15} /></div>
      <span className="complaint-nav-caption">WORKSPACE</span>
      <nav className="complaint-side-nav">{menuItems.map(({ label, icon: Icon, count }) => <button key={label} className={active === label ? "active" : ""} onClick={() => { setActive(label); setDrawer(false); setError(""); }}><Icon size={18} /><span>{label}</span>{count > 0 && <b>{count}</b>}</button>)}</nav>
      <div className="complaint-sidebar-bottom"><div className="complaint-help-card"><span><ShieldCheck size={18} /></span><strong>Your voice matters</strong><small>Every report is reviewed by the right team.</small><Link to="/faq">How this works <ArrowRight size={13} /></Link></div><Link to="/dashboard" className="complaint-side-link"><ArrowLeft size={16} /> College dashboard</Link><button className="complaint-side-link" onClick={logout}><LogOut size={16} /> Sign out</button></div>
    </aside>

    <section className="complaint-main">
      <header className="complaint-topbar">
        <button className="complaint-mobile-menu" onClick={() => setDrawer(!drawer)} aria-label="Toggle support navigation"><span>☰</span></button>
        <div><span className="complaint-breadcrumb">Northstar / Support{isDemo ? " · Demo workspace" : ""}</span><h1>{active === "Overview" ? "Overview" : active}</h1></div>
        <div className="complaint-top-actions">
          {role === "student" && <button className="complaint-button primary desktop-create" onClick={openNewComplaint}><Plus size={16} /> New complaint</button>}
          <button className="complaint-notification-button" onClick={() => setActive("Notifications")} aria-label={`${unreadCount} unread notifications`}><Bell size={19} />{unreadCount > 0 && <span>{unreadCount}</span>}</button>
          <button className="complaint-user-chip" onClick={() => navigate("/profile")}><span className="complaint-avatar">{session.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{session.name}</strong><small>{role === "admin" ? "Administrator" : role === "staff" ? "Staff member" : "Student"}</small></span></button>
        </div>
      </header>

      <div className="complaint-content">
        {error && <div className="complaint-alert error" role="alert"><AlertCircle size={17} />{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
        {notice && <div className="complaint-alert success" role="status"><Check size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}

        {active === "Overview" && <>
          <div className="complaint-welcome"><div><span className="complaint-eyebrow">SUPPORT OVERVIEW</span><h2>{role === "student" ? `Hello, ${session.name?.split(" ")[0] || "there"}.` : role === "staff" ? "Your department, in focus." : "A clearer view of every concern."}</h2><p>{role === "student" ? "Track your concerns and stay in the loop, all in one place." : "Review incoming concerns, assign ownership, and keep resolutions moving."}</p></div>{role === "student" && <button className="complaint-button primary" onClick={openNewComplaint}><Plus size={16} /> Submit a complaint</button>}</div>
          <div className={`complaint-metrics ${role === "student" ? "student-metrics" : role === "admin" ? "admin-metrics" : ""}`}>{metricCards.map(({ title: cardTitle, value, label, icon: Icon, tone }) => <article className="complaint-metric" key={cardTitle}><div className="complaint-metric-top"><span className={`complaint-metric-icon ${tone}`}><Icon size={18} /></span>{cardTitle === "Urgent" && value > 0 && <span className="complaint-urgent-dot" />}</div><strong>{loading ? "—" : value}</strong><span>{cardTitle}</span><small>{label}</small></article>)}</div>
          <div className="complaint-dashboard-grid">
            <section className="complaint-panel complaint-chart-panel"><div className="complaint-panel-heading"><div><h3>{role === "student" ? "Your complaint activity" : "Monthly complaints"}</h3><p>Complaint submissions over the last six months</p></div><span className="complaint-chart-period">Last 6 months</span></div>
              {stats.monthly.length ? <div className="complaint-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.monthly} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#8290a1", fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#8290a1", fontSize: 11 }} /><Tooltip cursor={{ fill: "#edf4fa" }} /><Bar dataKey="total" name="Complaints" fill="#3977ad" radius={[5, 5, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div> : <div className="complaint-empty-chart"><Activity size={21} /><span>Activity will appear here as complaints are submitted.</span></div>}
            </section>
            <section className="complaint-panel complaint-chart-panel"><div className="complaint-panel-heading"><div><h3>{role === "student" ? "Status overview" : "By department"}</h3><p>{role === "student" ? "Where your requests stand" : "Distribution across campus teams"}</p></div></div>
              {role === "student" ? <div className="complaint-status-breakdown">{statuses.slice(0, 5).map((status) => {
                const count = complaints.filter((item) => item.status === status).length;
                return <div key={status}><span className="complaint-status-dot" style={{ background: statusColors[status] }} /><span>{status}</span><strong>{count}</strong><i><b style={{ width: `${stats.total ? (count / stats.total) * 100 : 0}%`, background: statusColors[status] }} /></i></div>;
              })}</div> : stats.departments.length ? <div className="complaint-chart complaint-pie-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stats.departments.filter((item) => item.total)} dataKey="total" nameKey="department" innerRadius={55} outerRadius={83} paddingAngle={3}>{stats.departments.map((item, index) => <Cell key={item.department} fill={["#3779ad", "#67a3c2", "#7183bf", "#53a58e", "#d0a24f", "#c67879"][index % 6]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="complaint-department-legend">{stats.departments.slice(0, 5).map((item, index) => <span key={item.department}><i style={{ background: ["#3779ad", "#67a3c2", "#7183bf", "#53a58e", "#d0a24f"][index] }} />{item.department}<b>{item.total}</b></span>)}</div></div> : <div className="complaint-empty-chart"><Users size={21} /><span>Department reports will appear here.</span></div>}
            </section>
          </div>
          <section className="complaint-panel complaint-list-panel"><div className="complaint-panel-heading"><div><h3>{role === "student" ? "Recent complaints" : "Recent activity"}</h3><p>{role === "student" ? "Your latest submissions and status changes" : "The latest concerns requiring attention"}</p></div><button className="complaint-text-button" onClick={() => setActive(role === "student" ? "My complaints" : "All complaints")}>View all <ArrowRight size={14} /></button></div>
            <ComplaintTable rows={complaints.slice(0, 5)} role={role} loading={loading} onOpen={openDetail} onDelete={deleteComplaint} />
          </section>
        </>}

        {(active === "My complaints" || active === "All complaints") && <section className="complaint-panel complaint-list-panel">
          <div className="complaint-panel-heading"><div><h3>{role === "student" ? "Your complaints" : "Complaint register"}</h3><p>Search, filter, and follow each concern through to resolution.</p></div><button className="complaint-button subtle" onClick={exportReport} disabled={saving}><ArrowDownToLine size={15} /> Export CSV</button></div>
          <div className="complaint-filters">
            <label className="complaint-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search ID or title" aria-label="Search by complaint ID or title" /></label>
            <label><Filter size={15} /><select value={filterStatus} onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }} aria-label="Filter by status"><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label><select value={filterCategory} onChange={(event) => { setFilterCategory(event.target.value); setPage(1); }} aria-label="Filter by category"><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label><select value={filterPriority} onChange={(event) => { setFilterPriority(event.target.value); setPage(1); }} aria-label="Filter by priority"><option value="">All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            <label><select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }} aria-label="Sort complaints by"><option value="date">Sort: date</option><option value="priority">Sort: priority</option></select></label>
            <label><select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }} aria-label="Sort order"><option value="desc">Newest / urgent</option><option value="asc">Oldest / low</option></select></label>
            {role === "admin" && <label><select value={filterDepartment} onChange={(event) => { setFilterDepartment(event.target.value); setPage(1); }} aria-label="Filter by department"><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
          </div>
          <ComplaintTable rows={visibleRows} role={role} loading={loading} onOpen={openDetail} onDelete={deleteComplaint} />
          <div className="complaint-pagination"><span>{total ? `Showing ${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} of ${total}` : "No complaints found"}</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</button></div></div>
        </section>}

        {active === "New complaint" && role === "student" && <section className="complaint-form-page">
          <div className="complaint-form-intro"><button className="complaint-back-button" onClick={() => setActive("Overview")}><ArrowLeft size={15} /> Back to overview</button><span className="complaint-eyebrow">WE'RE HERE TO HELP</span><h2>Tell us what’s <em>going on.</em></h2><p>Share the details and we’ll make sure your concern reaches the right department.</p></div>
          <form className="complaint-form-card" onSubmit={submitComplaint}>
            <div className="complaint-form-heading"><span className="complaint-step">01</span><div><h3>Complaint information</h3><p>Fields marked with * are required.</p></div></div>
            <div className="complaint-form-grid">
              <label className="wide">Complaint title *<input name="title" required minLength={5} maxLength={180} placeholder="A short summary of your concern" /></label>
              <label className="wide">Full description *<textarea name="description" rows={5} required minLength={20} maxLength={10000} placeholder="Describe what happened, when it started, and how it affects you…" /><small>At least 20 characters</small></label>
              <label>Category *<select name="category" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Department *<select name="departmentId" required defaultValue=""><option value="" disabled>Choose a department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label>Priority *<select name="priority" defaultValue="Medium">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <label>Location *<input name="location" required minLength={2} maxLength={180} placeholder="Building, room, or campus area" /></label>
              <label>Date of complaint *<input name="complaintDate" type="date" required max={dateToday()} defaultValue={dateToday()} /></label>
              <label>Contact information *<input name="contactInfo" required maxLength={180} defaultValue={session.email || ""} placeholder="Email or phone number" /></label>
              <label className="wide">Supporting image or document <span className="complaint-optional">(optional · max 5 MB · JPEG, PNG, WebP, PDF)</span><input className="complaint-file-input" name="evidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></label>
            </div>
            <div className="complaint-privacy-note"><ShieldCheck size={18} /><span><strong>Your information is private.</strong> Only the complaint team and assigned department can access this report.</span></div>
            <div className="complaint-form-actions"><button type="button" className="complaint-button subtle" onClick={() => setActive("Overview")}>Cancel</button><button className="complaint-button primary" disabled={saving}>{saving ? "Submitting…" : "Submit complaint"} <ArrowRight size={16} /></button></div>
          </form>
        </section>}

        {active === "Notifications" && <section className="complaint-panel complaint-list-panel"><div className="complaint-panel-heading"><div><h3>Notifications</h3><p>Updates about complaint assignments, responses, and status changes.</p></div><span className="complaint-unread-pill">{unreadCount} unread</span></div>
          {pendingNotificationList.length ? <div className="complaint-notification-list">{pendingNotificationList.map((item) => <article key={item.id} className={!item.read_at ? "unread" : ""}><span className="complaint-notification-icon"><Bell size={17} /></span><div><strong>{item.complaint_code || "Complaint update"}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small></div><button onClick={() => { markNotificationRead(item); const row = complaints.find((complaint) => String(complaint.id) === String(item.complaint_id)); if (row) openDetail(row); }} aria-label="Open notification"><ArrowRight size={16} /></button></article>)}</div> : <EmptyState title="You're all caught up" text="New complaint updates will appear here." />}
        </section>}

        {active === "People" && role === "admin" && <section className="complaint-panel complaint-list-panel">
          <div className="complaint-panel-heading"><div><h3>People and department access</h3><p>{users.length} accounts · department staff can only see complaints for their own team.</p></div><button className="complaint-button primary" onClick={() => setShowStaffForm(!showStaffForm)}><Plus size={15} /> Add department staff</button></div>
          {showStaffForm && <form className="complaint-staff-form" onSubmit={createStaff}><label>Full name<input name="name" required minLength={2} maxLength={160} /></label><label>Email<input name="email" type="email" required maxLength={254} /></label><label>Department<select name="department" required defaultValue=""><option value="" disabled>Select department</option>{departments.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Initial password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label><button className="complaint-button primary" disabled={saving}>{saving ? "Creating…" : "Create staff account"}</button></form>}
          <div className="complaint-people-list">{users.map((person) => <article key={person.id}><span className="complaint-avatar">{person.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{person.name}</strong><small>{person.email}</small></div><span className="complaint-role-badge">{person.role}</span><span className="complaint-person-department">{person.department || "—"}</span></article>)}</div>
        </section>}
      </div>
      <footer className="complaint-footer"><span>Northstar College · Student support</span><span>Private, respectful, accountable.</span></footer>
    </section>
    {drawer && <button className="complaint-drawer-scrim" onClick={() => setDrawer(false)} aria-label="Close navigation" />}
    {detail && <DetailModal complaint={detail} role={role} departments={departments} staff={staff} onClose={() => setDetail(null)} onUpdate={saveUpdate} onFeedback={submitFeedback} onEvidence={downloadEvidence} loading={saving} />}
  </main>;
}

function ComplaintTable({ rows, role, loading, onOpen, onDelete }) {
  if (loading) return <div className="complaint-table-loading"><span /> Loading complaint records…</div>;
  if (!rows.length) return <EmptyState title={role === "student" ? "No complaints yet" : "No complaints to show"} text={role === "student" ? "When you submit a concern, it will appear here with a live status timeline." : "New concerns will appear here as soon as they are submitted."} />;
  return <div className="complaint-table-wrap"><table className="complaint-table"><thead><tr><th>COMPLAINT</th><th>CATEGORY</th><th>DEPARTMENT</th><th>PRIORITY</th><th>STATUS</th><th>SUBMITTED</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.id} onClick={() => onOpen(item)}><td><button className="complaint-title-link" onClick={(event) => { event.stopPropagation(); onOpen(item); }}><strong>{item.title}</strong><small>{item.complaint_code}{role !== "student" && item.submitted_by ? ` · ${item.submitted_by}` : ""}</small></button></td><td>{item.category}</td><td>{item.department}</td><td><span className={`complaint-priority priority-${item.priority?.toLowerCase()}`}>{item.priority}</span></td><td><span className="complaint-status" style={{ "--status-color": statusColors[item.status] }}>{item.status}</span></td><td>{item.complaint_date || new Date(item.created_at).toLocaleDateString()}</td><td><div className="complaint-row-actions"><button aria-label={`View ${item.complaint_code}`} onClick={(event) => { event.stopPropagation(); onOpen(item); }}><ArrowRight size={16} /></button>{role === "admin" && <button aria-label={`Delete ${item.complaint_code}`} onClick={(event) => { event.stopPropagation(); onDelete(item); }}><X size={16} /></button>}</div></td></tr>)}</tbody></table></div>;
}

function EmptyState({ title, text }) {
  return <div className="complaint-empty-state"><span><MessageSquare size={22} /></span><strong>{title}</strong><p>{text}</p></div>;
}
