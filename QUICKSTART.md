# 🚀 QUICK START GUIDE - AI-ATTEND PRO v2.0

## 📌 Before You Start
Make sure you have:
- ✅ Node.js installed (v16+)
- ✅ MongoDB installed locally OR MongoDB Atlas account
- ✅ Gmail account (for email notifications)
- ✅ Code editor (VS Code recommended)

---

## 🎯 5-Minute Setup

### Step 1: Configure Environment Variables (2 minutes)

Edit `.env` file with your settings:

```bash
# Database Configuration
MONGO_URI=mongodb://127.0.0.1:27017/ai_attendance_v2

# Or use MongoDB Atlas (cloud):
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ai_attendance_v2

# Security (CRITICAL for production - change this!)
JWT_SECRET=your-super-secret-key-change-this-in-production-12345

# Email Configuration (Gmail)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password

# Server Configuration
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# Network Restrictions (for campus WiFi verification)
ALLOWED_IPS=127.0.0.1,192.168.1.,10.0.0.,172.16.

# Session Settings
SESSION_DURATION=50
SESSION_EXPIRY_WARNING=5
```

⚠️ **Email Setup**: 
- Use Gmail with App Password (not regular password)
- Enable 2FA and generate app-specific password
- [Guide](https://myaccount.google.com/apppasswords)

---

### Step 2: Start MongoDB (1 minute)

**Option A: Local MongoDB**
```bash
# Terminal 1
mongod
```
✅ You should see: `Listening on 127.0.0.1:27017`

**Option B: MongoDB Atlas (Cloud)**
- Sign up at mongodb.com/cloud/atlas
- Create cluster
- Get connection string
- Paste in .env as MONGO_URI

---

### Step 3: Install Dependencies (1 minute)

```bash
# Terminal 2
npm install
```
✅ Wait for: `added 299 packages in ~9s`

---

### Step 4: Start Application (30 seconds)

```bash
# Terminal 2
npm start
```

✅ You should see:
```
Server running on http://localhost:3000
Connected to MongoDB at mongodb://127.0.0.1:27017/ai_attendance_v2
✅ Server is ready!
```

---

### Step 5: Open in Browser (30 seconds)

```
http://localhost:3000
```

✅ You'll see the login page with 3 role options: Admin, Teacher, Student

---

## 👨‍💼 Test Scenario (5 Steps)

### 1️⃣ Admin: Register First Student

**Login as Admin:**
```
Email: admin@college.edu
Password: admin123
```

**Steps:**
- Go to "Register Student" tab
- Fill form:
  - Name: John Doe
  - UID: 24BCS001
  - Email: john@college.edu
  - Section: A
  - Department: CSE
- Click "Register Student"
- Note the auto-generated password sent to email

---

### 2️⃣ Teacher: Create Session

**Login as Teacher:**
```
Email: teacher@college.edu
Password: teacher123
```

**Steps:**
- Select Section from list
- Click "Start Session"
- Copy the 6-digit session code
- Share with students
- Monitor real-time attendance table

---

### 3️⃣ Student: Mark Attendance

**Login as Student:**
```
Email: student@college.edu
Password: student123
UID: 24BCS001
```

**Steps:**
- Enter session code from teacher
- Allow camera access
- Face will be detected in oval overlay
- Auto-capture happens in 10 seconds
- See success message

---

### 4️⃣ Teacher: Monitor Real-time

**Back in Teacher Dashboard:**
- See student's name appear in attendance table (green highlight)
- Counter updates: "Present: 1"
- Real-time via Socket.io

---

### 5️⃣ Admin: View Analytics

**Go to Admin Dashboard:**
- "Analytics" tab shows overall statistics
- Section-wise attendance breakdown
- Export Excel report
- See trends and patterns

---

## 🎨 User Roles Overview

### 👨‍💻 Admin Dashboard
- **URL**: http://localhost:3000 → Admin Login
- **Features**:
  - Dashboard statistics (4 cards)
  - Register new students
  - View master logs
  - Analytics by section
  - Bulk import CSV
  - Export Excel
  - Clear logs
- **Tabs**: Overview, Register Student, Master Logs, Analytics, Bulk Import

### 👨‍🏫 Teacher Dashboard
- **URL**: http://localhost:3000 → Teacher Login
- **Features**:
  - View assigned sections
  - Start live session (generates 6-digit code)
  - Monitor real-time attendance
  - Session timer
  - Download QR code
  - View analytics
- **Tabs**: Sections, Active Session, Analytics

### 👨‍🎓 Student Dashboard
- **URL**: http://localhost:3000 → Student Login
- **Features**:
  - Enter session code
  - Face detection scanner
  - Mark attendance with face capture
  - View attendance history
  - WiFi status verification
  - Personal statistics

---

## 🔍 Troubleshooting

### ❌ MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:**
- Start MongoDB: `mongod` (Terminal 1)
- Or use MongoDB Atlas URL in .env

---

### ❌ Port 3000 Already in Use
```
Error: listen EADDRINUSE :::3000
```
**Solution:**
```bash
# Kill process on port 3000
# Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Or change port in .env:
PORT=3001
npm start
```

---

### ❌ Camera/Microphone Permission Error
```
Error: Permission denied accessing camera
```
**Solution:**
- Click allow when browser asks
- Check browser settings → Permissions
- Use HTTPS (Chrome requires it for camera)

---

### ❌ Email Not Sending
```
Error: Invalid login - Gmail error
```
**Solution:**
- Use App Password, not regular Gmail password
- Enable 2FA on Gmail account
- Generate new app password
- Copy the password WITHOUT spaces

---

### ❌ npm install Fails
```
Error: npm ERR! code E401 Unauthorized
```
**Solution:**
```bash
npm cache clean --force
npm install
```

---

## 📊 API Testing (Optional)

### Test with cURL or Postman

**Register:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@college.edu","password":"test123","role":"student","uid":"24BCS002"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@college.edu","password":"admin123"}'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "admin@college.edu",
    "role": "admin",
    "name": "Admin User"
  }
}
```

---

## 📁 Project Files

```
📦 AI-Attendance-System/
│
├── 📄 server.js              ← Backend API (1000+ lines)
├── 📄 index.html             ← Login/Registration
├── 📄 admin.html             ← Admin Dashboard
├── 📄 teacher.html           ← Teacher Dashboard
├── 📄 student.html           ← Student Scanner
├── 📄 .env                   ← Configuration (edit this!)
├── 📄 package.json           ← Dependencies
├── 📄 README.md              ← Full Documentation
├── 📄 REBUILD_SUMMARY.md     ← What's New in v2.0
├── 📄 QUICKSTART.md          ← This file
│
└── 📁 node_modules/          ← All packages (auto-created)
```

---

## 🔐 Security Notes

⚠️ **Development vs Production:**

**Development (.env):**
```
NODE_ENV=development
JWT_SECRET=dev-key-not-secure
MONGO_URI=mongodb://127.0.0.1:27017/
```

**Production (must change):**
```
NODE_ENV=production
JWT_SECRET=<generate-strong-random-key>
MONGO_URI=<mongodb-atlas-url>
```

🔑 **JWT Secret Generation:**
```bash
# Terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 💡 Useful Commands

```bash
# Start development with auto-reload
npm run dev

# Check Node version
node --version

# Check MongoDB
mongod --version

# Install specific package
npm install <package-name>

# View package.json
cat package.json

# Clear cache if issues
npm cache clean --force
```

---

## 📞 Quick Reference

| Component | Port | URL |
|-----------|------|-----|
| Application | 3000 | http://localhost:3000 |
| MongoDB | 27017 | localhost:27017 |
| API | 3000 | http://localhost:3000/api |
| WebSocket | 3000 | ws://localhost:3000 |

---

## ✅ Checklist

Before going live:
- [ ] MongoDB running
- [ ] .env file configured
- [ ] npm install completed
- [ ] npm start shows "Server running"
- [ ] Browser opens http://localhost:3000
- [ ] Login works with test credentials
- [ ] Camera works for student
- [ ] Real-time updates visible
- [ ] Email notifications sending
- [ ] Excel export working

---

## 🆘 Need Help?

1. **Check README.md** - Comprehensive documentation
2. **Check server.js** - Inline comments explain code
3. **Review .env** - All configuration options explained
4. **Test scenario** - Follow 5-step guide above
5. **Troubleshooting** - See section above

---

## ✨ Features Summary

✅ Real-time attendance tracking
✅ Face detection scanner
✅ Session-based marking
✅ Email notifications
✅ QR code generation
✅ Excel report export
✅ Analytics dashboard
✅ Role-based access
✅ Security hardened
✅ Error handling
✅ Input validation
✅ Responsive UI

---

## 🎉 You're Ready!

1. Configure .env
2. Start MongoDB
3. Run npm start
4. Open localhost:3000
5. Follow test scenario
6. Enjoy your AI-attendance system!

---

**Happy Coding! 🚀**

For detailed info, see README.md or REBUILD_SUMMARY.md
