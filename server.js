// Delivery location app: a learning project.
// Customer enters name -> browser asks for location permission -> saved for delivery.
// Admin can view (and delete) records after logging in.

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD সেট করা নেই। যেমন: ADMIN_PASSWORD='আপনার-শক্ত-পাসওয়ার্ড' node server.js");
  process.exit(1);
}

// ---------- Database ----------
const db = new Database(path.join(__dirname, "data.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    lat        REAL,
    lng        REAL,
    accuracy   REAL,
    address    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const insertCustomer = db.prepare(
  "INSERT INTO customers (name, lat, lng, accuracy, address) VALUES (?, ?, ?, ?, ?)"
);
const listCustomers = db.prepare("SELECT * FROM customers ORDER BY id DESC");
const deleteCustomer = db.prepare("DELETE FROM customers WHERE id = ?");

// ---------- Admin auth (HTTP Basic, use only over HTTPS) ----------
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const i = decoded.indexOf(":");
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (i >= 0 && safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) {
      return next();
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Admin"');
  res.status(401).send("লগইন প্রয়োজন");
}

// ---------- App ----------
const app = express();
app.use(express.json({ limit: "10kb" }));

const path = require('path');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});


// Public: customer page
app.use(express.static(path.join(__dirname, "public")));

// Public: customer submits name + location (or manual address)
app.post("/api/customers", (req, res) => {
  const { name, lat, lng, accuracy, address, consent } = req.body || {};

  if (consent !== true) {
    return res.status(400).json({ error: "সম্মতি ছাড়া তথ্য সংরক্ষণ করা যায় না।" });
  }
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (cleanName.length < 1 || cleanName.length > 100) {
    return res.status(400).json({ error: "নাম ১ থেকে ১০০ অক্ষরের মধ্যে দিন।" });
  }

  const hasCoords = typeof lat === "number" && typeof lng === "number";
  if (hasCoords) {
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) {
      return res.status(400).json({ error: "লোকেশন সঠিক নয়।" });
    }
  }
  const cleanAddress = typeof address === "string" ? address.trim().slice(0, 300) : "";
  if (!hasCoords && !cleanAddress) {
    return res.status(400).json({ error: "লোকেশন অথবা ঠিকানা দিন।" });
  }

  const acc = typeof accuracy === "number" && isFinite(accuracy) ? accuracy : null;
  insertCustomer.run(
    cleanName,
    hasCoords ? lat : null,
    hasCoords ? lng : null,
    hasCoords ? acc : null,
    cleanAddress || null
  );
  res.status(201).json({ ok: true });
});

// Admin only
app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "private", "admin.html"));
});

app.get("/api/admin/customers", requireAdmin, (req, res) => {
  res.json(listCustomers.all());
});

app.delete("/api/admin/customers/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ভুল id" });
  deleteCustomer.run(id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`চালু হয়েছে: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
