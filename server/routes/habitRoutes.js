const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getServerToday, evaluateDateLock } = require('../services/dateService');

router.get('/', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const today = getServerToday();

    try {
        const habitsQuery = await pool.query(
            `SELECT h.*, COALESCE(l.completed, false) as completed_today 
             FROM habits h 
             LEFT JOIN habit_logs l ON h.id = l.habit_id AND l.log_date = $2
             WHERE h.user_id = $1 AND h.status = 'active'
             ORDER BY h.created_at DESC`,
            [userId, today]
        );

        const habitsWithStreaks = await Promise.all(habitsQuery.rows.map(async (habit) => {
            const logsQuery = await pool.query(
                `SELECT log_date, completed FROM habit_logs 
                 WHERE habit_id = $1 AND log_date <= $2 
                 ORDER BY log_date DESC`,
                [habit.id, today]
            );

            let streak = 0;
            let checkDate = new Date(today);

            for (let i = 0; i < logsQuery.rows.length; i++) {
                const log = logsQuery.rows[i];
                const logDateStr = log.log_date.toISOString().split('T')[0];
                const expectedDateStr = checkDate.toISOString().split('T')[0];

                if (logDateStr === expectedDateStr && log.completed) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else if (logDateStr < expectedDateStr) {
                    break;
                }
            }

            return { ...habit, streak };
        }));

        res.json({ today, habits: habitsWithStreaks });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error fetching habits.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const { name, description, start_date } = req.body;

    try {
        if (!name || !start_date) {
            return res.status(400).json({ error: 'Name and start date required.' });
        }

        let trackerRes = await pool.query("SELECT id FROM trackers WHERE user_id = $1 AND tracker_type = 'habit'", [userId]);
        let trackerId = trackerRes.rows[0].id;

        const newHabit = await pool.query(
            `INSERT INTO habits (user_id, tracker_id, name, description, start_date) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [userId, trackerId, name, description || '', start_date]
        );

        res.status(201).json({ message: 'Habit created successfully.', habit: newHabit.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error creating habit.' });
    }
});

router.post('/:id/complete', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const habitId = req.params.id;
    const { completed, target_date } = req.body;
    const serverToday = getServerToday();
    const dateToLog = target_date || serverToday;

    try {
        const lockStatus = evaluateDateLock(dateToLog);
        if (lockStatus === 'LOCKED') return res.status(403).json({ error: 'LOCKED: Previous days are immutable.' });
        if (lockStatus === 'FUTURE') return res.status(403).json({ error: 'NOT ACTIVE: Future dates cannot be completed.' });

        const habitCheck = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
        if (habitCheck.rows.length === 0) return res.status(403).json({ error: 'Unauthorized.' });

        await pool.query(
            `INSERT INTO habit_logs (habit_id, user_id, log_date, completed) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (habit_id, log_date) DO UPDATE SET completed = $4`,
            [habitId, userId, dateToLog, completed]
        );

        res.json({ message: 'Updated successfully.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const habitId = req.params.id;
    try {
        await pool.query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
        res.json({ message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;