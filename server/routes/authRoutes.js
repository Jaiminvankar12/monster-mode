const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Invalid input. Password must be at least 6 characters.' });
        }
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists.' });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
            [email, passwordHash]
        );
        const userId = newUser.rows[0].id;

        const defaultTrackers = ['habit', 'workout', 'study', 'hygiene'];
        for (const type of defaultTrackers) {
            await pool.query('INSERT INTO trackers (user_id, tracker_type) VALUES ($1, $2)', [userId, type]);
        }

        await pool.query('INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)', [userId, 'ACCOUNT_REGISTERED', req.ip]);
        res.status(201).json({ message: 'Account initialized successfully!', user: newUser.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        req.session.userId = user.id;
        req.session.email = user.email;

        await pool.query('INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)', [user.id, 'USER_LOGIN', req.ip]);
        res.json({ message: 'Login successful.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

router.post('/logout', requireAuth, async (req, res) => {
    try {
        await pool.query('INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)', [req.session.userId, 'USER_LOGOUT', req.ip]);
        req.session.destroy((err) => {
            if (err) return res.status(500).json({ error: 'Could not log out.' });
            res.clearCookie('connect.sid');
            res.json({ message: 'Logged out successfully.' });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error during logout.' });
    }
});

router.get('/session', (req, res) => {
    if (req.session && req.session.userId) {
        return res.json({ authenticated: true, email: req.session.email });
    }
    res.json({ authenticated: false });
});

module.exports = router;