import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, Clock3, Compass, GraduationCap, LayoutDashboard, LogOut, Menu, Moon,
  Search, Settings, ShieldCheck, Sparkles, Sun, Users, X,
} from "lucide-react";
import { courses, events, faculty, initialStudents, seedNotices } from "./data";
import ManagementPortal from "./ManagementPortal";

const readStore = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const saveStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const initialSession = () => readStore("northstar-session", null);
const shouldUseDemo = (response) => response.status === 404 || response.status === 503
  || (response.status >= 500 && !response.headers.get("content-type")?.includes("application/json"));
const normalizeApiUser = (user) => ({
  ...user,
  databaseId: user.id,
  id: user.studentId || user.employeeId || `USER${user.id}`,
  department: user.department || "Undeclared",
  field: user.department || "Undeclared",
  year: user.year || "—",
  status: user.status === "inactive" ? "Inactive" : "Active",
});

function useCollegeData() {
  const [students, setStudents] = useState(() => readStore("northstar-students", initialStudents));
  const [facultyMembers, setFacultyMembers] = useState(() => readStore("northstar-faculty-records", faculty.map((person, index) => ({
    ...person, id: `FAC000${index + 1}`, employeeId: `FAC000${index + 1}`,
    email: `${person.name.toLowerCase().replaceAll(" ", ".")}@northstar.edu`, department: person.field, status: "Active",
  }))));
  const [notices, setNotices] = useState(() => readStore("northstar-notices", seedNotices));
  const [applications, setApplications] = useState(() => readStore("northstar-applications", [
    { name: "Sana Patel", course: "Computer Science", date: "Oct 26, 2026", status: "Under review" },
    { name: "Rohan Das", course: "Business & Economics", date: "Oct 24, 2026", status: "Under review" },
  ]));
  const [leaveRequests, setLeaveRequests] = useState(() => readStore("northstar-leave-requests", []));
  useEffect(() => saveStore("northstar-students", students), [students]);
  useEffect(() => saveStore("northstar-faculty-records", facultyMembers), [facultyMembers]);
  useEffect(() => saveStore("northstar-notices", notices), [notices]);
  useEffect(() => saveStore("northstar-applications", applications), [applications]);
  useEffect(() => saveStore("northstar-leave-requests", leaveRequests), [leaveRequests]);
  return { students, setStudents, facultyMembers, setFacultyMembers, notices, setNotices, applications, setApplications, leaveRequests, setLeaveRequests };
}

function App() {
  const [session, setSession] = useState(initialSession);
  const [dark, setDark] = useState(() => readStore("northstar-dark", false));
  const data = useCollegeData();
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); saveStore("northstar-dark", dark); }, [dark]);
  const login = (user) => { setSession(user); saveStore("northstar-session", user); };
  const logout = () => { setSession(null); localStorage.removeItem("northstar-session"); };
  return <div className="app-shell">
    <Header session={session} dark={dark} setDark={setDark} logout={logout} />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/courses" element={<Courses />} />
      <Route path="/faculty" element={<FacultyDirectory />} />
      <Route path="/admissions" element={<Admissions data={data} />} />
      <Route path="/campus" element={<Campus />} />
      <Route path="/news" element={<News notices={data.notices} />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/login/:role" element={<Login onLogin={login} />} />
      <Route path="/register" element={<Register data={data} onLogin={login} />} />
      <Route path="/dashboard" element={<ManagementPortal session={session} data={data} logout={logout} />} />
      <Route path="/profile" element={<Profile session={session} onSave={login} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    <Footer />
  </div>;
}

const navItems = [["About", "/about"], ["Academics", "/courses"], ["Campus life", "/campus"], ["Admissions", "/admissions"], ["News & events", "/news"]];

function Header({ session, dark, setDark, logout }) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); setProfileOpen(false); }, [location]);
  return <header className="site-header">
    <div className="topline"><span>Curiosity lives here.</span><div><Link to="/faq">Frequently asked questions</Link><span className="top-separator">·</span><a href="mailto:hello@northstar.edu">hello@northstar.edu</a></div></div>
    <div className="nav-wrap">
      <button className="mobile-menu icon-button" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
      <Link to="/" className="brand"><span className="brand-mark"><span>✳</span></span><span className="brand-name">northstar<span>COLLEGE</span></span></Link>
      <nav className={`main-nav ${open ? "nav-open" : ""}`}>
        {navItems.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>{label}</NavLink>)}
      </nav>
      <div className="nav-actions">
        <button className="icon-button theme-toggle" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        {session ? <div className="profile-menu-wrap">
          <button className="profile-trigger" onClick={() => setProfileOpen(!profileOpen)}><span className="mini-avatar">{session.name?.split(" ").map(x => x[0]).slice(0, 2).join("")}</span><span className="profile-trigger-name">{session.name?.split(" ")[0]}</span><ChevronDown size={14} /></button>
          {profileOpen && <div className="profile-menu"><Link to="/dashboard"><LayoutDashboard size={15} /> Dashboard</Link><Link to="/profile"><Settings size={15} /> Account settings</Link><button onClick={logout}><LogOut size={15} /> Sign out</button></div>}
        </div> : <Link className="nav-login" to="/login/student">Sign in <ArrowUpRight size={14} /></Link>}
        <Link className="button button-navy nav-apply" to="/admissions">Apply now <ArrowRight size={15} /></Link>
      </div>
    </div>
  </header>;
}

function Footer() {
  return <footer className="footer">
    <div className="footer-main">
      <div className="footer-about"><Link to="/" className="brand brand-footer"><span className="brand-mark"><span>✳</span></span><span className="brand-name">northstar<span>COLLEGE</span></span></Link><p>A place to find your people, follow your questions, and make something of your own.</p><span className="footer-address">48 University Avenue · Bengaluru, Karnataka 560001</span></div>
      <div className="footer-column"><span className="footer-label">EXPLORE</span><Link to="/about">Our story</Link><Link to="/courses">Academics</Link><Link to="/faculty">Faculty</Link><Link to="/campus">Campus life</Link></div>
      <div className="footer-column"><span className="footer-label">GET STARTED</span><Link to="/admissions">Undergraduate admissions</Link><Link to="/login/student">Student portal</Link><Link to="/login/faculty">Faculty portal</Link><Link to="/contact">Contact us</Link></div>
      <div className="footer-newsletter"><span className="footer-label">A LITTLE NORTHSTAR IN YOUR INBOX</span><p>Campus stories and opportunities, once a month.</p><Newsletter /></div>
    </div>
    <div className="footer-bottom"><span>© 2026 Northstar College. A fictional institution for demonstration.</span><div><Link to="/faq">Privacy</Link><Link to="/faq">Accessibility</Link><a href="mailto:hello@northstar.edu">Instagram ↗</a></div></div>
  </footer>;
}

function Newsletter() {
  const [done, setDone] = useState(false);
  return done ? <div className="newsletter-done"><Check size={16} /> You're on the list!</div> : <form className="newsletter-form" onSubmit={(e) => { e.preventDefault(); setDone(true); }}><input aria-label="Email for newsletter" type="email" placeholder="Your email address" required /><button aria-label="Subscribe"><ArrowRight size={17} /></button></form>;
}

function Home() {
  return <main>
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-star">✳</span> A UNIVERSITY FOR WHAT'S NEXT</span><h1>Find your place.<br /><em>Make your mark.</em></h1><p className="hero-description">Big questions. Bright minds. A community that gives you room to become whoever you’re meant to be.</p><div className="hero-buttons"><Link to="/courses" className="button button-gold">Explore our programs <ArrowRight size={16} /></Link><Link to="/about" className="text-link">Get to know us <ArrowUpRight size={16} /></Link></div><div className="hero-social-proof"><div className="avatar-stack"><span>AS</span><span>DN</span><span>IK</span><span>MT</span></div><div><strong>4,200+ curious minds</strong><small>and counting at Northstar</small></div></div></div>
      <div className="hero-visual"><img className="hero-image" src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1400&q=85" alt="Students gathering in front of a university building" /><div className="hero-image-shade"></div><div className="hero-image-caption"><span className="caption-dot"></span><span>Somewhere between who you are and who you’ll become.</span></div><div className="hero-sticker"><span>GOOD<br />THINGS<br /><em>start here.</em></span><span className="sticker-star">✳</span></div><div className="hero-image-counter">01 <span>/</span> 04</div></div>
    </section>
    <section className="ticker"><div>LEARN WITH PURPOSE <span>✳</span> FIND YOUR PEOPLE <span>✳</span> THINK A LITTLE BIGGER <span>✳</span> BUILD WHAT'S NEXT <span>✳</span> LEARN WITH PURPOSE <span>✳</span></div></section>
    <section className="section intro-section"><div className="section-label"><span>01</span> THE NORTHSTAR DIFFERENCE</div><div className="intro-content"><div><h2>More than a degree.<br /><em>A direction.</em></h2></div><div className="intro-right"><p>College should open more than a classroom door. Here, you’ll find a close-knit community, ideas that connect across disciplines, and the confidence to take your learning out into the world.</p><Link to="/about" className="text-link dark-link">A little more about us <ArrowRight size={16} /></Link></div></div>
      <div className="stat-grid"><div><strong>4,200<span>+</span></strong><small>students finding their way</small></div><div><strong>32</strong><small>programs with room to explore</small></div><div><strong>14:1</strong><small>student-to-faculty ratio</small></div><div><strong>92<span>%</span></strong><small>of grads employed or in further study</small></div></div>
    </section>
    <section className="program-section"><div className="section section-inner"><div className="section-heading-row"><div><div className="section-label section-label-light"><span>02</span> FIND YOUR INTEREST</div><h2>A good place to <em>begin.</em></h2></div><Link to="/courses" className="text-link light-link">All programs <ArrowRight size={16} /></Link></div><div className="program-grid">{courses.slice(0, 3).map((course, i) => <CourseCard key={course.title} course={course} index={i} />)}</div><div className="program-bottom"><span>Not sure where you fit? That’s a pretty great place to start.</span><Link to="/contact">Talk to an advisor <ArrowUpRight size={15} /></Link></div></div></section>
    <section className="campus-feature"><div className="campus-image"><img src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1300&q=85" alt="Students walking through a sunlit campus" /><span className="image-note">A campus full of possibility <span>↗</span></span></div><div className="campus-copy"><div className="section-label"><span>03</span> LIFE AT NORTHSTAR</div><h2>Room to grow.<br /><em>Space to belong.</em></h2><p>Late-night studio sessions. Unexpected conversations. A table where someone always saves you a seat. The best parts of college are often the ones you never put on a schedule.</p><Link to="/campus" className="button button-outline">Take a look around <ArrowRight size={16} /></Link><div className="campus-quote"><span>“</span><p>I came for the program. I stayed because it felt like I could be the whole version of myself here.</p><small>RIYA, CLASS OF 2025</small></div></div></section>
    <section className="notice-section section"><div className="section-heading-row"><div><div className="section-label"><span>04</span> WHAT'S HAPPENING</div><h2>A campus with <em>a pulse.</em></h2></div><Link to="/news" className="text-link dark-link">All news & events <ArrowRight size={16} /></Link></div><div className="notice-grid">{seedNotices.slice(0, 2).map((notice, i) => <article className="notice-card" key={notice.title}><div className={`notice-art notice-art-${i + 1}`}><span>{i === 0 ? "A new<br/>chapter." : "Make<br/>some noise."}</span><span className="art-star">✳</span></div><div className="notice-meta"><span>{notice.tag}</span><span>{notice.date}</span></div><h3>{notice.title}</h3><Link to="/news" aria-label={`Read ${notice.title}`} className="notice-arrow"><ArrowUpRight size={18} /></Link></article>)}</div></section>
    <section className="cta-section"><div className="cta-doodle">✳</div><div className="eyebrow"><span className="eyebrow-star">✳</span> YOUR NEXT CHAPTER STARTS HERE</div><h2>Curiosity looks good<br /><em>on you.</em></h2><p>Come see what happens when you follow it.</p><Link to="/admissions" className="button button-navy">Let's get started <ArrowRight size={16} /></Link><span className="cta-note">Applications for Fall 2027 are open</span></section>
  </main>;
}

function CourseCard({ course, index }) {
  return <Link to="/courses" className={`program-card card-${course.color}`}><div className="program-card-top"><span className="program-icon">{course.icon}</span><span>0{index + 1}</span></div><span className="program-category">{course.category}</span><h3>{course.title}</h3><div className="program-card-bottom"><span>{course.degree}</span><ArrowUpRight size={18} /></div></Link>;
}

function PageHero({ eyebrow, title, highlight, text, image, variant = "" }) {
  return <section className={`page-hero ${variant}`}><div className="page-hero-copy"><div className="eyebrow"><span className="eyebrow-star">✳</span> {eyebrow}</div><h1>{title}<br /><em>{highlight}</em></h1><p>{text}</p></div>{image && <div className="page-hero-image"><img src={image} alt="" /><span className="page-hero-image-star">✳</span></div>}</section>;
}

function About() {
  return <main><PageHero eyebrow="A LITTLE ABOUT US" title="A university with" highlight="its eyes open." text="We’re a community of thinkers, makers, and people who have never been all that good at accepting “because that’s how it’s always been.”" image="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=85" /><section className="section about-story"><div className="section-label"><span>01</span> WHY WE'RE HERE</div><div className="about-story-grid"><h2>Education for a<br /><em>world still being made.</em></h2><div><p>Northstar College began with a simple belief: the most important things you learn don't fit neatly inside a single subject. Since opening our doors in 1986, we have built an education that brings people and ideas together.</p><p>Today, our students learn by doing, asking uncomfortable questions, and working alongside faculty who are curious enough to keep learning themselves.</p><Link to="/courses" className="text-link dark-link">Meet our programs <ArrowRight size={16} /></Link></div></div></section><section className="values-strip"><div><span>01 / STAY CURIOUS</span><h3>Questions are<br />a good beginning.</h3></div><div><span>02 / MAKE IT MATTER</span><h3>Learn something.<br />Do something with it.</h3></div><div><span>03 / MAKE ROOM</span><h3>Different minds.<br />Better ideas.</h3></div></section><section className="section"><div className="section-heading-row"><div><div className="section-label"><span>02</span> NORTHSTAR, BY THE NUMBERS</div><h2>Small enough to <em>know you.</em></h2></div></div><div className="stat-grid stat-grid-large"><div><strong>1986</strong><small>the year we opened our doors</small></div><div><strong>4,200<span>+</span></strong><small>students across seven schools</small></div><div><strong>62</strong><small>countries represented</small></div><div><strong>1</strong><small>community we’re still building</small></div></div></section></main>;
}

function Courses() {
  const [filter, setFilter] = useState("All programs");
  const categories = ["All programs", ...new Set(courses.map((course) => course.category))];
  const visible = filter === "All programs" ? courses : courses.filter((course) => course.category === filter);
  return <main><PageHero eyebrow="ACADEMICS AT NORTHSTAR" title="Follow the thing" highlight="that fascinates you." text="A great education doesn't hand you a map. It helps you learn how to read one. Start with a question; build your own path from there." image="https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=85" /><section className="section courses-list"><div className="section-heading-row"><div><div className="section-label"><span>01</span> OUR PROGRAMS</div><h2>Find your <em>starting point.</em></h2></div><span className="course-count">32 programs · 7 schools</span></div><div className="filter-row">{categories.map((category) => <button key={category} onClick={() => setFilter(category)} className={`filter-chip ${filter === category ? "selected" : ""}`}>{category}</button>)}</div><div className="program-grid all-programs">{visible.map((course, i) => <CourseCard key={course.title} course={course} index={i} />)}</div><div className="course-help"><Sparkles size={18} /><span>Still exploring? You don’t have to have it all figured out yet.</span><Link to="/contact">Talk to an advisor <ArrowRight size={15} /></Link></div></section></main>;
}

function FacultyDirectory() {
  const [query, setQuery] = useState("");
  const list = faculty.filter((person) => `${person.name} ${person.field} ${person.role}`.toLowerCase().includes(query.toLowerCase()));
  return <main><PageHero eyebrow="OUR FACULTY" title="Good teachers." highlight="Great conversations." text="The people who will challenge your assumptions, champion your ideas, and remember your name. Meet a few of the minds behind Northstar." image="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=1200&q=85" /><section className="section directory-section"><div className="section-heading-row"><div><div className="section-label"><span>01</span> PEOPLE WHO MAKE A DIFFERENCE</div><h2>Meet your <em>people.</em></h2></div><label className="search-field"><Search size={16} /><input placeholder="Search faculty" value={query} onChange={(e) => setQuery(e.target.value)} /><span className="sr-only">Search faculty</span></label></div><div className="faculty-grid">{list.map((person) => <article className="faculty-card" key={person.name}><div className={`faculty-avatar ${person.color}`}>{person.initials}</div><span className="faculty-field">{person.field}</span><h3>{person.name}</h3><p>{person.role}</p><a href="mailto:hello@northstar.edu" className="faculty-contact">Say hello <ArrowUpRight size={15} /></a></article>)}{list.length === 0 && <EmptyState title="No faculty found" text="Try a different name or department." />}</div></section></main>;
}

function Admissions({ data }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError("");
    const formElement = e.currentTarget;
    const form = new FormData(e.currentTarget);
    if (form.get("phone").replace(/\D/g, "").length < 7) { setError("Enter a valid phone number so our team can reach you."); return; }
    const application = {
      name: form.get("name"), course: form.get("course"),
      date: new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date()),
      status: "Under review",
    };
    setLoading(true);
    try {
      const response = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantName: form.get("name"), email: form.get("email"), phone: form.get("phone"),
          dateOfBirth: form.get("dob"), qualification: form.get("qualification"), grade: form.get("grade"),
          preferredCourse: form.get("course"), preferredDepartment: form.get("department"),
          address: form.get("address"),
        }),
      });
      if (!response.ok && !shouldUseDemo(response)) {
        const body = await response.json().catch(() => ({}));
        setError(body.message || "We couldn't submit your enquiry. Please try again.");
        setLoading(false); return;
      }
    } catch (requestError) {
      if (!(requestError instanceof TypeError)) {
        setError(requestError.message || "We couldn't submit your enquiry. Please try again.");
        setLoading(false); return;
      }
    }
    data.setApplications((prev) => [application, ...prev]);
    setSent(true); setLoading(false); formElement.reset();
  };
  return <main><PageHero eyebrow="YOUR NEXT CHAPTER" title="There's a place" highlight="for your kind of curious." text="A good application isn't about having all the answers. It's about showing us what you can't stop asking." image="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85" /><section className="section admissions-body"><div className="admissions-intro"><div className="section-label"><span>01</span> COME AS YOU ARE</div><h2>Start with <em>hello.</em></h2><p>Tell us a little about yourself and what you’re interested in. Our admissions team will be in touch with the next steps.</p><div className="admissions-note"><span>✳</span><div><strong>Fall 2027 applications are open</strong><small>Priority deadline: January 15, 2027</small></div></div><div className="admissions-steps">{["Share a little about yourself", "Explore a program that feels right", "We’ll help with everything else"].map((item, i) => <div key={item}><span>0{i + 1}</span>{item}</div>)}</div></div><div className="form-card"><div className="form-card-head"><span>ADMISSION APPLICATION</span><span>FALL 2027 INTAKE</span></div>{sent ? <SuccessPanel title="You’re on your way." text="Thanks for reaching out. Our admissions team will be in touch soon with information about your next steps." onReset={() => setSent(false)} /> : <form onSubmit={submit} className="form-stack"><label>Applicant name<input name="name" placeholder="Your full name" required minLength="2" autoComplete="name" /></label><div className="form-row"><label>Email address<input name="email" type="email" placeholder="you@example.com" required autoComplete="email" /></label><label>Phone number<input name="phone" type="tel" placeholder="+91 98765 43210" required autoComplete="tel" /></label></div><div className="form-row"><label>Date of birth<input name="dob" type="date" required /></label><label>Previous qualification<select name="qualification" required defaultValue=""><option value="" disabled>Choose qualification</option><option>Higher Secondary / Class 12</option><option>Diploma</option><option>International equivalent</option><option>Other</option></select></label></div><div className="form-row"><label>Previous grade or percentage<input name="grade" placeholder="e.g. 88% or A grade" required /></label><label>Preferred course<select name="course" required defaultValue=""><option value="" disabled>Choose a program</option>{courses.map((course) => <option key={course.title}>{course.title}</option>)}</select></label></div><label>Preferred department<select name="department" required defaultValue=""><option value="" disabled>Choose a department</option>{courses.map((course) => <option key={course.title}>{course.category}</option>)}</select></label><label>Address<textarea name="address" rows="2" placeholder="Your current address" required /></label><label>Supporting documents <span className="optional">(optional · demo only, PDF or image)</span><input className="file-input" type="file" accept="application/pdf,image/png,image/jpeg" /></label><label className="check-label"><input type="checkbox" required /> <span>I'd like to hear from Northstar about my application.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<button disabled={loading} className="button button-navy form-submit">{loading ? "Submitting your application…" : "Submit application"} <ArrowRight size={16} /></button><small className="form-footnote">Your details are only used by our admissions team.</small></form>}</div></section><section className="faq-callout"><span>NEED A HAND?</span><p>Big question or little question, we’re here for both.</p><Link to="/contact">Talk to admissions <ArrowUpRight size={15} /></Link></section></main>;
}

function Campus() {
  return <main><PageHero eyebrow="LIFE AT NORTHSTAR" title="More than a" highlight="place to study." text="A campus is made of buildings. A community is made of everything that happens between them." image="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=85" /><section className="section campus-life-section"><div className="section-heading-row"><div><div className="section-label"><span>01</span> YOUR HOME BASE</div><h2>Find your <em>corner of it.</em></h2></div></div><div className="life-grid"><article className="life-card life-large"><img src="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1000&q=85" alt="Students collaborating in a bright university space" /><div><span>MAKE SOMETHING TOGETHER</span><h3>Clubs, projects,<br />and happy accidents.</h3></div></article><article className="life-card life-small"><img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85" alt="A green open space" /><div><span>ROOM TO EXHALE</span><h3>Green spaces<br />and open minds.</h3></div></article><article className="life-card life-small"><img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85" alt="Students sharing ideas around a table" /><div><span>ALWAYS A SEAT</span><h3>Community,<br />in every sense.</h3></div></article></div></section><section className="values-strip"><div><span>01 / LEARN WELL</span><h3>Studios, labs, and<br />space to try.</h3></div><div><span>02 / LIVE FULLY</span><h3>More than 60 clubs.<br />Pick your adventure.</h3></div><div><span>03 / FEEL AT HOME</span><h3>One campus.<br />A thousand ways in.</h3></div></section></main>;
}

function News({ notices }) {
  const [query, setQuery] = useState("");
  const allNotices = useMemo(() => [...notices.map((n) => ({ ...n, kind: "NOTICE" })), ...events.map((event) => ({ title: event.title, tag: event.type, date: `${event.month} ${event.day}, 2026`, text: event.detail, kind: "EVENT" }))], [notices]);
  const filtered = allNotices.filter((item) => `${item.title} ${item.tag} ${item.text}`.toLowerCase().includes(query.toLowerCase()));
  return <main><PageHero eyebrow="LIFE IN THE LOOP" title="Good things" highlight="are happening." text="The ideas, people, and moments making Northstar feel like Northstar. Pull up a chair." image="https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=85" /><section className="section news-list"><div className="section-heading-row"><div><div className="section-label"><span>01</span> THE LATEST</div><h2>Worth <em>knowing.</em></h2></div><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stories" /><span className="sr-only">Search stories</span></label></div><div className="news-items">{filtered.map((item, index) => <article className="news-item" key={`${item.title}-${index}`}><div className="news-item-number">0{index + 1}</div><div className="news-item-info"><span>{item.kind} · {item.tag}</span><h3>{item.title}</h3><p>{item.text}</p></div><div className="news-item-date">{item.date}<ArrowUpRight size={17} /></div></article>)}{filtered.length === 0 && <EmptyState title="Nothing here just yet" text="Try a different search." />}</div></section></main>;
}

function Contact() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const phone = form.get("phone");
    if (phone && String(phone).replace(/\D/g, "").length < 7) { setError("Please enter a valid phone number."); return; }
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), email: form.get("email"), subject: form.get("subject"),
          message: form.get("message"), rating: form.get("rating") ? Number(form.get("rating")) : undefined,
        }),
      });
      if (!response.ok && !shouldUseDemo(response)) {
        const body = await response.json().catch(() => ({}));
        setError(body.message || "We couldn't send your message. Please try again.");
        setLoading(false); return;
      }
    } catch (requestError) {
      if (!(requestError instanceof TypeError)) {
        setError(requestError.message || "We couldn't send your message. Please try again.");
        setLoading(false); return;
      }
    }
    setSent(true); setLoading(false); formElement.reset();
  };
  return <main><PageHero eyebrow="WE'D LOVE TO HEAR FROM YOU" title="A question, an idea," highlight="or just hello." text="The best conversations often start with a question. Tell us what’s on your mind and we’ll point you in the right direction." image="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=85" /><section className="section contact-layout"><div className="contact-details"><div className="section-label"><span>01</span> FIND YOUR WAY TO US</div><h2>People, not<br /><em>phone trees.</em></h2><p>Not sure who to ask? Start here. We’ll make sure your message finds the right person.</p><div className="contact-detail"><span>GENERAL QUESTIONS</span><a href="mailto:hello@northstar.edu">hello@northstar.edu</a></div><div className="contact-detail"><span>ADMISSIONS</span><a href="mailto:admissions@northstar.edu">admissions@northstar.edu</a></div><div className="contact-detail"><span>COME VISIT</span><p>48 University Avenue<br />Bengaluru, Karnataka 560001</p></div><div className="contact-hours">MON – FRI <span>9:00 AM – 5:00 PM IST</span></div></div><div className="form-card"><div className="form-card-head"><span>SEND US A NOTE</span><span>WE USUALLY REPLY IN 2 DAYS</span></div>{sent ? <SuccessPanel title="Message received." text="Thanks for reaching out. A real person from our team will be in touch soon." onReset={() => setSent(false)} /> : <form onSubmit={submit} className="form-stack"><div className="form-row"><label>Your name<input name="name" required placeholder="Your name" minLength="2" /></label><label>Email address<input type="email" name="email" required placeholder="you@example.com" /></label></div><label>Phone number <span className="optional">(optional)</span><input type="tel" name="phone" placeholder="+91 98765 43210" /></label><label>What’s this about?<select name="subject" defaultValue="General question"><option>General question</option><option>Admissions</option><option>Programs & academics</option><option>Campus visit</option><option>Something else</option></select></label><label>Your message<textarea name="message" rows="4" required minLength="10" placeholder="Tell us a little more…" /></label><div className="rating-row"><span>How was your experience? <span className="optional">(optional)</span></span><div className="rating-options">{[1, 2, 3, 4, 5].map((n) => <label key={n}><input type="radio" name="rating" value={n} /><span aria-label={`${n} out of 5`}>★</span></label>)}</div></div>{error && <p className="form-error" role="alert">{error}</p>}<button disabled={loading} className="button button-navy form-submit">{loading ? "Sending your message…" : "Send your message"} <ArrowRight size={16} /></button></form>}</div></section></main>;
}

function FAQ() {
  const questions = [
    ["When is the application deadline?", "Applications for Fall 2027 are open now. Our priority deadline is January 15, 2027. We review applications on a rolling basis after that date, as space allows."],
    ["Do I need to know my major before I apply?", "Not at all. Many Northstar students arrive with more questions than answers. You can explore across schools and work with an advisor to find what fits."],
    ["Can I visit the campus?", "Absolutely. Join one of our weekly campus tours or open campus afternoons. Use the contact form and our admissions team will help you find a date."],
    ["What financial aid is available?", "Northstar offers need-based grants, merit scholarships, and flexible payment plans. After applying, your admissions counselor can walk you through the options."],
    ["How do I access the student portal?", "Choose Student sign in from the sign-in page. Demo mode accepts any email and password. Live portal access is provided to enrolled students."],
    ["Is Northstar College a real institution?", "No. Northstar College is a fictional institution created as demonstration content for this website project. Sample statistics and people are illustrative only."],
  ];
  const [active, setActive] = useState(0);
  return <main><PageHero eyebrow="GOOD QUESTIONS" title="A few things you" highlight="might be wondering." text="And if the thing you’re wondering about isn’t here, we’re only a message away." image="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85" /><section className="section faq-section"><div className="faq-intro"><div className="section-label"><span>01</span> THE PRACTICAL STUFF</div><h2>Questions come<br /><em>with the territory.</em></h2><p>Here are a few answers to get you going.</p><Link to="/contact" className="text-link dark-link">Ask us something else <ArrowRight size={15} /></Link></div><div className="faq-list">{questions.map(([question, answer], i) => <article className={`faq-item ${active === i ? "faq-active" : ""}`} key={question}><button onClick={() => setActive(active === i ? -1 : i)} aria-expanded={active === i}><span><small>0{i + 1}</small>{question}</span><span className="faq-toggle">{active === i ? "−" : "+"}</span></button>{active === i && <p>{answer}</p>}</article>)}</div></section><div className="faq-callout"><span>STILL CURIOUS?</span><p>That’s kind of our thing, too.</p><Link to="/contact">Talk to us <ArrowUpRight size={15} /></Link></div></main>;
}

function Login({ onLogin }) {
  const { role = "student" } = useLocation().pathname.match(/\/login\/(?<role>[^/]+)/)?.groups || {};
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const roles = [
    { id: "student", title: "Student", icon: GraduationCap },
    { id: "faculty", title: "Faculty", icon: BookOpen },
    { id: "admin", title: "Administrator", icon: ShieldCheck },
  ];
  const selectedRole = roles.find((item) => item.id === role) || roles[0];
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const name = email.split("@")[0].split(/[._-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Alex Morgan";
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: form.get("password"), role }) });
      if (response.ok) {
        const result = await response.json(); onLogin({ ...result.user, token: result.token }); navigate("/dashboard"); return;
      }
      if (!shouldUseDemo(response)) {
        const body = await response.json().catch(() => ({})); throw new Error(body.message || "We couldn't sign you in with those details.");
      }
    } catch (requestError) {
      if (requestError instanceof TypeError) { /* API unavailable: use clearly labeled local demo mode. */ }
      else if (requestError.message !== "Failed to fetch") { setError(requestError.message); setLoading(false); return; }
    }
    onLogin({ name: name || (role === "admin" ? "College Admin" : "Alex Morgan"), email, role, demo: true });
    setLoading(false); navigate("/dashboard");
  };
  return <main className="auth-page"><div className="auth-aside"><div className="auth-aside-art"><span>✳</span><p>There's more than one way to find your way.</p></div><div className="auth-aside-bottom"><Link to="/" className="brand brand-footer"><span className="brand-mark"><span>✳</span></span><span className="brand-name">northstar<span>COLLEGE</span></span></Link><span>Made for curious minds. Est. 1986.</span></div></div><div className="auth-main"><div className="auth-card"><div className="auth-back"><Link to="/">← Back to Northstar</Link></div><div className="eyebrow"><span className="eyebrow-star">✳</span> GOOD TO HAVE YOU HERE</div><h1>Come on <em>in.</em></h1><p className="auth-subtitle">A little closer to what you’re here to do.</p><div className="role-tabs">{roles.map(({ id, title, icon: Icon }) => <Link className={role === id ? "role-tab selected" : "role-tab"} to={`/login/${id}`} key={id}><Icon size={16} />{title}</Link>)}</div><form className="form-stack" onSubmit={submit}><label>{role === "student" ? "Email address or student ID" : role === "faculty" ? "Email address or faculty ID" : "Administrator email"}<input name="email" type={role === "admin" ? "email" : "text"} autoComplete="username" placeholder={role === "student" ? "you@northstar.edu or NS202700001" : role === "faculty" ? "you@northstar.edu or FAC0001" : "admin@northstar.edu"} required /></label><label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Your password" required minLength="4" /></label><div className="auth-options"><label className="check-label"><input type="checkbox" /> <span>Remember me</span></label><Link to="/contact">Forgot password?</Link></div>{error && <p className="form-error" role="alert">{error}</p>}<button disabled={loading} className="button button-navy form-submit">{loading ? "Signing you in…" : `Sign in as ${selectedRole.title}`} <ArrowRight size={16} /></button></form><div className="demo-hint"><Sparkles size={15} /><span><strong>Just exploring?</strong> Demo mode is on. Use any email and password.</span></div>{role === "student" && <div className="auth-register">New to Northstar? <Link to="/register">Create a student account <ArrowRight size={14} /></Link></div>}</div><div className="auth-help">Need a hand? <Link to="/contact">Contact support</Link></div></div></main>;
}

function Register({ data, onLogin }) {
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError("");
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setError("Those passwords don't match. Give it another try."); return; }
    if (String(form.get("password")).length < 8) { setError("Choose a password with at least 8 characters."); return; }
    const email = String(form.get("email"));
    const name = String(form.get("name"));
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, password: form.get("password"), role: "student",
          department: form.get("department"), year: form.get("year"),
          phone: form.get("phone"), dateOfBirth: form.get("dob"), address: form.get("address"),
        }),
      });
      if (response.ok) {
        const result = await response.json();
        onLogin({ ...result.user, token: result.token });
        setSent(true); setLoading(false); return;
      }
      if (!shouldUseDemo(response)) {
        const body = await response.json().catch(() => ({}));
        setError(body.message || "We couldn't create your account. Please try again.");
        setLoading(false); return;
      }
    } catch (requestError) {
      if (!(requestError instanceof TypeError)) {
        setError(requestError.message || "We couldn't create your account. Please try again.");
        setLoading(false); return;
      }
    }
    const student = { name, email, id: `NS2027${String(data.students.length + 1).padStart(3, "0")}`, department: form.get("department"), year: form.get("year"), status: "Active" };
    data.setStudents((prev) => [student, ...prev]);
    onLogin({ name, email, role: "student", demo: true });
    setSent(true); setLoading(false);
  };
  if (sent) return <main className="auth-page"><div className="auth-main auth-main-full"><div className="auth-card"><SuccessPanel title="Welcome to Northstar." text="Your demo student profile is ready. Head to your dashboard to explore." onReset={() => navigate("/dashboard")} resetLabel="Go to my dashboard" /></div></div></main>;
  return <main className="auth-page"><div className="auth-aside"><div className="auth-aside-art"><span>✳</span><p>New questions. New people. A whole new direction.</p></div><div className="auth-aside-bottom"><Link to="/" className="brand brand-footer"><span className="brand-mark"><span>✳</span></span><span className="brand-name">northstar<span>COLLEGE</span></span></Link><span>Made for curious minds. Est. 1986.</span></div></div><div className="auth-main"><div className="auth-card"><div className="auth-back"><Link to="/login/student">← Already have an account?</Link></div><div className="eyebrow"><span className="eyebrow-star">✳</span> YOUR NORTHSTAR STARTS HERE</div><h1>Make it <em>official.</em></h1><p className="auth-subtitle">Create a student account to explore the portal.</p><form className="form-stack register-form" onSubmit={submit}><label>Full name<input name="name" required minLength="2" placeholder="Your full name" /></label><div className="form-row"><label>Email address<input name="email" type="email" required placeholder="you@example.com" /></label><label>Date of birth<input name="dob" type="date" required /></label></div><div className="form-row"><label>Phone number<input name="phone" type="tel" required placeholder="+91 98765 43210" /></label><label>Department<select name="department" required defaultValue=""><option value="" disabled>Choose a department</option>{courses.map((course) => <option key={course.title}>{course.title}</option>)}</select></label></div><div className="form-row"><label>Academic year<select name="year" required defaultValue=""><option value="" disabled>Select year</option>{[1, 2, 3, 4].map((n) => <option key={n}>Year {n}</option>)}</select></label><label>Gender <span className="optional">(optional)</span><select name="gender" defaultValue=""><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Self-describe</option></select></label></div><label>Address<textarea rows="2" name="address" placeholder="Your current address" required /></label><label>Profile photo <span className="optional">(optional · demo only)</span><input className="file-input" type="file" accept="image/png,image/jpeg,image/webp" /></label><div className="form-row"><label>Password<input name="password" type="password" minLength="8" required placeholder="At least 8 characters" /></label><label>Confirm password<input name="confirm" type="password" minLength="8" required placeholder="Type it again" /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<button disabled={loading} className="button button-navy form-submit">{loading ? "Creating your account…" : "Create my account"} <ArrowRight size={16} /></button><small className="form-footnote">Demo profiles are saved in this browser only.</small></form></div><div className="auth-help">Questions before you sign up? <Link to="/contact">Talk to us</Link></div></div></main>;
}

function Dashboard({ session, data, logout }) {
  const navigate = useNavigate();
  const [active, setActive] = useState("Overview");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => { if (!session) navigate("/login/student"); }, [session, navigate]);
  if (!session) return null;
  const role = session.role || "student";
  const menu = role === "admin" ? ["Overview", "Students", "Faculty", "Admissions", "Leave requests", "Notices", "Analytics"] : role === "faculty" ? ["Overview", "My classes", "Attendance", "Assignments", "Notices"] : ["Overview", "My courses", "Attendance", "Assignments", "Results", "Leave requests"];
  const filteredStudents = data.students.filter((student) => `${student.name} ${student.id} ${student.department}`.toLowerCase().includes(search.toLowerCase()));
  const markApplication = async (index, status) => {
    const application = data.applications[index];
    if (session.token && application?.databaseId) {
      try {
        const response = await fetch(`/api/admissions/${application.databaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ status: status === "Accepted" ? "accepted" : "rejected" }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "The application status could not be updated.");
      } catch (requestError) { setFeedback(requestError.message); return; }
    }
    data.setApplications((prev) => prev.map((item, i) => i === index ? { ...item, status } : item));
  };
  const markLeave = async (index, status) => {
    const request = data.leaveRequests[index];
    if (session.token && request?.databaseId) {
      try {
        const response = await fetch(`/api/leave/${request.databaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ status: status === "Approved" ? "approved" : "rejected" }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "The leave request could not be updated.");
      } catch (requestError) { setFeedback(requestError.message); return; }
    }
    data.setLeaveRequests((previous) => previous.map((item, i) => i === index ? { ...item, status } : item));
  };
  const handleNotice = (e) => { e.preventDefault(); if (!noticeDraft.trim()) return; data.setNotices((prev) => [{ title: noticeDraft.trim(), tag: "CAMPUS UPDATE", date: "Just now", text: "A new update from the Northstar community." }, ...prev]); setNoticeDraft(""); setFeedback("Your announcement is live."); };
  const addUser = async (userRole) => {
    const name = window.prompt(`${userRole === "student" ? "Student" : "Faculty"} full name`);
    if (!name?.trim()) return;
    const email = window.prompt(`${userRole === "student" ? "Student" : "Faculty"} email address`);
    if (!email?.trim()) return;
    const department = window.prompt("Department", "Computer Science") || "Undeclared";
    const year = userRole === "student" ? window.prompt("Academic year", "Year 1") || "Year 1" : undefined;
    const employeeId = userRole === "faculty" ? window.prompt("Faculty ID (e.g. FAC0007)") : undefined;
    if (userRole === "faculty" && !employeeId?.trim()) return;
    const password = window.prompt("Set an initial password (at least 8 characters)");
    if (!password) return;
    const localId = userRole === "student" ? `NS2027${String(data.students.length + 1).padStart(5, "0")}` : employeeId.toUpperCase();
    if (!session.token) {
      const localUser = { name: name.trim(), email: email.trim(), id: localId, employeeId, department, field: department, year: year || "—", status: "Active" };
      if (userRole === "student") data.setStudents((prev) => [localUser, ...prev]);
      else data.setFacultyMembers((prev) => [localUser, ...prev]);
      setFeedback(`${userRole === "student" ? "Student" : "Faculty"} record added to this demo workspace.`);
      return;
    }
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role: userRole, department, year, employeeId, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "The user record could not be created.");
      const newUser = normalizeApiUser(body);
      if (userRole === "student") data.setStudents((prev) => [newUser, ...prev]);
      else data.setFacultyMembers((prev) => [newUser, ...prev]);
      setFeedback(`${userRole === "student" ? "Student" : "Faculty"} record created.`);
    } catch (requestError) { setFeedback(requestError.message); }
  };
  const addStudent = () => addUser("student");
  const addFaculty = () => addUser("faculty");
  const removeUser = async (user, userRole) => {
    if (!window.confirm(`Remove ${user.name} from this directory?`)) return;
    if (session.token && user.databaseId) {
      try {
        const response = await fetch(`/api/users/${user.databaseId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "The user record could not be removed.");
        }
      } catch (requestError) { setFeedback(requestError.message); return; }
    }
    if (userRole === "student") data.setStudents((prev) => prev.filter((item) => item.id !== user.id));
    else data.setFacultyMembers((prev) => prev.filter((item) => item.id !== user.id));
    setFeedback(`${user.name} was removed from the demo directory.`);
  };
  const removeStudent = (student) => removeUser(student, "student");
  const removeFaculty = (person) => removeUser(person, "faculty");
  const editStudent = async (student) => {
    const name = window.prompt("Student's full name", student.name);
    if (!name?.trim()) return;
    const department = window.prompt("Department", student.department) || student.department;
    const year = window.prompt("Academic year", student.year) || student.year;
    if (session.token && student.databaseId) {
      try {
        const response = await fetch(`/api/users/${student.databaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ name: name.trim(), department, year }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "The student record could not be updated.");
      } catch (requestError) { setFeedback(requestError.message); return; }
    }
    data.setStudents((prev) => prev.map((item) => item.id === student.id ? { ...item, name: name.trim(), department, year } : item));
    setFeedback(`${name.trim()}'s record was updated.`);
  };
  const roleName = role === "admin" ? "Administrator" : role === "faculty" ? "Faculty" : "Student";
  return <main className="dashboard-page"><aside className="dash-sidebar"><Link to="/" className="brand dash-brand"><span className="brand-mark"><span>✳</span></span><span className="brand-name">northstar<span>COLLEGE</span></span></Link><div className="dash-context"><span>YOUR WORKSPACE</span><strong>{roleName} portal <ChevronDown size={14} /></strong></div><div className="dash-nav">{menu.map((item, i) => <button className={active === item ? "dash-nav-item selected" : "dash-nav-item"} key={item} onClick={() => setActive(item)}>{[LayoutDashboard, Users, CalendarDays, ClipboardCheck, Bell, Compass][i % 6] && (() => { const Icon = [LayoutDashboard, Users, CalendarDays, ClipboardCheck, Bell, Compass][i % 6]; return <Icon size={17} />; })()}<span>{item}</span>{item === "Notices" && role === "admin" && <span className="nav-badge">{data.notices.length}</span>}</button>)}</div><div className="dash-sidebar-bottom"><div className="help-card"><CircleHelp size={17} /><strong>Need a hand?</strong><span>We’re here to help you find your way.</span><Link to="/contact">Get support <ArrowRight size={13} /></Link></div><button className="dash-user" onClick={() => navigate("/profile")}><span className="mini-avatar">{session.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span><span><strong>{session.name}</strong><small>{roleName}</small></span><Settings size={16} /></button></div></aside>
    <div className="dash-main"><header className="dash-topbar"><div className="dash-breadcrumb">Northstar <ChevronRight size={14} /> <span>{active}</span></div><div className="dash-top-actions"><span className="demo-pill"><span></span> {session.token ? "API CONNECTED" : "DEMO MODE"}</span><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i></i></button><button className="dash-logout" onClick={() => { logout(); navigate("/"); }}><LogOut size={16} /> Sign out</button></div></header><div className="dash-content"><div className="dash-greeting"><div><span className="eyebrow"><span className="eyebrow-star">✳</span> WEDNESDAY, OCTOBER 29</span><h1>{role === "admin" ? "Good morning," : role === "faculty" ? "Welcome back," : "You're right where"} <em>{role === "student" ? "you need to be." : `${session.name.split(" ")[0]}.`}</em></h1><p>{role === "admin" ? "A good day to make the campus run a little smoother." : role === "faculty" ? "Your classes, your students, your Northstar." : "A new day to follow something interesting."}</p></div><Link className="button button-navy" to="/profile"><Settings size={15} /> Account settings</Link></div>
      {(session.demo || session.token) && <div className="demo-banner"><Sparkles size={17} /><span>{session.demo ? <><strong>This is your demo workspace.</strong> Changes you make are saved in this browser only. Connect the API and database for shared records.</> : <><strong>Your account is connected to the API.</strong> Student and faculty directory changes are persistent; other dashboard metrics and schedules remain illustrative sample data.</>}</span><button aria-label="Dismiss workspace notice" onClick={(e) => e.currentTarget.parentElement.remove()}><X size={15} /></button></div>}
      {role === "admin" ? <AdminDashboard active={active} data={data} session={session} filteredStudents={filteredStudents} search={search} setSearch={setSearch} addStudent={addStudent} addFaculty={addFaculty} removeStudent={removeStudent} removeFaculty={removeFaculty} editStudent={editStudent} markApplication={markApplication} markLeave={markLeave} noticeDraft={noticeDraft} setNoticeDraft={setNoticeDraft} handleNotice={handleNotice} feedback={feedback} setFeedback={setFeedback} /> : role === "faculty" ? <FacultyDashboard active={active} feedback={feedback} setFeedback={setFeedback} /> : <StudentDashboard active={active} session={session} data={data} feedback={feedback} setFeedback={setFeedback} />}
    </div></div></main>;
}

function AdminDashboard({ active, data, session, filteredStudents, search, setSearch, addStudent, addFaculty, removeStudent, removeFaculty, editStudent, markApplication, markLeave, noticeDraft, setNoticeDraft, handleNotice, feedback, setFeedback }) {
  useEffect(() => {
    if (!session.token) return undefined;
    let activeRequest = true;
    const loadDirectory = async () => {
      try {
        const [studentResponse, facultyResponse, admissionResponse, leaveResponse] = await Promise.all([
          fetch("/api/users?role=student", { headers: { Authorization: `Bearer ${session.token}` } }),
          fetch("/api/users?role=faculty", { headers: { Authorization: `Bearer ${session.token}` } }),
          fetch("/api/admissions", { headers: { Authorization: `Bearer ${session.token}` } }),
          fetch("/api/leave", { headers: { Authorization: `Bearer ${session.token}` } }),
        ]);
        if (!studentResponse.ok || !facultyResponse.ok || !admissionResponse.ok || !leaveResponse.ok) throw new Error("The college directory or applications could not be loaded.");
        const [studentUsers, facultyUsers, admissionRows, leaveRows] = await Promise.all([studentResponse.json(), facultyResponse.json(), admissionResponse.json(), leaveResponse.json()]);
        if (activeRequest) {
          data.setStudents(studentUsers.map(normalizeApiUser));
          data.setFacultyMembers(facultyUsers.map(normalizeApiUser));
          data.setApplications(admissionRows.map((application) => ({
            databaseId: application.id,
            name: application.applicant_name,
            course: application.preferred_course,
            date: new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(application.created_at)),
            status: application.status === "accepted" ? "Accepted" : application.status === "rejected" ? "Declined" : "Under review",
          })));
          data.setLeaveRequests(leaveRows.map((leave) => ({
            databaseId: leave.id, name: leave.student_name,
            from: leave.start_date, to: leave.end_date, reason: leave.reason,
            status: leave.status === "approved" ? "Approved" : leave.status === "rejected" ? "Rejected" : "Pending",
          })));
        }
      } catch (requestError) {
        if (activeRequest) setFeedback(requestError.message);
      }
    };
    loadDirectory();
    return () => { activeRequest = false; };
  }, [session.token, data.setStudents, data.setFacultyMembers, data.setApplications, data.setLeaveRequests, setFeedback]);
  const facultyRows = data.facultyMembers.filter((person) => `${person.name} ${person.field} ${person.id}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="metric-grid"><Metric label="Enrolled students" value={data.students.length.toLocaleString()} change="Across all programs" icon={Users} tint="lavender" /><Metric label="Faculty members" value={data.facultyMembers.length.toLocaleString()} change="Active faculty" icon={GraduationCap} tint="mint" /><Metric label="Academic programs" value="32" change="Across 7 schools" icon={BookOpen} tint="peach" /><Metric label="Applications to review" value={data.applications.filter((a) => a.status === "Under review" || a.status === "under_review").length} change="Fall 2027 intake" icon={ClipboardCheck} tint="yellow" /></div>
    {active === "Overview" && <div className="dash-two-col"><section className="dash-panel"><PanelHeader title="Recent admissions" link="View all" onClick={() => {}} /><div className="application-list">{data.applications.slice(0, 4).map((app, index) => <div className="application-row" key={`${app.name}-${index}`}><span className="mini-avatar avatar-tone">{app.name.split(" ").map((x) => x[0]).join("")}</span><div><strong>{app.name}</strong><small>{app.course} · {app.date}</small></div><span className={`status-tag ${app.status === "Accepted" ? "status-approved" : app.status === "Declined" ? "status-declined" : ""}`}>{app.status}</span><div className="row-actions">{app.status === "Under review" && <><button title="Approve application" onClick={() => markApplication(index, "Accepted")}><Check size={15} /></button><button title="Reject application" onClick={() => markApplication(index, "Declined")}><X size={15} /></button></>}</div></div>)}</div></section><section className="dash-panel"><PanelHeader title="Quick actions" /><div className="quick-actions"><button onClick={addStudent}><span className="quick-icon tint-lavender"><Users size={18} /></span><span><strong>Add a student</strong><small>Create a student record</small></span><ArrowRight size={15} /></button><button onClick={() => document.getElementById("notice-input")?.focus()}><span className="quick-icon tint-mint"><Bell size={18} /></span><span><strong>Publish a notice</strong><small>Share with the community</small></span><ArrowRight size={15} /></button><button onClick={() => window.alert("Report preview: " + data.students.length + " demo student records.")}><span className="quick-icon tint-peach"><ArrowDown size={18} /></span><span><strong>Download report</strong><small>Export a demo summary</small></span><ArrowRight size={15} /></button></div></section></div>}
    {(active === "Students" || active === "Overview") && <section className="dash-panel table-panel"><PanelHeader title={active === "Overview" ? "Student directory" : "Manage students"} link={<button className="button button-small button-navy" onClick={addStudent}>+ Add student</button>} /><div className="table-toolbar"><label className="search-field"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" /><span className="sr-only">Search students</span></label><span>{filteredStudents.length} students</span></div><StudentTable students={filteredStudents} onDelete={removeStudent} onEdit={editStudent} /></section>}
    {active === "Faculty" && <section className="dash-panel table-panel"><PanelHeader title="Faculty directory" link={<button className="button button-small button-navy" onClick={addFaculty}>+ Add faculty</button>} /><div className="table-toolbar"><label className="search-field"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search faculty" /><span className="sr-only">Search faculty</span></label><span>{facultyRows.length} faculty</span></div><div className="table-scroll"><table><thead><tr><th>FACULTY MEMBER</th><th>FACULTY ID</th><th>DEPARTMENT</th><th>STATUS</th><th></th></tr></thead><tbody>{facultyRows.map((person) => <tr key={person.id}><td><div className="table-person"><span className="mini-avatar">{person.initials || person.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td><td>{person.employeeId || person.id}</td><td>{person.field || person.department}</td><td><span className={`status-tag ${person.status === "Inactive" ? "status-declined" : "status-approved"}`}>{person.status || "Active"}</span></td><td><button className="delete-row" onClick={() => removeFaculty(person)} aria-label={`Delete ${person.name}`}><X size={15} /></button></td></tr>)}</tbody></table></div></section>}
    {active === "Admissions" && <section className="dash-panel table-panel"><PanelHeader title="Admission applications" /><div className="table-scroll"><table><thead><tr><th>APPLICANT</th><th>PROGRAM</th><th>SUBMITTED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data.applications.map((app, i) => <tr key={`${app.name}-${i}`}><td><strong>{app.name}</strong></td><td>{app.course}</td><td>{app.date}</td><td><span className={`status-tag ${app.status === "Accepted" ? "status-approved" : app.status === "Declined" ? "status-declined" : ""}`}>{app.status}</span></td><td>{app.status === "Under review" && <div className="row-actions"><button onClick={() => markApplication(i, "Accepted")} aria-label="Approve"><Check size={15} /></button><button onClick={() => markApplication(i, "Declined")} aria-label="Reject"><X size={15} /></button></div>}</td></tr>)}</tbody></table></div>{data.applications.length === 0 && <EmptyState title="No applications yet" text="New admission applications will appear here." />}</section>}
    {active === "Leave requests" && <section className="dash-panel table-panel"><PanelHeader title="Student leave requests" /><div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>DATES</th><th>REASON</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data.leaveRequests.map((request, i) => <tr key={`${request.name}-${request.from}-${i}`}><td><strong>{request.name}</strong></td><td>{request.from} – {request.to}</td><td>{request.reason}</td><td><span className={`status-tag ${request.status === "Approved" ? "status-approved" : request.status === "Rejected" ? "status-declined" : ""}`}>{request.status}</span></td><td>{request.status === "Pending" && <div className="row-actions"><button onClick={() => markLeave(i, "Approved")} aria-label="Approve leave"><Check size={15} /></button><button onClick={() => markLeave(i, "Rejected")} aria-label="Reject leave"><X size={15} /></button></div>}</td></tr>)}</tbody></table></div>{data.leaveRequests.length === 0 && <EmptyState title="No leave requests" text="Student requests will appear here for review." />}</section>}
    {active === "Notices" && <section className="dash-panel notice-manager"><PanelHeader title="Community notices" /><form onSubmit={handleNotice} className="notice-publish"><label htmlFor="notice-input">Publish an announcement</label><div><input id="notice-input" value={noticeDraft} onChange={(e) => setNoticeDraft(e.target.value)} placeholder="What's happening at Northstar?" required /><button className="button button-navy">Publish <ArrowRight size={15} /></button></div></form>{feedback && <p className="success-inline"><Check size={15} /> {feedback}</p>}<div className="managed-notices">{data.notices.map((notice, i) => <div key={`${notice.title}-${i}`}><span className="notice-tag">{notice.tag}</span><strong>{notice.title}</strong><small>{notice.date}</small><button aria-label={`Delete ${notice.title}`} onClick={() => { if (window.confirm("Remove this notice from the demo site?")) data.setNotices((prev) => prev.filter((_, n) => n !== i)); }}><X size={15} /></button></div>)}</div></section>}
    {(active === "Analytics" || active === "My classes" || active === "Attendance" || active === "Assignments" || active === "My courses" || active === "Results") && <section className="dash-panel"><PanelHeader title={active === "Analytics" ? "Campus snapshot" : active} /><div className="analytics-row"><div><span>STUDENT ATTENDANCE</span><strong>92.4%</strong><small>↑ 2.1% from last month</small><div className="progress"><span style={{ width: "92%" }} /></div></div><div><span>APPLICATIONS THIS TERM</span><strong>{data.applications.length + 284}</strong><small>Across all programs</small><div className="progress progress-gold"><span style={{ width: "68%" }} /></div></div><div><span>STUDENT SATISFACTION</span><strong>4.8 / 5</strong><small>From this semester’s survey</small><div className="progress progress-green"><span style={{ width: "96%" }} /></div></div></div></section>}
  </>;
}

function Metric({ label, value, change, icon: Icon, tint }) {
  return <article className="metric-card"><div className={`metric-icon tint-${tint}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small><span className="metric-change">↗</span> {change}</small></article>;
}
function PanelHeader({ title, link, onClick }) { return <div className="panel-header"><h2>{title}</h2>{link && (typeof link === "string" ? <button className="panel-link" onClick={onClick}>{link} <ArrowRight size={14} /></button> : link)}</div>; }
function StudentTable({ students, onDelete, onEdit }) {
  return students.length === 0 ? <EmptyState title="No students found" text="Try another search or add a new student." /> : <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>DEPARTMENT</th><th>YEAR</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><div className="table-person"><span className="mini-avatar">{student.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span><span><strong>{student.name}</strong><small>{student.email}</small></span></div></td><td>{student.id}</td><td>{student.department}</td><td>{student.year}</td><td><span className={`status-tag ${student.status === "Inactive" ? "status-declined" : "status-approved"}`}>{student.status}</span></td><td><div className="row-actions"><button title={`Edit ${student.name}`} onClick={() => onEdit(student)}><Settings size={14} /></button><button className="delete-row" onClick={() => onDelete(student)} aria-label={`Delete ${student.name}`}><X size={15} /></button></div></td></tr>)}</tbody></table></div>;
}
function StudentDashboard({ active, session, data, feedback, setFeedback }) {
  const leaveRequests = data.leaveRequests.filter((request) => request.email === session.email || request.name === session.name);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  useEffect(() => {
    if (!session.token) return undefined;
    let activeRequest = true;
    fetch("/api/leave", { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "Leave requests could not be loaded.");
        if (activeRequest) data.setLeaveRequests((previous) => [
          ...previous.filter((request) => request.email !== session.email),
          ...body.map((leave) => ({
          email: session.email, name: session.name,
          from: leave.start_date, to: leave.end_date, reason: leave.reason,
          status: leave.status === "approved" ? "Approved" : leave.status === "rejected" ? "Rejected" : "Pending",
        }))]);
      })
      .catch((requestError) => { if (activeRequest) setLeaveError(requestError.message); });
    return () => { activeRequest = false; };
  }, [session.token, session.email, session.name, data.setLeaveRequests]);
  const submitLeave = async (e) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const request = { name: session.name, from: String(form.get("from")), to: String(form.get("to")), reason: String(form.get("reason")), status: "Pending" };
    if (request.from > request.to) { setLeaveError("The end date must be on or after the start date."); return; }
    setLeaveError(""); setLeaveLoading(true);
    if (session.token) {
      try {
        const response = await fetch("/api/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ startDate: request.from, endDate: request.to, reason: request.reason }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "Your leave request could not be submitted.");
        request.databaseId = body.id;
      } catch (requestError) {
        setLeaveError(requestError.message); setLeaveLoading(false); return;
      }
    }
    data.setLeaveRequests((previous) => [request, ...previous]);
    formElement.reset(); setLeaveLoading(false); setFeedback("Your leave request has been submitted.");
  };
  if (active === "Leave requests") return <section className="dash-panel"><PanelHeader title="Request time away" /><p className="leave-intro">Submit your dates and a short reason. Your request will be sent to the college administrator for review.</p><form className="form-stack leave-form" onSubmit={submitLeave}><div className="form-row"><label>First day<input name="from" type="date" required /></label><label>Last day<input name="to" type="date" required /></label></div><label>Reason for leave<textarea name="reason" rows="3" minLength="10" maxLength="2000" placeholder="A short note to help your advisor review the request" required /></label>{leaveError && <p className="form-error" role="alert">{leaveError}</p>}<button disabled={leaveLoading} className="button button-navy">{leaveLoading ? "Submitting request…" : "Submit leave request"} <ArrowRight size={15} /></button>{feedback && <span className="success-inline"><Check size={14} />{feedback}</span>}</form><div className="leave-history"><h3>Your requests</h3>{leaveRequests.length ? leaveRequests.map((request, index) => <div key={`${request.from}-${index}`}><span>{request.from} – {request.to}</span><p>{request.reason}</p><span className={`status-tag ${request.status === "Approved" ? "status-approved" : request.status === "Rejected" ? "status-declined" : ""}`}>{request.status}</span></div>) : <EmptyState title="No leave requests yet" text="Your submitted requests will appear here." />}</div></section>;
  return <><div className="metric-grid"><Metric label="Attendance this term" value="94%" change="+2% this month" icon={Clock3} tint="mint" /><Metric label="Courses enrolled" value="5" change="Fall semester" icon={BookOpen} tint="lavender" /><Metric label="Assignments due" value="3" change="Next one in 2 days" icon={ClipboardCheck} tint="peach" /><Metric label="Current GPA" value="3.82" change="Out of 4.0" icon={Sparkles} tint="yellow" /></div><div className="dash-two-col"><section className="dash-panel"><PanelHeader title={active === "Overview" ? "Coming up this week" : active} /><div className="schedule-list"><div><span className="schedule-time">09:30<br /><small>AM</small></span><span className="schedule-mark mark-violet"></span><div><strong>Human-centered computing</strong><small>CS 204 · Dr. Maya Iyer · Lecture Hall 2</small></div><span className="schedule-pill">IN 25 MIN</span></div><div><span className="schedule-time">11:00<br /><small>AM</small></span><span className="schedule-mark mark-green"></span><div><strong>Foundations of economics</strong><small>EC 101 · Prof. Arjun Mehta · West Wing 108</small></div></div><div><span className="schedule-time">02:00<br /><small>PM</small></span><span className="schedule-mark mark-peach"></span><div><strong>Studio & critique</strong><small>DS 210 · Workshop Building</small></div></div></div></section><section className="dash-panel"><PanelHeader title="Coming up next" /><div className="assignment-list"><div className="assignment-item"><span className="assignment-icon tint-peach"><ClipboardCheck size={17} /></span><div><strong>Research brief · CS 204</strong><small>Due Friday, Oct 31</small></div><span className="due-soon">2 DAYS</span></div><div className="assignment-item"><span className="assignment-icon tint-lavender"><BookOpen size={17} /></span><div><strong>Reading reflection · EC 101</strong><small>Due Monday, Nov 3</small></div><span>NOV 03</span></div><div className="assignment-item"><span className="assignment-icon tint-mint"><CalendarDays size={17} /></span><div><strong>Midterm project · DS 210</strong><small>Due Thursday, Nov 6</small></div><span>NOV 06</span></div></div></section></div><div className="dash-two-col"><section className="dash-panel"><PanelHeader title="Your attendance" link="Full report" /><div className="attendance-display"><div className="attendance-ring"><div><strong>94<span>%</span></strong><small>OVERALL</small></div></div><div><span className="attendance-key"><i className="key-present"></i> Present <strong>47 classes</strong></span><span className="attendance-key"><i className="key-absent"></i> Absent <strong>3 classes</strong></span><span className="attendance-key"><i className="key-leave"></i> On leave <strong>2 classes</strong></span></div></div></section><section className="dash-panel"><PanelHeader title="A note for your advisor" /><form className="feedback-form" onSubmit={(e) => { e.preventDefault(); setFeedback("Your note was sent to your academic advisor."); e.currentTarget.reset(); }}><label className="sr-only" htmlFor="student-feedback">Your message</label><textarea id="student-feedback" rows="3" placeholder={`How are things going, ${session.name.split(" ")[0]}?`} required minLength="5" /><button className="button button-navy">Send a note <ArrowRight size={15} /></button>{feedback && <span className="success-inline"><Check size={14} />{feedback}</span>}</form></section></div><section className="dash-panel"><PanelHeader title="Latest from Northstar" link={<Link className="panel-link" to="/news">All notices <ArrowRight size={14} /></Link>} /><div className="student-notice-grid">{seedNotices.slice(0, 2).map((notice) => <article key={notice.title}><span>{notice.tag} · {notice.date}</span><strong>{notice.title}</strong><p>{notice.text}</p></article>)}</div></section></>;
}
function FacultyDashboard({ active, feedback, setFeedback }) {
  return <><div className="metric-grid"><Metric label="Classes today" value="3" change="Next at 09:30 AM" icon={BookOpen} tint="lavender" /><Metric label="Students this term" value="118" change="Across 4 courses" icon={Users} tint="mint" /><Metric label="Attendance pending" value="2" change="Classes need review" icon={ClipboardCheck} tint="peach" /><Metric label="Items to grade" value="24" change="3 assignments" icon={Clock3} tint="yellow" /></div><div className="dash-two-col"><section className="dash-panel"><PanelHeader title={active === "Overview" ? "Your classes today" : active} /><div className="schedule-list"><div><span className="schedule-time">09:30<br /><small>AM</small></span><span className="schedule-mark mark-violet"></span><div><strong>Human-centered computing</strong><small>CS 204 · Lecture Hall 2 · 32 students</small></div><button className="button button-small button-outline" onClick={() => setFeedback("Attendance roster opened in demo mode.")}>Take attendance</button></div><div><span className="schedule-time">11:00<br /><small>AM</small></span><span className="schedule-mark mark-green"></span><div><strong>Introduction to algorithms</strong><small>CS 108 · West Wing 201 · 28 students</small></div><button className="button button-small button-outline" onClick={() => setFeedback("Attendance roster opened in demo mode.")}>Take attendance</button></div><div><span className="schedule-time">02:00<br /><small>PM</small></span><span className="schedule-mark mark-peach"></span><div><strong>Computing seminar</strong><small>CS 310 · Innovation Center · 18 students</small></div></div></div>{feedback && <p className="success-inline"><Check size={15} /> {feedback}</p>}</section><section className="dash-panel"><PanelHeader title="Needs your attention" /><div className="assignment-list"><div className="assignment-item"><span className="assignment-icon tint-peach"><ClipboardCheck size={17} /></span><div><strong>Attendance to complete</strong><small>CS 204 · Today’s 09:30 class</small></div><span className="due-soon">TODAY</span></div><div className="assignment-item"><span className="assignment-icon tint-lavender"><BookOpen size={17} /></span><div><strong>Research brief submissions</strong><small>24 students · CS 204</small></div><span>GRADE</span></div><div className="assignment-item"><span className="assignment-icon tint-mint"><Bell size={17} /></span><div><strong>Faculty meeting</strong><small>Thursday, Oct 30 · 4:00 PM</small></div><span>CALENDAR</span></div></div></section></div><section className="dash-panel notice-manager"><PanelHeader title="Share a class update" /><form className="notice-publish" onSubmit={(e) => { e.preventDefault(); setFeedback("Your class announcement has been posted."); e.currentTarget.reset(); }}><label htmlFor="faculty-notice">Announcement for your students</label><div><input id="faculty-notice" placeholder="e.g. Reading list for next week is ready" required /><button className="button button-navy">Post update <ArrowRight size={15} /></button></div></form>{feedback && <p className="success-inline"><Check size={15} /> {feedback}</p>}</section><div className="dash-two-col"><section className="dash-panel"><PanelHeader title="A note from the college" /><div className="faculty-note"><span className="notice-tag">FACULTY NEWS · OCT 28</span><strong>Fall semester registration is open</strong><p>Help students plan ahead: registration closes November 14. Advising holds should be resolved by November 7.</p></div></section><section className="dash-panel"><PanelHeader title="Quick resources" /><div className="quick-actions"><button onClick={() => setFeedback("Study material upload is available when backend storage is configured.")}><span className="quick-icon tint-lavender"><BookOpen size={18} /></span><span><strong>Share study materials</strong><small>Upload a resource for class</small></span><ArrowRight size={15} /></button><button onClick={() => setFeedback("Marks entry form opened in demo mode.")}><span className="quick-icon tint-peach"><ClipboardCheck size={18} /></span><span><strong>Enter examination marks</strong><small>Update student results</small></span><ArrowRight size={15} /></button></div>{feedback && <p className="success-inline"><Check size={15} /> {feedback}</p>}</section></div></>;
}

function Profile({ session, onSave }) {
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (!session) navigate("/login/student"); }, [session, navigate]);
  if (!session) return null;
  return <main className="section profile-page"><div className="section-label"><span>01</span> YOUR NORTHSTAR</div><h1>Account <em>settings.</em></h1><p>Make this space feel a little more like yours.</p><form className="profile-form form-card" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSave({ ...session, name: String(f.get("name")), email: String(f.get("email")) }); setSaved(true); }}><div className="profile-summary"><span className="profile-avatar-large">{session.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span><div><strong>{session.name}</strong><small>{session.role} account · {session.demo ? "Demo mode" : "Connected account"}</small></div><label className="button button-outline upload-label">Change photo<input type="file" accept="image/png,image/jpeg,image/webp" /></label></div><div className="profile-form-grid"><label>Full name<input name="name" defaultValue={session.name} required minLength="2" /></label><label>Email address<input type="email" name="email" defaultValue={session.email} required /></label><label>Account role<input value={session.role} disabled /></label><label>Student / employee ID<input value={session.id || (session.role === "student" ? "NS2026042" : "Assigned by college")} disabled /></label></div><div className="profile-form-actions">{saved && <span className="success-inline"><Check size={15} /> Changes saved.</span>}<button className="button button-navy">Save changes <ArrowRight size={15} /></button></div></form></main>;
}

function SuccessPanel({ title, text, onReset, resetLabel = "Send another message" }) { return <div className="success-panel"><span className="success-icon"><Check size={21} /></span><h3>{title}</h3><p>{text}</p>{onReset && <button className="text-link dark-link" onClick={onReset}>{resetLabel} <ArrowRight size={15} /></button>}</div>; }
function EmptyState({ title, text }) { return <div className="empty-state"><span>✳</span><strong>{title}</strong><p>{text}</p></div>; }
function NotFound() { return <main className="not-found"><span>✳</span><h1>That page took<br /><em>a little detour.</em></h1><p>Let’s get you back to somewhere good.</p><Link to="/" className="button button-navy">Back to home <ArrowRight size={15} /></Link></main>; }

export default App;
