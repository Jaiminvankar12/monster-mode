const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { getServerToday, validateDateAccess } = require('./server/services/dateService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

const USERS_FILE = path.join(__dirname, 'users.json');
const HABITS_FILE = path.join(__dirname, 'habits.json');
const HABIT_LOGS_FILE = path.join(__dirname, 'habit_logs.json');
const WORKOUTS_FILE = path.join(__dirname, 'workouts.json');
const WORKOUT_LOGS_FILE = path.join(__dirname, 'workout_logs.json');
const STUDY_CATEGORIES_FILE = path.join(__dirname, 'study_categories.json');
const STUDY_SESSIONS_FILE = path.join(__dirname, 'study_sessions.json');
const HYGIENE_TASKS_FILE = path.join(__dirname, 'hygiene_tasks.json');
const HYGIENE_LOGS_FILE = path.join(__dirname, 'hygiene_logs.json');
const HYDRATION_FILE = path.join(__dirname, 'hydration_data.json');
const EXAM_MODE_FILE = path.join(__dirname, 'exam_mode.json');
const SANCTUARY_FILE = path.join(__dirname, 'sanctuary_mode.json');
const NOTIFICATION_LOGS_FILE = path.join(__dirname, 'notification_logs.json');
const USER_XP_FILE = path.join(__dirname, 'user_xp.json');
const LANDING_BG_FILE = path.join(__dirname, 'landing_bg.json');
const NOTES_REMINDERS_FILE = path.join(__dirname, 'notes_reminders.json');
const SYSTEM_LOCK_FILE = path.join(__dirname, 'system_lock.json');

const MONSTER_LAUNCH_DATE = "2026-09-11";
const MASTER_USER_ID = "admin_master_user";

function getMonsterDay(targetDateStr) {
    let launch = new Date(MONSTER_LAUNCH_DATE);
    let target = new Date(targetDateStr || getServerToday());
    let diffTime = target - launch;
    let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8757598599:AAELpH-bZszToGyRkndX8eVNFS65T9VzbIE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "5315516366"; 

async function sendTelegramAlert(message, eventKey = null) {
    if (eventKey) {
        let notifs = readJSON(NOTIFICATION_LOGS_FILE);
        if (notifs.includes(eventKey)) return;
        notifs.push(eventKey);
        writeJSON(NOTIFICATION_LOGS_FILE, notifs);
    }
    if (!TELEGRAM_CHAT_ID) return;
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
    } catch (err) {}
}

function readJSON(file) {
    if (!fs.existsSync(file)) {
        let initial = [];
        if (file === HABITS_FILE) {
            initial = [];
        } else if (file === WORKOUTS_FILE) {
            initial = [];
        } else if (file === STUDY_CATEGORIES_FILE) {
            initial = [];
        } else if (file === HYGIENE_TASKS_FILE) {
            initial = [
                { id: 'h1', userId: MASTER_USER_ID, name: '🧴 Hair Care', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h2', userId: MASTER_USER_ID, name: '🧼 Face Care', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h3', userId: MASTER_USER_ID, name: '🚿 General Body Hygiene', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE }
            ];
        } else if (file === USER_XP_FILE || file === HYDRATION_FILE || file === EXAM_MODE_FILE || file === SANCTUARY_FILE || file === LANDING_BG_FILE || file === NOTES_REMINDERS_FILE || file === SYSTEM_LOCK_FILE) {
            initial = {};
            if (file === HYDRATION_FILE) initial[MASTER_USER_ID] = { goal: 3000, glassSize: 250, logs: {} };
            if (file === EXAM_MODE_FILE) initial[MASTER_USER_ID] = { enabled: false, targetMinutes: 90 };
            if (file === SANCTUARY_FILE) initial[MASTER_USER_ID] = { enabled: false, activatedAt: null, reason: "" };
            if (file === USER_XP_FILE) initial[MASTER_USER_ID] = { xp: 0, level: 1 };
            if (file === LANDING_BG_FILE) initial = { url: "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" };
            if (file === NOTES_REMINDERS_FILE) initial = { [MASTER_USER_ID]: [] };
            if (file === SYSTEM_LOCK_FILE) initial = { locked: false, lockedAt: null };
        }
        fs.writeFileSync(file, JSON.stringify(initial, null, 2));
    }
    try {
        let content = fs.readFileSync(file, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        return file.includes('data.json') || file.includes('mode.json') || file.includes('xp.json') || file.includes('bg.json') || file.includes('lock.json') ? {} : [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getSystemLockStatus() {
    if (!fs.existsSync(SYSTEM_LOCK_FILE)) {
        let initial = { locked: false, lockedAt: null };
        fs.writeFileSync(SYSTEM_LOCK_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    return JSON.parse(fs.readFileSync(SYSTEM_LOCK_FILE, 'utf8'));
}

function getLandingBg() {
    if (!fs.existsSync(LANDING_BG_FILE)) {
        let defaultBg = { url: "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" };
        fs.writeFileSync(LANDING_BG_FILE, JSON.stringify(defaultBg, null, 2));
    }
    return JSON.parse(fs.readFileSync(LANDING_BG_FILE, 'utf8'));
}

function getHydrationData(userId = MASTER_USER_ID) {
    let data = readJSON(HYDRATION_FILE);
    if (!data[MASTER_USER_ID]) {
        data[MASTER_USER_ID] = { goal: 3000, glassSize: 250, logs: {} };
        writeJSON(HYDRATION_FILE, data);
    }
    return data[MASTER_USER_ID];
}

function calculateHydrationStreak(userId = MASTER_USER_ID) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;
    let hydData = getHydrationData(userId);
    let logs = hydData.logs || {};
    let goal = hydData.goal || 3000;
    let sanctuary = getSanctuaryData(userId);
    let streak = 0;
    let d = new Date();
    while (true) {
        let dateStr = d.toISOString().split('T')[0];
        if (dateStr < MONSTER_LAUNCH_DATE) break;
        if (sanctuary.enabled && dateStr >= sanctuary.activatedAt) {
            streak++;
            d.setDate(d.getDate() - 1);
            continue;
        }
        let consumed = logs[dateStr] || 0;
        if (consumed >= goal) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            if (streak === 0 && dateStr === todayStr) {
                d.setDate(d.getDate() - 1);
                continue;
            }
            break;
        }
    }
    return streak;
}

function getExamModeData(userId = MASTER_USER_ID) {
    let data = readJSON(EXAM_MODE_FILE);
    if (!data[MASTER_USER_ID]) {
        data[MASTER_USER_ID] = { enabled: false, targetMinutes: 90 };
        writeJSON(EXAM_MODE_FILE, data);
    }
    return data[MASTER_USER_ID];
}

function getSanctuaryData(userId = MASTER_USER_ID) {
    let data = readJSON(SANCTUARY_FILE);
    if (!data[MASTER_USER_ID]) {
        data[MASTER_USER_ID] = { enabled: false, activatedAt: null, reason: "" };
        writeJSON(SANCTUARY_FILE, data);
    }
    return data[MASTER_USER_ID];
}

function addXP(userId = MASTER_USER_ID, amount) {
    let xpData = readJSON(USER_XP_FILE);
    if (!xpData[MASTER_USER_ID]) xpData[MASTER_USER_ID] = { xp: 0, level: 1 };
    xpData[MASTER_USER_ID].xp += amount;
    xpData[MASTER_USER_ID].level = Math.floor(xpData[MASTER_USER_ID].xp / 500) + 1;
    writeJSON(USER_XP_FILE, xpData);
    return xpData[MASTER_USER_ID];
}

function getUserXP(userId = MASTER_USER_ID) {
    let xpData = readJSON(USER_XP_FILE);
    if (!xpData[MASTER_USER_ID]) {
        xpData[MASTER_USER_ID] = { xp: 0, level: 1 };
        writeJSON(USER_XP_FILE, xpData);
    }
    return xpData[MASTER_USER_ID];
}

function calculateWorkoutStreak(userId = MASTER_USER_ID) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;
    const workouts = readJSON(WORKOUTS_FILE);
    const logs = readJSON(WORKOUT_LOGS_FILE);
    if (workouts.length === 0) return 0;
    let sanctuary = getSanctuaryData(userId);
    let streak = 0;
    let d = new Date();
    while (true) {
        let dateStr = d.toISOString().split('T')[0];
        if (dateStr < MONSTER_LAUNCH_DATE) break;
        if (sanctuary.enabled && dateStr >= sanctuary.activatedAt) {
            streak++;
            d.setDate(d.getDate() - 1);
            continue;
        }
        let dayDone = workouts.every(w => {
            let log = logs.find(l => l.workoutId === w.id && l.date === dateStr);
            return log ? log.completed : false;
        });
        if (dayDone) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            if (streak === 0 && dateStr === todayStr) {
                d.setDate(d.getDate() - 1);
                continue;
            }
            break;
        }
    }
    return streak;
}

function calculateStreak(userId = MASTER_USER_ID, type) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;
    if (type === 'workout') return calculateWorkoutStreak(userId);
    if (type === 'hydration') return calculateHydrationStreak(userId);
    let sanctuary = getSanctuaryData(userId);
    let d = new Date();
    let streak = 0;
    while (true) {
        let dateStr = d.toISOString().split('T')[0];
        if (dateStr < MONSTER_LAUNCH_DATE) break;
        if (sanctuary.enabled && dateStr >= sanctuary.activatedAt) {
            streak++;
            d.setDate(d.getDate() - 1);
            continue;
        }
        let dayPassed = true;
        if (type === 'hygiene') {
            const tasks = readJSON(HYGIENE_TASKS_FILE);
            const logs = readJSON(HYGIENE_LOGS_FILE);
            let dayOfWeek = d.getDay();
            let applicable = tasks.filter(t => t.frequency === 'daily' || (dayOfWeek === 0 && t.frequency === 'sunday'));
            if (applicable.length > 0) {
                dayPassed = applicable.every(t => {
                    let l = logs.find(log => log.taskId === t.id && log.date === dateStr);
                    return l ? l.completed : false;
                });
            }
        } else if (type === 'study') {
            const sessions = readJSON(STUDY_SESSIONS_FILE);
            const categories = readJSON(STUDY_CATEGORIES_FILE);
            let targetMins = categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
            let daySessions = sessions.filter(s => s.date === dateStr);
            let studiedMins = daySessions.reduce((acc, s) => acc + (parseInt(s.durationMinutes) || 0), 0);
            dayPassed = targetMins > 0 && studiedMins >= targetMins;
        }
        if (dayPassed) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            if (streak === 0 && dateStr === todayStr) {
                d.setDate(d.getDate() - 1);
                continue;
            }
            break;
        }
    }
    return streak;
}

function runServerSyncEngine(userId = MASTER_USER_ID, targetDate) {
    if (targetDate < MONSTER_LAUNCH_DATE) return { allWorkoutsDone: false, studyDone: false, totalStudiedMinutes: 0, totalTargetMinutes: 0 };
    const workouts = readJSON(WORKOUTS_FILE);
    const workoutLogs = readJSON(WORKOUT_LOGS_FILE);
    const workoutsWithStatus = workouts.map(w => {
        const log = workoutLogs.find(l => l.workoutId === w.id && l.date === targetDate);
        return { ...w, completed: log ? log.completed : false };
    });
    const allWorkoutsDone = workoutsWithStatus.length > 0 && workoutsWithStatus.every(w => w.completed);
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    const sessions = readJSON(STUDY_SESSIONS_FILE).filter(s => s.date === targetDate);
    let examData = getExamModeData(userId);
    let totalTargetMinutes = examData.enabled ? parseInt(examData.targetMinutes) || 90 : categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
    let totalStudiedMinutes = sessions.reduce((acc, s) => acc + (parseInt(s.durationMinutes) || 0), 0);
    let studyDone = totalTargetMinutes > 0 && totalStudiedMinutes >= totalTargetMinutes;
    return { allWorkoutsDone, studyDone, totalStudiedMinutes, totalTargetMinutes };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'monster_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'strict', maxAge: 1000 * 60 * 60 * 24 }
}));

function requireAuth(req, res, next) {
    req.session.userId = MASTER_USER_ID;
    return next();
}

console.log("🔥 MONSTER MODE: Locked to September 11, 2026. Bulletproof Data Persistence Active.");

app.get('/api/system-lock', requireAuth, (req, res) => {
    let lockData = getSystemLockStatus();
    res.json({ success: true, ...lockData });
});

app.post('/api/system-lock', requireAuth, (req, res) => {
    const { locked, adminPassword } = req.body;
    if (adminPassword !== "monster123") return res.status(403).json({ error: "🔒 Invalid Admin Master Password!" });
    let lockData = { locked: locked !== undefined ? locked : true, lockedAt: locked ? new Date().toISOString() : null };
    writeJSON(SYSTEM_LOCK_FILE, lockData);
    res.json({ success: true, message: locked ? "System locked successfully by Admin." : "System unlocked.", ...lockData });
});

app.get('/api/landing-bg', (req, res) => { res.json({ success: true, ...getLandingBg() }); });
app.post('/api/control-panel/landing-bg', requireAuth, (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Image URL is required." });
    fs.writeFileSync(LANDING_BG_FILE, JSON.stringify({ url }, null, 2));
    res.json({ success: true, message: "Landing background updated successfully." });
});

app.get('/hydration', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'hydration.html')); });
app.get('/hygiene', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'hygiene.html')); });
app.get('/study', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'study.html')); });
app.get('/workout', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'workout.html')); });
app.get('/tracker', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'tracker.html')); });
app.get('/dashboard', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/control-panel', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'control-panel.html')); });

app.post('/api/auth/register', async (req, res) => { res.json({ success: true, message: "Account created successfully." }); });
app.post('/api/auth/login', async (req, res) => { req.session.userId = MASTER_USER_ID; res.json({ success: true, message: "Login successful." }); });
app.post('/api/auth/logout', (req, res) => { res.json({ success: true, message: "Logged out." }); });
app.get('/api/auth/session', (req, res) => { let xpInfo = getUserXP(MASTER_USER_ID); res.json({ authenticated: true, email: "admin@monstermode.com", ...xpInfo }); });
app.post('/api/control-panel/login', async (req, res) => { req.session.controlPanelAuth = true; req.session.userId = MASTER_USER_ID; res.json({ success: true, message: "Control Panel authorized." }); });
app.post('/api/control-panel/logout', (req, res) => { res.json({ success: true, message: "Control Panel logged out." }); });
app.get('/api/control-panel/session', (req, res) => { res.json({ authenticated: true, email: "admin@monstermode.com" }); });

app.get('/api/exam-mode', requireAuth, (req, res) => {
    let data = getExamModeData(MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/exam-mode', requireAuth, async (req, res) => {
    const { enabled, targetMinutes } = req.body;
    let data = readJSON(EXAM_MODE_FILE);
    let minutes = targetMinutes ? parseInt(targetMinutes) : 90;
    data[MASTER_USER_ID] = { enabled: enabled !== undefined ? enabled : false, targetMinutes: minutes };
    writeJSON(EXAM_MODE_FILE, data);
    res.json({ success: true, message: "Exam Mode settings updated successfully." });
});

app.get('/api/sanctuary', requireAuth, (req, res) => {
    let data = getSanctuaryData(MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/sanctuary', requireAuth, async (req, res) => {
    const { enabled, reason } = req.body;
    let data = readJSON(SANCTUARY_FILE);
    let today = getServerToday();
    data[MASTER_USER_ID] = { enabled: enabled !== undefined ? enabled : false, activatedAt: enabled ? today : null, reason: reason || "Medical Emergency / Recovery" };
    writeJSON(SANCTUARY_FILE, data);
    res.json({ success: true, message: "Sanctuary Protocol status updated.", ...data[MASTER_USER_ID] });
});

app.get('/api/hydration', requireAuth, (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let hydData = getHydrationData(MASTER_USER_ID);
    let consumed = hydData.logs[targetDate] || 0;
    let percent = Math.min(Math.round((consumed / hydData.goal) * 100), 100);
    let hydrationStreak = calculateHydrationStreak(MASTER_USER_ID);
    res.json({ success: true, goal: hydData.goal, glassSize: hydData.glassSize, consumed, percent, hydrationStreak, history: hydData.logs, serverDate: targetDate });
});

app.post('/api/hydration/drink', requireAuth, async (req, res) => {
    const today = getServerToday();
    let hydData = getHydrationData(MASTER_USER_ID);
    let current = hydData.logs[today] || 0;
    let added = hydData.glassSize || 250;
    let newTotal = current + added;
    hydData.logs[today] = newTotal;
    let dataAll = readJSON(HYDRATION_FILE);
    dataAll[MASTER_USER_ID] = hydData;
    writeJSON(HYDRATION_FILE, dataAll);
    let percent = Math.min(Math.round((newTotal / hydData.goal) * 100), 100);
    let hydrationStreak = calculateHydrationStreak(MASTER_USER_ID);
    res.json({ success: true, consumed: newTotal, percent, hydrationStreak, ...getUserXP(MASTER_USER_ID) });
});

app.post('/api/hydration/settings', requireAuth, (req, res) => {
    const { goal, glassSize } = req.body;
    let hydData = getHydrationData(MASTER_USER_ID);
    if (goal) hydData.goal = parseInt(goal);
    if (glassSize) hydData.glassSize = parseInt(glassSize);
    let dataAll = readJSON(HYDRATION_FILE);
    dataAll[MASTER_USER_ID] = hydData;
    writeJSON(HYDRATION_FILE, dataAll);
    res.json({ success: true, message: "Hydration settings updated." });
});

// --- NOTES & REMINDERS API ---
app.get('/api/notes-reminders', requireAuth, (req, res) => {
    let data = readJSON(NOTES_REMINDERS_FILE);
    if (!data[MASTER_USER_ID]) {
        data[MASTER_USER_ID] = [];
        writeJSON(NOTES_REMINDERS_FILE, data);
    }
    res.json({ success: true, items: data[MASTER_USER_ID], ...getUserXP(MASTER_USER_ID) });
});

app.post('/api/notes-reminders', requireAuth, (req, res) => {
    const { title, description, isReminder, date, time } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required." });
    let data = readJSON(NOTES_REMINDERS_FILE);
    if (!data[MASTER_USER_ID]) data[MASTER_USER_ID] = [];
    const newItem = {
        id: Date.now().toString(),
        userId: MASTER_USER_ID,
        title,
        description: description || "",
        isReminder: isReminder ? true : false,
        date: date || getServerToday(),
        time: time || "",
        completed: false,
        notifiedToday: false,
        createdAt: new Date().toISOString()
    };
    data[MASTER_USER_ID].push(newItem);
    writeJSON(NOTES_REMINDERS_FILE, data);
    res.json({ success: true, item: newItem });
});

app.delete('/api/notes-reminders/:id', requireAuth, (req, res) => {
    let data = readJSON(NOTES_REMINDERS_FILE);
    if (!data[MASTER_USER_ID]) data[MASTER_USER_ID] = [];
    const index = data[MASTER_USER_ID].findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Item not found." });
    data[MASTER_USER_ID].splice(index, 1);
    writeJSON(NOTES_REMINDERS_FILE, data);
    res.json({ success: true, message: "Item deleted successfully." });
});

// --- HABIT TRACKER API ---
app.get('/api/habits', requireAuth, (req, res) => {
    const habits = readJSON(HABITS_FILE);
    const logs = readJSON(HABIT_LOGS_FILE);
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    const habitsWithStatus = habits.map(habit => {
        const targetLog = logs.find(l => l.habitId === habit.id && l.date === targetDate);
        const habitLogs = logs.filter(l => l.habitId === habit.id && l.completed);
        return {
            ...habit,
            completedToday: targetLog ? targetLog.completed : false,
            streak: targetDate < MONSTER_LAUNCH_DATE ? 0 : habitLogs.length,
            serverToday: today
        };
    });
    res.json({ success: true, habits: habitsWithStatus, serverDate: targetDate, dateStatus, ...getUserXP(MASTER_USER_ID) });
});

app.post('/api/habits', requireAuth, (req, res) => {
    const { name, category, description, endDate, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Habit name is required." });
    const habits = readJSON(HABITS_FILE);
    const newHabit = {
        id: Date.now().toString(),
        userId: MASTER_USER_ID,
        trackerId: "habit_" + Date.now(),
        name,
        category: category || "General",
        description: description || "",
        activeDays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
        startDate: startDate || MONSTER_LAUNCH_DATE,
        endDate: endDate || "",
        status: "active",
        createdAt: new Date().toISOString()
    };
    habits.push(newHabit);
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, habit: newHabit });
});

app.put('/api/habits/:id', requireAuth, (req, res) => {
    let habits = readJSON(HABITS_FILE);
    const index = habits.findIndex(h => h.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Habit not found." });
    const { name, category, description, startDate } = req.body;
    habits[index].name = name || habits[index].name;
    habits[index].category = category !== undefined ? category : habits[index].category;
    habits[index].description = description !== undefined ? description : habits[index].description;
    habits[index].startDate = startDate || habits[index].startDate;
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, message: "Habit updated successfully.", habit: habits[index] });
});

app.post('/api/habits/:id/toggle', requireAuth, async (req, res) => {
    const habitId = req.params.id;
    const { date, completed } = req.body;
    const targetDate = date || getServerToday();
    if (targetDate < MONSTER_LAUNCH_DATE) {
        return res.status(403).json({ error: "🔒 PRE-LAUNCH: Planning Mode active." });
    }
    let logs = readJSON(HABIT_LOGS_FILE);
    let index = logs.findIndex(l => l.habitId === habitId && l.date === targetDate);
    if (index > -1) {
        logs[index].completed = completed;
    } else {
        logs.push({ id: Date.now().toString(), userId: MASTER_USER_ID, habitId, date: targetDate, completed });
    }
    writeJSON(HABIT_LOGS_FILE, logs);
    let updatedXP = getUserXP(MASTER_USER_ID);
    if (completed) {
        updatedXP = addXP(MASTER_USER_ID, 50);
    }
    res.json({ success: true, message: "Habit status updated.", completed, ...updatedXP });
});

app.delete('/api/habits/:id', requireAuth, (req, res) => {
    let habits = readJSON(HABITS_FILE);
    const index = habits.findIndex(h => h.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Habit not found." });
    habits.splice(index, 1);
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, message: "Habit deleted." });
});

// --- WORKOUT TRACKER API ---
app.get('/api/workouts', requireAuth, (req, res) => {
    const workouts = readJSON(WORKOUTS_FILE);
    const logs = readJSON(WORKOUT_LOGS_FILE);
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const workoutsWithStatus = workouts.map(w => {
        const log = logs.find(l => l.workoutId === w.id && l.date === targetDate);
        return { ...w, completed: log ? log.completed : false };
    });
    const syncResult = runServerSyncEngine(MASTER_USER_ID, targetDate);
    const currentStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateWorkoutStreak(MASTER_USER_ID);
    res.json({ success: true, workouts: workoutsWithStatus, allDone: syncResult.allWorkoutsDone, currentStreak, serverDate: targetDate, ...getUserXP(MASTER_USER_ID) });
});

app.post('/api/workouts', requireAuth, (req, res) => {
    const { name, sets, value, reps, unit, category, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Exercise name is required." });
    const workouts = readJSON(WORKOUTS_FILE);
    const newWorkout = {
        id: Date.now().toString(),
        userId: MASTER_USER_ID,
        name,
        sets: sets || 3,
        value: value || reps || 10,
        unit: unit || 'Reps',
        category: category || "Strength",
        startDate: startDate || MONSTER_LAUNCH_DATE,
        createdAt: new Date().toISOString()
    };
    workouts.push(newWorkout);
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, workout: newWorkout });
});

app.put('/api/workouts/:id', requireAuth, (req, res) => {
    let workouts = readJSON(WORKOUTS_FILE);
    const index = workouts.findIndex(w => w.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Workout not found." });
    const { name, sets, value, unit, category, startDate } = req.body;
    workouts[index].name = name || workouts[index].name;
    workouts[index].sets = sets !== undefined ? sets : workouts[index].sets;
    workouts[index].value = value !== undefined ? value : workouts[index].value;
    workouts[index].unit = unit || workouts[index].unit;
    workouts[index].category = category || workouts[index].category;
    workouts[index].startDate = startDate || workouts[index].startDate;
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, message: "Workout updated successfully.", workout: workouts[index] });
});

app.delete('/api/workouts/:id', requireAuth, (req, res) => {
    let workouts = readJSON(WORKOUTS_FILE);
    const index = workouts.findIndex(w => w.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Workout not found." });
    workouts.splice(index, 1);
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, message: "Workout deleted." });
});

app.post('/api/workouts/:id/toggle', requireAuth, async (req, res) => {
    const workoutId = req.params.id;
    const { date, completed } = req.body;
    const targetDate = date || getServerToday();
    let logs = readJSON(WORKOUT_LOGS_FILE);
    let index = logs.findIndex(l => l.workoutId === workoutId && l.date === targetDate);
    if (index > -1) {
        logs[index].completed = completed;
    } else {
        logs.push({ id: Date.now().toString(), userId: MASTER_USER_ID, workoutId, date: targetDate, completed });
    }
    writeJSON(WORKOUT_LOGS_FILE, logs);
    let updatedXP = getUserXP(MASTER_USER_ID);
    if (completed) {
        updatedXP = addXP(MASTER_USER_ID, 100);
    }
    const syncResult = runServerSyncEngine(MASTER_USER_ID, targetDate);
    const currentStreak = calculateWorkoutStreak(MASTER_USER_ID);
    res.json({ success: true, message: "Workout updated and synced.", allWorkoutsDone: syncResult.allWorkoutsDone, currentStreak, ...updatedXP });
});

// --- STUDY TRACKER API WITH DUPLICATE PREVENTION ---
app.get('/api/study/categories', requireAuth, (req, res) => {
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    res.json({ success: true, categories });
});

app.post('/api/study/categories', requireAuth, (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ error: "Category name is required." });
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    
    let existing = categories.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
        return res.status(400).json({ error: "❌ Study subject with this name already exists!" });
    }

    const newCat = {
        id: Date.now().toString(),
        userId: MASTER_USER_ID,
        name: name.trim(),
        dailyTargetMinutes: parseInt(dailyTargetMinutes) || 120,
        startDate: startDate || MONSTER_LAUNCH_DATE,
        endDate: endDate || "",
        createdAt: new Date().toISOString()
    };
    categories.push(newCat);
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, category: newCat });
});

app.put('/api/study/categories/:id', requireAuth, (req, res) => {
    let categories = readJSON(STUDY_CATEGORIES_FILE);
    const index = categories.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Category not found." });
    const { name, dailyTargetMinutes, startDate, endDate } = req.body;
    categories[index].name = name ? name.trim() : categories[index].name;
    categories[index].dailyTargetMinutes = dailyTargetMinutes !== undefined ? parseInt(dailyTargetMinutes) : categories[index].dailyTargetMinutes;
    categories[index].startDate = startDate || categories[index].startDate;
    categories[index].endDate = endDate !== undefined ? endDate : categories[index].endDate;
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, message: "Study category updated successfully.", category: categories[index] });
});

app.delete('/api/study/categories/:id', requireAuth, (req, res) => {
    let categories = readJSON(STUDY_CATEGORIES_FILE);
    const index = categories.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Category not found." });
    categories.splice(index, 1);
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, message: "Category deleted." });
});

app.get('/api/study/sessions', requireAuth, (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    const sessions = readJSON(STUDY_SESSIONS_FILE).filter(s => s.date === targetDate);
    let examData = getExamModeData(MASTER_USER_ID);
    const totalTargetMinutes = examData.enabled ? parseInt(examData.targetMinutes) : categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
    const totalStudiedMinutes = sessions.reduce((acc, s) => acc + (parseInt(s.durationMinutes) || 0), 0);
    const progressPercent = totalTargetMinutes > 0 ? Math.min(Math.round((totalStudiedMinutes / totalTargetMinutes) * 100), 100) : 0;
    const isDone = totalTargetMinutes > 0 && totalStudiedMinutes >= totalTargetMinutes;
    const studyStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateStreak(MASTER_USER_ID, 'study');
    runServerSyncEngine(MASTER_USER_ID, targetDate);
    res.json({
        success: true,
        categories,
        sessions,
        totalTargetMinutes,
        totalStudiedMinutes,
        progressPercent,
        isDone,
        studyStreak,
        serverDate: targetDate,
        ...getUserXP(MASTER_USER_ID)
    });
});

app.post('/api/study/sessions', requireAuth, async (req, res) => {
    const { categoryId, topic, durationMinutes, date } = req.body;
    if (!categoryId || !durationMinutes) return res.status(400).json({ error: "Category and duration are required." });
    const targetDate = date || getServerToday();
    const sessions = readJSON(STUDY_SESSIONS_FILE);
    const newSession = {
        id: Date.now().toString(),
        userId: MASTER_USER_ID,
        categoryId,
        topic: topic || "Deep Work Session",
        durationMinutes: parseInt(durationMinutes),
        date: targetDate,
        createdAt: new Date().toISOString()
    };
    sessions.push(newSession);
    writeJSON(STUDY_SESSIONS_FILE, sessions);
    let xpGained = parseInt(durationMinutes) * 2;
    let updatedXP = addXP(MASTER_USER_ID, xpGained);
    const syncResult = runServerSyncEngine(MASTER_USER_ID, targetDate);
    res.json({ success: true, session: newSession, studyDone: syncResult.studyDone, ...updatedXP });
});

app.delete('/api/study/sessions/:id', requireAuth, async (req, res) => {
    let sessions = readJSON(STUDY_SESSIONS_FILE);
    const index = sessions.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Session not found." });
    const targetDate = sessions[index].date;
    sessions.splice(index, 1);
    writeJSON(STUDY_SESSIONS_FILE, sessions);
    runServerSyncEngine(MASTER_USER_ID, targetDate);
    res.json({ success: true, message: "Session deleted." });
});

// --- HYGIENE TRACKER API ---
app.get('/api/hygiene', requireAuth, (req, res) => {
    const tasks = readJSON(HYGIENE_TASKS_FILE);
    const logs = readJSON(HYGIENE_LOGS_FILE);
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let targetDateObj = new Date(targetDate);
    let isSunday = targetDateObj.getDay() === 0;
    const tasksWithStatus = tasks.map(t => {
        const log = logs.find(l => l.taskId === t.id && l.date === targetDate);
        return {
            ...t,
            completed: log ? log.completed : false,
            isSundayTask: t.frequency === 'sunday'
        };
    });
    let applicableTasks = tasksWithStatus.filter(t => t.frequency === 'daily' || (isSunday && t.frequency === 'sunday'));
    let allDone = applicableTasks.length > 0 && applicableTasks.every(t => t.completed);
    let hygieneStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateStreak(MASTER_USER_ID, 'hygiene');
    res.json({
        success: true,
        tasks: tasksWithStatus,
        applicableTasks,
        allDone,
        hygieneStreak,
        isSunday,
        serverDate: targetDate,
        ...getUserXP(MASTER_USER_ID)
    });
});

app.post('/api/hygiene', requireAuth, (req, res) => {
    const { name, frequency, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Task name is required." });
    const tasks = readJSON(HYGIENE_TASKS_FILE);
    const newTask = {
        id: Date.now().toString(),
        userId: MASTER_USER_ID,
        name,
        frequency: frequency || 'daily',
        startDate: startDate || MONSTER_LAUNCH_DATE
    };
    tasks.push(newTask);
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, task: newTask });
});

app.put('/api/hygiene/:id', requireAuth, (req, res) => {
    let tasks = readJSON(HYGIENE_TASKS_FILE);
    const index = tasks.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Task not found." });
    const { name, frequency, startDate } = req.body;
    tasks[index].name = name || tasks[index].name;
    tasks[index].frequency = frequency !== undefined ? frequency : tasks[index].frequency;
    tasks[index].startDate = startDate || tasks[index].startDate;
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, message: "Hygiene task updated successfully.", task: tasks[index] });
});

app.delete('/api/hygiene/:id', requireAuth, (req, res) => {
    let tasks = readJSON(HYGIENE_TASKS_FILE);
    const index = tasks.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Task not found." });
    tasks.splice(index, 1);
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, message: "Task deleted." });
});

app.post('/api/hygiene/:id/toggle', requireAuth, async (req, res) => {
    const taskId = req.params.id;
    const { date, completed } = req.body;
    const targetDate = date || getServerToday();
    let logs = readJSON(HYGIENE_LOGS_FILE);
    let index = logs.findIndex(l => l.taskId === taskId && l.date === targetDate);
    if (index > -1) {
        logs[index].completed = completed;
    } else {
        logs.push({ id: Date.now().toString(), userId: MASTER_USER_ID, taskId, date: targetDate, completed });
    }
    writeJSON(HYGIENE_LOGS_FILE, logs);
    let updatedXP = getUserXP(MASTER_USER_ID);
    if (completed) {
        updatedXP = addXP(MASTER_USER_ID, 40);
    }
    let hygieneStreak = calculateStreak(MASTER_USER_ID, 'hygiene');
    res.json({ success: true, message: "Hygiene status updated.", hygieneStreak, ...updatedXP });
});

app.listen(PORT, () => {
    console.log(`🚀 MONSTER MODE Server running at http://localhost:${PORT}`);
});