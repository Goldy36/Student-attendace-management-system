/**
 * Seed Test Data for AI-ATTEND PRO
 * Creates admin, teacher, and student accounts for testing
 * Usage: node seed-test-data.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_attendance_v2')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// ==================== SCHEMAS ====================
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  name: String,
  department: String,
  phone: String,
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
  totalSessions: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Student = mongoose.model('Student', studentSchema);
const Teacher = mongoose.model('Teacher', teacherSchema);

// ==================== SEED DATA ====================
async function seedTestData() {
  try {
    console.log('\n🌱 Starting to seed test data...\n');

    // Clear existing test data
    await User.deleteMany({ email: { $in: ['admin@college.edu', 'teacher@college.edu', 'student@college.edu'] } });
    await Student.deleteMany({ uid: { $in: ['24BCS001', '24BCS002'] } });
    console.log('✅ Cleared old test data');

    // Create Admin
    const adminHash = await bcryptjs.hash('admin123', 10);
    const admin = await User.create({
      email: 'admin@college.edu',
      password: adminHash,
      role: 'admin',
      name: 'Admin User',
      department: 'Administration',
      isActive: true
    });
    console.log('✅ Created Admin:', admin.email);

    // Create Teacher
    const teacherHash = await bcryptjs.hash('teacher123', 10);
    const teacher = await User.create({
      email: 'teacher@college.edu',
      password: teacherHash,
      role: 'teacher',
      name: 'Prof. John Smith',
      department: 'CSE',
      isActive: true
    });
    await Teacher.create({
      userId: teacher._id,
      employeeID: 'EMP001',
      qualification: 'B.Tech, M.Tech',
      sections: [{ sectionName: 'A', subject: 'Data Structures' }]
    });
    console.log('✅ Created Teacher:', teacher.email);

    // Create Student 1
    const student1Hash = await bcryptjs.hash('student123', 10);
    const student1 = await User.create({
      email: 'student@college.edu',
      password: student1Hash,
      role: 'student',
      name: 'Raj Kumar',
      department: 'CSE',
      isActive: true
    });
    await Student.create({
      userId: student1._id,
      uid: '24BCS001',
      section: 'A',
      department: 'CSE',
      semester: 4
    });
    console.log('✅ Created Student 1:', student1.email, '(UID: 24BCS001)');

    // Create Student 2 (for testing multiple students)
    const student2Hash = await bcryptjs.hash('student456', 10);
    const student2 = await User.create({
      email: 'student2@college.edu',
      password: student2Hash,
      role: 'student',
      name: 'Priya Singh',
      department: 'CSE',
      isActive: true
    });
    await Student.create({
      userId: student2._id,
      uid: '24BCS002',
      section: 'A',
      department: 'CSE',
      semester: 4
    });
    console.log('✅ Created Student 2:', student2.email, '(UID: 24BCS002)');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 TEST DATA SEEDING COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n📌 TEST CREDENTIALS:\n');
    console.log('📊 Admin:');
    console.log('   Email: admin@college.edu');
    console.log('   Password: admin123\n');
    console.log('👨‍🏫 Teacher:');
    console.log('   Email: teacher@college.edu');
    console.log('   Password: teacher123\n');
    console.log('👨‍🎓 Student 1:');
    console.log('   Email: student@college.edu');
    console.log('   Password: student123');
    console.log('   UID: 24BCS001\n');
    console.log('👨‍🎓 Student 2:');
    console.log('   Email: student2@college.edu');
    console.log('   Password: student456');
    console.log('   UID: 24BCS002\n');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding Error:', err.message);
    process.exit(1);
  }
}

seedTestData();
