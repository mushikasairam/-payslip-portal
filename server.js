const express = require('express');
const session = require('express-session');
const multer  = require('multer');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Cloudinary config ────────────────────────────────────────────────────────
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

// ─── Multer → Cloudinary ──────────────────────────────────────────────────────
const cloudStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => {
    const year  = req.body.year;
    const month = String(req.body.month).padStart(2, '0');
    return {
      folder:        'payslips',
      public_id:     `${year}-${month}.pdf`,
      resource_type: 'raw',
      type:          'upload',
      access_mode:   'public'
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

// ─── Find resource (tries both public_id formats) ─────────────────────────────
async function findResource(year, month) {
  const mm  = String(month).padStart(2, '0');
  const ids = [`payslips/${year}-${mm}.pdf`, `payslips/${year}-${mm}`];
  for (const id of ids) {
    try {
      const r = await cloudinary.api.resource(id, { resource_type: 'raw' });
      return r;
    } catch { /* try next */ }
  }
  return null;
}

// ─── Proxy PDF through server (avoids CORS/auth issues) ──────────────────────
function proxyPdf(url, filename, inline, res) {
  const https = require('https');
  const disposition = inline
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`;

  const req = https.get(url, (stream) => {
    if (stream.statusCode === 401 || stream.statusCode === 403) {
      // Try with API auth header
      return res.status(403).send('File access denied. Please delete and re-upload this payslip from admin panel.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition);
    stream.pipe(res);
  });
  req.on('error', (e) => res.status(500).send('Error: ' + e.message));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

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

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireLogin, (req, res) => {
  res.json({ user: req.session.user, isAdmin: !!req.session.isAdmin });
});

app.get('/api/payslip/check', requireLogin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const r = await findResource(year, month);
  res.json({ exists: !!r });
});

app.get('/api/payslip/view', requireLogin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const r = await findResource(year, month);
  if (!r) return res.status(404).send('Payslip not found');
  const mm = String(month).padStart(2, '0');
  proxyPdf(r.secure_url, `Payslip-${year}-${mm}.pdf`, true, res);
});

app.get('/api/payslip/download', requireLogin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const r = await findResource(year, month);
  if (!r) return res.status(404).send('Payslip not found');
  const mm = String(month).padStart(2, '0');
  proxyPdf(r.secure_url, `Payslip-${year}-${mm}.pdf`, false, res);
});

app.post('/api/admin/upload', requireAdmin, upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, message: `Payslip for ${req.body.year}-${req.body.month} uploaded successfully` });
});

app.get('/api/admin/list', requireAdmin, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload', resource_type: 'raw',
      prefix: 'payslips/', max_results: 100
    });
    const files = result.resources.map(r => {
      const raw  = r.public_id.replace('payslips/', '');
      const name = raw.replace(/\.pdf$/, '');
      const parts = name.split('-');
      const year  = parts[0];
      const month = parts[1];
      return { filename: `${name}.pdf`, year, month };
    })
    .filter(f => f.year && f.month)
    .sort((a, b) => b.filename.localeCompare(a.filename));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list', detail: err.message });
  }
});

app.delete('/api/admin/delete/:filename', requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!/^\d{4}-\d{2}(\.pdf)?\.pdf$|^\d{4}-\d{2}\.pdf$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const name = filename.replace(/\.pdf\.pdf$/, '.pdf').replace(/\.pdf$/, '');
  try {
    await cloudinary.uploader.destroy(`payslips/${name}.pdf`, { resource_type: 'raw' });
    res.json({ success: true });
  } catch {
    try {
      await cloudinary.uploader.destroy(`payslips/${name}`, { resource_type: 'raw' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Delete failed', detail: e.message });
    }
  }
});

// Debug route
app.get('/api/admin/debug', requireAdmin, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload', resource_type: 'raw',
      prefix: 'payslips/', max_results: 10
    });
    res.json(result.resources.map(r => ({
      public_id:   r.public_id,
      access_mode: r.access_mode,
      type:        r.type,
      url:         r.secure_url
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Payslip Portal running at http://localhost:${PORT}\n`);
});
