CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('student', 'faculty', 'staff', 'admin')),
  student_id VARCHAR(24) UNIQUE,
  employee_id VARCHAR(24) UNIQUE,
  department VARCHAR(120),
  year VARCHAR(24),
  phone VARCHAR(32),
  date_of_birth DATE,
  address TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'faculty', 'staff', 'admin'));

CREATE INDEX IF NOT EXISTS users_role_created_idx ON users (role, created_at DESC);

CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO departments (name) VALUES
  ('Computer Science'),
  ('Business & Economics'),
  ('Architecture & Design'),
  ('Life Sciences'),
  ('Liberal Arts'),
  ('Law & Public Policy')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS complaints (
  id BIGSERIAL PRIMARY KEY,
  complaint_code VARCHAR(32) UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN ('Academic', 'Technical', 'Infrastructure', 'Hostel', 'Transport', 'Library', 'Fees', 'Other')),
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  priority VARCHAR(12) NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  location VARCHAR(180) NOT NULL,
  complaint_date DATE NOT NULL,
  contact_info VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected')),
  assigned_staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS complaints_owner_created_idx ON complaints (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_department_status_idx ON complaints (department_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS complaints_priority_created_idx ON complaints (priority, created_at DESC);

CREATE TABLE IF NOT EXISTS complaint_updates (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) CHECK (status IS NULL OR status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected')),
  message VARCHAR(3000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS complaint_updates_complaint_idx ON complaint_updates (complaint_id, created_at);

CREATE TABLE IF NOT EXISTS complaint_attachments (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  filename VARCHAR(180) NOT NULL,
  mime_type VARCHAR(80) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complaint_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  message VARCHAR(500) NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS complaint_notifications_user_idx ON complaint_notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS complaint_feedback (
  id BIGSERIAL PRIMARY KEY,
  complaint_id BIGINT NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  department VARCHAR(120) NOT NULL,
  degree VARCHAR(80),
  description TEXT,
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  course_code VARCHAR(24),
  semester SMALLINT NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 12),
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_code VARCHAR(24);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS semester SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_semester_check;
ALTER TABLE courses ADD CONSTRAINT courses_semester_check CHECK (semester BETWEEN 1 AND 12);
CREATE UNIQUE INDEX IF NOT EXISTS courses_course_code_unique_idx ON courses (course_code) WHERE course_code IS NOT NULL;
UPDATE courses c SET department_id = d.id FROM departments d
WHERE c.department_id IS NULL AND c.department = d.name;

INSERT INTO courses (title, department, degree, description, course_code, semester) VALUES
  ('Computer Science', 'Computer Science', 'B.Tech · 4 years', 'Sample program course for dashboard demonstration.', 'NS-CS-101', 1),
  ('Business & Economics', 'Business & Economics', 'B.Com · 3 years', 'Sample program course for dashboard demonstration.', 'NS-BE-101', 1),
  ('Architecture & Design', 'Architecture & Design', 'B.Des · 4 years', 'Sample program course for dashboard demonstration.', 'NS-AD-101', 1),
  ('Life Sciences', 'Life Sciences', 'B.Sc · 3 years', 'Sample program course for dashboard demonstration.', 'NS-LS-101', 1),
  ('Liberal Arts', 'Liberal Arts', 'B.A. · 3 years', 'Sample program course for dashboard demonstration.', 'NS-LA-101', 1),
  ('Law & Public Policy', 'Law & Public Policy', 'B.A. LL.B · 5 years', 'Sample program course for dashboard demonstration.', 'NS-LP-101', 1)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS course_faculty (
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  faculty_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, faculty_id)
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender VARCHAR(24),
  admission_date DATE,
  guardian_name VARCHAR(160),
  guardian_phone VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS student_courses (
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  academic_year VARCHAR(24) NOT NULL DEFAULT 'Year 1',
  semester SMALLINT NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 12),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS student_courses_course_idx ON student_courses (course_id, student_id);

CREATE TABLE IF NOT EXISTS scheduled_classes (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  faculty_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  location VARCHAR(180) NOT NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, faculty_id, starts_at)
);

CREATE INDEX IF NOT EXISTS scheduled_classes_starts_idx ON scheduled_classes (starts_at);

CREATE TABLE IF NOT EXISTS faculty_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(180),
  qualification VARCHAR(180),
  experience_years NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  joining_date DATE
);

CREATE TABLE IF NOT EXISTS notices (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(16) NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'students', 'faculty')),
  author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_applications (
  id BIGSERIAL PRIMARY KEY,
  applicant_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  date_of_birth DATE,
  qualification VARCHAR(180),
  grade VARCHAR(64),
  preferred_course VARCHAR(180) NOT NULL,
  preferred_department VARCHAR(120),
  address TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'under_review' CHECK (status IN ('under_review', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admissions_status_created_idx ON admission_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS leave_applications (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  reason VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_student_created_idx ON leave_applications (student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_date DATE NOT NULL,
  status VARCHAR(12) NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
  marked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id, class_date)
);

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check CHECK (status IN ('present', 'absent', 'late', 'leave'));

CREATE TABLE IF NOT EXISTS student_marks (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assessment VARCHAR(180) NOT NULL,
  score NUMERIC(7, 2) NOT NULL CHECK (score >= 0),
  max_score NUMERIC(7, 2) NOT NULL CHECK (max_score > 0 AND score <= max_score),
  entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_results (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  semester SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 12),
  assignment_marks NUMERIC(6, 2) NOT NULL CHECK (assignment_marks BETWEEN 0 AND 100),
  internal_marks NUMERIC(6, 2) NOT NULL CHECK (internal_marks BETWEEN 0 AND 100),
  practical_marks NUMERIC(6, 2) NOT NULL CHECK (practical_marks BETWEEN 0 AND 100),
  final_marks NUMERIC(6, 2) NOT NULL CHECK (final_marks BETWEEN 0 AND 100),
  entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id, semester)
);

CREATE TABLE IF NOT EXISTS student_fees (
  student_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_fee NUMERIC(12, 2) NOT NULL CHECK (total_fee > 0),
  due_date DATE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL UNIQUE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(24) NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer')),
  payment_status VARCHAR(16) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid')),
  received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_student_paid_idx ON payments (student_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
