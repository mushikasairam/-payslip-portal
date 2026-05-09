const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ─── Ensure uploads folder exists ───────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ─── In-memory user store (change credentials here) ─────────────────────────
// Format: { email: { passwordHash, name } }
// To add more users, duplicate an entry below.
const USERS = {
  'mushikasairam16@gmail.com': {
    name: 'Mushika Sairam',
    // password: Phaniram@416
    passwordHash: bcrypt.hashSync('Phaniram@416', 10)
  }
};

// Admin credentials (for uploading PDFs)
const ADMIN = {
  email: 'admin@company.com',
  // password: admin123
  passwordHash: bcrypt.hashSync('admin123', 10)
};

// ─── Multer storage: saves as YYYY-MM.pdf ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const { year, month } = req.body;
    cb(null, `${year}-${String(month).padStart(2, '0')}.pdf`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'payslip-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(403).json({ error: 'Admin access required' });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const emailLower = (email || '').toLowerCase().trim();

  // Check admin
  if (emailLower === ADMIN.email && bcrypt.compareSync(password, ADMIN.passwordHash)) {
    req.session.isAdmin = true;
    req.session.user = { email: ADMIN.email, name: 'Admin' };
    return res.json({ success: true, role: 'admin' });
  }

  // Check employee
  const user = USERS[emailLower];
  if (user && bcrypt.compareSync(password, user.passwordHash)) {
    req.session.user = { email: emailLower, name: user.name };
    return res.json({ success: true, role: 'employee' });
  }

  res.status(401).json({ error: 'Invalid email or password' });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current session info
app.get('/api/me', requireLogin, (req, res) => {
  res.json({ user: req.session.user, isAdmin: !!req.session.isAdmin });
});

// Check if a payslip exists for a given month/year
app.get('/api/payslip/check', requireLogin, (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const filename = `${year}-${String(month).padStart(2, '0')}.pdf`;
  const exists = fs.existsSync(path.join(UPLOADS_DIR, filename));
  res.json({ exists, filename });
});

// View payslip inline (opens in browser)
app.get('/api/payslip/view', requireLogin, (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const filename = `${year}-${String(month).padStart(2, '0')}.pdf`;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Payslip not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Payslip-${year}-${String(month).padStart(2, '0')}.pdf"`);
  fs.createReadStream(filePath).pipe(res);
});

// Download payslip
app.get('/api/payslip/download', requireLogin, (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const filename = `${year}-${String(month).padStart(2, '0')}.pdf`;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Payslip not found' });
  res.download(filePath, `Payslip-${year}-${String(month).padStart(2, '0')}.pdf`);
});

// Admin: upload payslip
app.post('/api/admin/upload', requireAdmin, upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, message: `Payslip for ${req.body.year}-${req.body.month} uploaded successfully` });
});

// Admin: list uploaded payslips
app.get('/api/admin/list', requireAdmin, (req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(f => f.endsWith('.pdf'))
    .map(f => {
      const [year, monthExt] = f.split('-');
      const month = monthExt.replace('.pdf', '');
      return { filename: f, year, month };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
  res.json({ files });
});

// Admin: delete a payslip
app.delete('/api/admin/delete/:filename', requireAdmin, (req, res) => {
  const filename = req.params.filename;
  // Sanitize: only allow YYYY-MM.pdf pattern
  if (!/^\d{4}-\d{2}\.pdf$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Payslip Portal running at http://localhost:${PORT}`);
  console.log(`\n📋 Default credentials:`);
  console.log(`   Employee → employee@company.com / employee123`);
  console.log(`   Admin    → admin@company.com    / admin123\n`);
});
