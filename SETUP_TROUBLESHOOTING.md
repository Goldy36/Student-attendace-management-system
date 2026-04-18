# 🔧 ADVANCED SETUP & TROUBLESHOOTING GUIDE

## 📋 Complete Environment Setup Guide

### 🖥️ System Requirements

**Minimum**:
- OS: Windows 10+, macOS 10.14+, Linux (Ubuntu 18+)
- RAM: 2GB (4GB recommended)
- Disk: 1GB free space
- Node.js: v16.0.0 or higher
- npm: v7.0.0 or higher

**Recommended for Development**:
- RAM: 8GB
- SSD storage (faster)
- VS Code editor
- MongoDB Compass (GUI)
- Postman (API testing)

---

## 💾 Database Setup

### Option 1: Local MongoDB (Recommended for Development)

#### Windows Installation

**Step 1: Download & Install**
```
1. Visit: https://www.mongodb.com/try/download/community
2. Select:
   - OS: Windows (64-bit)
   - Version: Latest
3. Download MSI installer
4. Run installer with default settings
5. MongoDB will install at: C:\Program Files\MongoDB\Server\
```

**Step 2: Create Data Directory**
```bash
# PowerShell as Administrator
mkdir C:\data\db
mkdir C:\data\log
```

**Step 3: Start MongoDB**
```bash
# Option A: Command Line
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath C:\data\db --logpath C:\data\log\mongod.log

# Option B: Register as Windows Service
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --install --serviceName MongoDB --logpath C:\data\log\mongod.log

# Then start service:
net start MongoDB
```

**Step 4: Verify Installation**
```bash
# Test connection
mongo

# Should show MongoDB shell prompt
>
```

#### macOS Installation

```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verify
mongo
```

#### Ubuntu/Linux Installation

```bash
# Add repository
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Install
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start
sudo systemctl start mongod
sudo systemctl enable mongod
```

---

### Option 2: MongoDB Atlas (Cloud - No Installation)

#### Setup Steps

**Step 1: Create Account**
```
1. Visit: https://www.mongodb.com/cloud/atlas
2. Sign up with email
3. Create organization and project
```

**Step 2: Create Cluster**
```
1. Click "Create a Database"
2. Choose Free Tier (M0)
3. Select region close to you
4. Wait for cluster creation (2-3 minutes)
```

**Step 3: Configure Security**
```
1. IP Whitelist:
   - Add your IP (or 0.0.0.0/0 for testing)
   
2. Database User:
   - Username: admin
   - Password: <strong-password>
   - Save credentials
```

**Step 4: Get Connection String**
```
1. Click "Connect"
2. Choose "Connect your Application"
3. Copy connection string
4. Replace <username> and <password>
5. Paste in .env as MONGO_URI

Example:
mongodb+srv://admin:password@cluster.mongodb.net/ai_attendance_v2?retryWrites=true&w=majority
```

**Step 5: Update .env**
```
MONGO_URI=mongodb+srv://admin:your-password@cluster.mongodb.net/ai_attendance_v2
```

---

## 📧 Gmail Setup for Email Notifications

### Step 1: Enable 2-Factor Authentication

```
1. Visit: https://myaccount.google.com/security
2. Scroll to "2-Step Verification"
3. Click "Get Started"
4. Follow verification steps
5. Confirm phone number
```

### Step 2: Generate App Password

```
1. Visit: https://myaccount.google.com/apppasswords
2. Select:
   - App: Mail
   - Device: Windows/Mac/Linux
3. Click "Generate"
4. Gmail shows 16-character password
5. Copy (remove spaces) to .env
```

### Step 3: Update .env File

```
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # Remove spaces!
```

### Step 4: Test Email

```bash
# Add this to server.js to test:
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email error:', error);
  } else {
    console.log('✅ Email configured successfully');
  }
});
```

---

## 🔑 Environment Variables Detailed

### Complete .env File Reference

```bash
# ==========================================
# SERVER CONFIGURATION
# ==========================================
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
LOG_LEVEL=info

# ==========================================
# DATABASE CONFIGURATION
# ==========================================

# Local MongoDB:
MONGO_URI=mongodb://127.0.0.1:27017/ai_attendance_v2

# MongoDB Atlas (Cloud):
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ai_attendance_v2

# Database name (optional)
DB_NAME=ai_attendance_v2

# ==========================================
# AUTHENTICATION
# ==========================================

# CRITICAL: Change this in production!
JWT_SECRET=dev-secret-key-change-in-production-min-32-chars

# Token expiry (in hours)
JWT_EXPIRE=24

# Refresh token expiry (in hours)
REFRESH_TOKEN_EXPIRE=7

# ==========================================
# EMAIL CONFIGURATION (Notifications)
# ==========================================

# Gmail Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # App password without spaces

# Email timeout (seconds)
EMAIL_TIMEOUT=10

# Enable/Disable email notifications
ENABLE_EMAIL_NOTIFICATIONS=true

# ==========================================
# SECURITY
# ==========================================

# CORS Origins (comma-separated)
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW=15  # minutes
RATE_LIMIT_MAX_REQUESTS=100  # requests per window

# Login rate limit
LOGIN_RATE_LIMIT=5  # attempts per 15 minutes

# Password requirements (minimum)
PASSWORD_MIN_LENGTH=6
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL=false

# ==========================================
# NETWORK/CAMPUS CONFIGURATION
# ==========================================

# WiFi/IP Restrictions (comma-separated)
ALLOWED_IPS=127.0.0.1,192.168.1.,10.0.0.,172.16.

# When enabled, only allows attendance from these IPs
ENABLE_IP_RESTRICTION=true

# Geolocation boundaries (optional)
CAMPUS_LAT=28.5244
CAMPUS_LNG=77.1855
CAMPUS_RADIUS=5  # km

ENABLE_GEOLOCATION=false

# ==========================================
# SESSION CONFIGURATION
# ==========================================

# Session duration in minutes
SESSION_DURATION=50

# Warning before session expires (minutes)
SESSION_EXPIRY_WARNING=5

# Session code length (digits)
SESSION_CODE_LENGTH=6

# ==========================================
# FILE UPLOAD CONFIGURATION
# ==========================================

# Max file size for uploads
MAX_FILE_SIZE=50mb

# Max number of records to import at once
MAX_BULK_IMPORT_ROWS=1000

# ==========================================
# ANALYTICS CONFIGURATION
# ==========================================

# Enable attendance analytics
ENABLE_ANALYTICS=true

# Number of records to keep for historical analytics
ANALYTICS_RETENTION_DAYS=365

# ==========================================
# FEATURE FLAGS
# ==========================================

ENABLE_QR_CODE_SCANNING=true
ENABLE_BULK_IMPORT=true
ENABLE_EXCEL_EXPORT=true
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_FACE_DETECTION=true
ENABLE_ANALYTICS=true
ENABLE_IP_RESTRICTION=true

# ==========================================
# BACKUP & LOGGING
# ==========================================

# Enable database backups
ENABLE_BACKUPS=false

# Backup frequency (hours)
BACKUP_FREQUENCY=24

# Log file location
LOG_DIR=./logs

# Keep logs for (days)
LOG_RETENTION=30

# ==========================================
# PRODUCTION NOTES
# ==========================================
# Before deploying to production:
# 1. Change JWT_SECRET to a strong random key
# 2. Set NODE_ENV=production
# 3. Use MongoDB Atlas (cloud) for reliability
# 4. Enable IP restrictions to campus network
# 5. Configure proper email service
# 6. Set strong password requirements
# 7. Enable HTTPS/SSL
# 8. Configure backups
# 9. Set up monitoring & alerts
# 10. Use environment-specific .env files
```

---

## 🐛 Troubleshooting Common Issues

### Issue 1: MongoDB Connection Failed

**Error:**
```
MongoServerError: connect ECONNREFUSED 127.0.0.1:27017
```

**Causes & Solutions:**

```bash
# Check 1: Is MongoDB running?
# Windows:
Get-Process mongo*

# macOS/Linux:
ps aux | grep mongod

# Solution: Start mongod
# Windows:
mongod

# macOS:
brew services start mongodb-community

# Linux:
sudo systemctl start mongod
```

```bash
# Check 2: Wrong port?
# Verify MongoDB port in .env
MONGO_URI=mongodb://127.0.0.1:27017/ai_attendance_v2
#                          ^^^^^ default port

# Custom port example:
MONGO_URI=mongodb://127.0.0.1:27018/ai_attendance_v2
```

```bash
# Check 3: Data directory doesn't exist
# Windows:
mkdir C:\data\db

# macOS/Linux:
mkdir -p ~/mongodb/data
sudo chown -R $(whoami) ~/mongodb
```

---

### Issue 2: Port 3000 Already in Use

**Error:**
```
Error: listen EADDRINUSE :::3000
Cannot assign requested address
```

**Solutions:**

```bash
# Option 1: Find and kill process on port 3000
# Windows PowerShell:
(Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# macOS/Linux:
lsof -i :3000 | awk 'NR!=1 {print $2}' | xargs kill -9
```

```bash
# Option 2: Use different port
# Change in .env:
PORT=3001

# Run:
npm start
# Server will start on http://localhost:3001
```

---

### Issue 3: npm install Fails

**Error:**
```
npm ERR! code E401
npm ERR! 401 Unauthorized
npm ERR! need auth
```

**Solutions:**

```bash
# Option 1: Clear cache
npm cache clean --force

# Option 2: Try again
npm install

# Option 3: Use specific registry
npm install --registry https://registry.npmjs.org/

# Option 4: Reinstall everything
rm -r node_modules package-lock.json
npm install
```

---

### Issue 4: Camera/Microphone Permission Denied

**Error:**
```
MediaStreamError: Permission Denied
NotAllowedError: Camera access rejected
```

**Solutions:**

**Chrome:**
```
1. Click padlock icon in address bar
2. Find "Camera" and "Microphone"
3. Click dropdown → Allow
4. Refresh page
```

**Localhost HTTPS (Required for some browsers):**
```bash
# Generate self-signed certificate
# Windows:
npm install -g mkcert
mkcert localhost 127.0.0.1 ::1

# Then in server.js:
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('localhost-key.pem'),
  cert: fs.readFileSync('localhost.pem')
};

https.createServer(options, app).listen(3000);
```

---

### Issue 5: Email Not Sending

**Error:**
```
Error: Invalid login - Gmail error
SMTPAuthenticationError
```

**Solutions:**

```bash
# Check 1: Using regular Gmail password instead of App Password
# Correct: Use 16-character app password
WRONG: EMAIL_PASSWORD=myregularpassword123
RIGHT: EMAIL_PASSWORD=xxxx xxxx xxxx xxxx

# Check 2: 2FA not enabled
# Enable 2-Step Verification:
# https://myaccount.google.com/security

# Check 3: App password not generated
# Generate new app password:
# https://myaccount.google.com/apppasswords

# Check 4: Gmail account not allowing less secure apps
# Turn on (if 2FA enabled):
# https://myaccount.google.com/security

# Test email in server:
curl -X POST http://localhost:3000/api/health/test-email
```

---

### Issue 6: Face Detection Not Working

**Error:**
```
Canvas context is null
Video stream not starting
```

**Solutions:**

```javascript
// Check 1: Video element is getting stream
const video = document.getElementById('video');
if (!video) console.error('Video element not found!');

// Check 2: Permissions granted
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
    console.log('✅ Camera access granted');
  })
  .catch(error => {
    console.error('❌ Camera access denied:', error);
  });

// Check 3: Canvas context available
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
if (!ctx) console.error('Canvas 2D context not supported');
```

---

### Issue 7: Real-time Updates Not Working (Socket.io)

**Error:**
```
Socket connection timeout
No real-time updates in dashboard
```

**Solutions:**

```javascript
// Check 1: Socket.io client library loaded
// In index.html:
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>

// Check 2: Socket connection
const socket = io();
socket.on('connect', () => console.log('✅ Socket connected'));
socket.on('error', (error) => console.error('❌ Socket error:', error));

// Check 3: Verify event names
// Teacher: socket.on('student-marked-present')
// Student: socket.emit('attendance-marked')

// Check 4: CORS configured for Socket.io
// In server.js:
io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.id);
});
```

---

### Issue 8: Excel Export Not Working

**Error:**
```
Excel file empty
Export fails silently
```

**Solutions:**

```javascript
// Check 1: ExcelJS installed
npm list exceljs

// Check 2: File permissions
// Ensure write access to directory

// Check 3: Attendance logs exist
// Admin must have created records first

// Check 4: Memory issue for large exports
// Limit export rows in .env:
MAX_EXPORT_ROWS=10000

// Test export:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/export-excel \
  --output attendance.xlsx
```

---

## 🧪 Testing & Validation

### API Testing with cURL

**Test 1: Register Admin**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "admin123",
    "role": "admin",
    "name": "Admin User"
  }'
```

**Test 2: Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "admin@test.com",
    "role": "admin"
  }
}
```

**Test 3: Protected Route (Include Bearer Token)**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."

curl -X GET http://localhost:3000/api/admin/dashboard-stats \
  -H "Authorization: Bearer $TOKEN"
```

---

### Browser Console Testing

**Check WebSocket Connection:**
```javascript
// Open browser console (F12)
// Type:
socket.io.engine.transport.name
// Should show: websocket or polling

socket.connected
// Should show: true
```

---

## 🔐 Security Hardening

### Production Checklist

- [ ] **Environment Variables**
  ```bash
  NODE_ENV=production
  JWT_SECRET=<48-character-random-key>
  ```

- [ ] **HTTPS/SSL**
  ```bash
  # Get free SSL from Let's Encrypt
  npm install -g certbot
  ```

- [ ] **Database**
  ```bash
  # Use MongoDB Atlas with:
  - IP Whitelist limited to server IPs
  - Database user with limited permissions
  - Automatic backups enabled
  - Network encryption enabled
  ```

- [ ] **Rate Limiting**
  ```javascript
  // Increase for production
  RATE_LIMIT_WINDOW=15
  RATE_LIMIT_MAX_REQUESTS=100
  LOGIN_RATE_LIMIT=5
  ```

- [ ] **CORS**
  ```javascript
  CORS_ORIGIN=https://yourdomain.com
  // Not *
  ```

- [ ] **Helmet Security Headers**
  ```javascript
  // Already enabled in server.js
  app.use(helmet());
  ```

- [ ] **Password Policy**
  ```javascript
  PASSWORD_MIN_LENGTH=10
  PASSWORD_REQUIRE_UPPERCASE=true
  PASSWORD_REQUIRE_NUMBERS=true
  PASSWORD_REQUIRE_SPECIAL=true
  ```

---

## 📊 Monitoring & Debugging

### Enable Debug Logging

**Set in .env:**
```
LOG_LEVEL=debug  # or: info, warn, error
NODE_ENV=development
```

**Quick Debug in Code:**
```javascript
// server.js
console.log('🔵 DEBUG:', variableName);
console.error('🔴 ERROR:', errorMessage);
console.warn('🟡 WARN:', warningMessage);
console.log('🟢 SUCCESS:', successMessage);
```

**Check Server Health:**
```bash
curl http://localhost:3000/api/health
```

---

## 📚 Additional Resources

### Official Documentation
- MongoDB: https://docs.mongodb.com
- Express.js: https://expressjs.com
- Socket.io: https://socket.io/docs
- JWT: https://jwt.io

### Useful Tools
- MongoDB Compass: https://www.mongodb.com/products/compass
- Postman: https://www.postman.com
- VS Code: https://code.visualstudio.com

---

## ✅ Verification Checklist

Before considering setup complete:

- [ ] Node.js installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] MongoDB running (`mongod` or service)
- [ ] .env file configured with all variables
- [ ] npm install completed successfully
- [ ] npm start shows "Server running"
- [ ] Browser opens localhost:3000
- [ ] Login works with test credentials
- [ ] Database connection verified
- [ ] Email sending works
- [ ] Camera access granted
- [ ] WebSocket connected
- [ ] Real-time updates visible

---

**Ready for testing! Follow QUICKSTART.md for the 5-step test scenario.**
