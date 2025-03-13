require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// ✅ Correct CORS Setup
app.use(
  cors({
    origin: "http://localhost:3000", // Allow frontend requests
    credentials: true, // Allow cookies
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(cookieParser());

// ✅ PostgreSQL Database Connection (Required for Render)
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }  // ✅ Required for Render PostgreSQL
});

// ✅ Check database connection
pool.connect()
    .then(() => console.log("✅ Connected to PostgreSQL Database!"))
    .catch(err => {
        console.error("🚨 Database connection error:", err.message);
        process.exit(1); // Stop the server if database fails
    });

// ✅ Root Route (To check if backend is live)
app.get("/", (req, res) => {
    res.send("🚀 Coupon Backend is Live!");
});

// ✅ Middleware to get user IP
const getUserIP = (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress;

// ✅ Claim a coupon with enhanced abuse prevention
app.post('/claim', async (req, res) => {
    const userIP = getUserIP(req);
    const cookie = req.cookies.couponClaimed; // Check if cookie exists

    // 🛑 If the user has already claimed a coupon (via cookie), deny request
    if (cookie) {
        return res.status(429).json({ message: "You've already claimed a coupon. Try again later." });
    }

    // 🛡️ Check if the user's IP has already claimed a coupon
    const checkQuery = 'SELECT * FROM coupons WHERE claimed_by = $1 AND is_claimed = true';
    const existingClaims = await pool.query(checkQuery, [userIP]);

    if (existingClaims.rowCount > 0) {
        return res.status(429).json({ message: "You've already claimed a coupon. Try again later." });
    }

    // 🎟️ Assign the next available coupon
    const claimQuery = 'UPDATE coupons SET is_claimed = true, claimed_by = $1 WHERE id = (SELECT id FROM coupons WHERE is_claimed = false LIMIT 1) RETURNING *';
    const { rows } = await pool.query(claimQuery, [userIP]);

    if (rows.length === 0) {
        return res.status(400).json({ message: "No more coupons available" });
    }

    // ✅ Set a secure cookie to block multiple claims from the same browser
    res.cookie('couponClaimed', true, {
        maxAge: 3600000, // Expires in 1 hour
        httpOnly: true, // Prevents client-side JS access
        sameSite: "Lax", // Allows requests from same-site frontend
        secure: false, // Change to `true` when deploying (for HTTPS)
    });

    res.json({ message: "Coupon claimed successfully!", coupon: rows[0] });
});

// ✅ Get available coupons
app.get('/coupons', async (req, res) => {
    try {
        const coupons = await pool.query('SELECT * FROM coupons WHERE is_claimed = false');
        res.json(coupons.rows);
    } catch (error) {
        console.error("🚨 Error fetching coupons:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ✅ Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
