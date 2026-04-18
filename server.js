const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const socketIO = require('socket.io');
const http = require('http');
const moment = require('moment');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.socket.io"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "ws://localhost:*", "http://localhost:*"]
    }
  }
}));
app.use(morgan('combined'));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.')); // Serve static files from root directory

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const role = String(req.body?.role || '').trim().toLowerCase();
    const identifier = role === 'student'
      ? String(req.body?.uid || req.body?.identifier || '').trim().toUpperCase()
      : String(req.body?.email || req.body?.identifier || '').trim().toLowerCase();
    return `${req.ip || 'unknown-ip'}|${role || 'unknown-role'}|${identifier || 'unknown-identifier'}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many login attempts for this account. Please wait 15 minutes and try again.' });
  }
});
const DEFAULT_STUDENT_PASSWORD = '123456789';
const TEACHER_SESSION_MINUTES_MIN = 2;
const TEACHER_SESSION_MINUTES_MAX = 10;
const TEACHER_SESSION_MINUTES_DEFAULT = 10;
const ESCALATION_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;

const TEST_ACCOUNT_CONFIG = {
  admin: {
    email: 'goldysha156@gmail.com',
    name: 'Dr Goldy Sharma',
    department: 'CSE',
    password: '123456789',
    employeeCode: 'E10231'
  },
  teacher: {
    email: 'test-teacher@ai-attend.local',
    name: 'Test Teacher',
    department: 'CSE',
    password: 'test123456',
    sections: [
      { sectionName: '24BCS-601', subject: 'AI Fundamentals' },
      { sectionName: '24BCS-601', subject: 'Machine Learning' },
      { sectionName: '24BCS-601', subject: 'Data Mining' },
      { sectionName: '24BCS-601', subject: 'Computer Vision' },
      { sectionName: '24BCS-601', subject: 'Natural Language Processing' },
      { sectionName: '24BCS-601', subject: 'Cloud Computing' },
      { sectionName: '24BAI-701', subject: 'AI Fundamentals' }
    ],
    timetable: [
      { dayOfWeek: 'Monday', startTime: '09:00', endTime: '09:50', sectionName: '24BCS-601', subject: 'AI Fundamentals' },
      { dayOfWeek: 'Monday', startTime: '10:00', endTime: '10:50', sectionName: '24BCS-601', subject: 'Machine Learning' },
      { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '09:50', sectionName: '24BCS-601', subject: 'Data Mining' },
      { dayOfWeek: 'Wednesday', startTime: '09:00', endTime: '09:50', sectionName: '24BCS-601', subject: 'Computer Vision' },
      { dayOfWeek: 'Thursday', startTime: '09:00', endTime: '09:50', sectionName: '24BCS-601', subject: 'Natural Language Processing' },
      { dayOfWeek: 'Friday', startTime: '09:00', endTime: '09:50', sectionName: '24BCS-601', subject: 'Cloud Computing' },
      { dayOfWeek: 'Friday', startTime: '10:00', endTime: '10:50', sectionName: '24BAI-701', subject: 'AI Fundamentals' }
    ]
  },
  student: {
    email: 'test-student@ai-attend.local',
    name: 'Test Student',
    department: 'CSE',
    password: DEFAULT_STUDENT_PASSWORD,
    uid: '24BCS10156',
    section: '24BCS-601',
    semester: 6
  }
};

const DEMO_SECTION = '24BCS-601';
const DEMO_STUDENT_COUNT = 50;
const BAI_SECTION = '24BAI-701';
const BAI_STUDENT_COUNT = 30;
const DEMO_STUDENT_NAMES = [
  'Aarav Sharma', 'Vivaan Singh', 'Aditya Verma', 'Vihaan Gupta', 'Arjun Mehta',
  'Sai Reddy', 'Krish Malhotra', 'Ishaan Kapoor', 'Dhruv Nair', 'Kabir Yadav',
  'Rohan Jain', 'Yash Patil', 'Aniket Das', 'Harsh Vyas', 'Manav Rao',
  'Rahul Kulkarni', 'Pranav Bhat', 'Devansh Tiwari', 'Ayush Soni', 'Kunal Chawla',
  'Ananya Gupta', 'Diya Sharma', 'Myra Singh', 'Aadhya Verma', 'Sara Iyer',
  'Navya Patel', 'Kiara Nair', 'Meera Joshi', 'Ira Saxena', 'Siya Kapoor',
  'Riya Menon', 'Avni Desai', 'Pihu Arora', 'Tanvi Bansal', 'Kashvi Malhotra',
  'Sneha Reddy', 'Nitya Chandra', 'Tara Mishra', 'Aisha Khan', 'Manya Bhatia',
  'Neha Dutta', 'Pari Jaiswal', 'Ritika Sahu', 'Ishita Anand', 'Samaira Bose',
  'Arnav Tripathi', 'Lakshya Dubey', 'Naman Bhardwaj', 'Sarthak Puri', 'Reyansh Saxena'
];

// ==================== DATABASE ====================
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_attendance_v2')
  .then(async () => {
    console.log('MongoDB Connected');
    startEscalationScheduler();
    try {
      await ensureTestUser('admin');
      console.log(`Default admin ready: ${TEST_ACCOUNT_CONFIG.admin.email}`);
      await ensureTestUser('teacher');
      console.log(`Default teacher ready: ${TEST_ACCOUNT_CONFIG.teacher.email}`);
    } catch (seedErr) {
      console.log('Default bootstrap failed:', seedErr.message);
    }
  })
  .catch(err => console.log('MongoDB Error:', err));

// ==================== SCHEMAS ====================
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  username: String,
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  name: String,
  employeeCode: String,
  department: String,
  phone: String,
  passwordUpdatedAt: { type: Date, default: Date.now },
  passwordUpdatedBy: { type: String, enum: ['system', 'admin', 'teacher'], default: 'system' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now }
});

const studentSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  uid: { type: String, unique: true, required: true },
  section: String,
  department: String,
  semester: Number,
  totalAttendance: { type: Number, default: 0 },
  totalClasses: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const teacherSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  employeeID: String,
  qualification: String,
  sections: [{ sectionName: String, subject: String }],
  timetable: [{
    dayOfWeek: String,
    startTime: String,
    endTime: String,
    sectionName: String,
    subject: String
  }],
  totalSessions: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  teacherID: mongoose.Schema.Types.ObjectId,
  teacherName: String,
  handoverID: mongoose.Schema.Types.ObjectId,
  originalTeacherID: mongoose.Schema.Types.ObjectId,
  originalTeacherName: String,
  section: String,
  subject: String,
  recoveryTag: String,
  recoveryReason: String,
  recoveryForStartTime: String,
  recoveryForEndTime: String,
  teacherNote: String,
  startTime: Date,
  endedAt: Date,
  endedByUserID: mongoose.Schema.Types.ObjectId,
  endedByRole: { type: String, enum: ['teacher', 'admin', 'system'], default: 'system' },
  endedByName: String,
  endedReason: String,
  duration: Number,
  isActive: { type: Boolean, default: true },
  enrolledStudents: [{
    studentID: mongoose.Schema.Types.ObjectId,
    uid: String,
    name: String,
    status: { type: String, enum: ['Present', 'Absent', 'Pending'], default: 'Absent' },
    markedTime: Date,
    lateReason: String,
    faceData: String,
    decisionAt: Date
  }],
  totalPresent: { type: Number, default: 0 },
  totalAbsent: { type: Number, default: 0 },
  qrCode: String,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const attendanceLogSchema = new mongoose.Schema({
  sessionID: mongoose.Schema.Types.ObjectId,
  studentID: mongoose.Schema.Types.ObjectId,
  studentUID: String,
  studentName: String,
  section: String,
  subject: String,
  status: { type: String, enum: ['Present', 'Absent'] },
  markedTime: Date,
  ipAddress: String,
  createdAt: { type: Date, default: Date.now }
});

const reportSchema = new mongoose.Schema({
  studentID: mongoose.Schema.Types.ObjectId,
  academicYear: String,
  totalClasses: Number,
  totalPresent: Number,
  totalAbsent: Number,
  attendancePercentage: Number,
  createdAt: { type: Date, default: Date.now }
});

const shortageReferralSchema = new mongoose.Schema({
  teacherID: mongoose.Schema.Types.ObjectId,
  teacherName: String,
  studentID: mongoose.Schema.Types.ObjectId,
  studentUID: String,
  studentName: String,
  studentEmail: String,
  section: String,
  department: String,
  totalClasses: Number,
  totalAttendance: Number,
  attendancePercentage: Number,
  threshold: Number,
  note: String,
  adminComment: String,
  adminActionAt: Date,
  status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const adminAnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  targetRole: { type: String, enum: ['all', 'teacher', 'student'], default: 'all' },
  priority: { type: String, enum: ['normal', 'high', 'critical'], default: 'normal' },
  isActive: { type: Boolean, default: true },
  publishAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdBy: mongoose.Schema.Types.ObjectId,
  createdByName: String,
  createdAt: { type: Date, default: Date.now }
});

const adminAuditLogSchema = new mongoose.Schema({
  actorId: mongoose.Schema.Types.ObjectId,
  actorName: String,
  action: String,
  targetType: String,
  targetId: String,
  details: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

const attendanceCorrectionRequestSchema = new mongoose.Schema({
  teacherID: mongoose.Schema.Types.ObjectId,
  teacherName: String,
  sessionID: mongoose.Schema.Types.ObjectId,
  sessionCode: String,
  section: String,
  subject: String,
  studentID: mongoose.Schema.Types.ObjectId,
  studentUID: String,
  studentName: String,
  currentStatus: { type: String, enum: ['Present', 'Absent'], default: 'Absent' },
  requestedStatus: { type: String, enum: ['Present', 'Absent'], required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminComment: String,
  decidedBy: mongoose.Schema.Types.ObjectId,
  decidedByName: String,
  decidedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const attendanceDisputeSchema = new mongoose.Schema({
  sessionID: mongoose.Schema.Types.ObjectId,
  sessionCode: String,
  section: String,
  subject: String,
  studentID: mongoose.Schema.Types.ObjectId,
  studentUID: String,
  studentName: String,
  teacherID: mongoose.Schema.Types.ObjectId,
  teacherName: String,
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending_teacher', 'resolved_teacher', 'escalated_admin', 'resolved_admin', 'rejected_admin'],
    default: 'pending_teacher'
  },
  teacherComment: String,
  adminComment: String,
  resolvedBy: mongoose.Schema.Types.ObjectId,
  resolvedByName: String,
  resolvedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const substituteHandoverSchema = new mongoose.Schema({
  fromTeacherID: mongoose.Schema.Types.ObjectId,
  fromTeacherName: String,
  toTeacherID: mongoose.Schema.Types.ObjectId,
  toTeacherName: String,
  section: String,
  subject: String,
  dayOfWeek: String,
  startTime: String,
  endTime: String,
  effectiveFrom: Date,
  effectiveTo: Date,
  note: String,
  requestSource: { type: String, enum: ['admin', 'teacher'], default: 'admin' },
  teacherDecision: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  teacherDecisionAt: Date,
  teacherDecisionByName: String,
  teacherDecisionNote: String,
  substituteAttendanceSessionCode: String,
  substituteAttendanceByName: String,
  substituteAttendanceStartedAt: Date,
  substituteAttendanceCompletedAt: Date,
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  createdBy: mongoose.Schema.Types.ObjectId,
  createdByName: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const escalationRuleSchema = new mongoose.Schema({
  isEnabled: { type: Boolean, default: false },
  threshold: { type: Number, default: 75 },
  consecutiveDays: { type: Number, default: 3 },
  minLogs: { type: Number, default: 3 },
  notifyTeacher: { type: Boolean, default: true },
  notifyStudent: { type: Boolean, default: true },
  notifyAdmin: { type: Boolean, default: true },
  lastRunAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const escalationAlertSchema = new mongoose.Schema({
  studentID: mongoose.Schema.Types.ObjectId,
  studentUID: String,
  studentName: String,
  studentEmail: String,
  section: String,
  threshold: Number,
  consecutiveDays: Number,
  attendanceRate: Number,
  teacherID: mongoose.Schema.Types.ObjectId,
  teacherName: String,
  teacherEmail: String,
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
  details: String,
  notifiedTargets: [String],
  triggeredAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const attendancePolicySchema = new mongoose.Schema({
  examModeEnabled: { type: Boolean, default: false },
  attendanceEditCutoff: { type: Date, default: null },
  allowAdminOverride: { type: Boolean, default: true },
  overrideReasonRequired: { type: Boolean, default: true },
  updatedBy: mongoose.Schema.Types.ObjectId,
  updatedByName: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Student = mongoose.model('Student', studentSchema);
const Teacher = mongoose.model('Teacher', teacherSchema);
const Session = mongoose.model('Session', sessionSchema);
const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);
const Report = mongoose.model('Report', reportSchema);
const ShortageReferral = mongoose.model('ShortageReferral', shortageReferralSchema);
const AdminAnnouncement = mongoose.model('AdminAnnouncement', adminAnnouncementSchema);
const AdminAuditLog = mongoose.model('AdminAuditLog', adminAuditLogSchema);
const AttendanceCorrectionRequest = mongoose.model('AttendanceCorrectionRequest', attendanceCorrectionRequestSchema);
const AttendanceDispute = mongoose.model('AttendanceDispute', attendanceDisputeSchema);
const SubstituteHandover = mongoose.model('SubstituteHandover', substituteHandoverSchema);
const EscalationRule = mongoose.model('EscalationRule', escalationRuleSchema);
const EscalationAlert = mongoose.model('EscalationAlert', escalationAlertSchema);
const AttendancePolicy = mongoose.model('AttendancePolicy', attendancePolicySchema);

let escalationSchedulerStarted = false;
function startEscalationScheduler() {
  if (escalationSchedulerStarted) return;
  escalationSchedulerStarted = true;

  const run = async () => {
    try {
      await evaluateEscalationRules();
    } catch (err) {
      console.log('Escalation scheduler warning:', err.message);
    }
  };

  setTimeout(run, 45 * 1000);
  setInterval(run, ESCALATION_SCHEDULER_INTERVAL_MS);
}

function isDemoAccount(email, role) {
  const config = TEST_ACCOUNT_CONFIG[role];
  return Boolean(config && email?.toLowerCase() === config.email.toLowerCase());
}

async function ensureDemoStudents(sectionName, department, semester, options = {}) {
  const {
    studentCount = DEMO_STUDENT_COUNT,
    uidPrefix = '24BCS10',
    uidPadding = 3,
    emailPrefix = 'demo-student',
    studentNames = DEMO_STUDENT_NAMES
  } = options;
  const hash = await bcryptjs.hash(DEFAULT_STUDENT_PASSWORD, 10);
  const emailPadding = Math.max(2, String(studentCount).length);

  for (let index = 0; index < studentCount; index++) {
    const serial = String(index + 1).padStart(emailPadding, '0');
    const email = `${emailPrefix}${serial}@ai-attend.local`;
    const uid = `${uidPrefix}${String(index + 1).padStart(uidPadding, '0')}`;
    const name = studentNames[index] || `Demo Student ${serial}`;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        username: uid,
        password: hash,
        role: 'student',
        name,
        department
      });
    } else if (user.username !== uid) {
      user.username = uid;
      await user.save();
    }

    const student = await Student.findOne({ uid });
    if (!student) {
      await Student.create({
        userId: user._id,
        uid,
        section: sectionName,
        department,
        semester
      });
    } else {
      let hasChanges = false;
      if (!student.userId) {
        student.userId = user._id;
        hasChanges = true;
      }
      if (student.section !== sectionName) {
        student.section = sectionName;
        hasChanges = true;
      }
      if (student.department !== department) {
        student.department = department;
        hasChanges = true;
      }
      if (student.semester !== semester) {
        student.semester = semester;
        hasChanges = true;
      }
      if (hasChanges) {
        await student.save();
      }
    }
  }
}

async function ensureTestUser(role) {
  const config = TEST_ACCOUNT_CONFIG[role];
  if (!config) {
    throw new Error('Invalid role');
  }

  const email = String(config.email || '').toLowerCase();
  const desiredPassword = String(config.password || 'test123456');
  let user = await User.findOne({ email });

  if (!user) {
    const hash = await bcryptjs.hash(desiredPassword, 10);
    const payload = {
      email,
      password: hash,
      role,
      name: config.name,
      employeeCode: config.employeeCode || '',
      department: config.department
    };
    if (role === 'student' && config.uid) {
      payload.username = String(config.uid).trim().toUpperCase();
    }
    user = await User.create(payload);
  } else {
    let hasChanges = false;

    if (user.role !== role) {
      user.role = role;
      hasChanges = true;
    }
    if (config.name && user.name !== config.name) {
      user.name = config.name;
      hasChanges = true;
    }
    if (config.department && user.department !== config.department) {
      user.department = config.department;
      hasChanges = true;
    }
    if (typeof config.employeeCode === 'string' && user.employeeCode !== config.employeeCode) {
      user.employeeCode = config.employeeCode;
      hasChanges = true;
    }
    if (role === 'student' && config.uid) {
      const normalizedUid = String(config.uid).trim().toUpperCase();
      if (user.username !== normalizedUid) {
        user.username = normalizedUid;
        hasChanges = true;
      }
    }

    const passwordMatches = await bcryptjs.compare(desiredPassword, user.password).catch(() => false);
    if (!passwordMatches) {
      user.password = await bcryptjs.hash(desiredPassword, 10);
      markPasswordChange(user, 'system');
      hasChanges = true;
    }

    if (hasChanges) {
      await user.save();
    }
  }

  if (role === 'teacher') {
    const teacher = await Teacher.findOne({ userId: user._id });
    if (!teacher) {
      await Teacher.create({
        userId: user._id,
        employeeID: 'TEST-TEACHER-001',
        qualification: 'Demo Account',
        sections: config.sections,
        timetable: normalizeTeacherTimetable(config.timetable || [], config.sections)
      });
    } else {
      teacher.sections = config.sections;
      if (!Array.isArray(teacher.timetable) || !teacher.timetable.length) {
        teacher.timetable = normalizeTeacherTimetable(config.timetable || [], config.sections);
      }
      await teacher.save();
    }

    await ensureDemoStudents(DEMO_SECTION, config.department, 6, {
      studentCount: DEMO_STUDENT_COUNT,
      uidPrefix: '24BCS10',
      uidPadding: 3,
      emailPrefix: 'demo-student',
      studentNames: DEMO_STUDENT_NAMES
    });

    await ensureDemoStudents(BAI_SECTION, config.department, 7, {
      studentCount: BAI_STUDENT_COUNT,
      uidPrefix: '24BAI7',
      uidPadding: 3,
      emailPrefix: 'bai-student',
      studentNames: DEMO_STUDENT_NAMES
    });
  }

  if (role === 'student') {
    const student = await Student.findOne({ userId: user._id });
    if (!student) {
      await Student.create({
        userId: user._id,
        uid: config.uid,
        section: config.section,
        department: config.department,
        semester: config.semester
      });
    }
  }

  return user;
}

async function getAvailableStudentUid(preferredUid) {
  const normalizedBase = String(preferredUid || 'AUTO-STUDENT').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'AUTO-STUDENT';
  let candidate = normalizedBase;
  let suffix = 1;

  while (await Student.exists({ uid: candidate })) {
    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function ensureStudentProfileForUser(userId, options = {}) {
  const user = await User.findById(userId);
  if (!user || user.role !== 'student') {
    return null;
  }

  let student = await Student.findOne({ userId: user._id });
  if (student) {
    if (student.uid && user.username !== student.uid) {
      user.username = student.uid;
      await user.save();
    }
    return student;
  }

  const isTestStudent = user.email?.toLowerCase() === TEST_ACCOUNT_CONFIG.student.email.toLowerCase();
  const fallbackUid = `AUTO-${String(user._id).slice(-8).toUpperCase()}`;
  const preferredUid = options.uid || (isTestStudent ? TEST_ACCOUNT_CONFIG.student.uid : fallbackUid);
  const uid = await getAvailableStudentUid(preferredUid);

  student = await Student.create({
    userId: user._id,
    uid,
    section: options.section || (isTestStudent ? TEST_ACCOUNT_CONFIG.student.section : DEMO_SECTION),
    department: options.department || user.department || (isTestStudent ? TEST_ACCOUNT_CONFIG.student.department : 'GENERAL'),
    semester: Number(options.semester) || (isTestStudent ? TEST_ACCOUNT_CONFIG.student.semester : 6)
  });

  if (user.username !== uid) {
    user.username = uid;
    await user.save();
  }

  return student;
}

async function getTeacherContext(userId) {
  const teacher = await Teacher.findOne({ userId });
  if (!teacher) {
    return null;
  }

  return {
    teacher,
    teacherObjectId: teacher._id?.toString()
  };
}

function buildTeacherSectionBreakdown(teacher, students) {
  const sectionMap = new Map();
  const studentCountMap = new Map();

  (students || []).forEach(student => {
    if (!student?.section) return;
    studentCountMap.set(student.section, (studentCountMap.get(student.section) || 0) + 1);
  });

  (teacher.sections || []).forEach(item => {
    const sectionName = String(item.sectionName || '').trim();
    const subject = String(item.subject || '').trim();
    if (!sectionName || !subject) return;

    if (!sectionMap.has(sectionName)) {
      sectionMap.set(sectionName, { sectionName, subjects: new Set() });
    }
    sectionMap.get(sectionName).subjects.add(subject);
  });

  return Array.from(sectionMap.values())
    .map(item => ({
      sectionName: item.sectionName,
      studentCount: studentCountMap.get(item.sectionName) || 0,
      subjects: Array.from(item.subjects).sort((a, b) => a.localeCompare(b)),
      subjectCount: item.subjects.size
    }))
    .sort((a, b) => a.sectionName.localeCompare(b.sectionName));
}

function buildTimetableReminderPayload({ timetable = [], sessions = [], now = moment() }) {
  const todayName = now.format('dddd');
  const todaySlots = timetable
    .filter(slot => slot.dayOfWeek === todayName)
    .map(slot => ({
      ...slot,
      startMinutes: timeStringToMinutes(slot.startTime),
      endMinutes: timeStringToMinutes(slot.endTime)
    }))
    .filter(slot => Number.isInteger(slot.startMinutes) && Number.isInteger(slot.endMinutes))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const reminders = [];

  todaySlots.forEach(slot => {
    const slotStart = moment(now).startOf('day').add(slot.startMinutes, 'minutes');
    const slotEnd = moment(now).startOf('day').add(slot.endMinutes, 'minutes');
    const hasSession = sessions.some(session => {
      if (String(session.section || '').trim() !== slot.sectionName) return false;
      if (String(session.subject || '').trim().toLowerCase() !== slot.subject.toLowerCase()) return false;

      const startedAt = moment(session.startTime);
      const earliestAllowed = moment(slotStart).subtract(20, 'minutes');
      const latestAllowed = moment(slotEnd).add(45, 'minutes');
      return startedAt.isBetween(earliestAllowed, latestAllowed, undefined, '[]');
    });

    if (hasSession) {
      return;
    }

    if (now.isBefore(slotStart)) {
      return;
    }

    if (now.isSameOrBefore(moment(slotEnd).add(10, 'minutes'))) {
      reminders.push({
        type: 'pending',
        message: `Attendance not started yet for ${slot.sectionName} (${slot.subject}) at ${slot.startTime}`,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        sectionName: slot.sectionName,
        subject: slot.subject
      });
      return;
    }

    reminders.push({
      type: 'missed',
      message: `Attendance may be missed for ${slot.sectionName} (${slot.subject}) scheduled ${slot.startTime}-${slot.endTime}`,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      sectionName: slot.sectionName,
      subject: slot.subject
    });
  });

  return { todayName, reminders };
}

async function getResponsibleTeacherFromSession(session) {
  if (!session) {
    return { teacherID: null, teacherName: '' };
  }

  if (session.originalTeacherID) {
    return {
      teacherID: session.originalTeacherID,
      teacherName: session.originalTeacherName || session.teacherName || 'Teacher'
    };
  }

  if (!session.teacherID || !session.startTime) {
    return {
      teacherID: session.teacherID || null,
      teacherName: session.teacherName || 'Teacher'
    };
  }

  const sessionDate = new Date(session.startTime);
  if (Number.isNaN(sessionDate.getTime())) {
    return {
      teacherID: session.teacherID || null,
      teacherName: session.teacherName || 'Teacher'
    };
  }

  const dayName = moment(sessionDate).format('dddd');
  const handover = await SubstituteHandover.findOne({
    toTeacherID: session.teacherID,
    section: String(session.section || '').trim(),
    subject: String(session.subject || '').trim(),
    dayOfWeek: dayName,
    status: 'active',
    teacherDecision: 'accepted',
    effectiveFrom: { $lte: sessionDate },
    effectiveTo: { $gte: sessionDate }
  }).sort({ createdAt: -1 });

  if (handover?.fromTeacherID) {
    return {
      teacherID: handover.fromTeacherID,
      teacherName: handover.fromTeacherName || session.teacherName || 'Teacher',
      handoverID: handover._id
    };
  }

  return {
    teacherID: session.teacherID,
    teacherName: session.teacherName || 'Teacher'
  };
}

async function reconcilePendingDisputesOwnership() {
  const pendingDisputes = await AttendanceDispute.find({ status: 'pending_teacher' })
    .sort({ createdAt: -1 })
    .limit(500)
    .select('_id sessionID teacherID teacherName');
  if (!pendingDisputes.length) return 0;

  const sessionIds = [...new Set(pendingDisputes.map(item => String(item.sessionID || '')).filter(Boolean))];
  if (!sessionIds.length) return 0;

  const sessions = await Session.find({ _id: { $in: sessionIds } })
    .select('_id teacherID teacherName section subject startTime originalTeacherID originalTeacherName');
  const sessionMap = new Map(sessions.map(session => [String(session._id), session]));

  const updates = [];
  for (const dispute of pendingDisputes) {
    const session = sessionMap.get(String(dispute.sessionID || ''));
    if (!session) continue;
    const responsible = await getResponsibleTeacherFromSession(session);
    if (!responsible.teacherID) continue;
    if (String(responsible.teacherID) === String(dispute.teacherID || '')) continue;

    updates.push({
      updateOne: {
        filter: { _id: dispute._id },
        update: {
          $set: {
            teacherID: responsible.teacherID,
            teacherName: responsible.teacherName || dispute.teacherName || 'Teacher',
            updatedAt: new Date()
          }
        }
      }
    });
  }

  if (!updates.length) return 0;
  const result = await AttendanceDispute.bulkWrite(updates, { ordered: false });
  return Number(result.modifiedCount || 0);
}

async function updateHandoverAttendanceState({
  handoverId,
  sessionCode = '',
  substituteName = '',
  state = 'in_progress'
} = {}) {
  const normalizedHandoverId = String(handoverId || '').trim();
  if (!normalizedHandoverId || !mongoose.Types.ObjectId.isValid(normalizedHandoverId)) {
    return null;
  }

  const handover = await SubstituteHandover.findById(normalizedHandoverId);
  if (!handover) return null;

  if (state === 'in_progress') {
    handover.substituteAttendanceSessionCode = String(sessionCode || handover.substituteAttendanceSessionCode || '').trim();
    handover.substituteAttendanceByName = String(substituteName || handover.substituteAttendanceByName || '').trim();
    handover.substituteAttendanceStartedAt = handover.substituteAttendanceStartedAt || new Date();
  }

  if (state === 'completed') {
    handover.substituteAttendanceSessionCode = String(sessionCode || handover.substituteAttendanceSessionCode || '').trim();
    handover.substituteAttendanceByName = String(substituteName || handover.substituteAttendanceByName || '').trim();
    handover.substituteAttendanceStartedAt = handover.substituteAttendanceStartedAt || new Date();
    handover.substituteAttendanceCompletedAt = new Date();
  }

  handover.updatedAt = new Date();
  await handover.save();
  return handover;
}

async function closeExpiredSessions({ maxScan = 1000 } = {}) {
  const now = new Date();
  const activeSessions = await Session.find({ isActive: true })
    .sort({ startTime: -1 })
    .limit(Math.max(1, Number(maxScan) || 1000))
    .select('_id code handoverID teacherName startTime duration expiresAt endedAt isActive');

  const expiredSessions = activeSessions.filter(session => {
    const derivedExpiry = session.expiresAt
      || (session.startTime
        ? moment(session.startTime).add(Number(session.duration || TEACHER_SESSION_MINUTES_DEFAULT), 'minutes').toDate()
        : null);
    if (!derivedExpiry || Number.isNaN(new Date(derivedExpiry).getTime())) {
      return false;
    }
    return new Date(derivedExpiry) <= now;
  });

  if (!expiredSessions.length) return 0;

  const updates = expiredSessions.map(session => ({
    updateOne: {
      filter: { _id: session._id, isActive: true },
      update: {
        $set: {
          isActive: false,
          endedAt: session.endedAt || now,
          endedByRole: 'system',
          endedByName: 'System Auto-close',
          endedReason: 'expired'
        }
      }
    }
  }));

  const result = await Session.bulkWrite(updates, { ordered: false });

  for (const session of expiredSessions) {
    if (session.handoverID) {
      await updateHandoverAttendanceState({
        handoverId: session.handoverID,
        sessionCode: session.code,
        substituteName: session.teacherName || '',
        state: 'completed'
      });
    }
  }

  return Number(result.modifiedCount || 0);
}

async function applyApprovedCorrection(correction, options = {}) {
  if (!correction?.sessionCode || !correction?.studentUID) {
    return { applied: false, reason: 'Session code or student UID missing' };
  }

  const session = await Session.findOne({ code: correction.sessionCode });
  if (!session) {
    return { applied: false, reason: 'Session not found' };
  }

  const enrolled = (session.enrolledStudents || []).find(entry =>
    String(entry.uid || '').trim().toUpperCase() === String(correction.studentUID || '').trim().toUpperCase()
  );
  if (!enrolled) {
    return { applied: false, reason: 'Student not found in session roster' };
  }

  const policy = await getAttendancePolicyDoc();
  try {
    assertAttendanceEditAllowed({
      session,
      policy,
      allowAdminOverride: true,
      adminOverride: Boolean(options.adminOverride),
      overrideReason: options.overrideReason || ''
    });
  } catch (err) {
    return { applied: false, reason: err.message };
  }

  const nextStatus = correction.requestedStatus;
  const previousStatus = enrolled.status === 'Present' ? 'Present' : 'Absent';
  if (previousStatus === nextStatus) {
    return { applied: true, changed: false, reason: 'No status change required' };
  }

  enrolled.status = nextStatus;
  enrolled.decisionAt = new Date();
  session.totalPresent = session.enrolledStudents.filter(student => student.status === 'Present').length;
  session.totalAbsent = session.enrolledStudents.filter(student => student.status === 'Absent').length;
  await session.save();

  const student = await Student.findOne({ uid: correction.studentUID });
  if (student) {
    if (previousStatus === 'Absent' && nextStatus === 'Present') {
      student.totalAttendance = Number(student.totalAttendance || 0) + 1;
      await student.save();
    } else if (previousStatus === 'Present' && nextStatus === 'Absent') {
      student.totalAttendance = Math.max(0, Number(student.totalAttendance || 0) - 1);
      await student.save();
    }
  }

  if (student) {
    const attendanceLog = await AttendanceLog.findOne({ sessionID: session._id, studentUID: correction.studentUID });
    if (attendanceLog) {
      attendanceLog.status = nextStatus;
      attendanceLog.markedTime = attendanceLog.markedTime || new Date();
      await attendanceLog.save();
    } else {
      const user = student.userId ? await User.findById(student.userId) : null;
      await AttendanceLog.create({
        sessionID: session._id,
        studentID: student._id,
        studentUID: correction.studentUID,
        studentName: user?.name || correction.studentName || correction.studentUID,
        section: session.section,
        subject: session.subject,
        status: nextStatus,
        markedTime: new Date(),
        ipAddress: 'admin-correction'
      });
    }
  }

  return { applied: true, changed: true };
}

async function getLowAttendanceStudentsForSection({ teacherContext, section, threshold = 75 }) {
  const normalizedSection = section?.trim();
  if (!normalizedSection) {
    throw new Error('Section is required');
  }

  const teacherSections = new Set((teacherContext.teacher.sections || []).map(item => item.sectionName));
  if (!teacherSections.has(normalizedSection)) {
    throw new Error('Section is not assigned to this teacher');
  }

  const students = await Student.find({ section: normalizedSection }).sort({ uid: 1 });
  const users = await User.find({ _id: { $in: students.map(student => student.userId).filter(Boolean) } });
  const userMap = new Map(users.map(user => [user._id.toString(), user]));

  return students
    .map(student => {
      const user = userMap.get(student.userId?.toString());
      const attendancePercentage = student.totalClasses > 0
        ? Number(((student.totalAttendance / student.totalClasses) * 100).toFixed(2))
        : 0;

      return {
        studentId: student._id,
        uid: student.uid,
        name: user?.name || student.uid,
        email: user?.email || '',
        section: student.section,
        department: student.department,
        totalClasses: student.totalClasses || 0,
        totalAttendance: student.totalAttendance || 0,
        totalAbsent: Math.max(0, (student.totalClasses || 0) - (student.totalAttendance || 0)),
        attendancePercentage
      };
    })
    .filter(student => student.attendancePercentage < threshold);
}

function buildTeacherWorkbook(session) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Session Attendance');

  ws.columns = [
    { header: 'Session Code', key: 'code', width: 16 },
    { header: 'Section', key: 'section', width: 16 },
    { header: 'Subject', key: 'subject', width: 28 },
    { header: 'UID', key: 'uid', width: 16 },
    { header: 'Student Name', key: 'name', width: 28 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Marked Time', key: 'markedTime', width: 24 },
    { header: 'Session Start', key: 'startTime', width: 24 },
    { header: 'Session End', key: 'endedAt', width: 24 }
  ];

  session.enrolledStudents.forEach(student => {
    ws.addRow({
      code: session.code,
      section: session.section,
      subject: session.subject,
      uid: student.uid,
      name: student.name,
      status: student.status,
      markedTime: student.markedTime ? moment(student.markedTime).format('YYYY-MM-DD HH:mm:ss') : '-',
      startTime: session.startTime ? moment(session.startTime).format('YYYY-MM-DD HH:mm:ss') : '-',
      endedAt: session.endedAt ? moment(session.endedAt).format('YYYY-MM-DD HH:mm:ss') : (session.isActive ? 'Active' : '-')
    });
  });

  return wb;
}

function parseTeacherSectionsInput(input) {
  if (!input || typeof input !== 'string') {
    return [];
  }

  return input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [sectionName, subject] = line.split(':').map(value => value?.trim() || '');
      return { sectionName, subject };
    })
    .filter(item => item.sectionName && item.subject);
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function normalizeDayName(dayValue) {
  const normalized = String(dayValue || '').trim().toLowerCase();
  const map = {
    mon: 'Monday', monday: 'Monday',
    tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday',
    wed: 'Wednesday', wednesday: 'Wednesday',
    thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday',
    fri: 'Friday', friday: 'Friday',
    sat: 'Saturday', saturday: 'Saturday',
    sun: 'Sunday', sunday: 'Sunday'
  };
  return map[normalized] || '';
}

function normalizeTimeValue(timeValue) {
  const raw = String(timeValue || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return '';
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '';
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeStringToMinutes(timeString) {
  const normalized = normalizeTimeValue(timeString);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function normalizeTeacherTimetable(entries, validSections = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const validSectionNames = new Set((validSections || []).map(section => section.sectionName).filter(Boolean));
  const seen = new Set();
  const cleaned = [];

  entries.forEach(entry => {
    const dayOfWeek = normalizeDayName(entry?.dayOfWeek);
    const startTime = normalizeTimeValue(entry?.startTime);
    const endTime = normalizeTimeValue(entry?.endTime);
    const sectionName = String(entry?.sectionName || '').trim();
    const subject = String(entry?.subject || '').trim();

    if (!dayOfWeek || !startTime || !endTime || !sectionName || !subject) {
      return;
    }

    if (validSectionNames.size > 0 && !validSectionNames.has(sectionName)) {
      return;
    }

    const startMinutes = timeStringToMinutes(startTime);
    const endMinutes = timeStringToMinutes(endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return;
    }

    const uniqueKey = `${dayOfWeek}|${startTime}|${endTime}|${sectionName}|${subject.toLowerCase()}`;
    if (seen.has(uniqueKey)) {
      return;
    }
    seen.add(uniqueKey);

    cleaned.push({ dayOfWeek, startTime, endTime, sectionName, subject });
  });

  return cleaned.sort((a, b) => {
    const dayDiff = DAY_NAMES.indexOf(a.dayOfWeek) - DAY_NAMES.indexOf(b.dayOfWeek);
    if (dayDiff !== 0) return dayDiff;
    return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
  });
}

function parseTeacherTimetableInput(input, validSections = []) {
  if (!input || typeof input !== 'string') {
    return [];
  }

  const parsed = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[,\|]/).map(part => part.trim());
      if (parts.length < 5) {
        return null;
      }
      return {
        dayOfWeek: parts[0],
        startTime: parts[1],
        endTime: parts[2],
        sectionName: parts[3],
        subject: parts.slice(4).join(', ')
      };
    })
    .filter(Boolean);

  return normalizeTeacherTimetable(parsed, validSections);
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function splitCsvLine(line = '') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  values.push(current.trim());
  return values;
}

function getDefaultEscalationRule() {
  return {
    isEnabled: false,
    threshold: 75,
    consecutiveDays: 3,
    minLogs: 3,
    notifyTeacher: true,
    notifyStudent: true,
    notifyAdmin: true,
    lastRunAt: null
  };
}

function getDefaultAttendancePolicy() {
  return {
    examModeEnabled: false,
    attendanceEditCutoff: null,
    allowAdminOverride: true,
    overrideReasonRequired: true
  };
}

async function getAttendancePolicyDoc() {
  const doc = await AttendancePolicy.findOne().sort({ updatedAt: -1 });
  if (doc) return doc;
  return getDefaultAttendancePolicy();
}

function isAttendanceEditLockedByPolicy(session, policy) {
  if (!policy?.examModeEnabled) return false;
  const cutoff = policy?.attendanceEditCutoff ? new Date(policy.attendanceEditCutoff) : null;
  const sessionStart = session?.startTime ? new Date(session.startTime) : null;
  if (!cutoff || Number.isNaN(cutoff.getTime())) return false;
  if (!sessionStart || Number.isNaN(sessionStart.getTime())) return false;
  return sessionStart <= cutoff;
}

function assertAttendanceEditAllowed({
  session,
  policy,
  allowAdminOverride = false,
  adminOverride = false,
  overrideReason = ''
}) {
  const locked = isAttendanceEditLockedByPolicy(session, policy);
  if (!locked) return;

  const normalizedReason = String(overrideReason || '').trim();
  const canOverride = Boolean(
    allowAdminOverride
    && policy?.allowAdminOverride
    && adminOverride
    && (!policy?.overrideReasonRequired || normalizedReason.length >= 5)
  );

  if (canOverride) return;
  if (allowAdminOverride && adminOverride && policy?.overrideReasonRequired && normalizedReason.length < 5) {
    throw new Error('Override reason must be at least 5 characters');
  }

  throw new Error('Attendance edits are locked due to exam mode freeze');
}

function escapePdfText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdfBuffer(lines = []) {
  const safeLines = (lines || []).map(line => String(line || '').slice(0, 140));
  const contentRows = [
    'BT',
    '/F1 10 Tf',
    '14 TL',
    '40 760 Td'
  ];

  safeLines.slice(0, 48).forEach((line, index) => {
    if (index > 0) contentRows.push('T*');
    contentRows.push(`(${escapePdfText(line)}) Tj`);
  });
  contentRows.push('ET');
  const streamBuffer = Buffer.from(contentRows.join('\n'), 'utf8');

  const parts = [];
  const offsets = [0];
  const pushString = (value) => parts.push(Buffer.from(value, 'binary'));
  const pushBuffer = (value) => parts.push(value);
  const getByteLength = () => parts.reduce((sum, part) => sum + part.length, 0);

  pushString('%PDF-1.4\n');
  offsets[1] = getByteLength();
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offsets[2] = getByteLength();
  pushString('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  offsets[3] = getByteLength();
  pushString('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  offsets[4] = getByteLength();
  pushString('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  offsets[5] = getByteLength();
  pushString(`5 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n`);
  pushBuffer(streamBuffer);
  pushString('\nendstream\nendobj\n');

  const xrefStart = getByteLength();
  pushString('xref\n0 6\n');
  pushString('0000000000 65535 f \n');
  for (let i = 1; i <= 5; i += 1) {
    pushString(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return Buffer.concat(parts);
}

async function buildTimetableImportPreview({ csvText = '', mode = 'replace' }) {
  const normalizedMode = mode === 'append' ? 'append' : 'replace';
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      mode: normalizedMode,
      totalRows: 0,
      validRows: 0,
      canApply: false,
      issues: [{ rowNumber: 0, message: 'CSV is empty' }],
      conflicts: [],
      updates: []
    };
  }

  const firstRowColumns = splitCsvLine(lines[0]).map(item => item.toLowerCase());
  const hasHeader = firstRowColumns.some(col =>
    ['teacheremail', 'teacher_email', 'email'].includes(col)
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const parsedRows = dataLines.map((line, index) => {
    const rowNumber = hasHeader ? index + 2 : index + 1;
    const parts = splitCsvLine(line);
    return {
      rowNumber,
      teacherEmail: String(parts[0] || '').trim().toLowerCase(),
      dayOfWeekRaw: String(parts[1] || '').trim(),
      startTimeRaw: String(parts[2] || '').trim(),
      endTimeRaw: String(parts[3] || '').trim(),
      sectionName: String(parts[4] || '').trim(),
      subject: String(parts.slice(5).join(',') || '').trim()
    };
  });

  const teacherEmails = [...new Set(parsedRows.map(row => row.teacherEmail).filter(Boolean))];
  const users = await User.find({ email: { $in: teacherEmails }, role: 'teacher' });
  const userMap = new Map(users.map(user => [user.email.toLowerCase(), user]));
  const teachers = await Teacher.find({ userId: { $in: users.map(user => user._id) } });
  const teacherByUserId = new Map(teachers.map(teacher => [String(teacher.userId), teacher]));

  const issues = [];
  const conflicts = [];
  const buckets = new Map();

  const upsertBucket = (teacherDoc, userDoc) => {
    const key = String(teacherDoc._id);
    if (!buckets.has(key)) {
      buckets.set(key, {
        teacherId: teacherDoc._id,
        teacherName: userDoc.name || 'Teacher',
        teacherEmail: userDoc.email,
        teacherDoc,
        entries: []
      });
    }
    return buckets.get(key);
  };

  parsedRows.forEach(row => {
    if (!row.teacherEmail || !row.dayOfWeekRaw || !row.startTimeRaw || !row.endTimeRaw || !row.sectionName || !row.subject) {
      issues.push({ rowNumber: row.rowNumber, message: 'Missing required columns' });
      return;
    }

    const userDoc = userMap.get(row.teacherEmail);
    const teacherDoc = userDoc ? teacherByUserId.get(String(userDoc._id)) : null;
    if (!userDoc || !teacherDoc) {
      issues.push({ rowNumber: row.rowNumber, message: `Teacher not found for email ${row.teacherEmail}` });
      return;
    }

    const dayOfWeek = normalizeDayName(row.dayOfWeekRaw);
    const startTime = normalizeTimeValue(row.startTimeRaw);
    const endTime = normalizeTimeValue(row.endTimeRaw);
    const startMinutes = timeStringToMinutes(startTime);
    const endMinutes = timeStringToMinutes(endTime);

    if (!dayOfWeek || !startTime || !endTime || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      issues.push({ rowNumber: row.rowNumber, message: 'Invalid day or time range' });
      return;
    }

    const bucket = upsertBucket(teacherDoc, userDoc);
    bucket.entries.push({
      rowNumber: row.rowNumber,
      dayOfWeek,
      startTime,
      endTime,
      sectionName: row.sectionName,
      subject: row.subject,
      startMinutes,
      endMinutes
    });
  });

  const updates = [];
  buckets.forEach(bucket => {
    const importEntries = bucket.entries || [];
    const existingEntries = (bucket.teacherDoc.timetable || []).map(item => ({
      dayOfWeek: normalizeDayName(item.dayOfWeek),
      startTime: normalizeTimeValue(item.startTime),
      endTime: normalizeTimeValue(item.endTime),
      sectionName: String(item.sectionName || '').trim(),
      subject: String(item.subject || '').trim(),
      rowNumber: 0,
      startMinutes: timeStringToMinutes(item.startTime),
      endMinutes: timeStringToMinutes(item.endTime)
    })).filter(item => item.dayOfWeek && item.startTime && item.endTime && Number.isInteger(item.startMinutes) && Number.isInteger(item.endMinutes));

    for (let i = 0; i < importEntries.length; i += 1) {
      for (let j = i + 1; j < importEntries.length; j += 1) {
        const a = importEntries[i];
        const b = importEntries[j];
        if (a.dayOfWeek !== b.dayOfWeek) continue;
        if (!intervalsOverlap(a.startMinutes, a.endMinutes, b.startMinutes, b.endMinutes)) continue;
        conflicts.push({
          teacherName: bucket.teacherName,
          teacherEmail: bucket.teacherEmail,
          type: 'import_overlap',
          rowNumber: a.rowNumber,
          otherRowNumber: b.rowNumber,
          message: `Rows ${a.rowNumber} and ${b.rowNumber} overlap on ${a.dayOfWeek}`
        });
      }
    }

    if (normalizedMode === 'append') {
      importEntries.forEach(entry => {
        const overlap = existingEntries.find(existing =>
          existing.dayOfWeek === entry.dayOfWeek
          && intervalsOverlap(existing.startMinutes, existing.endMinutes, entry.startMinutes, entry.endMinutes)
        );
        if (overlap) {
          conflicts.push({
            teacherName: bucket.teacherName,
            teacherEmail: bucket.teacherEmail,
            type: 'existing_overlap',
            rowNumber: entry.rowNumber,
            message: `Row ${entry.rowNumber} overlaps existing slot ${overlap.dayOfWeek} ${overlap.startTime}-${overlap.endTime}`
          });
        }
      });
    }

    const mergedSections = [...(bucket.teacherDoc.sections || [])];
    importEntries.forEach(entry => {
      const exists = mergedSections.some(section =>
        String(section.sectionName || '').trim() === entry.sectionName
        && String(section.subject || '').trim().toLowerCase() === entry.subject.toLowerCase()
      );
      if (!exists) {
        mergedSections.push({ sectionName: entry.sectionName, subject: entry.subject });
      }
    });

    const importAsTimetable = importEntries.map(entry => ({
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      sectionName: entry.sectionName,
      subject: entry.subject
    }));
    const nextTimetable = normalizedMode === 'append'
      ? normalizeTeacherTimetable([...(bucket.teacherDoc.timetable || []), ...importAsTimetable], mergedSections)
      : normalizeTeacherTimetable(importAsTimetable, mergedSections);

    updates.push({
      teacherId: bucket.teacherId,
      teacherName: bucket.teacherName,
      teacherEmail: bucket.teacherEmail,
      importedRows: importEntries.length,
      sections: mergedSections,
      timetable: nextTimetable
    });
  });

  return {
    mode: normalizedMode,
    totalRows: parsedRows.length,
    validRows: parsedRows.length - issues.length,
    canApply: parsedRows.length > 0 && issues.length === 0 && conflicts.length === 0,
    issues,
    conflicts,
    updates
  };
}

async function evaluateEscalationRules() {
  const ruleDoc = await EscalationRule.findOne().sort({ updatedAt: -1 });
  const fallback = getDefaultEscalationRule();
  const rule = ruleDoc ? {
    isEnabled: Boolean(ruleDoc.isEnabled),
    threshold: Number(ruleDoc.threshold || 75),
    consecutiveDays: Number(ruleDoc.consecutiveDays || 3),
    minLogs: Number(ruleDoc.minLogs || 3),
    notifyTeacher: Boolean(ruleDoc.notifyTeacher),
    notifyStudent: Boolean(ruleDoc.notifyStudent),
    notifyAdmin: Boolean(ruleDoc.notifyAdmin),
    lastRunAt: ruleDoc.lastRunAt || null
  } : fallback;

  if (!rule.isEnabled) {
    return { ...rule, createdAlerts: 0, skippedAlerts: 0, scannedStudents: 0, disabled: true };
  }

  const threshold = Math.min(100, Math.max(1, Number(rule.threshold) || 75));
  const consecutiveDays = Math.min(30, Math.max(1, Number(rule.consecutiveDays) || 3));
  const minLogs = Math.min(500, Math.max(1, Number(rule.minLogs) || 3));
  const fromDate = moment().startOf('day').subtract(consecutiveDays - 1, 'days').toDate();

  const aggregates = await AttendanceLog.aggregate([
    { $match: { studentID: { $ne: null }, createdAt: { $gte: fromDate } } },
    {
      $group: {
        _id: {
          studentID: '$studentID',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
        },
        dayTotal: { $sum: 1 },
        dayPresent: {
          $sum: {
            $cond: [{ $eq: ['$status', 'Present'] }, 1, 0]
          }
        }
      }
    },
    {
      $group: {
        _id: '$_id.studentID',
        observedDays: { $sum: 1 },
        totalLogs: { $sum: '$dayTotal' },
        totalPresent: { $sum: '$dayPresent' }
      }
    }
  ]);

  const candidates = aggregates.filter(item => {
    const totalLogs = Number(item.totalLogs || 0);
    const attendanceRate = totalLogs ? (Number(item.totalPresent || 0) / totalLogs) * 100 : 0;
    return Number(item.observedDays || 0) >= consecutiveDays && totalLogs >= minLogs && attendanceRate < threshold;
  });

  const studentIds = candidates.map(item => item._id).filter(Boolean);
  if (!studentIds.length) {
    if (ruleDoc) {
      ruleDoc.lastRunAt = new Date();
      ruleDoc.updatedAt = new Date();
      await ruleDoc.save();
    }
    return { ...rule, threshold, consecutiveDays, minLogs, createdAlerts: 0, skippedAlerts: 0, scannedStudents: 0 };
  }

  const [students, users, admins, openAlerts] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }),
    User.find({ role: { $in: ['student', 'teacher', 'admin'] } }).select('name email role'),
    User.find({ role: 'admin' }).select('name email'),
    EscalationAlert.find({
      studentID: { $in: studentIds },
      status: { $in: ['open', 'acknowledged'] },
      createdAt: { $gte: fromDate }
    }).select('studentID')
  ]);

  const sectionsInScope = [...new Set(students.map(student => String(student.section || '').trim()).filter(Boolean))];
  const teacherDocs = sectionsInScope.length
    ? await Teacher.find({ 'sections.sectionName': { $in: sectionsInScope } })
    : [];

  const studentMap = new Map(students.map(student => [String(student._id), student]));
  const userMap = new Map(users.map(user => [String(user._id), user]));
  const openAlertStudentSet = new Set(openAlerts.map(alert => String(alert.studentID)));

  const teacherUserIds = teacherDocs.map(teacher => String(teacher.userId || '')).filter(Boolean);
  const teacherUserMap = new Map(
    users.filter(user => teacherUserIds.includes(String(user._id)))
      .map(user => [String(user._id), user])
  );

  let createdAlerts = 0;
  let skippedAlerts = 0;

  for (const candidate of candidates) {
    const student = studentMap.get(String(candidate._id));
    if (!student) {
      skippedAlerts += 1;
      continue;
    }
    if (openAlertStudentSet.has(String(student._id))) {
      skippedAlerts += 1;
      continue;
    }

    const studentUser = student.userId ? userMap.get(String(student.userId)) : null;
    const totalLogs = Number(candidate.totalLogs || 0);
    const attendanceRate = totalLogs ? Number(((Number(candidate.totalPresent || 0) / totalLogs) * 100).toFixed(2)) : 0;

    const teacher = teacherDocs.find(doc => (doc.sections || []).some(section => section.sectionName === student.section));
    const teacherUser = teacher?.userId ? teacherUserMap.get(String(teacher.userId)) : null;

    const recipients = [];
    if (rule.notifyStudent && studentUser?.email) recipients.push({ email: studentUser.email, label: `student:${studentUser.email}` });
    if (rule.notifyTeacher && teacherUser?.email) recipients.push({ email: teacherUser.email, label: `teacher:${teacherUser.email}` });
    if (rule.notifyAdmin) {
      admins.forEach(admin => {
        if (admin.email) recipients.push({ email: admin.email, label: `admin:${admin.email}` });
      });
    }

    const uniqueRecipients = [...new Map(recipients.map(item => [item.email, item])).values()];
    for (const recipient of uniqueRecipients) {
      await sendEmail(
        recipient.email,
        'AI-ATTEND PRO Escalation Alert',
        `<h3>Attendance Escalation Alert</h3>
         <p>Student: <strong>${studentUser?.name || student.uid}</strong> (${student.uid})</p>
         <p>Section: <strong>${student.section}</strong></p>
         <p>Attendance in last ${consecutiveDays} day(s): <strong>${attendanceRate}%</strong></p>
         <p>Threshold: <strong>${threshold}%</strong></p>`
      );
    }

    await EscalationAlert.create({
      studentID: student._id,
      studentUID: student.uid,
      studentName: studentUser?.name || student.uid,
      studentEmail: studentUser?.email || '',
      section: student.section,
      threshold,
      consecutiveDays,
      attendanceRate,
      teacherID: teacher?._id || null,
      teacherName: teacherUser?.name || '',
      teacherEmail: teacherUser?.email || '',
      status: 'open',
      details: `Auto escalation triggered by rule: below ${threshold}% for ${consecutiveDays} day(s)`,
      notifiedTargets: uniqueRecipients.map(item => item.label),
      triggeredAt: new Date(),
      updatedAt: new Date()
    });
    createdAlerts += 1;
  }

  if (ruleDoc) {
    ruleDoc.lastRunAt = new Date();
    ruleDoc.updatedAt = new Date();
    await ruleDoc.save();
  }

  return {
    ...rule,
    threshold,
    consecutiveDays,
    minLogs,
    createdAlerts,
    skippedAlerts,
    scannedStudents: candidates.length
  };
}

// ==================== EMAIL SERVICE ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
});

function isEmailConfigured() {
  return Boolean(
    process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true'
    && process.env.EMAIL_USER
    && process.env.EMAIL_PASSWORD
    && process.env.EMAIL_USER !== 'your-gmail@gmail.com'
    && process.env.EMAIL_PASSWORD !== 'your-app-specific-password'
  );
}

async function sendEmail(to, subject, html) {
  if (!isEmailConfigured()) {
    return {
      success: false,
      reason: 'Email notifications are disabled or SMTP credentials are not configured in .env'
    };
  }

  try {
    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
    console.log(`ðŸ“§ Email sent to ${to}`);
    return { success: true };
  } catch (err) {
    console.log('âš ï¸ Email service unavailable:', err.message);
    return { success: false, reason: err.message };
  }
}

// ==================== AUTH MIDDLEWARE ====================
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

function getNormalizedRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) || req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const trimmedIp = String(rawIp).trim();

  if (trimmedIp === '::1') {
    return '127.0.0.1';
  }

  if (trimmedIp.startsWith('::ffff:')) {
    return trimmedIp.replace('::ffff:', '');
  }

  return trimmedIp;
}

function isCampusOrAllowedIp(ip) {
  const normalizedIp = ip || '127.0.0.1';
  const allowedEntries = (process.env.ALLOWED_IPS || '127.0.0.1,::1,192.168.,10.,172.16.,172.17.,172.18.,172.19.,172.20.,172.21.,172.22.,172.23.,172.24.,172.25.,172.26.,172.27.,172.28.,172.29.,172.30.,172.31.')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (allowedEntries.some(entry => normalizedIp.startsWith(entry))) {
    return true;
  }

  if (normalizedIp === '127.0.0.1') {
    return true;
  }

  // Fallback for private/local development networks.
  return (
    normalizedIp.startsWith('192.168.') ||
    normalizedIp.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalizedIp)
  );
}

async function logAdminAudit(req, action, targetType, targetId, details = {}) {
  if (!req?.user?.id) return;

  try {
    const actor = await User.findById(req.user.id).select('name');
    await AdminAuditLog.create({
      actorId: req.user.id,
      actorName: actor?.name || 'Admin',
      action,
      targetType,
      targetId: targetId ? String(targetId) : '',
      details
    });
  } catch (err) {
    console.log('Audit log error:', err.message);
  }
}

function markPasswordChange(user, changedBy) {
  if (!user) return;
  user.passwordUpdatedAt = new Date();
  user.passwordUpdatedBy = changedBy;
}

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role, name, uid, section, department } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'Missing fields' });

    const normalizedRole = String(role || '').trim().toLowerCase();
    const normalizedUid = normalizedRole === 'student'
      ? String(uid || '').trim().toUpperCase()
      : '';

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email exists' });
    if (normalizedRole === 'student' && !normalizedUid) {
      return res.status(400).json({ error: 'UID is required for student registration' });
    }
    if (normalizedRole === 'student' && normalizedUid) {
      const uidExists = await Student.findOne({ uid: normalizedUid });
      if (uidExists) return res.status(409).json({ error: 'UID exists' });
    }

    const registrationPassword = normalizedRole === 'student'
      ? DEFAULT_STUDENT_PASSWORD
      : String(password);
    const hash = await bcryptjs.hash(registrationPassword, 10);
    const userPayload = {
      email: email.toLowerCase(),
      password: hash,
      role: normalizedRole,
      name,
      department
    };
    if (normalizedRole === 'student' && normalizedUid) {
      userPayload.username = normalizedUid;
    }

    const user = new User(userPayload);
    await user.save();

    if (normalizedRole === 'student') {
      await ensureStudentProfileForUser(user._id, {
        uid: normalizedUid || undefined,
        section,
        department
      });
    }
    if (normalizedRole === 'teacher') {
      await Teacher.create({ userId: user._id });
    }

    const token = jwt.sign({ id: user._id, role: normalizedRole },  process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });
    res.status(201).json({ token, user: { id: user._id, role: normalizedRole, name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, uid, role, identifier } = req.body;
    const normalizedRole = String(role || '').trim().toLowerCase();
    const rawIdentifier = String(uid || identifier || email || '').trim();

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    let user = null;

    if (normalizedRole === 'student') {
      const normalizedUid = rawIdentifier.toUpperCase();
      if (normalizedUid === String(TEST_ACCOUNT_CONFIG.student.uid || '').toUpperCase()) {
        await ensureTestUser('student');
      }

      const student = await Student.findOne({ uid: normalizedUid }).select('userId uid');
      if (!student?.userId) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      user = await User.findById(student.userId);
      if (!user || user.role !== 'student') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else {
      const normalizedEmail = rawIdentifier.toLowerCase();
      const matchedRole = Object.keys(TEST_ACCOUNT_CONFIG).find(roleName =>
        TEST_ACCOUNT_CONFIG[roleName]?.email?.toLowerCase() === normalizedEmail
      );
      if (matchedRole) {
        await ensureTestUser(matchedRole);
      }

      user = await User.findOne({ email: normalizedEmail });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      if (normalizedRole && user.role !== normalizedRole) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    const match = await bcryptjs.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    if (isDemoAccount(user.email, user.role)) {
      await ensureTestUser(user.role);
    }
    if (user.role === 'student') {
      const studentProfile = await ensureStudentProfileForUser(user._id);
      if (studentProfile?.uid && user.username !== studentProfile.uid) {
        user.username = studentProfile.uid;
        await user.save();
      }
    }

    await User.updateOne({ _id: user._id }, { lastLogin: new Date() });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, role: user.role, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEST LOGIN (BYPASS) ====================
app.post('/api/auth/test-login', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await ensureTestUser(role);
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, role: user.role, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ADMIN ROUTES ====================
app.post('/api/admin/register-student', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const { email, name, uid, section, department } = req.body;
    if (!email || !name || !uid) return res.status(400).json({ error: 'Missing fields' });

    const normalizedUid = String(uid || '').trim().toUpperCase();
    const exists = await Student.findOne({ uid: normalizedUid });
    if (exists) return res.status(409).json({ error: 'UID exists' });

    const pass = DEFAULT_STUDENT_PASSWORD;
    const hash = await bcryptjs.hash(pass, 10);
    
    const user = new User({
      email: email.toLowerCase(),
      username: normalizedUid,
      password: hash,
      role: 'student',
      name,
      department
    });
    await user.save();

    const student = new Student({ userId: user._id, uid: normalizedUid, section, department });
    await student.save();

    sendEmail(email, 'AI-ATTEND PRO Login', `<h2>Welcome ${name}!</h2><p>Password: <strong>${pass}</strong></p>`);
    await logAdminAudit(req, 'student.registered', 'student', student._id, { uid: normalizedUid, email, section, department });
    res.status(201).json({ message: 'Student registered', defaultPassword: DEFAULT_STUDENT_PASSWORD });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const stats = {
      totalStudents: await Student.countDocuments(),
      totalTeachers: await Teacher.countDocuments(),
      totalSessions: await Session.countDocuments(),
      activeSessions: await Session.countDocuments({ isActive: true }),
      totalRecords: await AttendanceLog.countDocuments(),
      pendingReferrals: await ShortageReferral.countDocuments({ status: 'pending' })
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/system-status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const [dbState, activeSessions, latestAnnouncement, lastAudit] = await Promise.all([
      mongoose.connection.readyState,
      Session.countDocuments({ isActive: true }),
      AdminAnnouncement.findOne().sort({ createdAt: -1 }).select('title priority createdAt'),
      AdminAuditLog.findOne().sort({ createdAt: -1 }).select('action actorName createdAt')
    ]);

    res.json({
      apiStatus: 'OK',
      databaseStatus: dbState === 1 ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      activeSessions,
      emailConfigured: isEmailConfigured(),
      latestAnnouncement,
      latestAudit: lastAudit,
      serverTime: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/master-logs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const logs = await AttendanceLog.find().sort({ createdAt: -1 }).limit(1000);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/teachers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const teachers = await Teacher.find().sort({ createdAt: -1 }).limit(200);
    const users = await User.find({
      _id: { $in: teachers.map(teacher => teacher.userId).filter(Boolean) }
    }).select('name email isActive department phone passwordUpdatedAt passwordUpdatedBy');
    const userMap = new Map(users.map(user => [user._id.toString(), user]));

    const data = teachers.map(teacher => {
      const linkedUser = teacher.userId ? userMap.get(teacher.userId.toString()) : null;
      return {
        _id: teacher._id,
        userId: linkedUser?._id || null,
        name: linkedUser?.name || 'Teacher',
        email: linkedUser?.email || '',
        department: linkedUser?.department || '',
        phone: linkedUser?.phone || '',
        passwordUpdatedAt: linkedUser?.passwordUpdatedAt || null,
        passwordUpdatedBy: linkedUser?.passwordUpdatedBy || 'system',
        isActive: linkedUser?.isActive ?? true,
        employeeID: teacher.employeeID || '',
        qualification: teacher.qualification || '',
        totalSessions: teacher.totalSessions || 0,
        sections: teacher.sections || [],
        sectionsText: (teacher.sections || []).map(item => `${item.sectionName}:${item.subject}`).join('\n'),
        timetable: teacher.timetable || [],
        timetableText: (teacher.timetable || [])
          .map(item => `${item.dayOfWeek},${item.startTime},${item.endTime},${item.sectionName},${item.subject}`)
          .join('\n')
      };
    });

    res.json({ teachers: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/teachers/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    const linkedUser = teacher.userId ? await User.findById(teacher.userId) : null;
    const {
      name,
      email,
      department,
      phone,
      employeeID,
      qualification,
      sectionsText,
      timetableText,
      newPassword,
      isActive
    } = req.body;

    if (linkedUser) {
      if (typeof name === 'string') {
        const normalizedName = name.trim();
        if (!normalizedName) {
          return res.status(400).json({ error: 'Name is required' });
        }
        linkedUser.name = normalizedName;
      }
      if (typeof department === 'string') {
        linkedUser.department = department.trim();
      }
      if (typeof phone === 'string') {
        linkedUser.phone = phone.trim();
      }
      if (typeof newPassword === 'string' && newPassword.trim()) {
        if (newPassword.trim().length < 6) {
          return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        linkedUser.password = await bcryptjs.hash(newPassword.trim(), 10);
        markPasswordChange(linkedUser, 'admin');
      }
      if (typeof email === 'string') {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
          return res.status(400).json({ error: 'Email is required' });
        }
        const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: linkedUser._id } });
        if (existingEmail) {
          return res.status(409).json({ error: 'Email already exists' });
        }
        linkedUser.email = normalizedEmail;
      }
    }

    if (typeof employeeID === 'string') {
      teacher.employeeID = employeeID.trim();
    }
    if (typeof qualification === 'string') {
      teacher.qualification = qualification.trim();
    }
    if (typeof sectionsText === 'string') {
      teacher.sections = parseTeacherSectionsInput(sectionsText);
    }
    if (typeof timetableText === 'string') {
      teacher.timetable = parseTeacherTimetableInput(timetableText, teacher.sections || []);
    } else if (typeof sectionsText === 'string') {
      teacher.timetable = normalizeTeacherTimetable(teacher.timetable || [], teacher.sections || []);
    }
    await teacher.save();

    if (linkedUser) {
      if (typeof isActive === 'boolean') {
        linkedUser.isActive = isActive;
      }
      await linkedUser.save();
    }

    await logAdminAudit(req, 'teacher.updated', 'teacher', teacher._id, {
      name: linkedUser?.name || '',
      email: linkedUser?.email || '',
      department: linkedUser?.department || '',
      phone: linkedUser?.phone || '',
      employeeID: teacher.employeeID,
      qualification: teacher.qualification,
      sectionCount: teacher.sections.length,
      timetableCount: teacher.timetable?.length || 0,
      passwordReset: Boolean(typeof newPassword === 'string' && newPassword.trim()),
      isActive
    });

    res.json({ message: 'Teacher updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/teachers/:id/password', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    if (!teacher.userId) return res.status(404).json({ error: 'Linked teacher user not found' });

    const linkedUser = await User.findById(teacher.userId);
    if (!linkedUser) return res.status(404).json({ error: 'Linked teacher user not found' });

    const { newPassword } = req.body;
    const normalizedPassword = String(newPassword || '').trim();
    if (!normalizedPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }
    if (normalizedPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    linkedUser.password = await bcryptjs.hash(normalizedPassword, 10);
    markPasswordChange(linkedUser, 'admin');
    await linkedUser.save();

    await logAdminAudit(req, 'teacher.password_reset', 'teacher', teacher._id, {
      email: linkedUser.email
    });

    res.json({
      message: 'Teacher password updated successfully',
      passwordUpdatedAt: linkedUser.passwordUpdatedAt,
      passwordUpdatedBy: linkedUser.passwordUpdatedBy
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/register-teacher', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const {
      name,
      email,
      department = '',
      phone = '',
      employeeID = '',
      qualification = '',
      sectionsText = '',
      timetableText = '',
      password = ''
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ error: 'Email already exists' });

    const generatedPassword = password?.trim() || Math.random().toString(36).slice(-10);
    const hash = await bcryptjs.hash(generatedPassword, 10);

    const sections = parseTeacherSectionsInput(sectionsText);
    const timetable = parseTeacherTimetableInput(timetableText, sections);

    const user = await User.create({
      email: normalizedEmail,
      password: hash,
      role: 'teacher',
      name: String(name).trim(),
      department: String(department || '').trim(),
      phone: String(phone || '').trim(),
      passwordUpdatedAt: new Date(),
      passwordUpdatedBy: 'admin'
    });

    const teacher = await Teacher.create({
      userId: user._id,
      employeeID: String(employeeID || '').trim(),
      qualification: String(qualification || '').trim(),
      sections,
      timetable
    });

    const mailResult = await sendEmail(
      normalizedEmail,
      'AI-ATTEND PRO Teacher Account',
      `<h3>Welcome ${user.name}</h3><p>Your teacher account is ready.</p><p>Email: <strong>${normalizedEmail}</strong></p><p>Password: <strong>${generatedPassword}</strong></p>`
    );

    await logAdminAudit(req, 'teacher.created', 'teacher', teacher._id, {
      name: user.name,
      email: user.email,
      department: user.department,
      phone: user.phone,
      sectionCount: sections.length,
      timetableCount: timetable.length
    });

    res.status(201).json({
      message: 'Teacher account created',
      teacherId: teacher._id,
      emailSent: mailResult.success,
      temporaryPassword: generatedPassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/students', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const { search = '', section = '', department = '' } = req.query;
    const studentFilter = {};
    if (section) {
      studentFilter.section = new RegExp(`^${section.trim()}$`, 'i');
    }
    if (department) {
      studentFilter.department = new RegExp(`^${department.trim()}$`, 'i');
    }
    if (search) {
      studentFilter.uid = new RegExp(search.trim(), 'i');
    }

    const students = await Student.find(studentFilter).sort({ uid: 1 }).limit(300);
    const userIds = students.map(student => student.userId).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).select('name email isActive');
    const userMap = new Map(users.map(user => [user._id.toString(), user]));

    const filteredStudents = students
      .map(student => {
        const linkedUser = student.userId ? userMap.get(student.userId.toString()) : null;
        const attendancePercentage = student.totalClasses > 0
          ? Number(((student.totalAttendance / student.totalClasses) * 100).toFixed(2))
          : 0;

        return {
          _id: student._id,
          uid: student.uid,
          name: linkedUser?.name || student.uid,
          email: linkedUser?.email || '',
          isActive: linkedUser?.isActive ?? true,
          section: student.section || '-',
          department: student.department || '-',
          semester: student.semester || '-',
          totalClasses: student.totalClasses || 0,
          totalAttendance: student.totalAttendance || 0,
          totalAbsent: Math.max(0, (student.totalClasses || 0) - (student.totalAttendance || 0)),
          attendancePercentage,
          createdAt: student.createdAt
        };
      })
      .filter(student => {
        if (!search) return true;
        const term = search.trim().toLowerCase();
        return (
          student.uid.toLowerCase().includes(term) ||
          student.name.toLowerCase().includes(term) ||
          student.email.toLowerCase().includes(term)
        );
      });

    res.json({ students: filteredStudents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/student-sections', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const sections = await Student.aggregate([
      {
        $match: {
          section: { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$section',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      sections: sections.map(item => ({
        section: item._id,
        count: item.count
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/students/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const { section, department, semester, isActive } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (typeof section === 'string' && section.trim()) {
      student.section = section.trim();
    }
    if (typeof department === 'string' && department.trim()) {
      student.department = department.trim();
    }
    if (semester !== undefined && semester !== null && semester !== '') {
      student.semester = Number(semester);
    }
    await student.save();

    if (typeof isActive === 'boolean' && student.userId) {
      await User.findByIdAndUpdate(student.userId, { isActive });
    }

    await logAdminAudit(req, 'student.updated', 'student', student._id, {
      section: student.section,
      department: student.department,
      semester: student.semester,
      isActive
    });

    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/export-excel', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const logs = await AttendanceLog.find();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');

    ws.columns = [
      { header: 'UID', key: 'studentUID' },
      { header: 'Name', key: 'studentName' },
      { header: 'Section', key: 'section' },
      { header: 'Subject', key: 'subject' },
      { header: 'Status', key: 'status' },
      { header: 'Date', key: 'markedTime' }
    ];

    logs.forEach(log => {
      ws.addRow({
        studentUID: log.studentUID,
        studentName: log.studentName,
        section: log.section,
        subject: log.subject,
        status: log.status,
        markedTime: moment(log.markedTime).format('YYYY-MM-DD HH:mm:ss')
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.xlsx"');
    await wb.xlsx.write(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/clear-logs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const result = await AttendanceLog.deleteMany({});
    await logAdminAudit(req, 'attendance.logs_cleared', 'attendance', 'all', { deletedCount: result.deletedCount || 0 });
    res.json({ message: 'Logs cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/recent-sessions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    await closeExpiredSessions();

    const sessions = await Session.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('code teacherName section subject startTime endedAt isActive totalPresent totalAbsent enrolledStudents createdAt endedByName endedByRole endedReason');

    const data = sessions.map(session => {
      const totalStudents = session.enrolledStudents?.length || 0;
      const attendanceRate = totalStudents
        ? Number(((session.totalPresent / totalStudents) * 100).toFixed(2))
        : 0;

      return {
        _id: session._id,
        code: session.code,
        teacherName: session.teacherName || 'Unknown',
        section: session.section || '-',
        subject: session.subject || '-',
        startTime: session.startTime,
        endedAt: session.endedAt,
        endedByName: session.endedByName || '',
        endedByRole: session.endedByRole || '',
        endedReason: session.endedReason || '',
        isActive: session.isActive,
        totalPresent: session.totalPresent || 0,
        totalAbsent: session.totalAbsent || 0,
        totalStudents,
        attendanceRate
      };
    });

    res.json({ sessions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/recent-sessions/:id/complete', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!session.isActive) return res.status(400).json({ error: 'Session is already completed' });
    const actor = await User.findById(req.user.id).select('name');

    session.isActive = false;
    session.endedAt = new Date();
    session.endedByUserID = req.user.id;
    session.endedByRole = 'admin';
    session.endedByName = actor?.name || 'Admin';
    session.endedReason = 'manual_admin';
    await session.save();

    if (session.teacherID) {
      await Teacher.findByIdAndUpdate(session.teacherID, { $inc: { totalSessions: 1 } });
    }

    io.to(`session-${session.code}`).emit('session-ended');
    await logAdminAudit(req, 'session.completed_by_admin', 'session', session._id, {
      code: session.code,
      teacherName: session.teacherName || 'Unknown'
    });

    res.json({ message: 'Session marked as completed', sessionId: session._id, code: session.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/announcements', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const announcements = await AdminAnnouncement.find().sort({ createdAt: -1 }).limit(50);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildAnnouncementFiltersForRole(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!['teacher', 'student'].includes(normalizedRole)) {
    return null;
  }

  const now = new Date();
  return {
    isActive: true,
    targetRole: { $in: ['all', normalizedRole] },
    $and: [
      { $or: [{ publishAt: null }, { publishAt: { $exists: false } }, { publishAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] }
    ]
  };
}

async function fetchAnnouncementsForRole(role, limit = 20) {
  const filters = buildAnnouncementFiltersForRole(role);
  if (!filters) return [];
  return AdminAnnouncement.find(filters).sort({ createdAt: -1 }).limit(limit);
}

app.get('/api/teacher/announcements', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Unauthorized' });
    const announcements = await fetchAnnouncementsForRole('teacher', 20);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/student/announcements', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Unauthorized' });
    const announcements = await fetchAnnouncementsForRole('student', 20);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const role = String(req.user.role || '').trim().toLowerCase();
    if (!['teacher', 'student', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const announcements = role === 'admin'
      ? await AdminAnnouncement.find({}).sort({ createdAt: -1 }).limit(20)
      : await fetchAnnouncementsForRole(role, 20);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/announcements', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const {
      title,
      message,
      targetRole = 'all',
      priority = 'normal',
      isActive = true,
      publishAt = '',
      expiresAt = ''
    } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

    const normalizedTargetRole = String(targetRole || '').trim().toLowerCase();
    if (!['all', 'teacher', 'student'].includes(normalizedTargetRole)) {
      return res.status(400).json({ error: 'Invalid announcement audience' });
    }

    const normalizedPriority = String(priority || 'normal').trim().toLowerCase();
    if (!['normal', 'high', 'critical'].includes(normalizedPriority)) {
      return res.status(400).json({ error: 'Invalid announcement priority' });
    }

    const normalizedPublishAt = publishAt ? new Date(publishAt) : null;
    const normalizedExpiresAt = expiresAt ? new Date(expiresAt) : null;

    if (normalizedPublishAt && Number.isNaN(normalizedPublishAt.getTime())) {
      return res.status(400).json({ error: 'Invalid publish date/time' });
    }
    if (normalizedExpiresAt && Number.isNaN(normalizedExpiresAt.getTime())) {
      return res.status(400).json({ error: 'Invalid expiry date/time' });
    }
    if (normalizedPublishAt && normalizedExpiresAt && normalizedExpiresAt <= normalizedPublishAt) {
      return res.status(400).json({ error: 'Expiry must be later than publish time' });
    }

    const actor = await User.findById(req.user.id).select('name');
    const announcement = await AdminAnnouncement.create({
      title: title.trim(),
      message: message.trim(),
      targetRole: normalizedTargetRole,
      priority: normalizedPriority,
      isActive: Boolean(isActive),
      publishAt: normalizedPublishAt,
      expiresAt: normalizedExpiresAt,
      createdBy: req.user.id,
      createdByName: actor?.name || 'Admin'
    });

    await logAdminAudit(req, 'announcement.created', 'announcement', announcement._id, {
      title: announcement.title,
      targetRole: announcement.targetRole,
      priority: announcement.priority,
      publishAt: announcement.publishAt || null,
      expiresAt: announcement.expiresAt || null
    });

    res.status(201).json({ message: 'Announcement published', announcement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function handleDeleteAnnouncement(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid announcement id' });
    }

    const announcement = await AdminAnnouncement.findByIdAndDelete(id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    await logAdminAudit(req, 'announcement.deleted', 'announcement', announcement._id, {
      title: announcement.title,
      targetRole: announcement.targetRole,
      priority: announcement.priority,
      isActive: announcement.isActive
    });

    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.delete('/api/admin/announcements/:id', authenticateToken, handleDeleteAnnouncement);
app.post('/api/admin/announcements/:id/delete', authenticateToken, handleDeleteAnnouncement);

app.get('/api/admin/audit-logs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const {
      action = '',
      actor = '',
      from = '',
      to = '',
      limit = '100'
    } = req.query;

    const filter = {};
    if (String(action).trim()) {
      filter.action = { $regex: String(action).trim(), $options: 'i' };
    }
    if (String(actor).trim()) {
      filter.actorName = { $regex: String(actor).trim(), $options: 'i' };
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid to date' });
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const normalizedLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 100));
    const logs = await AdminAuditLog.find(filter).sort({ createdAt: -1 }).limit(normalizedLimit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/audit-logs/export', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const {
      action = '',
      actor = '',
      from = '',
      to = '',
      format = 'xlsx'
    } = req.query;

    const filter = {};
    if (String(action).trim()) {
      filter.action = { $regex: String(action).trim(), $options: 'i' };
    }
    if (String(actor).trim()) {
      filter.actorName = { $regex: String(actor).trim(), $options: 'i' };
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid to date' });
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const logs = await AdminAuditLog.find(filter).sort({ createdAt: -1 }).limit(5000);

    if (String(format).toLowerCase() === 'csv') {
      const escapeCSV = (value) => {
        const text = String(value ?? '');
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const rows = [
        ['Time', 'Actor', 'Action', 'Target Type', 'Target Id', 'Details']
      ];
      logs.forEach(log => {
        rows.push([
          moment(log.createdAt).format('YYYY-MM-DD HH:mm:ss'),
          log.actorName || 'Admin',
          log.action || '',
          log.targetType || '',
          log.targetId || '',
          JSON.stringify(log.details || {})
        ]);
      });

      const csv = rows.map(row => row.map(escapeCSV).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="admin-audit-logs.csv"');
      return res.send(csv);
    }

    if (String(format).toLowerCase() === 'pdf') {
      const lines = [
        `Admin Audit Logs Export - ${moment().format('YYYY-MM-DD HH:mm:ss')}`,
        `Filters: action="${String(action || '').trim() || '*'}" actor="${String(actor || '').trim() || '*'}"`,
        `Date Range: ${from ? moment(from).format('YYYY-MM-DD HH:mm') : '-'} to ${to ? moment(to).format('YYYY-MM-DD HH:mm') : '-'}`,
        `Rows: ${logs.length}`,
        '------------------------------------------------------------'
      ];
      logs.slice(0, 40).forEach(log => {
        lines.push(
          `${moment(log.createdAt).format('YYYY-MM-DD HH:mm:ss')} | ${log.actorName || 'Admin'} | ${log.action || '-'}`
        );
        lines.push(`Target: ${log.targetType || '-'} ${log.targetId || ''}`);
        lines.push(`Details: ${JSON.stringify(log.details || {})}`);
        lines.push('');
      });
      if (logs.length > 40) {
        lines.push(`... truncated ${logs.length - 40} more rows`);
      }

      const pdfBuffer = buildSimplePdfBuffer(lines);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="admin-audit-logs.pdf"');
      return res.send(pdfBuffer);
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Audit Logs');
    ws.columns = [
      { header: 'Time', key: 'time', width: 22 },
      { header: 'Actor', key: 'actor', width: 24 },
      { header: 'Action', key: 'action', width: 32 },
      { header: 'Target Type', key: 'targetType', width: 18 },
      { header: 'Target Id', key: 'targetId', width: 30 },
      { header: 'Details', key: 'details', width: 70 }
    ];
    logs.forEach(log => {
      ws.addRow({
        time: moment(log.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        actor: log.actorName || 'Admin',
        action: log.action || '',
        targetType: log.targetType || '',
        targetId: log.targetId || '',
        details: JSON.stringify(log.details || {})
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="admin-audit-logs.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/attendance-policy', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const policyDoc = await AttendancePolicy.findOne().sort({ updatedAt: -1 });
    const policy = policyDoc ? policyDoc.toObject() : getDefaultAttendancePolicy();
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/attendance-policy', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const actor = await User.findById(req.user.id).select('name');
    const payload = req.body || {};
    const examModeEnabled = Boolean(payload.examModeEnabled);
    const allowAdminOverride = payload.allowAdminOverride !== false;
    const overrideReasonRequired = payload.overrideReasonRequired !== false;
    const cutoffRaw = String(payload.attendanceEditCutoff || '').trim();
    const attendanceEditCutoff = cutoffRaw ? new Date(cutoffRaw) : null;

    if (attendanceEditCutoff && Number.isNaN(attendanceEditCutoff.getTime())) {
      return res.status(400).json({ error: 'Invalid attendance edit cutoff date/time' });
    }

    let policyDoc = await AttendancePolicy.findOne();
    if (!policyDoc) {
      policyDoc = new AttendancePolicy();
    }

    policyDoc.examModeEnabled = examModeEnabled;
    policyDoc.attendanceEditCutoff = attendanceEditCutoff;
    policyDoc.allowAdminOverride = allowAdminOverride;
    policyDoc.overrideReasonRequired = overrideReasonRequired;
    policyDoc.updatedBy = req.user.id;
    policyDoc.updatedByName = actor?.name || 'Admin';
    policyDoc.updatedAt = new Date();
    await policyDoc.save();

    await logAdminAudit(req, 'attendance_policy.updated', 'attendance_policy', policyDoc._id, {
      examModeEnabled,
      attendanceEditCutoff,
      allowAdminOverride,
      overrideReasonRequired
    });

    res.json({ message: 'Attendance policy updated', policy: policyDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/timetable-import/preview', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { csvText = '', mode = 'replace' } = req.body || {};
    const preview = await buildTimetableImportPreview({ csvText, mode });
    res.json({ preview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/timetable-import/apply', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { csvText = '', mode = 'replace' } = req.body || {};
    const preview = await buildTimetableImportPreview({ csvText, mode });
    if (!preview.canApply) {
      return res.status(409).json({
        error: 'Cannot apply timetable import until all issues/conflicts are resolved',
        preview
      });
    }

    let updatedTeachers = 0;
    for (const update of preview.updates || []) {
      const teacher = await Teacher.findById(update.teacherId);
      if (!teacher) continue;
      teacher.sections = update.sections || teacher.sections;
      teacher.timetable = update.timetable || [];
      await teacher.save();
      updatedTeachers += 1;
    }

    await logAdminAudit(req, 'timetable_import.applied', 'teacher_timetable', null, {
      mode: preview.mode,
      rows: preview.totalRows,
      updatedTeachers
    });

    res.json({
      message: `Timetable import applied for ${updatedTeachers} teacher(s)`,
      updatedTeachers,
      mode: preview.mode
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/escalation-rules', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const doc = await EscalationRule.findOne().sort({ updatedAt: -1 });
    const rule = doc ? doc.toObject() : getDefaultEscalationRule();
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/escalation-rules', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const payload = req.body || {};
    const sanitized = {
      isEnabled: Boolean(payload.isEnabled),
      threshold: Math.min(100, Math.max(1, Number.parseInt(payload.threshold, 10) || 75)),
      consecutiveDays: Math.min(30, Math.max(1, Number.parseInt(payload.consecutiveDays, 10) || 3)),
      minLogs: Math.min(500, Math.max(1, Number.parseInt(payload.minLogs, 10) || 3)),
      notifyTeacher: payload.notifyTeacher !== false,
      notifyStudent: payload.notifyStudent !== false,
      notifyAdmin: payload.notifyAdmin !== false,
      updatedAt: new Date()
    };

    const rule = await EscalationRule.findOneAndUpdate(
      {},
      { $set: sanitized },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAdminAudit(req, 'escalation_rule.updated', 'escalation_rule', rule._id, sanitized);
    res.json({ message: 'Escalation rule updated', rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/escalation-rules/run', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const result = await evaluateEscalationRules();
    await logAdminAudit(req, 'escalation_rule.executed', 'escalation_rule', null, result);
    res.json({
      message: result.disabled
        ? 'Escalation engine is disabled in current rule settings'
        : `Escalation run completed. Created ${result.createdAlerts} alert(s)`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/escalation-alerts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const status = String(req.query.status || '').trim();
    const filter = {};
    if (['open', 'acknowledged', 'resolved'].includes(status)) {
      filter.status = status;
    }
    const alerts = await EscalationAlert.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/escalation-alerts/:id/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const status = String(req.body?.status || '').trim();
    if (!['acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Status must be acknowledged or resolved' });
    }

    const alertDoc = await EscalationAlert.findById(req.params.id);
    if (!alertDoc) return res.status(404).json({ error: 'Escalation alert not found' });
    alertDoc.status = status;
    alertDoc.updatedAt = new Date();
    await alertDoc.save();

    await logAdminAudit(req, 'escalation_alert.updated', 'escalation_alert', alertDoc._id, { status });
    res.json({ message: 'Escalation alert updated', alert: alertDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/correction-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const status = String(req.query.status || '').trim();
    const filter = {};
    if (['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }
    const requests = await AttendanceCorrectionRequest.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/correction-requests/:id/decision', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const {
      decision,
      adminComment = '',
      adminOverride = false,
      overrideReason = ''
    } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }

    const request = await AttendanceCorrectionRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Correction request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${request.status}` });
    }

    let applyResult = null;
    if (decision === 'approved') {
      applyResult = await applyApprovedCorrection(request, {
        adminOverride: Boolean(adminOverride),
        overrideReason: String(overrideReason || '').trim()
      });
      if (!applyResult?.applied) {
        return res.status(423).json({ error: applyResult?.reason || 'Unable to apply correction update' });
      }
    }

    const actor = await User.findById(req.user.id).select('name');
    request.status = decision;
    request.adminComment = String(adminComment || '').trim();
    request.decidedBy = req.user.id;
    request.decidedByName = actor?.name || 'Admin';
    request.decidedAt = new Date();
    request.updatedAt = new Date();
    await request.save();

    await logAdminAudit(req, `correction.${decision}`, 'correction_request', request._id, {
      sessionCode: request.sessionCode,
      studentUID: request.studentUID,
      requestedStatus: request.requestedStatus,
      applyResult,
      adminOverride: Boolean(adminOverride),
      overrideReason: String(overrideReason || '').trim()
    });

    res.json({ message: `Correction request ${decision}`, request, applyResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/disputes', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    await reconcilePendingDisputesOwnership();
    const status = String(req.query.status || '').trim();
    const filter = {};
    if (status) filter.status = status;
    const disputes = await AttendanceDispute.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ disputes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/disputes/:id/decision', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { decision, adminComment = '' } = req.body;
    if (!['resolved_admin', 'rejected_admin'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be resolved_admin or rejected_admin' });
    }

    const dispute = await AttendanceDispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (!['pending_teacher', 'escalated_admin'].includes(dispute.status)) {
      return res.status(400).json({ error: `Dispute is already closed as ${dispute.status}` });
    }

    const actor = await User.findById(req.user.id).select('name');
    dispute.status = decision;
    dispute.adminComment = String(adminComment || '').trim();
    dispute.resolvedBy = req.user.id;
    dispute.resolvedByName = actor?.name || 'Admin';
    dispute.resolvedAt = new Date();
    dispute.updatedAt = new Date();
    await dispute.save();

    await logAdminAudit(req, `dispute.${decision}`, 'attendance_dispute', dispute._id, {
      sessionCode: dispute.sessionCode,
      studentUID: dispute.studentUID
    });

    res.json({ message: `Dispute marked as ${decision}`, dispute });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/substitute-handovers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const {
      fromTeacherId,
      toTeacherId,
      section,
      subject,
      dayOfWeek,
      startTime,
      endTime,
      effectiveFrom,
      effectiveTo,
      note = ''
    } = req.body;

    if (!fromTeacherId || !toTeacherId || !section || !subject || !dayOfWeek || !startTime || !endTime || !effectiveFrom || !effectiveTo) {
      return res.status(400).json({ error: 'Missing handover fields' });
    }
    if (String(fromTeacherId) === String(toTeacherId)) {
      return res.status(400).json({ error: 'From and substitute teacher cannot be same' });
    }

    const fromTeacher = await Teacher.findById(fromTeacherId);
    const toTeacher = await Teacher.findById(toTeacherId);
    if (!fromTeacher || !toTeacher) return res.status(404).json({ error: 'Teacher not found' });

    const [fromUser, toUser, adminUser] = await Promise.all([
      User.findById(fromTeacher.userId).select('name'),
      User.findById(toTeacher.userId).select('name'),
      User.findById(req.user.id).select('name')
    ]);

    const startDate = new Date(effectiveFrom);
    const endDate = new Date(effectiveTo);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid effective dates' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'Effective end date must be after start date' });
    }

    const conflict = await SubstituteHandover.findOne({
      toTeacherID: toTeacher._id,
      section: String(section).trim(),
      subject: String(subject).trim(),
      dayOfWeek: String(dayOfWeek).trim(),
      status: 'active',
      teacherDecision: { $ne: 'rejected' },
      $or: [
        {
          effectiveFrom: { $lte: endDate },
          effectiveTo: { $gte: startDate }
        }
      ]
    });
    if (conflict) {
      return res.status(409).json({ error: 'Conflict: substitute assignment overlaps an existing active handover' });
    }

    const handover = await SubstituteHandover.create({
      fromTeacherID: fromTeacher._id,
      fromTeacherName: fromUser?.name || 'Teacher',
      toTeacherID: toTeacher._id,
      toTeacherName: toUser?.name || 'Teacher',
      section: String(section).trim(),
      subject: String(subject).trim(),
      dayOfWeek: String(dayOfWeek).trim(),
      startTime: String(startTime).trim(),
      endTime: String(endTime).trim(),
      effectiveFrom: startDate,
      effectiveTo: endDate,
      note: String(note || '').trim(),
      requestSource: 'admin',
      teacherDecision: 'pending',
      status: 'active',
      createdBy: req.user.id,
      createdByName: adminUser?.name || 'Admin'
    });

    await logAdminAudit(req, 'handover.created', 'substitute_handover', handover._id, {
      fromTeacherName: handover.fromTeacherName,
      toTeacherName: handover.toTeacherName,
      section: handover.section,
      subject: handover.subject,
      dayOfWeek: handover.dayOfWeek
    });

    res.status(201).json({ message: 'Substitute handover assigned', handover });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/substitute-handovers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const status = String(req.query.status || '').trim();
    const baseFilter = {};
    if (['active', 'cancelled'].includes(status)) {
      baseFilter.status = status;
    }
    const handovers = await SubstituteHandover.find(baseFilter).sort({ createdAt: -1 }).limit(500);

    const mapped = handovers.map(item => {
      const decision = item.teacherDecision || 'pending';
      let workflowStatus = 'active';
      if (item.status === 'cancelled') {
        workflowStatus = decision === 'rejected' ? 'rejected' : 'cancelled';
      } else if (decision === 'pending') {
        workflowStatus = 'pending';
      } else if (decision === 'accepted') {
        if (item.substituteAttendanceCompletedAt) workflowStatus = 'completed';
        else if (item.substituteAttendanceStartedAt) workflowStatus = 'in_progress';
        else workflowStatus = 'accepted';
      } else if (decision === 'rejected') {
        workflowStatus = 'rejected';
      }

      let workflowMessage = '';
      if (workflowStatus === 'pending') {
        workflowMessage = 'Waiting for substitute teacher decision';
      } else if (workflowStatus === 'accepted') {
        workflowMessage = `Accepted by ${item.teacherDecisionByName || item.toTeacherName || 'Teacher'}`;
      } else if (workflowStatus === 'in_progress') {
        workflowMessage = `Attendance in progress by ${item.substituteAttendanceByName || item.toTeacherName || 'Substitute teacher'}`;
      } else if (workflowStatus === 'completed') {
        workflowMessage = `Attendance marked by ${item.substituteAttendanceByName || item.toTeacherName || 'Substitute teacher'}`;
      } else if (workflowStatus === 'rejected') {
        workflowMessage = `Rejected by ${item.teacherDecisionByName || item.toTeacherName || 'Teacher'}`;
      }

      return {
        ...item.toObject(),
        workflowStatus,
        workflowMessage
      };
    });

    const filtered = ['pending', 'accepted', 'in_progress', 'completed', 'rejected'].includes(status)
      ? mapped.filter(item => item.workflowStatus === status)
      : mapped;

    res.json({ handovers: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/substitute-handovers/:id/cancel', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const handover = await SubstituteHandover.findById(req.params.id);
    if (!handover) return res.status(404).json({ error: 'Handover not found' });

    handover.status = 'cancelled';
    handover.updatedAt = new Date();
    await handover.save();

    await logAdminAudit(req, 'handover.cancelled', 'substitute_handover', handover._id, {
      section: handover.section,
      subject: handover.subject
    });

    res.json({ message: 'Handover cancelled', handover });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/defaulter-intelligence', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const weeks = Math.min(12, Math.max(1, Number.parseInt(req.query.weeks, 10) || 8));
    const threshold = Math.min(100, Math.max(1, Number.parseInt(req.query.threshold, 10) || 75));
    const fromDate = moment().startOf('isoWeek').subtract(weeks - 1, 'weeks').toDate();

    const weekly = await AttendanceLog.aggregate([
      { $match: { createdAt: { $gte: fromDate } } },
      {
        $group: {
          _id: {
            year: { $isoWeekYear: '$createdAt' },
            week: { $isoWeek: '$createdAt' },
            section: '$section',
            subject: '$subject'
          },
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Present'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.week': -1, '_id.section': 1, '_id.subject': 1 } },
      { $limit: 500 }
    ]);

    const trends = weekly.map(item => {
      const total = Number(item.total || 0);
      const present = Number(item.present || 0);
      const attendanceRate = total ? Number(((present / total) * 100).toFixed(2)) : 0;
      return {
        weekLabel: `${item._id.year}-W${String(item._id.week).padStart(2, '0')}`,
        section: item._id.section || '-',
        subject: item._id.subject || '-',
        total,
        present,
        absent: Math.max(0, total - present),
        attendanceRate,
        atRisk: attendanceRate < threshold
      };
    });

    const sectionRisk = await Student.aggregate([
      {
        $project: {
          section: '$section',
          attendancePercentage: {
            $cond: [
              { $gt: ['$totalClasses', 0] },
              { $multiply: [{ $divide: ['$totalAttendance', '$totalClasses'] }, 100] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: '$section',
          students: { $sum: 1 },
          avgAttendance: { $avg: '$attendancePercentage' },
          belowThreshold: {
            $sum: {
              $cond: [{ $lt: ['$attendancePercentage', threshold] }, 1, 0]
            }
          }
        }
      },
      { $sort: { belowThreshold: -1, avgAttendance: 1 } },
      { $limit: 100 }
    ]);

    res.json({
      threshold,
      weeks,
      trends,
      sectionRisk: sectionRisk.map(item => ({
        section: item._id || '-',
        students: item.students || 0,
        avgAttendance: Number((item.avgAttendance || 0).toFixed(2)),
        belowThreshold: item.belowThreshold || 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/teacher-performance', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const fromDate = moment().subtract(30, 'days').toDate();

    const [teachers, users, sessions] = await Promise.all([
      Teacher.find().select('userId timetable sections'),
      User.find({ role: 'teacher' }).select('name email'),
      Session.find({ startTime: { $gte: fromDate } }).select('teacherID section subject startTime isActive enrolledStudents totalPresent')
    ]);

    const userMap = new Map(users.map(user => [String(user._id), user]));
    const teacherMap = new Map(teachers.map(teacher => [String(teacher._id), teacher]));
    const performanceMap = new Map();

    teachers.forEach(teacher => {
      const user = userMap.get(String(teacher.userId));
      performanceMap.set(String(teacher._id), {
        teacherId: String(teacher._id),
        teacherName: user?.name || 'Teacher',
        email: user?.email || '',
        sessionCount: 0,
        activeSessions: 0,
        pendingApprovals: 0,
        avgClassCoverage: 0,
        onTimeStartRate: 0,
        sessionConsistencyPerWeek: 0
      });
    });

    const onTimeTracker = new Map();
    const nowDay = moment().startOf('day');
    sessions.forEach(session => {
      const key = String(session.teacherID || '');
      if (!performanceMap.has(key)) return;
      const metric = performanceMap.get(key);
      metric.sessionCount += 1;
      if (session.isActive) metric.activeSessions += 1;
      metric.pendingApprovals += (session.enrolledStudents || []).filter(student => student.status === 'Pending').length;

      const totalStudents = Number(session.enrolledStudents?.length || 0);
      const coverage = totalStudents ? (Number(session.totalPresent || 0) / totalStudents) * 100 : 0;
      metric.avgClassCoverage += coverage;

      const teacher = teacherMap.get(key);
      const timetable = normalizeTeacherTimetable(teacher?.timetable || [], teacher?.sections || []);
      const dayName = moment(session.startTime).format('dddd');
      const matchedSlot = timetable.find(slot =>
        slot.dayOfWeek === dayName &&
        String(slot.sectionName || '').trim() === String(session.section || '').trim() &&
        String(slot.subject || '').trim().toLowerCase() === String(session.subject || '').trim().toLowerCase()
      );
      if (matchedSlot) {
        const actualStart = moment(session.startTime).diff(moment(session.startTime).startOf('day'), 'minutes');
        const scheduledStart = timeStringToMinutes(matchedSlot.startTime);
        const onTime = Number.isInteger(scheduledStart) && Math.abs(actualStart - scheduledStart) <= 10;
        const tracker = onTimeTracker.get(key) || { total: 0, onTime: 0 };
        tracker.total += 1;
        if (onTime) tracker.onTime += 1;
        onTimeTracker.set(key, tracker);
      }
    });

    const metrics = Array.from(performanceMap.values()).map(metric => {
      const weeksWindow = 4;
      metric.avgClassCoverage = metric.sessionCount ? Number((metric.avgClassCoverage / metric.sessionCount).toFixed(2)) : 0;
      metric.sessionConsistencyPerWeek = Number((metric.sessionCount / weeksWindow).toFixed(2));
      const tracker = onTimeTracker.get(metric.teacherId);
      metric.onTimeStartRate = tracker?.total ? Number(((tracker.onTime / tracker.total) * 100).toFixed(2)) : 0;
      return metric;
    }).sort((a, b) => b.sessionCount - a.sessionCount);

    res.json({ metrics, windowDays: 30 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/attendance-referrals', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const filter = {};
    if (req.query.status && ['pending', 'reviewed', 'resolved'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const referrals = await ShortageReferral.find(filter).sort({ updatedAt: -1 }).limit(200);
    res.json({ referrals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/attendance-referrals/export-resolved', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const referrals = await ShortageReferral.find({ status: 'resolved' })
      .sort({ adminActionAt: -1, updatedAt: -1 })
      .limit(5000);

    if (!referrals.length) {
      return res.status(404).json({ error: 'No resolved referrals found' });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Resolved Referrals');

    ws.columns = [
      { header: 'Student Name', key: 'studentName', width: 24 },
      { header: 'UID', key: 'studentUID', width: 16 },
      { header: 'Email', key: 'studentEmail', width: 32 },
      { header: 'Section', key: 'section', width: 14 },
      { header: 'Teacher Name', key: 'teacherName', width: 24 },
      { header: 'Attendance %', key: 'attendancePercentage', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Resolved At', key: 'resolvedAt', width: 24 },
      { header: 'Admin Remark', key: 'adminComment', width: 40 }
    ];

    referrals.forEach(referral => {
      ws.addRow({
        studentName: referral.studentName || '',
        studentUID: referral.studentUID || '',
        studentEmail: referral.studentEmail || '',
        section: referral.section || '',
        teacherName: referral.teacherName || '',
        attendancePercentage: referral.attendancePercentage ?? '',
        status: referral.status || '',
        resolvedAt: referral.adminActionAt ? moment(referral.adminActionAt).format('YYYY-MM-DD HH:mm:ss') : '',
        adminComment: referral.adminComment || referral.note || ''
      });
    });

    await logAdminAudit(req, 'referral.export_resolved', 'referral', 'resolved', { exportedCount: referrals.length });

    const fileDate = moment().format('YYYY-MM-DD');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="resolved_referrals_${fileDate}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/attendance-referrals/:id/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const { status, adminComment } = req.body;
    if (!['pending', 'reviewed', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const referral = await ShortageReferral.findByIdAndUpdate(
      req.params.id,
      {
        status,
        adminComment: typeof adminComment === 'string' ? adminComment.trim() : undefined,
        adminActionAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!referral) return res.status(404).json({ error: 'Referral not found' });
    await logAdminAudit(req, 'referral.updated', 'referral', referral._id, {
      status,
      adminComment: referral.adminComment || ''
    });
    res.json({ message: 'Referral updated', referral });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEACHER ROUTES ====================
app.get('/api/teacher/profile-overview', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const [teacherUser, students, sessionsToday] = await Promise.all([
      User.findById(req.user.id).select('name email department'),
      Student.find({ section: { $in: [...new Set((context.teacher.sections || []).map(item => item.sectionName).filter(Boolean))] } }).select('section'),
      Session.find({
        teacherID: context.teacher._id,
        startTime: { $gte: moment().startOf('day').toDate(), $lte: moment().endOf('day').toDate() }
      }).select('section subject startTime isActive code')
    ]);

    const sectionBreakdown = buildTeacherSectionBreakdown(context.teacher, students);
    const uniqueSubjects = new Set((context.teacher.sections || []).map(item => String(item.subject || '').trim()).filter(Boolean));
    const summary = {
      totalSections: sectionBreakdown.length,
      totalSubjectAssignments: (context.teacher.sections || []).length,
      totalSubjects: uniqueSubjects.size,
      totalStudents: sectionBreakdown.reduce((sum, section) => sum + (section.studentCount || 0), 0)
    };

    const normalizedTimetable = normalizeTeacherTimetable(context.teacher.timetable || [], context.teacher.sections || []);
    const reminderPayload = buildTimetableReminderPayload({
      timetable: normalizedTimetable,
      sessions: sessionsToday,
      now: moment()
    });
    const nowMoment = moment();
    const reminders = [...(reminderPayload.reminders || [])];
    const isTestTeacher = isDemoAccount(teacherUser?.email, 'teacher');
    const dailyChecklist = normalizedTimetable
      .filter(slot => slot.dayOfWeek === reminderPayload.todayName)
      .map(slot => ({
        ...slot,
        startMinutes: timeStringToMinutes(slot.startTime),
        endMinutes: timeStringToMinutes(slot.endTime)
      }))
      .filter(slot => Number.isInteger(slot.startMinutes) && Number.isInteger(slot.endMinutes))
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map(slot => {
        const slotStart = moment(nowMoment).startOf('day').add(slot.startMinutes, 'minutes');
        const slotEnd = moment(nowMoment).startOf('day').add(slot.endMinutes, 'minutes');
        const matchedSession = sessionsToday.find(session => {
          if (String(session.section || '').trim() !== slot.sectionName) return false;
          if (String(session.subject || '').trim().toLowerCase() !== String(slot.subject || '').trim().toLowerCase()) return false;
          const startedAt = moment(session.startTime);
          return startedAt.isBetween(moment(slotStart).subtract(20, 'minutes'), moment(slotEnd).add(45, 'minutes'), undefined, '[]');
        });

        let status = 'not_started';
        if (matchedSession) {
          status = matchedSession.isActive ? 'running' : 'completed';
        } else if (nowMoment.isAfter(moment(slotEnd).add(10, 'minutes'))) {
          status = 'missed';
        } else if (nowMoment.isAfter(slotStart)) {
          status = 'pending';
        }

        return {
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          sectionName: slot.sectionName,
          subject: slot.subject,
          status,
          sessionCode: matchedSession?.code || '',
          canStartNow: !matchedSession && ['not_started', 'pending', 'missed'].includes(status)
        };
      });

    if (isTestTeacher && !reminders.some(reminder => reminder.type === 'missed')) {
      const fallbackSlot = normalizedTimetable.find(slot => slot.sectionName && slot.subject) || {};
      const fallbackSection = String(
        fallbackSlot.sectionName
        || context.teacher.sections?.[0]?.sectionName
        || DEMO_SECTION
      ).trim();
      const fallbackSubject = String(
        fallbackSlot.subject
        || context.teacher.sections?.[0]?.subject
        || 'Demo Subject'
      ).trim();
      const fallbackStartTime = String(fallbackSlot.startTime || '09:00').trim();
      const fallbackEndTime = String(fallbackSlot.endTime || '09:50').trim();

      reminders.push({
        type: 'missed',
        message: `Demo missed reminder for testing: ${fallbackSection} (${fallbackSubject}) scheduled ${fallbackStartTime}-${fallbackEndTime}`,
        dayOfWeek: reminderPayload.todayName,
        startTime: fallbackStartTime,
        endTime: fallbackEndTime,
        sectionName: fallbackSection,
        subject: fallbackSubject
      });
    }

    res.json({
      profile: {
        name: teacherUser?.name || 'Teacher',
        email: teacherUser?.email || '',
        department: teacherUser?.department || '',
        employeeID: context.teacher.employeeID || '',
        qualification: context.teacher.qualification || '',
        totalSessions: context.teacher.totalSessions || 0
      },
      summary,
      sectionBreakdown,
      sections: context.teacher.sections || [],
      timetable: normalizedTimetable,
      dailyChecklist,
      todayDayName: reminderPayload.todayName,
      todayReminders: reminders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/teacher/profile', authenticateToken, async (req, res) => {
  return res.status(403).json({ error: 'Teacher profile is read-only. Please contact admin to update details.' });
});

app.post('/api/teacher/change-password', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const passwordMatches = await bcryptjs.compare(String(currentPassword), user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = await bcryptjs.hash(String(newPassword).trim(), 10);
    markPasswordChange(user, 'teacher');
    await user.save();

    res.json({
      message: 'Password updated successfully',
      passwordUpdatedAt: user.passwordUpdatedAt,
      passwordUpdatedBy: user.passwordUpdatedBy
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/sections', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user.id });
    if (!teacher) return res.json({ sections: [] });

    const studentCounts = await Student.aggregate([
      { $match: { section: { $in: [...new Set((teacher?.sections || []).map(section => section.sectionName))] } } },
      { $group: { _id: '$section', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(studentCounts.map(item => [item._id, item.count]));
    const baseSections = (teacher?.sections || []).map(section => ({
      ...section.toObject?.() || section,
      studentCount: countMap.get(section.sectionName) || 0,
      handover: false
    }));

    const todayName = moment().format('dddd');
    const activeHandovers = await SubstituteHandover.find({
      toTeacherID: teacher._id,
      status: 'active',
      teacherDecision: 'accepted',
      dayOfWeek: todayName,
      effectiveFrom: { $lte: moment().endOf('day').toDate() },
      effectiveTo: { $gte: moment().startOf('day').toDate() }
    }).select('section subject fromTeacherName startTime endTime');

    const handoverSections = activeHandovers.map(item => ({
      sectionName: item.section,
      subject: item.subject,
      studentCount: countMap.get(item.section) || 0,
      handover: true,
      handoverFrom: item.fromTeacherName || '',
      handoverWindow: `${item.startTime || '--:--'}-${item.endTime || '--:--'}`
    }));

    const unique = new Map();
    [...baseSections, ...handoverSections].forEach(section => {
      const key = `${section.sectionName}::${section.subject}`;
      if (!unique.has(key)) {
        unique.set(key, section);
      } else if (section.handover) {
        unique.set(key, section);
      }
    });
    const sections = Array.from(unique.values());

    res.json({ sections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/low-attendance', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const threshold = Number(req.query.threshold || 75);
    const students = await getLowAttendanceStudentsForSection({
      teacherContext: context,
      section: req.query.section,
      threshold
    });

    res.json({ students, threshold, section: req.query.section });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/low-attendance/email', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const teacherUser = await User.findById(req.user.id);
    const { section, threshold = 75, customMessage } = req.body;
    const students = await getLowAttendanceStudentsForSection({
      teacherContext: context,
      section,
      threshold: Number(threshold)
    });

    const emailReadyStudents = students.filter(student => student.email);
    if (!emailReadyStudents.length) {
      return res.status(400).json({ error: 'No student email addresses are available for this section' });
    }

    let sentCount = 0;
    const failures = [];
    for (const student of emailReadyStudents) {
      const html = `
        <h2>Low Attendance Notice</h2>
        <p>Dear ${student.name},</p>
        <p>Your attendance in section <strong>${student.section}</strong> is currently <strong>${student.attendancePercentage}%</strong>, below the minimum threshold of <strong>${threshold}%</strong>.</p>
        <p>Total classes: <strong>${student.totalClasses}</strong></p>
        <p>Classes attended: <strong>${student.totalAttendance}</strong></p>
        <p>Classes missed: <strong>${student.totalAbsent}</strong></p>
        <p>${customMessage || 'Please improve your attendance and contact your teacher if you need help.'}</p>
        <p>Regards,<br>${teacherUser?.name || 'Teacher'}<br>AI-ATTEND PRO</p>
      `;

      const result = await sendEmail(student.email, `Attendance Warning - ${student.section}`, html);
      if (result.success) {
        sentCount += 1;
      } else {
        failures.push({ email: student.email, reason: result.reason || 'Unknown email error' });
      }
    }

    if (!sentCount) {
      return res.status(400).json({
        error: failures[0]?.reason || 'No warning emails were sent',
        recipients: 0,
        failures
      });
    }

    res.json({
      message: `Attendance warnings sent to ${sentCount} students`,
      recipients: sentCount,
      failures
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/low-attendance/refer', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const teacherUser = await User.findById(req.user.id);
    const { section, threshold = 75, note = '' } = req.body;
    const students = await getLowAttendanceStudentsForSection({
      teacherContext: context,
      section,
      threshold: Number(threshold)
    });

    const referrals = [];
    for (const student of students) {
      const referral = await ShortageReferral.findOneAndUpdate(
        {
          teacherID: context.teacher._id,
          studentID: student.studentId,
          section: student.section,
          status: { $in: ['pending', 'reviewed'] }
        },
        {
          teacherID: context.teacher._id,
          teacherName: teacherUser?.name || 'Teacher',
          studentID: student.studentId,
          studentUID: student.uid,
          studentName: student.name,
          studentEmail: student.email,
          section: student.section,
          department: student.department,
          totalClasses: student.totalClasses,
          totalAttendance: student.totalAttendance,
          attendancePercentage: student.attendancePercentage,
          threshold: Number(threshold),
          note,
          updatedAt: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      referrals.push(referral);
    }

    res.json({
      message: `${referrals.length} low-attendance students referred to admin`,
      count: referrals.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/teacher/corrections', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const { sessionCode, studentUID, requestedStatus, reason } = req.body;
    if (!sessionCode || !studentUID || !requestedStatus || !reason) {
      return res.status(400).json({ error: 'Session code, student UID, requested status and reason are required' });
    }
    if (!['Present', 'Absent'].includes(requestedStatus)) {
      return res.status(400).json({ error: 'Requested status must be Present or Absent' });
    }

    const session = await Session.findOne({ code: String(sessionCode).trim() });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const policy = await getAttendancePolicyDoc();
    try {
      assertAttendanceEditAllowed({ session, policy });
    } catch (lockErr) {
      return res.status(423).json({ error: lockErr.message });
    }

    const normalizedUid = String(studentUID).trim().toUpperCase();
    const enrolled = session.enrolledStudents.find(student => String(student.uid || '').trim().toUpperCase() === normalizedUid);
    if (!enrolled) return res.status(404).json({ error: 'Student not found in session' });

    const teacherUser = await User.findById(req.user.id).select('name');
    const student = await Student.findOne({ uid: normalizedUid });
    const studentUser = student?.userId ? await User.findById(student.userId).select('name') : null;

    const existingPending = await AttendanceCorrectionRequest.findOne({
      sessionCode: session.code,
      studentUID: normalizedUid,
      status: 'pending'
    });
    if (existingPending) {
      return res.status(409).json({ error: 'A pending correction request already exists for this student/session' });
    }

    const request = await AttendanceCorrectionRequest.create({
      teacherID: context.teacher._id,
      teacherName: teacherUser?.name || 'Teacher',
      sessionID: session._id,
      sessionCode: session.code,
      section: session.section,
      subject: session.subject,
      studentID: student?._id,
      studentUID: normalizedUid,
      studentName: studentUser?.name || enrolled.name || normalizedUid,
      currentStatus: enrolled.status === 'Present' ? 'Present' : 'Absent',
      requestedStatus,
      reason: String(reason).trim(),
      status: 'pending',
      updatedAt: new Date()
    });

    res.status(201).json({ message: 'Correction request submitted to admin', request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/corrections', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const status = String(req.query.status || '').trim();
    const filter = { teacherID: context.teacher._id };
    if (['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const requests = await AttendanceCorrectionRequest.find(filter).sort({ createdAt: -1 }).limit(300);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/disputes', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });
    await reconcilePendingDisputesOwnership();

    const status = String(req.query.status || '').trim();
    const filter = { teacherID: context.teacher._id };
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ['pending_teacher', 'resolved_teacher', 'escalated_admin', 'resolved_admin', 'rejected_admin'] };
    }

    const disputes = await AttendanceDispute.find(filter).sort({ createdAt: -1 }).limit(300);
    res.json({ disputes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher/disputes/:id/action', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const { decision, comment = '' } = req.body;
    if (!['resolved_teacher', 'escalated_admin'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be resolved_teacher or escalated_admin' });
    }

    const dispute = await AttendanceDispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (dispute.status !== 'pending_teacher') {
      return res.status(400).json({ error: 'Only pending teacher disputes can be updated' });
    }

    dispute.status = decision;
    dispute.teacherComment = String(comment || '').trim();
    dispute.updatedAt = new Date();
    if (decision === 'resolved_teacher') {
      const teacherUser = await User.findById(req.user.id).select('name');
      dispute.resolvedBy = req.user.id;
      dispute.resolvedByName = teacherUser?.name || 'Teacher';
      dispute.resolvedAt = new Date();
    }
    await dispute.save();

    res.json({ message: `Dispute marked as ${decision}`, dispute });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher/handovers/request', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const {
      toEmployeeCode,
      section,
      subject,
      dayOfWeek,
      startTime,
      endTime,
      effectiveFrom,
      effectiveTo,
      note = ''
    } = req.body || {};

    const normalizedEmployeeCode = String(toEmployeeCode || '').trim();
    const normalizedSection = String(section || '').trim();
    const normalizedSubject = String(subject || '').trim();
    const normalizedDay = normalizeDayName(dayOfWeek);
    const normalizedStartTime = normalizeTimeValue(startTime);
    const normalizedEndTime = normalizeTimeValue(endTime);

    if (!normalizedEmployeeCode || !normalizedSection || !normalizedSubject || !normalizedDay || !normalizedStartTime || !normalizedEndTime || !effectiveFrom || !effectiveTo) {
      return res.status(400).json({ error: 'Missing required handover request fields' });
    }

    const startMinutes = timeStringToMinutes(normalizedStartTime);
    const endMinutes = timeStringToMinutes(normalizedEndTime);
    if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes) || endMinutes <= startMinutes) {
      return res.status(400).json({ error: 'Invalid handover time window' });
    }

    const fromTeacher = context.teacher;
    const isAssignedClass = (fromTeacher.sections || []).some(item =>
      String(item.sectionName || '').trim() === normalizedSection
      && String(item.subject || '').trim().toLowerCase() === normalizedSubject.toLowerCase()
    );
    if (!isAssignedClass) {
      return res.status(400).json({ error: 'You can request handover only for your assigned class/subject' });
    }

    let toTeacher = await Teacher.findOne({ employeeID: normalizedEmployeeCode }).collation({ locale: 'en', strength: 2 });
    if (!toTeacher) {
      toTeacher = await Teacher.findOne({ employeeID: new RegExp(`^${normalizedEmployeeCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    }
    if (!toTeacher) return res.status(404).json({ error: 'Target teacher not found by employee code' });
    if (String(toTeacher._id) === context.teacherObjectId) {
      return res.status(400).json({ error: 'You cannot handover to yourself' });
    }

    const startDate = new Date(effectiveFrom);
    const endDate = new Date(effectiveTo);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid effective dates' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'Effective end date must be after start date' });
    }

    const potentialConflicts = await SubstituteHandover.find({
      toTeacherID: toTeacher._id,
      dayOfWeek: normalizedDay,
      status: 'active',
      teacherDecision: { $ne: 'rejected' },
      effectiveFrom: { $lte: endDate },
      effectiveTo: { $gte: startDate }
    }).select('startTime endTime section subject');

    const conflict = potentialConflicts.find(item => {
      const itemStart = timeStringToMinutes(item.startTime);
      const itemEnd = timeStringToMinutes(item.endTime);
      if (!Number.isInteger(itemStart) || !Number.isInteger(itemEnd)) return false;
      return intervalsOverlap(startMinutes, endMinutes, itemStart, itemEnd);
    });
    if (conflict) {
      return res.status(409).json({
        error: `Conflict for target teacher: overlaps ${conflict.section || '-'} / ${conflict.subject || '-'} (${conflict.startTime}-${conflict.endTime})`
      });
    }

    const [fromUser, toUser] = await Promise.all([
      User.findById(req.user.id).select('name'),
      User.findById(toTeacher.userId).select('name')
    ]);

    const handover = await SubstituteHandover.create({
      fromTeacherID: fromTeacher._id,
      fromTeacherName: fromUser?.name || 'Teacher',
      toTeacherID: toTeacher._id,
      toTeacherName: toUser?.name || 'Teacher',
      section: normalizedSection,
      subject: normalizedSubject,
      dayOfWeek: normalizedDay,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      effectiveFrom: startDate,
      effectiveTo: endDate,
      note: String(note || '').trim(),
      requestSource: 'teacher',
      teacherDecision: 'pending',
      status: 'active',
      createdBy: req.user.id,
      createdByName: fromUser?.name || 'Teacher',
      updatedAt: new Date()
    });

    res.status(201).json({
      message: `Handover request sent to ${toUser?.name || 'target teacher'} for approval`,
      handover
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/handovers', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const handovers = await SubstituteHandover.find({
      $or: [
        { fromTeacherID: context.teacher._id },
        { toTeacherID: context.teacher._id }
      ]
    }).sort({ createdAt: -1 }).limit(300);
    const mapped = handovers.map(item => ({
      ...item.toObject(),
      perspective: item.toTeacherID?.toString() === context.teacherObjectId ? 'incoming' : 'outgoing',
      teacherDecision: item.teacherDecision || 'pending',
      attendanceState: item.substituteAttendanceCompletedAt
        ? 'completed'
        : item.substituteAttendanceStartedAt
          ? 'in_progress'
          : 'not_started',
      attendanceMessage: item.substituteAttendanceCompletedAt
        ? `Attendance marked successfully by substitute ${item.substituteAttendanceByName || 'teacher'}`
        : item.substituteAttendanceStartedAt
          ? `Attendance is in progress by substitute ${item.substituteAttendanceByName || 'teacher'}`
          : ''
    }));

    res.json({ handovers: mapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher/handovers/:id/decision', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const { decision, note = '' } = req.body;
    const normalizedDecision = String(decision || '').trim();
    if (!['accepted', 'rejected'].includes(normalizedDecision)) {
      return res.status(400).json({ error: 'Decision must be accepted or rejected' });
    }

    const handover = await SubstituteHandover.findById(req.params.id);
    if (!handover) return res.status(404).json({ error: 'Handover not found' });
    if (handover.toTeacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Only assigned substitute teacher can decide this handover' });
    }
    if (handover.status !== 'active') {
      return res.status(400).json({ error: `Handover is ${handover.status}` });
    }

    const currentDecision = handover.teacherDecision || 'pending';
    if (currentDecision !== 'pending') {
      return res.status(400).json({ error: `Handover already ${currentDecision}` });
    }

    const teacherUser = await User.findById(req.user.id).select('name');
    handover.teacherDecision = normalizedDecision;
    handover.teacherDecisionAt = new Date();
    handover.teacherDecisionByName = teacherUser?.name || 'Teacher';
    handover.teacherDecisionNote = String(note || '').trim();
    if (normalizedDecision === 'rejected') {
      handover.status = 'cancelled';
    }
    handover.updatedAt = new Date();
    await handover.save();

    res.json({
      message: normalizedDecision === 'accepted'
        ? 'Handover accepted. Attendance link is now active for this class.'
        : 'Handover rejected.',
      handover
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/handovers/:id/students', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const handover = await SubstituteHandover.findById(req.params.id);
    if (!handover) return res.status(404).json({ error: 'Handover not found' });
    if (handover.toTeacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized handover access' });
    }
    if (handover.status !== 'active' || (handover.teacherDecision || 'pending') !== 'accepted') {
      return res.status(400).json({ error: 'Students list is available only after accepting an active handover' });
    }

    const students = await Student.find({ section: handover.section }).sort({ uid: 1 });
    const users = await User.find({
      _id: { $in: students.map(student => student.userId).filter(Boolean) }
    }).select('name');
    const userMap = new Map(users.map(user => [String(user._id), user]));

    res.json({
      handover: {
        id: handover._id,
        section: handover.section,
        subject: handover.subject,
        dayOfWeek: handover.dayOfWeek,
        startTime: handover.startTime,
        endTime: handover.endTime
      },
      attendanceLink: `teacher.html?handover=${handover._id}`,
      students: students.map(student => ({
        studentId: student._id,
        uid: student.uid,
        name: userMap.get(String(student.userId))?.name || student.uid
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/risk-list', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const threshold = Math.min(100, Math.max(1, Number.parseInt(req.query.threshold, 10) || 75));
    const sections = [...new Set((context.teacher.sections || []).map(item => item.sectionName).filter(Boolean))];
    const students = await Student.find({ section: { $in: sections } }).sort({ section: 1, uid: 1 });
    const users = await User.find({ _id: { $in: students.map(student => student.userId).filter(Boolean) } }).select('name email');
    const userMap = new Map(users.map(user => [String(user._id), user]));

    const risks = students.map(student => {
      const totalClasses = Number(student.totalClasses || 0);
      const totalAttendance = Number(student.totalAttendance || 0);
      const attendancePercentage = totalClasses ? Number(((totalAttendance / totalClasses) * 100).toFixed(2)) : 0;
      let riskLevel = 'low';
      if (attendancePercentage < threshold - 10) riskLevel = 'high';
      else if (attendancePercentage < threshold) riskLevel = 'medium';
      else if (attendancePercentage < threshold + 5) riskLevel = 'watch';

      return {
        studentId: student._id,
        uid: student.uid,
        name: userMap.get(String(student.userId))?.name || student.uid,
        email: userMap.get(String(student.userId))?.email || '',
        section: student.section,
        totalClasses,
        totalAttendance,
        totalAbsent: Math.max(0, totalClasses - totalAttendance),
        attendancePercentage,
        riskLevel,
        threshold
      };
    }).filter(item => item.riskLevel !== 'low');

    res.json({ threshold, students: risks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher/start-session', authenticateToken, async (req, res) => {
  try {
    const {
      section,
      subject,
      duration = TEACHER_SESSION_MINUTES_DEFAULT,
      isRecoverySession = false,
      recoveryReason = '',
      recoveryForStartTime = '',
      recoveryForEndTime = '',
      handoverId = ''
    } = req.body;
    if (!section || !subject) return res.status(400).json({ error: 'Missing fields' });

    const durationMinutes = Number.parseInt(duration, 10);
    if (!Number.isInteger(durationMinutes) || durationMinutes < TEACHER_SESSION_MINUTES_MIN || durationMinutes > TEACHER_SESSION_MINUTES_MAX) {
      return res.status(400).json({
        error: `Duration must be between ${TEACHER_SESSION_MINUTES_MIN} and ${TEACHER_SESSION_MINUTES_MAX} minutes`
      });
    }
    if (Boolean(isRecoverySession) && String(recoveryReason || '').trim().length < 5) {
      return res.status(400).json({ error: 'Recovery reason must be at least 5 characters' });
    }

    const teacher = await Teacher.findOne({ userId: req.user.id });
    const user = await User.findById(req.user.id);
    if (!teacher || !user) return res.status(404).json({ error: 'Teacher profile not found' });

    let handoverContext = null;
    const normalizedHandoverId = String(handoverId || '').trim();
    if (normalizedHandoverId) {
      if (!mongoose.Types.ObjectId.isValid(normalizedHandoverId)) {
        return res.status(400).json({ error: 'Invalid handover id' });
      }
      const handover = await SubstituteHandover.findById(normalizedHandoverId);
      if (!handover) {
        return res.status(404).json({ error: 'Handover not found' });
      }
      if (String(handover.toTeacherID || '') !== String(teacher._id)) {
        return res.status(403).json({ error: 'Unauthorized handover access' });
      }
      if (handover.status !== 'active' || (handover.teacherDecision || 'pending') !== 'accepted') {
        return res.status(400).json({ error: 'Only accepted active handovers can start attendance' });
      }
      if (String(handover.section || '').trim() !== String(section || '').trim()
        || String(handover.subject || '').trim().toLowerCase() !== String(subject || '').trim().toLowerCase()) {
        return res.status(400).json({ error: 'Section/subject must match accepted handover details' });
      }

      handoverContext = handover;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const students = await Student.find({ section });
    const studentUsers = await User.find({ _id: { $in: students.map(s => s.userId).filter(Boolean) } });
    const studentNameMap = new Map(studentUsers.map(u => [u._id.toString(), u.name]));
    const enrolled = students.map(s => ({
      studentID: s._id,
      uid: s.uid,
      name: studentNameMap.get(s.userId?.toString()) || s.uid,
      status: 'Absent'
    }));

    const expiresAt = moment().add(durationMinutes, 'minutes').toDate();
    const session = new Session({
      code,
      teacherID: teacher._id,
      teacherName: user.name,
      handoverID: handoverContext?._id || null,
      originalTeacherID: handoverContext?.fromTeacherID || null,
      originalTeacherName: handoverContext?.fromTeacherName || '',
      section,
      subject,
      recoveryTag: Boolean(isRecoverySession) ? 'recovery-session' : '',
      recoveryReason: Boolean(isRecoverySession) ? String(recoveryReason || '').trim() : '',
      recoveryForStartTime: Boolean(isRecoverySession) ? String(recoveryForStartTime || '').trim() : '',
      recoveryForEndTime: Boolean(isRecoverySession) ? String(recoveryForEndTime || '').trim() : '',
      startTime: new Date(),
      duration: durationMinutes,
      enrolledStudents: enrolled,
      expiresAt,
      totalAbsent: enrolled.length
    });

    await session.save();

    if (handoverContext?._id) {
      await updateHandoverAttendanceState({
        handoverId: handoverContext._id,
        sessionCode: session.code,
        substituteName: user.name || '',
        state: 'in_progress'
      });
    }

    const qrCode = await QRCode.toDataURL(`http://localhost:3000?session=${code}`);

    setTimeout(async () => {
      const expiredSession = await Session.findOne({ code });
      if (!expiredSession || !expiredSession.isActive) {
        io.to(`session-${code}`).emit('session-expired');
        return;
      }
      expiredSession.isActive = false;
      expiredSession.endedAt = new Date();
      expiredSession.endedByRole = 'system';
      expiredSession.endedByName = 'System Auto-close';
      expiredSession.endedReason = 'expired';
      await expiredSession.save();

      if (expiredSession.handoverID) {
        await updateHandoverAttendanceState({
          handoverId: expiredSession.handoverID,
          sessionCode: expiredSession.code,
          substituteName: expiredSession.teacherName || '',
          state: 'completed'
        });
      }

      io.to(`session-${code}`).emit('session-expired');
    }, durationMinutes * 60 * 1000);

    res.json({ code, expiresAt, qrCode, studentCount: enrolled.length, duration: durationMinutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/session/:code', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const session = await Session.findOne({ code: req.params.code });
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (session.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/teacher/session/:code/note', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const session = await Session.findOne({ code: req.params.code });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const note = String(req.body?.note || '').trim();
    if (note.length > 1000) {
      return res.status(400).json({ error: 'Session note cannot exceed 1000 characters' });
    }

    session.teacherNote = note;
    await session.save();
    res.json({ message: 'Session note saved', note: session.teacherNote || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher/attendance-decision', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const { sessionCode, studentId, decision } = req.body;
    if (!sessionCode || !studentId || !['Present', 'Absent'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision payload' });
    }

    const session = await Session.findOne({ code: sessionCode });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const policy = await getAttendancePolicyDoc();
    try {
      assertAttendanceEditAllowed({ session, policy });
    } catch (lockErr) {
      return res.status(423).json({ error: lockErr.message });
    }

    const enrolled = session.enrolledStudents.find(student => student.studentID.toString() === studentId);
    if (!enrolled) return res.status(404).json({ error: 'Student not found in session' });
    if (enrolled.status !== 'Pending') {
      return res.status(400).json({ error: 'No pending request for this student' });
    }

    enrolled.status = decision;
    enrolled.decisionAt = new Date();
    session.totalPresent = session.enrolledStudents.filter(student => student.status === 'Present').length;
    session.totalAbsent = session.enrolledStudents.filter(student => student.status === 'Absent').length;
    await session.save();

    const student = await Student.findById(studentId);
    const user = student?.userId ? await User.findById(student.userId) : null;
    if (student) {
      const log = new AttendanceLog({
        sessionID: session._id,
        studentID: student._id,
        studentUID: student.uid,
        studentName: user?.name || enrolled.name,
        section: student.section,
        subject: session.subject,
        status: decision,
        markedTime: enrolled.markedTime || new Date(),
        ipAddress: req.ip
      });
      await log.save();

      const update = decision === 'Present'
        ? { $inc: { totalAttendance: 1, totalClasses: 1 } }
        : { $inc: { totalClasses: 1 } };
      await Student.updateOne({ _id: student._id }, update);
    }

    io.to(`session-${sessionCode}`).emit('attendance-decision-updated', {
      studentId,
      uid: enrolled.uid,
      decision,
      totalPresent: session.totalPresent,
      totalAbsent: session.totalAbsent
    });

    res.json({ message: `Student marked ${decision.toLowerCase()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher/end-session', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const { sessionCode } = req.body;
    const session = await Session.findOne({ code: sessionCode });
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (session.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!session.isActive) {
      return res.status(400).json({ error: 'Session is already completed' });
    }
    const teacherUser = await User.findById(req.user.id).select('name');

    session.isActive = false;
    session.endedAt = new Date();
    session.endedByUserID = req.user.id;
    session.endedByRole = 'teacher';
    session.endedByName = teacherUser?.name || session.teacherName || 'Teacher';
    session.endedReason = 'manual_teacher';
    await session.save();

    if (session.handoverID) {
      await updateHandoverAttendanceState({
        handoverId: session.handoverID,
        sessionCode: session.code,
        substituteName: session.teacherName || '',
        state: 'completed'
      });
    }

    await Teacher.findByIdAndUpdate(session.teacherID, { $inc: { totalSessions: 1 } });
    io.to(`session-${sessionCode}`).emit('session-ended');

    res.json({ message: 'Session ended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/session-history', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });
    await closeExpiredSessions();

    const sessions = await Session.find({ teacherID: context.teacher._id })
      .sort({ createdAt: -1 })
      .limit(25);

    const history = sessions.map(session => ({
      code: session.code,
      section: session.section,
      subject: session.subject,
      recoveryTag: session.recoveryTag || '',
      recoveryReason: session.recoveryReason || '',
      startTime: session.startTime,
      endedAt: session.endedAt,
      endedByRole: session.endedByRole || '',
      endedByName: session.endedByName || '',
      isActive: session.isActive,
      teacherNote: session.teacherNote || '',
      totalPresent: session.totalPresent || 0,
      totalAbsent: session.totalAbsent || 0,
      totalStudents: session.enrolledStudents?.length || 0,
      attendanceRate: session.enrolledStudents?.length
        ? Number(((session.totalPresent / session.enrolledStudents.length) * 100).toFixed(2))
        : 0
    }));

    res.json({ sessions: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/dashboard-summary', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });
    await closeExpiredSessions();

    const sessions = await Session.find({ teacherID: context.teacher._id });
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(session => session.isActive).length;
    const completedSessions = sessions.filter(session => !session.isActive).length;
    const totalMarked = sessions.reduce((sum, session) => sum + (session.totalPresent || 0), 0);
    const avgAttendanceRate = completedSessions
      ? Number((
          sessions
            .filter(session => !session.isActive)
            .reduce((sum, session) => {
              const totalStudents = session.enrolledStudents?.length || 0;
              return sum + (totalStudents ? (session.totalPresent / totalStudents) * 100 : 0);
            }, 0) / completedSessions
        ).toFixed(2))
      : 0;

    res.json({
      totalSessions,
      activeSessions,
      completedSessions,
      avgAttendanceRate,
      totalMarked
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher/export-session/:code', authenticateToken, async (req, res) => {
  try {
    const context = await getTeacherContext(req.user.id);
    if (!context) return res.status(404).json({ error: 'Teacher profile not found' });

    const session = await Session.findOne({ code: req.params.code });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacherID?.toString() !== context.teacherObjectId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const wb = buildTeacherWorkbook(session);
    const safeSubject = session.subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSubject}-${session.code}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== STUDENT ROUTES ====================
app.get('/api/student/validate-session/:code', authenticateToken, async (req, res) => {
  try {
    const session = await Session.findOne({ code: req.params.code });
    if (!session || !session.isActive) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    const student = await ensureStudentProfileForUser(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const enrolled = session.enrolledStudents.find(s => s.studentID.toString() === student._id.toString());
    if (!enrolled) return res.status(400).json({ error: 'You are not enrolled in this session' });

    res.json({
      code: session.code,
      section: session.section,
      subject: session.subject,
      status: enrolled.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/student/mark-attendance', authenticateToken, async (req, res) => {
  try {
    const { sessionCode, faceData, lateReason = '' } = req.body;
    if (!sessionCode) return res.status(400).json({ error: 'No code' });

    const session = await Session.findOne({ code: sessionCode });
    if (!session || !session.isActive) return res.status(404).json({ error: 'Invalid session' });
    const policy = await getAttendancePolicyDoc();
    try {
      assertAttendanceEditAllowed({ session, policy });
    } catch (lockErr) {
      return res.status(423).json({ error: lockErr.message });
    }

    const student = await ensureStudentProfileForUser(req.user.id);
    if (!student) return res.status(404).json({ error: 'Not found' });

    const enrolled = session.enrolledStudents.find(s => s.studentID.toString() === student._id.toString());
    if (!enrolled) return res.status(400).json({ error: 'Not enrolled' });
    const user = await User.findById(req.user.id);
    if (enrolled.status === 'Present') {
      return res.status(400).json({ error: 'Attendance already approved for this session' });
    }
    if (enrolled.status === 'Pending') {
      return res.status(400).json({ error: 'Attendance request is already pending teacher approval' });
    }

    const lateReasonText = String(lateReason || '').trim();
    const minutesSinceStart = moment().diff(moment(session.startTime), 'minutes', true);
    if (minutesSinceStart >= 10) {
      if (minutesSinceStart > 15) {
        return res.status(400).json({ error: 'Late attendance window is closed for this session' });
      }
      if (lateReasonText.length < 5) {
        return res.status(400).json({ error: 'Late attendance requires a reason (minimum 5 characters)' });
      }
    }

    enrolled.status = 'Pending';
    enrolled.markedTime = new Date();
    enrolled.lateReason = lateReasonText;
    enrolled.faceData = faceData || '';
    session.totalPresent = session.enrolledStudents.filter(s => s.status === 'Present').length;
    session.totalAbsent = session.enrolledStudents.filter(s => s.status === 'Absent').length;
    await session.save();

    io.to(`session-${sessionCode}`).emit('student-attendance-requested', {
      studentId: student._id,
      uid: student.uid,
      name: user?.name || enrolled.name,
      markedTime: enrolled.markedTime,
      lateReason: enrolled.lateReason || ''
    });

    res.json({ message: 'Attendance request sent to teacher for approval' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/student/disputes', authenticateToken, async (req, res) => {
  try {
    const { sessionCode, reason } = req.body;
    if (!sessionCode || !reason) {
      return res.status(400).json({ error: 'Session code and reason are required' });
    }

    const student = await ensureStudentProfileForUser(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const user = await User.findById(req.user.id).select('name');
    const session = await Session.findOne({ code: String(sessionCode).trim() });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const enrolled = session.enrolledStudents.find(entry => entry.studentID?.toString() === student._id.toString());
    if (!enrolled) return res.status(400).json({ error: 'You are not enrolled in this session' });

    const existing = await AttendanceDispute.findOne({
      sessionCode: session.code,
      studentID: student._id,
      status: { $in: ['pending_teacher', 'escalated_admin'] }
    });
    if (existing) {
      return res.status(409).json({ error: 'An active dispute already exists for this session' });
    }

    const responsible = await getResponsibleTeacherFromSession(session);
    const teacher = responsible.teacherID ? await Teacher.findById(responsible.teacherID) : null;
    const teacherUser = teacher?.userId ? await User.findById(teacher.userId).select('name') : null;

    const dispute = await AttendanceDispute.create({
      sessionID: session._id,
      sessionCode: session.code,
      section: session.section,
      subject: session.subject,
      studentID: student._id,
      studentUID: student.uid,
      studentName: user?.name || student.uid,
      teacherID: teacher?._id || responsible.teacherID || session.teacherID || null,
      teacherName: teacherUser?.name || responsible.teacherName || session.teacherName || 'Teacher',
      reason: String(reason).trim(),
      status: 'pending_teacher',
      updatedAt: new Date()
    });

    res.status(201).json({ message: 'Attendance dispute submitted to teacher', dispute });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/student/disputes', authenticateToken, async (req, res) => {
  try {
    const student = await ensureStudentProfileForUser(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const disputes = await AttendanceDispute.find({ studentID: student._id }).sort({ createdAt: -1 }).limit(200);
    res.json({ disputes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/student/my-attendance', authenticateToken, async (req, res) => {
  try {
    const student = await ensureStudentProfileForUser(req.user.id);
    if (!student) return res.status(404).json({ error: 'Not found' });

    const logs = await AttendanceLog.find({ studentID: student._id });
    const attendance = student.totalClasses > 0 ? ((student.totalAttendance / student.totalClasses) * 100).toFixed(2) : 0;

    res.json({
      totalClasses: student.totalClasses,
      totalAttendance: student.totalAttendance,
      attendancePercentage: attendance,
      recentLogs: logs.slice(-10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/student/verify-wifi', (req, res) => {
  const ip = getNormalizedRequestIp(req);
  const isAllowed = isCampusOrAllowedIp(ip);
  res.json({ isAllowed, ip });
});

// ==================== ANALYTICS ====================
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
  try {
    const total = await AttendanceLog.countDocuments();
    const present = await AttendanceLog.countDocuments({ status: 'Present' });
    const absent = await AttendanceLog.countDocuments({ status: 'Absent' });

    const bySec = await AttendanceLog.aggregate([
      { $group: { _id: '$section', count: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } } } }
    ]);

    res.json({
      total,
      present,
      absent,
      percentage: total > 0 ? ((present / total) * 100).toFixed(2) : 0,
      bySection: bySec
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('âœ… Connected:', socket.id);

  socket.on('teacher-join-session', ({ sessionCode }) => {
    socket.join(`session-${sessionCode}`);
    console.log(`ðŸ‘¨â€ðŸ« Teacher joined: ${sessionCode}`);
  });

  socket.on('student-join-session', ({ sessionCode, studentUID }) => {
    socket.join(`session-${sessionCode}`);
    console.log(`ðŸ‘¨â€ðŸŽ“ Student ${studentUID} joined: ${sessionCode}`);
  });

  socket.on('disconnect', () => console.log('âŒ Disconnected:', socket.id));
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\nðŸš€ AI-ATTEND PRO v2.0 running on http://localhost:${PORT}`);
  console.log(`ðŸ“Š Database: ${process.env.MONGO_URI || 'MongoDB local'}`);
  console.log(`â° Started: ${new Date().toLocaleString()}\n`);
});

module.exports = { app, io };

