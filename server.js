const express = require('express');
const session = require('express-session');
const multer  = require('multer');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Cloudinary config (set these as env vars on Render) ─────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ─── Users ────────────────────────────────────────────────────────────────────
const USERS = {
  'mushikasairam16@gmail.com': {
    name: 'Mushika Sairam',
    passwordHash: bcrypt.hashSync('Phaniram@416', 10)
  }
};

const ADMIN = {
  email: 'admin@company.com',
  passwordHash: bcrypt.hashSync('admin123', 10)
};

// ─── Multer → Cloudinary storage ─────────────────────────────────────────────
// Files are stored in Cloudinary folder "payslips" with public_id = YYYY-MM
const cloudStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => {
    const year  = req.body.year;
    const month = String(req.body.month).padStart(2, '0');
    return {
      folder:        'payslips',
      public_id:     `${year}-${month}`,
      resource_type: 'raw',   // required for PDFs
      format:        'pdf'
    };
  }
});

const upload = multer({
  storage: cloudStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'payslip-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000 }
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

// ─── Helper: build Cloudinary public_id ──────────────────────────────────────
// Cloudinary stores raw files with format appended, so public_id = YYYY-MM.pdf
function publicId(year, month) {
  return `payslips/${year}-${String(month).padStart(2, '0')}.pdf`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const emailLower = (email || '').toLowerCase().trim();

  if (emailLower === ADMIN.email && bcrypt.compareSync(password, ADMIN.passwordHash)) {
    req.session.isAdmin = true;
    req.session.user = { email: ADMIN.email, name: 'Admin' };
    return res.json({ success: true, role: 'admin' });
  }

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

// Session info
app.get('/api/me', requireLogin, (req, res) => {
  res.json({ user: req.session.user, isAdmin: !!req.session.isAdmin });
});

// Check if payslip exists
app.get('/api/payslip/check', requireLogin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  try {
    await cloudinary.api.resource(publicId(year, month), { resource_type: 'raw' });
    res.json({ exists: true });
  } catch {
    res.json({ exists: false });
  }
});

// View payslip inline (proxy from Cloudinary)
app.get('/api/payslip/view', requireLogin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  try {
    const result = await cloudinary.api.resource(publicId(year, month), { resource_type: 'raw' });
    // Generate a signed URL valid for 1 hour
    const url = cloudinary.utils.private_download_url(
      publicId(year, month), 'pdf',
      { resource_type: 'raw', expires_at: Math.floor(Date.now() / 1000) + 3600, attachment: false }
    );
    res.redirect(url);
  } catch {
    res.status(404).json({ error: 'Payslip not found' });
  }
});

// Download payslip (attachment)
app.get('/api/payslip/download', requireLogin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  try {
    await cloudinary.api.resource(publicId(year, month), { resource_type: 'raw' });
    const url = cloudinary.utils.private_download_url(
      publicId(year, month), 'pdf',
      { resource_type: 'raw', expires_at: Math.floor(Date.now() / 1000) + 3600, attachment: true }
    );
    res.redirect(url);
  } catch {
    res.status(404).json({ error: 'Payslip not found' });
  }
});

// Admin: upload payslip to Cloudinary
app.post('/api/admin/upload', requireAdmin, upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, message: `Payslip for ${req.body.year}-${req.body.month} uploaded successfully` });
});

// Admin: list all payslips from Cloudinary
app.get('/api/admin/list', requireAdmin, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type:          'upload',
      resource_type: 'raw',
      prefix:        'payslips/',
      max_results:   100
    });
    const files = result.resources
      .map(r => {
        const name = r.public_id.replace('payslips/', ''); // YYYY-MM
        const [year, month] = name.split('-');
        return { filename: `${name}.pdf`, year, month };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list payslips', detail: err.message });
  }
});

// Admin: delete a payslip from Cloudinary
app.delete('/api/admin/delete/:filename', requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!/^\d{4}-\d{2}\.pdf$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const name = filename.replace('.pdf', ''); // YYYY-MM
  try {
    await cloudinary.uploader.destroy(`payslips/${name}.pdf`, { resource_type: 'raw' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Debug: list raw Cloudinary resources (admin only)
app.get('/api/admin/debug', requireAdmin, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload', resource_type: 'raw',
      prefix: 'payslips/', max_results: 10
    });
    res.json(result.resources.map(r => ({ public_id: r.public_id, format: r.format, url: r.secure_url })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Payslip Portal running at http://localhost:${PORT}`);
  console.log(`\n📋 Credentials:`);
  console.log(`   Employee → mushikasairam16@gmail.com / Phaniram@416`);
  console.log(`   Admin    → admin@company.com / admin123\n`);
});
