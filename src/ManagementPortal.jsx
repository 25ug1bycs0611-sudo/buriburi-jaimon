import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, ClipboardCheck, Clock3, GraduationCap,
  LayoutDashboard, LogOut, Search, Settings, Users, Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { faculty as demoFaculty, courses as demoPrograms, initialStudents, seedNotices } from "./data";
import "./management.css";

const demoData = () => ({
  students: initialStudents.map((student, index) => ({
    ...student, databaseId: `demo-student-${index + 1}`, email: student.email,
    courses: [{ id: "demo-course-1", title: student.department, semester: 1 }],
    phone: "", gender: "", address: "", guardianName: "", guardianPhone: "",
  })),
  faculty: demoFaculty.map((member, index) => ({
    ...member, databaseId: `demo-faculty-${index + 1}`, employeeId: `FAC000${index + 1}`,
    email: `${member.name.toLowerCase().replaceAll(" ", ".")}@northstar.edu`,
    department: member.field, subject: member.field, courseIds: ["demo-course-1"],
  })),
  courses: demoPrograms.map((course, index) => ({
    id: `demo-course-${index + 1}`, title: course.title, department: course.title,
    degree: course.degree, semester: 1, course_code: `NS${String(index + 1).padStart(3, "0")}`,
  })),
  departments: demoPrograms.map((course, index) => ({ id: `demo-department-${index + 1}`, name: course.title })),
  attendance: [],
  results: [],
  fees: [],
  notices: seedNotices.map((notice, index) => ({ ...notice, id: `demo-notice-${index + 1}`, body: notice.text })),
  admissions: [],
  leaveRequests: [],
  schedules: [2, 26, 50].map((hours, index) => ({
    id: `demo-class-${index + 1}`,
    course_id: "demo-course-1",
    course: demoPrograms[0].title,
    faculty_name: demoFaculty[0].name,
    starts_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    location: ["Lecture Hall 2", "West Wing 108", "Innovation Center"][index],
  })),
  stats: null,
});

const readDemo = () => {
  try { return { ...demoData(), ...(JSON.parse(localStorage.getItem("northstar-management-demo") || "{}")) }; }
  catch { return demoData(); }
};
const saveDemo = (value) => localStorage.setItem("northstar-management-demo", JSON.stringify(value));
const currentDate = () => new Date().toISOString().slice(0, 10);
const fullName = (record) => record?.name || record?.student_name || "Student";
const displayStatus = (status) => status === "active" ? "Active" : status === "inactive" ? "Inactive" : status;
const grade = (percent) => percent >= 90 ? "A" : percent >= 80 ? "B" : percent >= 70 ? "C" : percent >= 60 ? "D" : "F";
const asNum = (value) => Number(value || 0);

function downloadCsv(filename, columns, rows) {
  const csv = [columns, ...rows].map((row) => row.map((value) => {
    const text = String(value ?? "").replace(/^[\t\r ]*[=+\-@]/, (match) => `'${match.trimStart()}`);
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeStudent(student) {
  return {
    ...student,
    databaseId: student.databaseId || student.id,
    id: student.student_id || student.studentId || student.id,
    name: student.name || student.student_name,
    department: student.department || "Undeclared",
    year: student.year || "Year 1",
    status: displayStatus(student.status),
    guardianName: student.guardian_name || student.guardianName || "",
    guardianPhone: student.guardian_phone || student.guardianPhone || "",
    courses: Array.isArray(student.courses) ? student.courses : [],
  };
}

function normalizeFaculty(member) {
  return {
    ...member,
    databaseId: member.databaseId || member.id,
    id: member.employee_id || member.employeeId || member.id,
    employeeId: member.employee_id || member.employeeId,
    department: member.department || "Undeclared",
    subject: member.subject || member.field || "",
    courseIds: member.course_ids || member.courseIds || [],
  };
}

export default function ManagementPortal({ session, logout }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) navigate("/login/student");
  }, [session, navigate]);
  const [record, setRecord] = useState(readDemo);
  const [active, setActive] = useState("Overview");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingFaculty, setEditingFaculty] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(currentDate());
  const [attendanceStatus, setAttendanceStatus] = useState({});
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(session?.token));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const role = session?.role || "student";
  const demoStudent = record.students.find((student) =>
    student.email?.toLowerCase() === session?.email?.toLowerCase() || student.id === session?.id,
  ) || record.students[0];
  const studentProfile = profile || (role === "student" && demoStudent ? {
    ...demoStudent, name: demoStudent.name || session?.name, email: demoStudent.email || session?.email,
  } : null);

  const request = async (path, method = "GET", body) => {
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.message || "The request could not be completed.");
    return result;
  };

  const refreshAdminStats = async () => {
    if (!session?.token || role !== "admin") return;
    try {
      updateRecord({ stats: await request("/api/dashboard/stats") });
    } catch (statsError) {
      setError(`Record saved, but dashboard statistics could not be refreshed: ${statsError.message}`);
    }
  };

  const updateRecord = (changes) => setRecord((previous) => {
    return { ...previous, ...changes };
  });

  useEffect(() => {
    if (session && !session.token) saveDemo(record);
  }, [record, session]);

  useEffect(() => {
    if (!session?.token) {
      setLoading(false);
      return undefined;
    }
    let activeRequest = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const [courses, departments, notices, schedules] = await Promise.all([
          request("/api/courses"),
          request("/api/departments"),
          request(role === "admin" ? "/api/notices" : `/api/notices?audience=${role === "student" ? "students" : "faculty"}`),
          request("/api/schedule"),
        ]);
        if (!activeRequest) return;
        const common = { courses, departments, notices, schedules };
        if (role === "admin") {
          const [students, facultyRows, admissions, leaveRequests, results, fees, stats] = await Promise.all([
            request("/api/students"), request("/api/faculty"), request("/api/admissions"), request("/api/leave"),
            request("/api/results"), request("/api/fees"), request("/api/dashboard/stats"),
          ]);
          if (!activeRequest) return;
          updateRecord({
            ...common, students: students.map(normalizeStudent), faculty: facultyRows.map(normalizeFaculty),
            admissions, leaveRequests, results, fees, stats,
          });
        } else if (role === "faculty") {
          const facultyCourses = await request("/api/faculty/courses");
          if (!activeRequest) return;
          updateRecord({ ...common, courses: facultyCourses, faculty: record.faculty });
          setSelectedCourse(String(facultyCourses[0]?.id || ""));
        } else {
          const student = await request("/api/students/me");
          if (!activeRequest) return;
          const [attendance, results, fees] = await Promise.all([
            request("/api/attendance"), request("/api/results"), request("/api/fees"),
          ]);
          if (!activeRequest) return;
          setProfile(normalizeStudent(student));
          updateRecord({
            ...common, students: [normalizeStudent(student)], attendance, results, fees,
            courses: (student.courses || []).map((course) => ({
              ...course, title: course.title, course_code: course.course_code,
            })),
          });
        }
      } catch (requestError) {
        if (activeRequest) setError(requestError.message);
      } finally {
        if (activeRequest) setLoading(false);
      }
    };
    load();
    return () => { activeRequest = false; };
  }, [session?.token, role]);

  const students = record.students;
  const courses = record.courses;
  const departments = record.departments;
  const roster = useMemo(() => {
    if (role === "student") return studentProfile ? [studentProfile] : [];
    return students.filter((student) => {
      if (!selectedCourse) return role === "admin";
      return student.courses?.some((course) => String(course.id) === String(selectedCourse))
        || String(student.course_id) === String(selectedCourse);
    });
  }, [role, students, selectedCourse, studentProfile]);

  useEffect(() => {
    if (!session?.token || !["faculty", "admin"].includes(role) || !selectedCourse) return undefined;
    let cancelled = false;
    if (role === "faculty") request(`/api/students?courseId=${selectedCourse}`)
      .then((rows) => { if (!cancelled) updateRecord({ students: rows.map(normalizeStudent) }); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    if (role === "faculty") request(`/api/results?courseId=${selectedCourse}`)
      .then((rows) => { if (!cancelled) updateRecord({ results: rows }); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    request(`/api/attendance/course/${selectedCourse}?date=${selectedDate}`)
      .then((rows) => { if (!cancelled) setAttendanceStatus(Object.fromEntries(rows.map((item) => [item.student_id, item.status]))); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [session?.token, role, selectedCourse, selectedDate]);

  const menu = role === "admin"
    ? ["Overview", "Students", "Faculty", "Courses", "Departments", "Schedule", "Attendance", "Results", "Fees", "Admissions", "Leave requests", "Announcements"]
    : role === "faculty"
      ? ["Overview", "My courses", "Schedule", "Attendance", "Results", "Announcements"]
      : ["Overview", "My profile", "My courses", "Schedule", "Attendance", "Results", "Fees", "Announcements", "Leave requests"];

  const run = async (event, onSubmit) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await onSubmit(new FormData(form));
      await refreshAdminStats();
      form.reset();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const upsertStudent = async (form) => {
    const values = Object.fromEntries(form.entries());
    const courseId = values.courseId ? (session.token ? Number(values.courseId) : values.courseId) : null;
    if (session.token) {
      const created = await request("/api/students", "POST", {
        ...values, studentId: values.studentId || null, courseId, semester: Number(values.semester || 1),
      });
      updateRecord({ students: [normalizeStudent({
        ...created,
        courses: courseId ? [{
          id: courseId,
          title: courses.find((course) => String(course.id) === String(courseId))?.title,
          semester: Number(values.semester || 1),
        }] : [],
      }), ...students] });
    } else {
      const student = {
        ...values, databaseId: `demo-${Date.now()}`, id: values.studentId || `NS${Date.now()}`,
        department: values.department || "Undeclared", year: values.year, status: "Active",
        courses: courseId ? [{ id: courseId, title: courses.find((course) => String(course.id) === String(courseId))?.title }] : [],
      };
      updateRecord({ students: [student, ...students] });
    }
    setMessage("Student record created.");
  };

  const deleteStudent = async (student) => {
    if (!window.confirm(`Delete ${fullName(student)} and their associated academic records?`)) return;
    try {
      setError("");
      if (session.token) await request(`/api/users/${student.databaseId}`, "DELETE");
      updateRecord({
        students: students.filter((item) => item.databaseId !== student.databaseId),
        attendance: record.attendance.filter((item) => String(item.student_id) !== String(student.databaseId)),
        results: record.results.filter((item) => String(item.student_id) !== String(student.databaseId)),
        fees: record.fees.filter((item) => String(item.student_id) !== String(student.databaseId)),
        leaveRequests: record.leaveRequests.filter((item) => String(item.student_id) !== String(student.databaseId)),
      });
      setMessage("Student record deleted.");
      await refreshAdminStats();
    } catch (requestError) { setError(requestError.message); }
  };

  const saveStudentEdit = async (form) => {
    const values = Object.fromEntries(form.entries());
    const courseIds = form.getAll("courseIds").map((id) => session.token ? Number(id) : id);
    if (session.token) {
      await request(`/api/students/${editingStudent.databaseId}`, "PATCH", values);
      await request(`/api/students/${editingStudent.databaseId}/courses`, "PUT", {
        courseIds, academicYear: values.year || "Year 1", semester: Number(values.semester || 1),
      });
    }
    updateRecord({ students: students.map((student) => student.databaseId === editingStudent.databaseId
      ? { ...student, ...values, courses: courseIds.map((id) => ({ id, title: courses.find((course) => String(course.id) === String(id))?.title })) }
      : student) });
    setEditingStudent(null);
    setMessage("Student profile and enrollment updated.");
  };

  const createFaculty = async (form) => {
    const values = Object.fromEntries(form.entries());
    const courseIds = form.getAll("courseIds").map((id) => session.token ? Number(id) : id);
    if (session.token) {
      const created = await request("/api/faculty", "POST", {
        ...values, courseIds, experienceYears: Number(values.experienceYears || 0),
        joiningDate: values.joiningDate || null,
      });
      updateRecord({ faculty: [normalizeFaculty(created), ...record.faculty] });
    } else {
      updateRecord({ faculty: [{
        ...values, databaseId: `demo-faculty-${Date.now()}`, id: values.employeeId,
        department: values.department, subject: values.subject, courseIds,
      }, ...record.faculty] });
    }
    setMessage("Faculty record created.");
  };

  const saveFacultyEdit = async (form) => {
    const values = Object.fromEntries(form.entries());
    const courseIds = form.getAll("courseIds").map(Number);
    if (session.token) await request(`/api/faculty/${editingFaculty.databaseId}`, "PATCH", {
      ...values, courseIds, experienceYears: Number(values.experienceYears || 0),
      joiningDate: values.joiningDate || null,
    });
    updateRecord({ faculty: record.faculty.map((person) => person.databaseId === editingFaculty.databaseId
      ? { ...person, ...values, courseIds } : person) });
    setEditingFaculty(null);
    setMessage("Faculty profile and course assignments updated.");
  };

  const deleteFaculty = async (person) => {
    if (!window.confirm(`Delete faculty record for ${person.name}?`)) return;
    try {
      if (session.token) await request(`/api/users/${person.databaseId}`, "DELETE");
      updateRecord({ faculty: record.faculty.filter((item) => item.databaseId !== person.databaseId) });
      setMessage("Faculty record deleted.");
      await refreshAdminStats();
    } catch (requestError) { setError(requestError.message); }
  };

  const createCourse = async (form) => {
    const values = Object.fromEntries(form.entries());
    if (session.token) {
      const created = await request("/api/courses", "POST", {
        ...values, courseCode: values.courseCode || null, degree: values.degree || null,
        description: values.description || null, facultyId: values.facultyId || null,
        semester: Number(values.semester),
      });
      updateRecord({
        courses: [...courses, created],
        ...(values.facultyId ? {
          faculty: record.faculty.map((person) => String(person.databaseId) === String(values.facultyId)
            ? { ...person, courseIds: [...person.courseIds, created.id] } : person),
        } : {}),
      });
    } else {
      const created = {
        ...values, id: `demo-course-${Date.now()}`, semester: Number(values.semester),
        course_code: values.courseCode || "",
      };
      updateRecord({
        courses: [...courses, created],
        ...(values.facultyId ? {
          faculty: record.faculty.map((person) => String(person.databaseId) === String(values.facultyId)
            ? { ...person, courseIds: [...person.courseIds, created.id] } : person),
        } : {}),
      });
    }
    setMessage("Course created.");
  };

  const saveCourseEdit = async (form) => {
    const values = Object.fromEntries(form.entries());
    if (session.token) await request(`/api/courses/${editingCourse.id}`, "PATCH", {
      ...values, courseCode: values.courseCode || null, degree: values.degree || null,
      description: values.description || null, semester: Number(values.semester),
    });
    updateRecord({ courses: courses.map((course) => String(course.id) === String(editingCourse.id)
      ? { ...course, ...values, semester: Number(values.semester) } : course) });
    setEditingCourse(null);
    setMessage("Course details updated.");
  };

  const deleteCourse = async (course) => {
    if (!window.confirm(`Delete ${course.title} and its associated academic records?`)) return;
    try {
      if (session.token) await request(`/api/courses/${course.id}`, "DELETE");
      updateRecord({
        courses: courses.filter((item) => String(item.id) !== String(course.id)),
        students: students.map((student) => ({
          ...student,
          courses: student.courses?.filter((item) => String(item.id) !== String(course.id)) || [],
        })),
        faculty: record.faculty.map((person) => ({
          ...person,
          courseIds: person.courseIds?.filter((id) => String(id) !== String(course.id)) || [],
        })),
        attendance: record.attendance.filter((item) => String(item.course_id) !== String(course.id)),
        results: record.results.filter((item) => String(item.course_id) !== String(course.id)),
        schedules: record.schedules.filter((item) => String(item.course_id) !== String(course.id)),
      });
      setMessage("Course deleted.");
      await refreshAdminStats();
    } catch (requestError) { setError(requestError.message); }
  };

  const createDepartment = async (form) => {
    const name = String(form.get("name") || "").trim();
    if (session.token) {
      const department = await request("/api/departments", "POST", { name });
      updateRecord({ departments: [...departments, department] });
    } else {
      updateRecord({ departments: [...departments, { id: `demo-dept-${Date.now()}`, name }] });
    }
    setMessage("Department created.");
  };

  const createSchedule = async (form) => {
    const values = Object.fromEntries(form.entries());
    const course = courses.find((item) => String(item.id) === String(values.courseId));
    const facultyMember = record.faculty.find((item) => String(item.databaseId) === String(values.facultyId));
    const sessionRow = {
      id: `demo-class-${Date.now()}`, course_id: values.courseId, course: course?.title,
      faculty_id: values.facultyId, faculty_name: facultyMember?.name,
      starts_at: new Date(values.startsAt).toISOString(), location: values.location,
    };
    if (session.token) {
      const created = await request("/api/schedule", "POST", {
        courseId: Number(values.courseId), facultyId: Number(values.facultyId),
        startsAt: sessionRow.starts_at, location: values.location,
      });
      updateRecord({ schedules: [...record.schedules, { ...sessionRow, ...created, course: course?.title, faculty_name: facultyMember?.name }] });
    } else updateRecord({ schedules: [...record.schedules, sessionRow] });
    setMessage("Class scheduled.");
  };

  const deleteSchedule = async (classRow) => {
    if (!window.confirm(`Remove the ${classRow.course} class on ${new Date(classRow.starts_at).toLocaleString()}?`)) return;
    try {
      if (session.token) await request(`/api/schedule/${classRow.id}`, "DELETE");
      updateRecord({ schedules: record.schedules.filter((item) => item.id !== classRow.id) });
      setMessage("Scheduled class removed.");
    } catch (requestError) { setError(requestError.message); }
  };

  const deleteDepartment = async (department) => {
    if (!window.confirm(`Delete the department “${department.name}”?`)) return;
    try {
      if (session.token) await request(`/api/departments/${department.id}`, "DELETE");
      updateRecord({ departments: departments.filter((item) => item.id !== department.id) });
      setMessage("Department deleted.");
      await refreshAdminStats();
    } catch (requestError) { setError(requestError.message); }
  };

  const saveAttendance = async () => {
    if (!selectedCourse || !roster.length) throw new Error("Choose a course with enrolled students.");
    const records = roster.map((student) => ({
      studentId: student.databaseId,
      status: attendanceStatus[student.databaseId] || "present",
    }));
    if (session.token) await request("/api/attendance", "PUT", {
      courseId: Number(selectedCourse), classDate: selectedDate, records,
    });
    else updateRecord({
      attendance: [
        ...record.attendance.filter((item) => !(String(item.course_id) === selectedCourse && item.class_date === selectedDate)),
        ...records.map((item) => ({ ...item, student_id: item.studentId, course_id: selectedCourse, class_date: selectedDate })),
      ],
    });
    setMessage("Attendance saved.");
    await refreshAdminStats();
  };

  const saveResult = async (form) => {
    const values = Object.fromEntries(form.entries());
    const resultValues = {
      studentId: session.token ? Number(values.studentId) : values.studentId,
      courseId: session.token ? Number(values.courseId) : values.courseId,
      semester: Number(values.semester),
      assignmentMarks: Number(values.assignmentMarks), internalMarks: Number(values.internalMarks),
      practicalMarks: Number(values.practicalMarks), finalMarks: Number(values.finalMarks),
    };
    if (session.token) {
      const result = await request("/api/results", "PUT", resultValues);
      updateRecord({ results: [...record.results.filter((item) => item.id !== result.id), result] });
    } else {
      const total = resultValues.assignmentMarks + resultValues.internalMarks + resultValues.practicalMarks + resultValues.finalMarks;
      const percentage = total / 4;
      updateRecord({ results: [
        ...record.results.filter((item) => !(String(item.student_id) === values.studentId && String(item.course_id) === values.courseId && Number(item.semester) === resultValues.semester)),
        { ...resultValues, id: `demo-result-${Date.now()}`, student_id: values.studentId, course_id: values.courseId,
          total_marks: total, percentage, grade: grade(percentage) },
      ] });
    }
    setMessage("Result saved.");
  };

  const setFee = async (form) => {
    const values = Object.fromEntries(form.entries());
    const studentId = values.studentId;
    if (session.token) {
      await request(`/api/fees/${studentId}`, "PUT", { totalFee: Number(values.totalFee), dueDate: values.dueDate || null });
      const fees = await request("/api/fees");
      updateRecord({ fees });
    } else {
      updateRecord({ fees: [
        ...record.fees.filter((fee) => String(fee.student_id) !== String(studentId)),
        { student_id: studentId, student_name: fullName(students.find((student) => String(student.databaseId) === studentId)),
          total_fee: Number(values.totalFee), paid_amount: 0, remaining_amount: Number(values.totalFee), status: "pending", payments: [] },
      ] });
    }
    setMessage("Fee amount saved.");
  };

  const recordPayment = async (form) => {
    const values = Object.fromEntries(form.entries());
    const studentId = values.studentId;
    if (session.token) {
      await request("/api/payments", "POST", {
        studentId: Number(studentId), paymentMethod: values.paymentMethod, idempotencyKey: crypto.randomUUID(),
      });
      updateRecord({ fees: await request("/api/fees") });
    } else {
      const fee = record.fees.find((item) => String(item.student_id) === studentId);
      if (!fee) throw new Error("Set up the student's total fee first.");
      if (asNum(fee.paid_amount) > 0) throw new Error("This fee has already been paid.");
      updateRecord({ fees: record.fees.map((item) => String(item.student_id) === studentId
        ? { ...item, paid_amount: item.total_fee, remaining_amount: 0, status: "paid",
          payments: [{ id: `demo-payment-${Date.now()}`, amount: item.total_fee, method: values.paymentMethod, paidAt: new Date().toISOString() }] }
        : item) });
    }
    setMessage("Payment receipt recorded. This records a confirmed payment; it does not charge a payment method.");
  };

  const postNotice = async (form) => {
    const values = Object.fromEntries(form.entries());
    if (session.token) {
      const notice = await request("/api/notices", "POST", values);
      updateRecord({ notices: [notice, ...record.notices] });
    } else {
      updateRecord({ notices: [{ ...values, id: `demo-notice-${Date.now()}`, created_at: new Date().toISOString() }, ...record.notices] });
    }
    setMessage("Announcement published.");
  };

  const changeApplication = async (application, status) => {
    try {
      if (session.token) await request(`/api/admissions/${application.id}`, "PATCH", { status });
      updateRecord({ admissions: record.admissions.map((item) => item.id === application.id ? { ...item, status } : item) });
    } catch (requestError) { setError(requestError.message); }
  };

  const changeLeave = async (request, status) => {
    try {
      if (session.token) await request(`/api/leave/${request.id}`, "PATCH", { status });
      updateRecord({ leaveRequests: record.leaveRequests.map((item) => item.id === request.id ? { ...item, status } : item) });
    } catch (requestError) { setError(requestError.message); }
  };

  const submitLeave = async (form) => {
    const values = Object.fromEntries(form.entries());
    if (values.startDate > values.endDate) throw new Error("The end date must be on or after the start date.");
    if (session.token) {
      const created = await request("/api/leave", "POST", {
        startDate: values.startDate, endDate: values.endDate, reason: values.reason,
      });
      updateRecord({ leaveRequests: [created, ...record.leaveRequests] });
    } else {
      updateRecord({ leaveRequests: [{ ...values, student_name: session.name, status: "pending", id: `demo-leave-${Date.now()}` }, ...record.leaveRequests] });
    }
    setMessage("Your leave request has been submitted.");
  };

  const filteredStudents = students.filter((student) =>
    `${student.name} ${student.id} ${student.email} ${student.department}`.toLowerCase().includes(search.toLowerCase()) &&
    (!departmentFilter || student.department === departmentFilter) &&
    (!yearFilter || student.year === yearFilter) &&
    (!courseFilter || student.courses?.some((course) => String(course.id) === courseFilter)),
  );
  const totalAttendance = record.attendance.length;
  const presentAttendance = record.attendance.filter((item) => ["present", "late"].includes(item.status)).length;
  const attendancePercent = totalAttendance ? Math.round((presentAttendance / totalAttendance) * 100) : 0;
  const facultyAttendanceCount = Object.values(attendanceStatus).length;
  const facultyAttendancePercent = facultyAttendanceCount
    ? Math.round(Object.values(attendanceStatus).filter((status) => ["present", "late"].includes(status)).length / facultyAttendanceCount * 100)
    : 0;
  const studentAttendance = record.attendance.filter((item) => role !== "student" || String(item.student_id) === String(studentProfile?.databaseId));
  const studentResults = record.results.filter((item) => role !== "student" || String(item.student_id) === String(studentProfile?.databaseId));
  const studentFees = role === "student"
    ? record.fees.filter((item) => String(item.student_id) === String(studentProfile?.databaseId))
    : record.fees;
  const roleTitle = role === "admin" ? "Administrator" : role === "faculty" ? "Faculty" : "Student";

  if (!session) return null;

  return <main className="management-shell">
    <aside className="management-side">
      <a href="/" className="management-brand"><span>✳</span><strong>northstar<small>COLLEGE</small></strong></a>
      <div className="management-caption">YOUR WORKSPACE</div>
      <div className="management-nav">{menu.map((item) => {
        const Icon = item === "Overview" ? LayoutDashboard : item.includes("course") || item === "Courses" ? BookOpen
          : item.includes("Attendance") ? CalendarDays : item.includes("Results") ? ClipboardCheck
            : item === "Fees" ? Wallet : item.includes("Notice") || item === "Announcements" ? Bell : Users;
        return <button key={item} className={active === item ? "active" : ""} onClick={() => { setActive(item); setError(""); setMessage(""); }}>
          <Icon size={16} /><span>{item}</span>
        </button>;
      })}</div>
      <div className="management-user"><span>{session.name?.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><div><strong>{session.name}</strong><small>{roleTitle}</small></div></div>
    </aside>
    <section className="management-main">
      <header className="management-top"><div><span>Northstar College</span><b>/</b>{active}</div>
        <div className="management-top-right"><span className={`demo-pill ${session.token ? "connected" : "demo"}`}>{session.token ? "API CONNECTED" : "LOCAL DEMO"}</span><button onClick={() => { logout(); navigate("/"); }}><LogOut size={15} /> Sign out</button></div>
      </header>
      <div className="management-content">
        <div className="management-heading"><div><span className="management-eyebrow">{roleTitle.toUpperCase()} PORTAL</span><h1>{active === "Overview" ? `Welcome, ${session.name?.split(" ")[0] || "there"}.` : active}</h1>
          <p>{role === "admin" ? "Manage college operations and academic records." : role === "faculty" ? "Manage your assigned classes and student progress." : "Your academic information, all in one place."}</p></div>
          {role === "student" && studentProfile && <span className="student-id-chip">{studentProfile.id}</span>}
        </div>
        {!session.token && <div className="management-notice"><strong>Demo workspace</strong> Changes are stored in this browser only. Connect PostgreSQL to use shared records.</div>}
        {error && <div className="management-alert error" role="alert">{error}</div>}
        {message && <div className="management-alert success" role="status"><Check size={16} />{message}</div>}
        {loading ? <div className="management-loading">Loading your workspace…</div> : renderContent()}
      </div>
    </section>
  </main>;

  function renderContent() {
    if (active === "Overview") return <Overview />;
    if (active === "Students" && role === "admin") return <Students />;
    if (active === "Faculty" && role === "admin") return <Faculty />;
    if ((active === "Courses" && role === "admin") || active === "My courses") return <Courses />;
    if (active === "Departments" && role === "admin") return <Departments />;
    if (active === "Schedule") return <Schedule />;
    if (active === "Attendance") return <Attendance />;
    if (active === "Results") return <Results />;
    if (active === "Fees") return <Fees />;
    if (active === "Announcements") return <Announcements />;
    if (active === "Admissions" && role === "admin") return <Admissions />;
    if (active === "Leave requests") return <LeaveRequests />;
    if (active === "My profile" && role === "student") return <Profile />;
    return <Overview />;
  }

  function Overview() {
    const stats = role === "admin"
      ? [["Students", record.stats?.students ?? students.length, Users], ["Faculty", record.stats?.faculty ?? record.faculty.length, GraduationCap],
        ["Courses", record.stats?.courses ?? courses.length, BookOpen], ["Departments", record.stats?.departments ?? departments.length, ClipboardCheck],
        ["Attendance", `${record.stats?.attendance_percent ?? attendancePercent}%`, CalendarDays],
        ["Pending fees", money(record.stats?.pending_fees ?? 0), Wallet]]
      : role === "faculty"
        ? [["Assigned courses", courses.length, BookOpen], ["Students", students.length, Users], ["Attendance today", `${facultyAttendancePercent}%`, CalendarDays], ["Results entered", record.results.length, ClipboardCheck]]
        : [["Attendance", `${attendancePercent}%`, CalendarDays], ["Courses", studentProfile?.courses?.length || courses.length, BookOpen], ["Results", studentResults.length, ClipboardCheck], ["Fee status", studentFees[0]?.status || "Pending", Wallet]];
    return <>
      <div className="management-metrics">{stats.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><strong>{value}</strong></article>)}</div>
      <div className="management-grid">
        <section className="management-card"><CardTitle title="Upcoming classes" detail={`${record.schedules.length} scheduled`} />
          <ScheduleList list={record.schedules.slice(0, 4)} />
          <button className="management-text-button" onClick={() => setActive("Schedule")}>View schedule <ArrowRight size={13} /></button>
        </section>
        {role === "admin" && <section className="management-card"><CardTitle title="Recent student registrations" />
          {students.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5).map((student) => <article className="notice-item" key={student.databaseId}><strong>{student.name}</strong><p>{student.id} · {student.department} · {student.created_at ? new Date(student.created_at).toLocaleDateString() : "Demo record"}</p></article>)}
          {!students.length && <Empty text="No student records yet." />}
        </section>}
        <section className="management-card"><CardTitle title={role === "student" ? "My courses" : "Quick access"} />
          {role === "student" ? <CourseList list={studentProfile?.courses || courses} /> : <div className="quick-links">{menu.filter((item) => item !== "Overview").slice(0, 6).map((item) => <button key={item} onClick={() => setActive(item)}>{item}<ArrowRight size={14} /></button>)}</div>}
        </section>
        <section className="management-card"><CardTitle title="Latest announcements" />
          {record.notices.slice(0, 4).map((notice) => <article className="notice-item" key={notice.id || notice.title}><small>{notice.audience || "CAMPUS UPDATE"}</small><strong>{notice.title}</strong><p>{notice.body || notice.text}</p></article>)}
          {!record.notices.length && <Empty text="No announcements have been published." />}
        </section>
      </div>
    </>;
  }

  function Students() {
    return <div className="management-card">
      <CardTitle title="Student directory" detail={`${students.length} records`} />
      <button className="management-export" onClick={() => downloadCsv(
        "northstar-students.csv",
        ["Name", "Student ID", "Email", "Department", "Academic Year", "Status"],
        filteredStudents.map((student) => [student.name, student.id, student.email, student.department, student.year, student.status]),
      )}>Download student report</button>
      {editingStudent && <form className="management-form" onSubmit={(event) => run(event, saveStudentEdit)}>
        <h3>Edit {editingStudent.name}</h3>
        <div className="management-fields">
          <Field label="Full name" name="name" defaultValue={editingStudent.name} required />
          <Field label="Phone" name="phone" defaultValue={editingStudent.phone} />
          <Field label="Address" name="address" defaultValue={editingStudent.address} />
          <SelectField label="Department" name="department" values={departments.map((item) => item.name)} defaultValue={editingStudent.department} />
          <Field label="Academic year" name="year" defaultValue={editingStudent.year} />
          <SelectField label="Semester" name="semester" values={Array.from({ length: 12 }, (_, i) => String(i + 1))} defaultValue={String(editingStudent.courses?.[0]?.semester || 1)} />
          <Field label="Guardian name" name="guardianName" defaultValue={editingStudent.guardianName} />
          <Field label="Guardian phone" name="guardianPhone" defaultValue={editingStudent.guardianPhone} />
        </div>
        <div className="management-checks"><span>Course enrollment</span>{courses.map((course) => <label key={course.id}><input type="checkbox" name="courseIds" value={course.id} defaultChecked={editingStudent.courses?.some((item) => String(item.id) === String(course.id))} />{course.title}</label>)}</div>
        <button className="management-button" disabled={saving}>Save student <Check size={15} /></button>
        <button type="button" className="management-cancel" onClick={() => setEditingStudent(null)}>Cancel</button>
      </form>}
      <form className="management-form" onSubmit={(event) => run(event, upsertStudent)}>
        <h3>Add student</h3>
        <div className="management-fields">
          <Field label="Student ID" name="studentId" placeholder="Auto-generated if blank" />
          <Field label="Full name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Initial password" name="password" type="password" minLength="8" required />
          <Field label="Date of birth" name="dateOfBirth" type="date" />
          <SelectField label="Gender" name="gender" values={["Female", "Male", "Other"]} />
          <Field label="Phone" name="phone" type="tel" />
          <Field label="Address" name="address" />
          <SelectField label="Department" name="department" values={departments.map((item) => item.name)} required />
          <Field label="Academic year" name="year" placeholder="Year 1" />
          <Field label="Admission date" name="admissionDate" type="date" />
          <SelectField label="Enrolled course" name="courseId" options={courses} />
          <SelectField label="Semester" name="semester" values={Array.from({ length: 12 }, (_, i) => String(i + 1))} />
          <Field label="Parent / guardian" name="guardianName" />
          <Field label="Guardian contact" name="guardianPhone" type="tel" />
        </div>
        <button className="management-button" disabled={saving}>{saving ? "Saving…" : "Add student"} <ArrowRight size={15} /></button>
      </form>
      <div className="management-filters">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, email" /></label>
        <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
        <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="">All years</option>{[1, 2, 3, 4, 5].map((year) => <option key={year}>Year {year}</option>)}</select>
        <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>
      </div>
      <div className="management-table-wrap"><table><thead><tr><th>STUDENT</th><th>ID</th><th>DEPARTMENT / YEAR</th><th>COURSES</th><th>STATUS</th><th></th></tr></thead><tbody>
        {filteredStudents.map((student) => <tr key={student.databaseId}><td><strong>{student.name}</strong><small>{student.email}</small></td><td>{student.id}</td><td>{student.department}<small>{student.year}</small></td><td>{student.courses?.map((course) => course.title).join(", ") || "—"}</td><td><span className="status-pill">{student.status}</span></td><td><button onClick={() => setEditingStudent(student)}>Edit</button> <button className="text-danger" onClick={() => deleteStudent(student)}>Delete</button></td></tr>)}
      </tbody></table>{!filteredStudents.length && <Empty text="No students match these filters." />}</div>
    </div>;
  }

  function Faculty() {
    const filteredFaculty = record.faculty.filter((member) => `${member.name} ${member.employeeId} ${member.email} ${member.department}`.toLowerCase().includes(facultySearch.toLowerCase()));
    return <div className="management-card">
      <CardTitle title="Faculty directory" detail={`${record.faculty.length} records`} />
      {editingFaculty && <form className="management-form" onSubmit={(event) => run(event, saveFacultyEdit)}>
        <h3>Edit {editingFaculty.name}</h3>
        <div className="management-fields">
          <Field label="Full name" name="name" defaultValue={editingFaculty.name} required />
          <Field label="Phone" name="phone" defaultValue={editingFaculty.phone} />
          <SelectField label="Department" name="department" values={departments.map((item) => item.name)} defaultValue={editingFaculty.department} />
          <Field label="Subject" name="subject" defaultValue={editingFaculty.subject} />
          <Field label="Qualification" name="qualification" defaultValue={editingFaculty.qualification} />
          <Field label="Experience" name="experienceYears" type="number" min="0" step="0.5" defaultValue={editingFaculty.experience_years} />
          <Field label="Joining date" name="joiningDate" type="date" defaultValue={String(editingFaculty.joining_date || "").slice(0, 10)} />
        </div>
        <div className="management-checks"><span>Assigned courses</span>{courses.map((course) => <label key={course.id}><input type="checkbox" name="courseIds" value={course.id} defaultChecked={editingFaculty.courseIds?.some((id) => String(id) === String(course.id))} />{course.title}</label>)}</div>
        <button className="management-button" disabled={saving}>Save faculty <Check size={15} /></button>
        <button type="button" className="management-cancel" onClick={() => setEditingFaculty(null)}>Cancel</button>
      </form>}
      <form className="management-form" onSubmit={(event) => run(event, createFaculty)}>
        <h3>Register faculty</h3>
        <div className="management-fields">
          <Field label="Faculty ID" name="employeeId" placeholder="FAC0001" required />
          <Field label="Full name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Initial password" name="password" type="password" minLength="8" required />
          <Field label="Phone" name="phone" type="tel" />
          <SelectField label="Department" name="department" values={departments.map((item) => item.name)} required />
          <Field label="Subject" name="subject" />
          <Field label="Qualification" name="qualification" />
          <Field label="Experience (years)" name="experienceYears" type="number" min="0" step="0.5" />
          <Field label="Joining date" name="joiningDate" type="date" />
        </div>
        <div className="management-checks"><span>Assign courses</span>{courses.map((course) => <label key={course.id}><input type="checkbox" name="courseIds" value={course.id} />{course.title}</label>)}</div>
        <button className="management-button" disabled={saving}>{saving ? "Saving…" : "Register faculty"} <ArrowRight size={15} /></button>
      </form>
      <label className="search-field management-search"><Search size={16} /><input value={facultySearch} onChange={(event) => setFacultySearch(event.target.value)} placeholder="Search faculty name or department" /></label>
      <div className="management-table-wrap"><table><thead><tr><th>FACULTY</th><th>FACULTY ID</th><th>DEPARTMENT</th><th>SUBJECT / QUALIFICATION</th><th>ASSIGNED COURSES</th><th>Actions</th></tr></thead><tbody>
        {filteredFaculty.map((person) => <tr key={person.databaseId}><td><strong>{person.name}</strong><small>{person.email}</small></td><td>{person.employeeId || person.id}</td><td>{person.department}</td><td>{person.subject}<small>{person.qualification}</small></td><td>{person.courseIds?.length || 0}</td><td><button onClick={() => setEditingFaculty(person)}>Edit</button> <button className="text-danger" onClick={() => deleteFaculty(person)}>Delete</button></td></tr>)}
      </tbody></table>{!record.faculty.length && <Empty text="No faculty records." />}</div>
    </div>;
  }

  function Courses() {
    return <div className="management-card">
      <CardTitle title={role === "faculty" ? "My assigned courses" : "Courses"} detail={`${courses.length} courses`} />
      {editingCourse && <form className="management-form" onSubmit={(event) => run(event, saveCourseEdit)}>
        <h3>Edit {editingCourse.title}</h3>
        <div className="management-fields">
          <Field label="Course name" name="title" defaultValue={editingCourse.title} required />
          <Field label="Course code" name="courseCode" defaultValue={editingCourse.course_code} />
          <SelectField label="Department" name="department" values={departments.map((item) => item.name)} defaultValue={editingCourse.department} />
          <Field label="Program / degree" name="degree" defaultValue={editingCourse.degree} />
          <SelectField label="Semester" name="semester" values={Array.from({ length: 12 }, (_, i) => String(i + 1))} defaultValue={String(editingCourse.semester || 1)} />
          <Field label="Description" name="description" defaultValue={editingCourse.description} />
        </div>
        <button className="management-button" disabled={saving}>Save course <Check size={15} /></button>
        <button type="button" className="management-cancel" onClick={() => setEditingCourse(null)}>Cancel</button>
      </form>}
      {role === "admin" && <form className="management-form" onSubmit={(event) => run(event, createCourse)}>
        <h3>Add course / subject</h3>
        <div className="management-fields">
          <Field label="Course name" name="title" required />
          <Field label="Course code" name="courseCode" placeholder="CS101" />
          <SelectField label="Department" name="department" values={departments.map((item) => item.name)} required />
          <Field label="Program / degree" name="degree" placeholder="B.Tech" />
          <SelectField label="Semester" name="semester" values={Array.from({ length: 12 }, (_, i) => String(i + 1))} required />
          <SelectField label="Assign faculty" name="facultyId" options={record.faculty.map((member) => ({ id: member.databaseId, title: member.name }))} />
          <Field label="Description" name="description" />
        </div>
        <button className="management-button" disabled={saving}>{saving ? "Saving…" : "Add course"} <ArrowRight size={15} /></button>
      </form>}
      {role === "admin" ? <div className="management-table-wrap"><table><thead><tr><th>COURSE</th><th>CODE</th><th>DEPARTMENT</th><th>PROGRAM</th><th>SEMESTER</th><th>Actions</th></tr></thead><tbody>
        {courses.map((course) => <tr key={course.id}><td>{course.title}</td><td>{course.course_code || "—"}</td><td>{course.department}</td><td>{course.degree || "—"}</td><td>{course.semester || 1}</td><td><button onClick={() => setEditingCourse(course)}>Edit</button> <button className="text-danger" onClick={() => deleteCourse(course)}>Delete</button></td></tr>)}
      </tbody></table>{!courses.length && <Empty text="No courses have been created." />}</div> : <CourseList list={courses} />}
    </div>;
  }

  function Departments() {
    return <div className="management-card">
      <CardTitle title="Departments" detail={`${departments.length} departments`} />
      <form className="management-inline-form" onSubmit={(event) => run(event, createDepartment)}><Field label="New department name" name="name" required /><button className="management-button">Add department <ArrowRight size={15} /></button></form>
      <ul className="management-departments">{departments.map((department) => <li key={department.id}><span>{department.name}</span><small>Course department</small><button className="text-danger" onClick={() => deleteDepartment(department)}>Remove</button></li>)}</ul>
    </div>;
  }

  function Schedule() {
    return <div className="management-card">
      <CardTitle title={role === "admin" ? "Class schedule" : "Upcoming classes"} detail="Times are shown in your browser's local timezone." />
      {role === "admin" && <form className="management-form" onSubmit={(event) => run(event, createSchedule)}>
        <h3>Schedule a class session</h3>
        <div className="management-fields">
          <SelectField label="Course" name="courseId" options={courses} required />
          <SelectField label="Assigned faculty" name="facultyId" options={record.faculty.map((person) => ({ id: person.databaseId, title: person.name }))} required />
          <Field label="Date and time" name="startsAt" type="datetime-local" required />
          <Field label="Room / location" name="location" maxLength="180" required />
        </div>
        <button className="management-button" disabled={saving}>Schedule class <CalendarDays size={15} /></button>
      </form>}
      <ScheduleList list={record.schedules} />
      {role === "admin" && record.schedules.map((classRow) => <button key={`remove-${classRow.id}`} className="text-danger management-remove-class" onClick={() => deleteSchedule(classRow)}>Remove {classRow.course} class</button>)}
      {!record.schedules.length && <Empty text="No upcoming classes are scheduled." />}
    </div>;
  }

  function Attendance() {
    const attendanceRows = role === "student" ? studentAttendance : roster;
    const percentage = role === "student" && studentAttendance.length
      ? Math.round(studentAttendance.filter((item) => ["present", "late"].includes(item.status)).length / studentAttendance.length * 100)
      : attendancePercent;
    return <div className="management-card">
      <CardTitle title={role === "student" ? "My attendance" : "Attendance register"} detail={role === "student" ? `${percentage}% attendance` : `${roster.length} enrolled students`} />
      {role !== "student" && <div className="management-filters">
        <select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)} required><option value="">Select course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>
        <label className="management-date">Class date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
      </div>}
      <div className="management-table-wrap"><table><thead><tr><th>STUDENT</th><th>COURSE</th><th>DATE</th><th>STATUS</th>{role !== "student" && <th>MARK</th>}</tr></thead><tbody>
        {role === "student" ? studentAttendance.map((item, index) => <tr key={item.id || index}><td>{item.course || studentProfile?.name}</td><td>{item.course || "—"}</td><td>{String(item.class_date || "").slice(0, 10)}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td></tr>)
          : roster.map((student) => <tr key={student.databaseId}><td><strong>{student.name}</strong><small>{student.id}</small></td><td>{courses.find((course) => String(course.id) === String(selectedCourse))?.title}</td><td>{selectedDate}</td><td><span className={`status-pill status-${attendanceStatus[student.databaseId] || "present"}`}>{attendanceStatus[student.databaseId] || "present"}</span></td><td><select value={attendanceStatus[student.databaseId] || "present"} onChange={(event) => setAttendanceStatus((previous) => ({ ...previous, [student.databaseId]: event.target.value }))}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option></select></td></tr>)}
      </tbody></table>{!attendanceRows.length && <Empty text={role === "student" ? "No attendance has been recorded yet." : "No students are enrolled in this course."} />}</div>
      {role !== "student" && <button className="management-button" onClick={() => saveAttendance().catch((saveError) => setError(saveError.message))}>Save attendance <Check size={15} /></button>}
      {role === "student" && <p className="management-help">Present and late records count toward attendance percentage. Leave and absent records do not.</p>}
    </div>;
  }

  function Results() {
    const visibleResults = role === "student" ? studentResults : record.results;
    return <div className="management-card">
      <CardTitle title={role === "student" ? "My examination results" : "Marks and results"} detail="Grade scale: A ≥ 90 · B ≥ 80 · C ≥ 70 · D ≥ 60 · F < 60" />
      {role === "student" && <button className="management-export" onClick={() => downloadCsv(
        "northstar-academic-results.csv",
        ["Course", "Semester", "Assignment", "Internal", "Practical", "Final", "Total out of 400", "Percentage", "Grade"],
        visibleResults.map((item) => [item.course, item.semester, item.assignment_marks, item.internal_marks, item.practical_marks, item.final_marks, item.total_marks, item.percentage, item.grade]),
      )}>Download my results</button>}
      {role !== "student" && <form className="management-form" onSubmit={(event) => run(event, saveResult)}>
        <h3>Enter or update marks</h3>
        <div className="management-fields">
          <SelectField label="Course" name="courseId" options={courses} required />
          <SelectField label="Student" name="studentId" options={students.map((student) => ({ id: student.databaseId, title: `${student.name} (${student.id})` }))} required />
          <SelectField label="Semester" name="semester" values={Array.from({ length: 12 }, (_, i) => String(i + 1))} required />
          <Field label="Assignment / 100" name="assignmentMarks" type="number" min="0" max="100" step="0.01" required />
          <Field label="Internal / 100" name="internalMarks" type="number" min="0" max="100" step="0.01" required />
          <Field label="Practical / 100" name="practicalMarks" type="number" min="0" max="100" step="0.01" required />
          <Field label="Final exam / 100" name="finalMarks" type="number" min="0" max="100" step="0.01" required />
        </div>
        <button className="management-button" disabled={saving}>{saving ? "Saving…" : "Save result"} <ArrowRight size={15} /></button>
      </form>}
      <div className="management-filters"><select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>
        <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}><option value="">All semesters</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>Semester {i + 1}</option>)}</select></div>
      <div className="management-table-wrap"><table><thead><tr><th>STUDENT</th><th>COURSE</th><th>SEMESTER</th><th>ASSIGNMENT</th><th>INTERNAL</th><th>PRACTICAL</th><th>FINAL</th><th>TOTAL / 400</th><th>%</th><th>GRADE</th></tr></thead><tbody>
        {visibleResults.filter((item) => (!courseFilter || String(item.course_id) === courseFilter) && (!semesterFilter || String(item.semester) === semesterFilter)).map((item) => {
          const total = asNum(item.total_marks ?? (asNum(item.assignment_marks) + asNum(item.internal_marks) + asNum(item.practical_marks) + asNum(item.final_marks)));
          const percentage = asNum(item.percentage ?? total / 4);
          return <tr key={item.id}><td>{item.student_name || (role === "student" ? studentProfile?.name : students.find((student) => String(student.databaseId) === String(item.student_id))?.name)}</td><td>{item.course || courses.find((course) => String(course.id) === String(item.course_id))?.title || "—"}</td><td>{item.semester}</td><td>{item.assignment_marks}</td><td>{item.internal_marks}</td><td>{item.practical_marks}</td><td>{item.final_marks}</td><td>{total} / 400</td><td>{percentage.toFixed(1)}%</td><td><b className="grade-badge">{item.grade || grade(percentage)}</b></td></tr>;
        })}
      </tbody></table>{!visibleResults.length && <Empty text="No results have been published yet." />}</div>
    </div>;
  }

  function Fees() {
    return <div className="management-card">
      <CardTitle title={role === "student" ? "My fee details" : "Fee management"} detail={role === "student" ? "Payment history and balance" : "Each fee is recorded as a single full payment."} />
      {role === "admin" && <>
        <form className="management-form" onSubmit={(event) => run(event, setFee)}>
          <h3>Set student fee</h3><div className="management-fields">
            <SelectField label="Student" name="studentId" options={students.map((student) => ({ id: student.databaseId, title: `${student.name} (${student.id})` }))} required />
            <Field label="Total fee" name="totalFee" type="number" min="0.01" step="0.01" required />
            <Field label="Due date" name="dueDate" type="date" />
          </div><button className="management-button" disabled={saving}>Save fee <ArrowRight size={15} /></button>
        </form>
        <form className="management-form" onSubmit={(event) => run(event, recordPayment)}>
          <h3>Record confirmed full payment</h3><div className="management-fields">
            <SelectField label="Student" name="studentId" options={students.map((student) => ({ id: student.databaseId, title: `${student.name} (${student.id})` }))} required />
            <SelectField label="Payment method" name="paymentMethod" values={["cash", "upi", "card", "bank_transfer"]} required />
          </div><p className="management-help">This creates a receipt for a payment already received. It does not process a card, UPI, or bank transaction.</p>
          <button className="management-button" disabled={saving}>Record payment <Check size={15} /></button>
        </form>
      </>}
      <div className="management-table-wrap"><table><thead><tr><th>STUDENT</th><th>TOTAL</th><th>PAID</th><th>REMAINING</th><th>STATUS</th><th>PAYMENT HISTORY</th></tr></thead><tbody>
        {studentFees.map((fee) => <tr key={fee.student_id}><td>{fee.student_name || (role === "student" ? studentProfile?.name : students.find((student) => String(student.databaseId) === String(fee.student_id))?.name)}</td><td>{money(fee.total_fee)}</td><td>{money(fee.paid_amount)}</td><td>{money(fee.remaining_amount)}</td><td><span className={`status-pill status-${fee.status}`}>{fee.status}</span></td><td>{(fee.payments || []).map((payment) => `${money(payment.amount)} · ${payment.method || payment.payment_method} · ${String(payment.paidAt || payment.paid_at || "").slice(0, 10)}`).join(", ") || "No payments"}</td></tr>)}
      </tbody></table>{!studentFees.length && <Empty text={role === "student" ? "No fee has been assigned to your account." : "No fee records yet."} />}</div>
    </div>;
  }

  function Announcements() {
    return <div className="management-grid">
      <section className="management-card"><CardTitle title="Announcements" />
        {record.notices.map((notice) => <article className="notice-item" key={notice.id || notice.title}><small>{notice.audience || "all"}</small><strong>{notice.title}</strong><p>{notice.body || notice.text}</p><time>{String(notice.created_at || notice.date || "").slice(0, 10)}</time></article>)}
        {!record.notices.length && <Empty text="No announcements available." />}
      </section>
      {role !== "student" && <section className="management-card"><CardTitle title="Publish an announcement" />
        <form className="management-form" onSubmit={(event) => run(event, postNotice)}>
          <Field label="Title" name="title" minLength="3" maxLength="180" required />
          <label className="management-field">Message<textarea name="body" minLength="3" maxLength="5000" rows="5" required /></label>
          <SelectField label="Audience" name="audience" values={["all", "students", "faculty"]} />
          <button className="management-button" disabled={saving}>Publish announcement <ArrowRight size={15} /></button>
        </form>
      </section>}
    </div>;
  }

  function Admissions() {
    return <div className="management-card"><CardTitle title="Admission applications" detail={`${record.admissions.length} applications`} />
      <div className="management-table-wrap"><table><thead><tr><th>APPLICANT</th><th>EMAIL</th><th>PROGRAM</th><th>DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {record.admissions.map((item) => <tr key={item.id}><td>{item.applicant_name}</td><td>{item.email}</td><td>{item.preferred_course}</td><td>{String(item.created_at || "").slice(0, 10)}</td><td>{item.status}</td><td><button onClick={() => changeApplication(item, "accepted")}>Approve</button> <button className="text-danger" onClick={() => changeApplication(item, "rejected")}>Reject</button></td></tr>)}
      </tbody></table>{!record.admissions.length && <Empty text="No admission applications to review." />}</div>
    </div>;
  }

  function LeaveRequests() {
    const handleLeaveSubmit = (event) => {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (values.startDate > values.endDate) {
        event.preventDefault();
        setError("The end date must be on or after the start date.");
        setMessage("");
        return;
      }
      run(event, submitLeave);
    };
    const visibleRequests = record.leaveRequests.filter((item) => role !== "student" ||
      String(item.student_id) === String(studentProfile?.databaseId) ||
      item.student_name === session.name || item.email === session.email);
    return <div className="management-card">
      {role === "student" ? <>
        <CardTitle title="Request leave" />
        <form className="management-form" onSubmit={handleLeaveSubmit}><div className="management-fields"><Field label="First day" name="startDate" type="date" required /><Field label="Last day" name="endDate" type="date" required /></div>
          <label className="management-field">Reason for leave<textarea name="reason" minLength="10" maxLength="2000" rows="3" required /></label>
          <button className="management-button" disabled={saving}>Submit leave request <ArrowRight size={15} /></button></form>
      </> : <CardTitle title="Leave requests" />}
      <div className="management-table-wrap"><table><thead><tr><th>STUDENT</th><th>DATES</th><th>REASON</th><th>STATUS</th>{role === "admin" && <th>REVIEW</th>}</tr></thead><tbody>
        {visibleRequests.map((item) => <tr key={item.id}><td>{item.student_name || session.name}</td><td>{String(item.start_date || item.startDate || "").slice(0, 10)} – {String(item.end_date || item.endDate || "").slice(0, 10)}</td><td>{item.reason}</td><td>{item.status?.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</td>{role === "admin" && <td><button onClick={() => changeLeave(item, "approved")}>Approve</button> <button className="text-danger" onClick={() => changeLeave(item, "rejected")}>Reject</button></td>}</tr>)}
      </tbody></table>{!visibleRequests.length && <Empty text="No leave requests yet" />}</div>
    </div>;
  }

  function Profile() {
    const saveProfile = async (form) => {
      const values = Object.fromEntries(form.entries());
      if (session.token) {
        const updated = await request(`/api/students/${studentProfile.databaseId}`, "PATCH", values);
        setProfile(normalizeStudent({ ...studentProfile, ...updated, guardian_name: values.guardianName, guardian_phone: values.guardianPhone, gender: values.gender }));
      } else {
        const updated = { ...studentProfile, ...values };
        setProfile(updated);
        updateRecord({ students: record.students.map((item) => item.databaseId === studentProfile.databaseId ? updated : item) });
      }
      setMessage("Profile updated.");
    };
    return <div className="management-card"><CardTitle title="My profile" detail="Keep your contact details current." />
      <form className="management-form" onSubmit={(event) => run(event, saveProfile)}>
        <div className="management-fields">
          <Field label="Full name" name="name" defaultValue={studentProfile?.name} required />
          <Field label="Email" name="email" type="email" defaultValue={studentProfile?.email} disabled />
          <Field label="Student ID" name="studentId" defaultValue={studentProfile?.id} disabled />
          <Field label="Department" name="department" defaultValue={studentProfile?.department} disabled />
          <Field label="Phone" name="phone" defaultValue={studentProfile?.phone} />
          <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={String(studentProfile?.date_of_birth || "").slice(0, 10)} />
          <SelectField label="Gender" name="gender" values={["Female", "Male", "Other"]} defaultValue={studentProfile?.gender} />
          <Field label="Address" name="address" defaultValue={studentProfile?.address} />
          <Field label="Guardian name" name="guardianName" defaultValue={studentProfile?.guardianName} />
          <Field label="Guardian contact" name="guardianPhone" defaultValue={studentProfile?.guardianPhone} />
        </div>
        <button className="management-button" disabled={saving}>Save profile <Check size={15} /></button>
      </form>
    </div>;
  }
}

function CardTitle({ title, detail }) {
  return <div className="management-card-title"><div><h2>{title}</h2>{detail && <span>{detail}</span>}</div></div>;
}

function Field({ label, name, type = "text", required = false, ...props }) {
  return <label className="management-field">{label}<input name={name} type={type} required={required} {...props} /></label>;
}

function SelectField({ label, name, values, options, required = false, defaultValue }) {
  const list = options || values?.map((value) => ({ id: value, title: value })) || [];
  return <label className="management-field">{label}<select name={name} required={required} defaultValue={defaultValue ?? ""}><option value="">Select…</option>{list.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>;
}

function CourseList({ list }) {
  return list?.length ? <div className="management-course-list">{list.map((course) => <article key={course.id || course.title}><span><BookOpen size={16} /></span><div><strong>{course.title}</strong><small>{course.course_code || course.degree || "Academic course"} · Semester {course.semester || 1}</small></div></article>)}</div> : <Empty text="No courses are assigned." />;
}

function ScheduleList({ list }) {
  return list?.length ? <div className="management-course-list">{list.map((classRow) => <article key={classRow.id}>
    <span><Clock3 size={16} /></span>
    <div><strong>{classRow.course}</strong><small>{classRow.faculty_name || "Faculty"} · {classRow.location}</small>
      <small>{new Date(classRow.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
    </div>
  </article>)}</div> : <Empty text="No upcoming classes are scheduled." />;
}

function Empty({ text }) { return <div className="management-empty">{text}</div>; }
function money(value) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(asNum(value)); }
