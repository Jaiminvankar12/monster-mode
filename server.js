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

// Application Global Start Date Constraint (10/9/2026)
const MONSTER_LAUNCH_DATE = "2026-09-10";

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8757598599:AAELpH-bZszToGyRkndX8eVNFS65T9VzbIE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "5315516366"; 

async function sendTelegramAlert(message, eventKey = null) {
    if (eventKey) {
        let notifs = readJSON(NOTIFICATION_LOGS_FILE);
        if (notifs.includes(eventKey)) {
            console.log(`🛡️ [Duplicate Protection]: Event ${eventKey} already notified. Skipping.`);
            return;
        }
        notifs.push(eventKey);
        writeJSON(NOTIFICATION_LOGS_FILE, notifs);
    }

    if (!TELEGRAM_CHAT_ID) {
        console.log(`🤖 [Telegram Simulation]: ${message}`);
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        const data = await response.json();
        if (!data.ok) {
            console.error("Telegram API Error Response:", data);
        } else {
            console.log("🤖 [Telegram Sent Successfully]: Secure alert delivered!");
        }
    } catch (err) {
        console.error("Telegram Network Error:", err.message);
    }
}

// Helper JSON storage functions
function readJSON(file) {
    if (!fs.existsSync(file)) {
        let initial = [];
        if (file === HYGIENE_TASKS_FILE) {
            initial = [
                { id: 'h1', userId: 'default', name: '🧴 Hair Care', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h2', userId: 'default', name: '🧼 Face Care', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h3', userId: 'default', name: '🚿 General Body Hygiene', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h4', userId: 'default', name: '🧔 Mustache & Beard', frequency: 'sunday', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h5', userId: 'default', name: '✨ Tan Care', frequency: 'sunday', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h6', userId: 'default', name: '🩱 Chest / Underarm / Pubic Hair', frequency: 'sunday', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h7', userId: 'default', name: '🧘 Private-area Stretching', frequency: 'sunday', startDate: MONSTER_LAUNCH_DATE }
            ];
        } else if (file === USER_XP_FILE || file === HYDRATION_FILE || file === EXAM_MODE_FILE || file === SANCTUARY_FILE) {
            initial = {};
        }
        fs.writeFileSync(file, JSON.stringify(initial, null, 2));
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- HYDRATION HELPER ---
function getHydrationData(userId) {
    let data = readJSON(HYDRATION_FILE);
    if (!data[userId]) {
        data[userId] = { goal: 3000, glassSize: 250, logs: {} };
        writeJSON(HYDRATION_FILE, data);
    }
    return data[userId];
}

// --- EXAM MODE HELPER ---
function getExamModeData(userId) {
    let data = readJSON(EXAM_MODE_FILE);
    if (!data[userId]) {
        data[userId] = { enabled: false, targetMinutes: 90 };
        writeJSON(EXAM_MODE_FILE, data);
    }
    return data[userId];
}

// --- SANCTUARY PROTOCOL HELPER ---
function getSanctuaryData(userId) {
    let data = readJSON(SANCTUARY_FILE);
    if (!data[userId]) {
        data[userId] = { enabled: false, activatedAt: null, reason: "" };
        writeJSON(SANCTUARY_FILE, data);
    }
    return data[userId];
}

// --- GAMIFICATION & XP SYSTEM ENGINE ---
function addXP(userId, amount) {
    let xpData = readJSON(USER_XP_FILE);
    if (!xpData[userId]) {
        xpData[userId] = { xp: 0, level: 1 };
    }
    xpData[userId].xp += amount;
    
    let calculatedLevel = Math.floor(xpData[userId].xp / 500) + 1;
    xpData[userId].level = calculatedLevel;

    writeJSON(USER_XP_FILE, xpData);
    return xpData[userId];
}

function getUserXP(userId) {
    let xpData = readJSON(USER_XP_FILE);
    return xpData[userId] || { xp: 0, level: 1 };
}

// --- CENTRAL REUSABLE STREAK & STATUS ENGINE ---
function calculateWorkoutStreak(userId) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;

    const workouts = readJSON(WORKOUTS_FILE).filter(w => w.userId === userId);
    const logs = readJSON(WORKOUT_LOGS_FILE).filter(l => l.userId === userId);
    if (workouts.length === 0) return 0;

    let sanctuary = getSanctuaryData(userId);
    let streak = 0;
    let d = new Date();
    
    while (true) {
        let dateStr = d.toISOString().split('T')[0];
        if (dateStr < MONSTER_LAUNCH_DATE) break;

        // Sanctuary Protocol Freeze Check: Preserve streak during emergencies
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

function calculateStreak(userId, type) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;

    if (type === 'workout') return calculateWorkoutStreak(userId);
    let sanctuary = getSanctuaryData(userId);
    let d = new Date();
    let streak = 0;
    
    while (true) {
        let dateStr = d.toISOString().split('T')[0];
        if (dateStr < MONSTER_LAUNCH_DATE) break;

        // Sanctuary Protocol Freeze Check
        if (sanctuary.enabled && dateStr >= sanctuary.activatedAt) {
            streak++;
            d.setDate(d.getDate() - 1);
            continue;
        }

        let dayPassed = true;

        if (type === 'hygiene') {
            const tasks = readJSON(HYGIENE_TASKS_FILE).filter(t => t.userId === userId || t.userId === 'default');
            const logs = readJSON(HYGIENE_LOGS_FILE).filter(l => l.userId === userId);
            let dayOfWeek = d.getDay();
            let applicable = tasks.filter(t => t.frequency === 'daily' || (dayOfWeek === 0 && t.frequency === 'sunday'));
            if (applicable.length > 0) {
                dayPassed = applicable.every(t => {
                    let l = logs.find(log => log.taskId === t.id && log.date === dateStr);
                    return l ? l.completed : false;
                });
            }
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

// Centralized Server-Side Sync Service
function runServerSyncEngine(userId, targetDate) {
    if (targetDate < MONSTER_LAUNCH_DATE) return { allWorkoutsDone: false, studyDone: false, totalStudiedMinutes: 0, totalTargetMinutes: 0 };

    let habits = readJSON(HABITS_FILE);
    let habitLogs = readJSON(HABIT_LOGS_FILE);

    const workouts = readJSON(WORKOUTS_FILE).filter(w => w.userId === userId);
    const workoutLogs = readJSON(WORKOUT_LOGS_FILE).filter(l => l.userId === userId);
    const workoutsWithStatus = workouts.map(w => {
        const log = workoutLogs.find(l => l.workoutId === w.id && l.date === targetDate);
        return { ...w, completed: log ? log.completed : false };
    });
    const allWorkoutsDone = workoutsWithStatus.length > 0 && workoutsWithStatus.every(w => w.completed);

    let workoutHabit = habits.find(h => h.userId === userId && h.name.toLowerCase().includes('workout'));
    if (!workoutHabit && workouts.length > 0) {
        workoutHabit = {
            id: 'habit_workout_auto_' + userId,
            userId: userId,
            trackerId: "habit_workout",
            name: "🏋️ Complete Daily Workout",
            description: "Auto-synced with athlete workout matrix",
            activeDays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
            startDate: MONSTER_LAUNCH_DATE,
            status: "active"
        };
        habits.push(workoutHabit);
        writeJSON(HABITS_FILE, habits);
    }
    if (workoutHabit) {
        let hLogIndex = habitLogs.findIndex(l => l.habitId === workoutHabit.id && l.date === targetDate && l.userId === userId);
        if (hLogIndex > -1) {
            habitLogs[hLogIndex].completed = allWorkoutsDone;
        } else {
            habitLogs.push({ id: Date.now().toString(), userId, habitId: workoutHabit.id, date: targetDate, completed: allWorkoutsDone });
        }
    }

    const categories = readJSON(STUDY_CATEGORIES_FILE).filter(c => c.userId === userId);
    const sessions = readJSON(STUDY_SESSIONS_FILE).filter(s => s.userId === userId && s.date === targetDate);
    
    // Check Exam Mode Override
    let examData = getExamModeData(userId);
    let totalTargetMinutes = 0;
    if (examData.enabled) {
        totalTargetMinutes = examData.targetMinutes;
    } else {
        totalTargetMinutes = categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
    }

    let totalStudiedMinutes = sessions.reduce((acc, s) => acc + (parseInt(s.durationMinutes) || 0), 0);
    let studyDone = totalTargetMinutes > 0 && totalStudiedMinutes >= totalTargetMinutes;

    let studyHabit = habits.find(h => h.userId === userId && h.name.toLowerCase().includes('study'));
    if (!studyHabit) {
        studyHabit = {
            id: 'habit_study_auto_' + userId,
            userId: userId,
            trackerId: "habit_study",
            name: "📚 Complete Daily Study Target",
            description: "Auto-synced with deep-work study session matrix",
            activeDays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
            startDate: MONSTER_LAUNCH_DATE,
            status: "active"
        };
        habits.push(studyHabit);
        writeJSON(HABITS_FILE, habits);
    }
    if (studyHabit) {
        let sLogIndex = habitLogs.findIndex(l => l.habitId === studyHabit.id && l.date === targetDate && l.userId === userId);
        if (sLogIndex > -1) {
            habitLogs[sLogIndex].completed = studyDone;
        } else {
            habitLogs.push({ id: Date.now().toString() + Math.random(), userId, habitId: studyHabit.id, date: targetDate, completed: studyDone });
        }
    }

    writeJSON(HABIT_LOGS_FILE, habitLogs);
    return { allWorkoutsDone, studyDone, totalStudiedMinutes, totalTargetMinutes };
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'monster_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

function requireAuth(req, res, next) {
    if (req.session && (req.session.userId || req.session.controlPanelAuth)) {
        if (!req.session.userId && req.session.controlPanelAuth) {
            req.session.userId = "admin_master_user";
        }
        return next();
    }
    res.status(401).json({ error: "Unauthorized access. Please login." });
}

console.log("🔥 MONSTER MODE: Locked to 10/9/2026 Launch Date.");

// --- AUTOMATED TELEGRAM CRON JOBS (Optimized Timings) ---

// 1. Sunday Morning Hygiene Reminder: Every Sunday at 8:00 AM
cron.schedule('0 8 * * 0', async () => {
    console.log("⏰ [Cron Job]: Triggering Sunday Morning Hygiene Command...");
    const users = readJSON(USERS_FILE);
    for (let user of users) {
        let userId = user.id;
        const tasks = readJSON(HYGIENE_TASKS_FILE).filter(t => t.frequency === 'sunday');
        let message = `🌟 *SUNDAY GROOMING COMMAND (MONSTER MODE)*\nToday is Sunday! Complete your special grooming vectors:\n`;
        tasks.forEach(t => { message += `• ${t.name} ○ PENDING\n`; });
        message += `\n"Take care of yourself like an elite athlete." 🧼✨`;

        await sendTelegramAlert(message, `sunday_hygiene_${getServerToday()}_${userId}`);
    }
}, { scheduled: true, timezone: "Asia/Kolkata" });

// 2. Morning Briefing & Audit: Every Mon-Sat at 8:00 AM
cron.schedule('0 8 * * 1-6', async () => {
    console.log("⏰ [Cron Job]: Triggering Morning Briefing & Audit...");
    const users = readJSON(USERS_FILE);
    for (let user of users) {
        let userId = user.id;
        let today = getServerToday();
        let sanctuary = getSanctuaryData(userId);
        if (sanctuary.enabled) {
            console.log(`🛡️ [Sanctuary Active]: Skipping morning brief for user ${userId}.`);
            continue;
        }

        let habits = readJSON(HABITS_FILE).filter(h => h.userId === userId);
        let workouts = readJSON(WORKOUTS_FILE).filter(w => w.userId === userId);
        let categories = readJSON(STUDY_CATEGORIES_FILE).filter(c => c.userId === userId);
        let examData = getExamModeData(userId);
        let totalStudyTarget = examData.enabled ? examData.targetMinutes : categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
        let studyHoursStr = `${Math.floor(totalStudyTarget / 60)}h ${totalStudyTarget % 60}m`;

        let message = `🌅 *MONSTER MODE — MORNING BRIEFING & AUDIT*\n` +
                      `📅 *Date:* ${today}\n\n` +
                      `🔥 *Active Habits:* ${habits.length} vectors loaded.\n` +
                      `🏋️ *Workouts Today:* ${workouts.length} exercises on deck.\n` +
                      `📚 *Study Target:* ${studyHoursStr} deep-work${examData.enabled ? ' (⚡ Exam Mode)' : ''}.\n\n` +
                      `*"Zero excuses. Absolute control. Dominate today!"* ⚡`;

        await sendTelegramAlert(message, `morning_brief_${today}_${userId}`);
    }
}, { scheduled: true, timezone: "Asia/Kolkata" });

// 3. Night Audit & Hydration Summary Report: Every day at 10:00 PM (22:00)
cron.schedule('0 22 * * *', async () => {
    console.log("🌙 [Cron Job]: Triggering 10 PM Night Audit & Hydration Report...");
    const users = readJSON(USERS_FILE);
    for (let user of users) {
        let userId = user.id;
        let today = getServerToday();
        let sanctuary = getSanctuaryData(userId);
        
        if (sanctuary.enabled) {
            await sendTelegramAlert(`🛡️ *SANCTUARY PROTOCOL ACTIVE*\nNight audit bypassed. You are in safe-haven mode. Recover peacefully, Monster. 🛌✨`, `sanctuary_audit_${today}_${userId}`);
            continue;
        }

        let syncRes = runServerSyncEngine(userId, today);
        let workoutStreak = calculateWorkoutStreak(userId);

        let hydData = getHydrationData(userId);
        let consumed = hydData.logs[today] || 0;
        let percent = Math.min(Math.round((consumed / hydData.goal) * 100), 100);

        let message = `🌙 *MONSTER MODE — NIGHT AUDIT REPORT (10 PM)*\n` +
                      `📅 *Date:* ${today}\n\n` +
                      `🏋️ *Workouts:* ${syncRes.allWorkoutsDone ? '✅ CONQUERED' : '⏳ PENDING'} (Streak: ${workoutStreak} Days)\n` +
                      `📚 *Study:* ${Math.floor(syncRes.totalStudiedMinutes / 60)}h ${syncRes.totalStudiedMinutes % 60}m / Target: ${Math.floor(syncRes.totalTargetMinutes / 60)}h ${syncRes.totalTargetMinutes % 60}m\n` +
                      `💧 *Hydration:* ${consumed} ml / ${hydData.goal} ml (${percent}%)\n` +
                      `🧼 *Hygiene:* Logged & Checked\n\n` +
                      `*"Rest well, Monster. No disturbances. Tomorrow we conquer again."* 🛡️`;

        await sendTelegramAlert(message, `night_audit_${today}_${userId}`);
    }
}, { scheduled: true, timezone: "Asia/Kolkata" });

// --- HTML PAGE ROUTES ---
app.get('/hydration', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'hydration.html')); });
app.get('/hygiene', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'hygiene.html')); });
app.get('/study', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'study.html')); });
app.get('/workout', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'workout.html')); });
app.get('/tracker', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'tracker.html')); });
app.get('/dashboard', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/control-panel', requireAuth, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'control-panel.html')); });

// --- AUTH & CONTROL PANEL ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email === email)) return res.status(400).json({ error: "Account already exists." });
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id: Date.now().toString(), email, password_hash: hashedPassword });
    writeJSON(USERS_FILE, users);
    res.json({ success: true, message: "Account created successfully." });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Invalid email or password." });
    }
    req.session.userId = user.id;
    req.session.email = user.email;
    res.json({ success: true, message: "Login successful." });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true, message: "Logged out." });
    });
});

app.get('/api/auth/session', (req, res) => {
    if (req.session && req.session.userId) {
        let xpInfo = getUserXP(req.session.userId);
        res.json({ authenticated: true, email: req.session.email || "admin@monstermode.com", ...xpInfo });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

app.post('/api/control-panel/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === "admin@monstermode.com" && password === "MonsterAdmin@2026") {
        req.session.controlPanelAuth = true;
        req.session.userId = "admin_master_user";
        req.session.adminEmail = email;
        return res.json({ success: true, message: "Control Panel authorized." });
    }
    res.status(401).json({ error: "Invalid Control Panel credentials." });
});

app.post('/api/control-panel/logout', (req, res) => {
    req.session.controlPanelAuth = false;
    delete req.session.adminEmail;
    res.json({ success: true, message: "Control Panel logged out." });
});

app.get('/api/control-panel/session', (req, res) => {
    if (req.session && req.session.controlPanelAuth) {
        res.json({ authenticated: true, email: req.session.adminEmail });
    } else {
        res.status(403).json({ authenticated: false });
    }
});

// --- EXAM MODE API ROUTES ---
app.get('/api/exam-mode', requireAuth, (req, res) => {
    let data = getExamModeData(req.session.userId);
    res.json({ success: true, ...data });
});

app.post('/api/exam-mode', requireAuth, (req, res) => {
    const { enabled, targetMinutes } = req.body;
    let data = readJSON(EXAM_MODE_FILE);
    data[req.session.userId] = {
        enabled: enabled !== undefined ? enabled : false,
        targetMinutes: targetMinutes ? parseInt(targetMinutes) : 90
    };
    writeJSON(EXAM_MODE_FILE, data);
    res.json({ success: true, message: "Exam Mode settings updated successfully." });
});

// --- SANCTUARY PROTOCOL API ROUTES ---
app.get('/api/sanctuary', requireAuth, (req, res) => {
    let data = getSanctuaryData(req.session.userId);
    res.json({ success: true, ...data });
});

app.post('/api/sanctuary', requireAuth, async (req, res) => {
    const { enabled, reason } = req.body;
    let data = readJSON(SANCTUARY_FILE);
    let userId = req.session.userId;
    let today = getServerToday();

    data[userId] = {
        enabled: enabled !== undefined ? enabled : false,
        activatedAt: enabled ? today : null,
        reason: reason || "Medical Emergency / Recovery"
    };
    writeJSON(SANCTUARY_FILE, data);

    if (enabled) {
        await sendTelegramAlert(`🛡️ *SANCTUARY PROTOCOL ACTIVATED*\nEmergency safe-haven mode online.\n*Reason:* ${data[userId].reason}\n\n_Streaks and targets are frozen. Recover well, Monster._ 🛌✨`);
    } else {
        await sendTelegramAlert(`⚡ *SANCTUARY PROTOCOL LIFTED*\nSystem returned to full combat readiness. Progress resumed from active state. Let's dominate! 🐉🔥`);
    }

    res.json({ success: true, message: "Sanctuary Protocol status updated.", ...data[userId] });
});

// --- HYDRATION API ROUTES ---
app.get('/api/hydration', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let hydData = getHydrationData(userId);

    let consumed = hydData.logs[targetDate] || 0;
    let percent = Math.min(Math.round((consumed / hydData.goal) * 100), 100);

    res.json({
        success: true,
        goal: hydData.goal,
        glassSize: hydData.glassSize,
        consumed,
        percent,
        history: hydData.logs,
        serverDate: targetDate
    });
});

app.post('/api/hydration/drink', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const today = getServerToday();
    let hydData = getHydrationData(userId);

    let current = hydData.logs[today] || 0;
    let added = hydData.glassSize;
    let newTotal = current + added;
    hydData.logs[today] = newTotal;

    let dataAll = readJSON(HYDRATION_FILE);
    dataAll[userId] = hydData;
    writeJSON(HYDRATION_FILE, dataAll);

    let percent = Math.min(Math.round((newTotal / hydData.goal) * 100), 100);

    if (percent >= 100) {
        let habits = readJSON(HABITS_FILE);
        let habitLogs = readJSON(HABIT_LOGS_FILE);
        let waterHabit = habits.find(h => h.userId === userId && h.name.toLowerCase().includes('water'));
        if (waterHabit) {
            let logIndex = habitLogs.findIndex(l => l.habitId === waterHabit.id && l.date === today);
            if (logIndex > -1) {
                habitLogs[logIndex].completed = true;
            } else {
                habitLogs.push({ id: Date.now().toString(), userId, habitId: waterHabit.id, date: today, completed: true });
            }
            writeJSON(HABIT_LOGS_FILE, habitLogs);
        }
    }

    res.json({ success: true, consumed: newTotal, percent, ...getUserXP(userId) });
});

app.post('/api/hydration/settings', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { goal, glassSize } = req.body;
    let hydData = getHydrationData(userId);

    if (goal) hydData.goal = parseInt(goal);
    if (glassSize) hydData.glassSize = parseInt(glassSize);

    let dataAll = readJSON(HYDRATION_FILE);
    dataAll[userId] = hydData;
    writeJSON(HYDRATION_FILE, dataAll);

    res.json({ success: true, message: "Hydration settings updated." });
});

// --- HABIT TRACKER API ---
app.get('/api/habits', requireAuth, (req, res) => {
    const habits = readJSON(HABITS_FILE).filter(h => h.userId === req.session.userId);
    const logs = readJSON(HABIT_LOGS_FILE).filter(l => l.userId === req.session.userId);
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
    res.json({ success: true, habits: habitsWithStatus, serverDate: targetDate, dateStatus, ...getUserXP(req.session.userId) });
});

app.post('/api/habits', requireAuth, (req, res) => {
    const { name, category, description, endDate, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Habit name is required." });
    const habits = readJSON(HABITS_FILE);
    const newHabit = {
        id: Date.now().toString(),
        userId: req.session.userId,
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

app.post('/api/habits/:id/toggle', requireAuth, async (req, res) => {
    const habitId = req.params.id;
    const { date, completed } = req.body;
    const targetDate = date || getServerToday();

    if (targetDate < MONSTER_LAUNCH_DATE) {
        return res.status(403).json({ error: "🔒 PRE-LAUNCH: Planning Mode active. Toggling locked until 10/9/2026." });
    }

    const dateStatus = validateDateAccess(targetDate);
    if (dateStatus === 'LOCKED') return res.status(403).json({ error: "🔒 LOCKED: Past records immutable." });

    const habits = readJSON(HABITS_FILE);
    const habit = habits.find(h => h.id === habitId && h.userId === req.session.userId);
    if (!habit) return res.status(404).json({ error: "Habit not found." });

    let logs = readJSON(HABIT_LOGS_FILE);
    let index = logs.findIndex(l => l.habitId === habitId && l.date === targetDate && l.userId === req.session.userId);
    const prevStatus = index > -1 ? (logs[index].completed ? '✅' : '❌') : '❌';

    if (index > -1) {
        logs[index].completed = completed;
    } else {
        logs.push({ id: Date.now().toString(), userId: req.session.userId, habitId, date: targetDate, completed });
    }
    writeJSON(HABIT_LOGS_FILE, logs);

    let updatedXP = getUserXP(req.session.userId);
    if (completed) {
        updatedXP = addXP(req.session.userId, 50);
    }

    const newStatusSymbol = completed ? '✅' : '❌';
    let eventKey = `habit_${habitId}_${targetDate}_${completed}`;
    
    await sendTelegramAlert(
        `🐲 *MONSTER MODE ON*\n🔥 *HABIT UPDATED*\nHabit:\n${habit.name}\nPrevious:\n${prevStatus}\nNew:\n${newStatusSymbol}\n⭐ *XP Gained:* +50 (Level ${updatedXP.level})`,
        eventKey
    );

    res.json({ success: true, message: "Habit status updated.", completed, ...updatedXP });
});

app.delete('/api/habits/:id', requireAuth, (req, res) => {
    let habits = readJSON(HABITS_FILE);
    const index = habits.findIndex(h => h.id === req.params.id && h.userId === req.session.userId);
    if (index === -1) return res.status(404).json({ error: "Habit not found." });
    habits.splice(index, 1);
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, message: "Habit deleted." });
});

// --- WORKOUT TRACKER API ---
app.get('/api/workouts', requireAuth, (req, res) => {
    const workouts = readJSON(WORKOUTS_FILE).filter(w => w.userId === req.session.userId);
    const logs = readJSON(WORKOUT_LOGS_FILE).filter(l => l.userId === req.session.userId);
    const today = getServerToday();
    const targetDate = req.query.date || today;

    const dateStatus = validateDateAccess(targetDate);
    const workoutsWithStatus = workouts.map(w => {
        const log = logs.find(l => l.workoutId === w.id && l.date === targetDate);
        return { ...w, completed: log ? log.completed : false };
    });

    const syncResult = runServerSyncEngine(req.session.userId, targetDate);
    const currentStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateWorkoutStreak(req.session.userId);

    res.json({ success: true, workouts: workoutsWithStatus, allDone: syncResult.allWorkoutsDone, currentStreak, serverDate: targetDate, dateStatus, ...getUserXP(req.session.userId) });
});

app.post('/api/workouts', requireAuth, (req, res) => {
    const { name, sets, reps, category, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Exercise name is required." });
    const workouts = readJSON(WORKOUTS_FILE);
    const newWorkout = {
        id: Date.now().toString(),
        userId: req.session.userId,
        name,
        sets: sets || 3,
        reps: reps || 10,
        category: category || "Strength",
        startDate: startDate || MONSTER_LAUNCH_DATE,
        createdAt: new Date().toISOString()
    };
    workouts.push(newWorkout);
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, workout: newWorkout });
});

app.delete('/api/workouts/:id', requireAuth, (req, res) => {
    let workouts = readJSON(WORKOUTS_FILE);
    const index = workouts.findIndex(w => w.id === req.params.id && w.userId === req.session.userId);
    if (index === -1) return res.status(404).json({ error: "Workout not found." });
    workouts.splice(index, 1);
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, message: "Workout deleted." });
});

app.post('/api/workouts/:id/toggle', requireAuth, async (req, res) => {
    const workoutId = req.params.id;
    const { date, completed } = req.body;
    const targetDate = date || getServerToday();

    if (targetDate < MONSTER_LAUNCH_DATE) {
        return res.status(403).json({ error: "🔒 PRE-LAUNCH: Planning Mode active. Toggling locked until 10/9/2026." });
    }

    const dateStatus = validateDateAccess(targetDate);
    if (dateStatus === 'LOCKED') return res.status(403).json({ error: "🔒 LOCKED: Past records immutable." });

    let logs = readJSON(WORKOUT_LOGS_FILE);
    let index = logs.findIndex(l => l.workoutId === workoutId && l.date === targetDate && l.userId === req.session.userId);
    if (index > -1) {
        logs[index].completed = completed;
    } else {
        logs.push({ id: Date.now().toString(), userId: req.session.userId, workoutId, date: targetDate, completed });
    }
    writeJSON(WORKOUT_LOGS_FILE, logs);

    let updatedXP = getUserXP(req.session.userId);
    if (completed) {
        updatedXP = addXP(req.session.userId, 100);
    }

    const syncResult = runServerSyncEngine(req.session.userId, targetDate);
    const currentStreak = calculateWorkoutStreak(req.session.userId);

    if (syncResult.allWorkoutsDone) {
        let eventKey = `workout_done_${targetDate}_${req.session.userId}`;
        await sendTelegramAlert(
            `🐲 *MONSTER MODE ON*\n🏋️ *WORKOUT MATRIX CONQUERED!*\n⭐ *XP Gained:* +100 (Level ${updatedXP.level})\nWorkout Streak: 🔥 ${currentStreak} Days`,
            eventKey
        );
    }

    res.json({ success: true, message: "Workout updated and synced.", allWorkoutsDone: syncResult.allWorkoutsDone, currentStreak, ...updatedXP });
});

// --- STUDY TRACKER API ---
app.get('/api/study/categories', requireAuth, (req, res) => {
    const categories = readJSON(STUDY_CATEGORIES_FILE).filter(c => c.userId === req.session.userId);
    res.json({ success: true, categories });
});

app.post('/api/study/categories', requireAuth, (req, res) => {
    const { name, dailyTargetMinutes, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Category name is required." });
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    const newCat = {
        id: Date.now().toString(),
        userId: req.session.userId,
        name,
        dailyTargetMinutes: parseInt(dailyTargetMinutes) || 120,
        startDate: startDate || MONSTER_LAUNCH_DATE,
        createdAt: new Date().toISOString()
    };
    categories.push(newCat);
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, category: newCat });
});

app.delete('/api/study/categories/:id', requireAuth, (req, res) => {
    let categories = readJSON(STUDY_CATEGORIES_FILE);
    const index = categories.findIndex(c => c.id === req.params.id && c.userId === req.session.userId);
    if (index === -1) return res.status(404).json({ error: "Category not found." });
    categories.splice(index, 1);
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, message: "Category deleted." });
});

app.get('/api/study/sessions', requireAuth, (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;

    const dateStatus = validateDateAccess(targetDate);
    const categories = readJSON(STUDY_CATEGORIES_FILE).filter(c => c.userId === req.session.userId);
    const sessions = readJSON(STUDY_SESSIONS_FILE).filter(s => s.userId === req.session.userId && s.date === targetDate);

    let examData = getExamModeData(req.session.userId);
    const totalTargetMinutes = examData.enabled ? examData.targetMinutes : categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
    const totalStudiedMinutes = sessions.reduce((acc, s) => acc + (parseInt(s.durationMinutes) || 0), 0);
    const progressPercent = totalTargetMinutes > 0 ? Math.min(Math.round((totalStudiedMinutes / totalTargetMinutes) * 100), 100) : 0;
    const isDone = totalTargetMinutes > 0 && totalStudiedMinutes >= totalTargetMinutes;
    const studyStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateStreak(req.session.userId, 'habit');

    runServerSyncEngine(req.session.userId, targetDate);

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
        dateStatus,
        ...getUserXP(req.session.userId)
    });
});

app.post('/api/study/sessions', requireAuth, async (req, res) => {
    const { categoryId, topic, durationMinutes, date } = req.body;
    if (!categoryId || !durationMinutes) return res.status(400).json({ error: "Category and duration are required." });
    const targetDate = date || getServerToday();

    if (targetDate < MONSTER_LAUNCH_DATE) {
        return res.status(403).json({ error: "🔒 PRE-LAUNCH: Planning Mode active. Logging locked until 10/9/2026." });
    }

    const dateStatus = validateDateAccess(targetDate);
    if (dateStatus === 'LOCKED') return res.status(403).json({ error: "🔒 LOCKED: Past study logs immutable." });

    const sessions = readJSON(STUDY_SESSIONS_FILE);
    const newSession = {
        id: Date.now().toString(),
        userId: req.session.userId,
        categoryId,
        topic: topic || "Deep Work Session",
        durationMinutes: parseInt(durationMinutes),
        date: targetDate,
        createdAt: new Date().toISOString()
    };
    sessions.push(newSession);
    writeJSON(STUDY_SESSIONS_FILE, sessions);

    let xpGained = parseInt(durationMinutes) * 2;
    let updatedXP = addXP(req.session.userId, xpGained);

    const syncResult = runServerSyncEngine(req.session.userId, targetDate);

    if (syncResult.studyDone) {
        let eventKey = `study_done_${targetDate}_${req.session.userId}`;
        await sendTelegramAlert(
            `🐲 *MONSTER MODE ON*\n📚 *STUDY TARGET MET!*\n⭐ *XP Gained:* +${xpGained} (Level ${updatedXP.level})`,
            eventKey
        );
    }

    res.json({ success: true, session: newSession, studyDone: syncResult.studyDone, ...updatedXP });
});

app.delete('/api/study/sessions/:id', requireAuth, async (req, res) => {
    let sessions = readJSON(STUDY_SESSIONS_FILE);
    const index = sessions.findIndex(s => s.id === req.params.id && s.userId === req.session.userId);
    if (index === -1) return res.status(404).json({ error: "Session not found." });
    const targetDate = sessions[index].date;

    const dateStatus = validateDateAccess(targetDate);
    if (dateStatus === 'LOCKED') return res.status(403).json({ error: "🔒 LOCKED: Immutable." });

    sessions.splice(index, 1);
    writeJSON(STUDY_SESSIONS_FILE, sessions);
    runServerSyncEngine(req.session.userId, targetDate);

    res.json({ success: true, message: "Session deleted." });
});

// --- HYGIENE TRACKER API ---
app.get('/api/hygiene', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const tasks = readJSON(HYGIENE_TASKS_FILE).filter(t => t.userId === userId || t.userId === 'default');
    const logs = readJSON(HYGIENE_LOGS_FILE).filter(l => l.userId === userId);
    const today = getServerToday();
    const targetDate = req.query.date || today;

    const dateStatus = validateDateAccess(targetDate);
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
    let hygieneStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateStreak(userId, 'hygiene');

    res.json({
        success: true,
        tasks: tasksWithStatus,
        applicableTasks,
        allDone,
        hygieneStreak,
        isSunday,
        serverDate: targetDate,
        dateStatus,
        ...getUserXP(userId)
    });
});

app.post('/api/hygiene', requireAuth, (req, res) => {
    const { name, frequency, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Task name is required." });
    const tasks = readJSON(HYGIENE_TASKS_FILE);
    const newTask = {
        id: Date.now().toString(),
        userId: req.session.userId,
        name,
        frequency: frequency || 'daily',
        startDate: startDate || MONSTER_LAUNCH_DATE
    };
    tasks.push(newTask);
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, task: newTask });
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

    if (targetDate < MONSTER_LAUNCH_DATE) {
        return res.status(403).json({ error: "🔒 PRE-LAUNCH: Planning Mode active. Toggling locked until 10/9/2026." });
    }

    const dateStatus = validateDateAccess(targetDate);
    if (dateStatus === 'LOCKED') return res.status(403).json({ error: "🔒 LOCKED: Past hygiene logs are immutable." });

    let logs = readJSON(HYGIENE_LOGS_FILE);
    let index = logs.findIndex(l => l.taskId === taskId && l.date === targetDate && l.userId === req.session.userId);
    if (index > -1) {
        logs[index].completed = completed;
    } else {
        logs.push({ id: Date.now().toString(), userId: req.session.userId, taskId, date: targetDate, completed });
    }
    writeJSON(HYGIENE_LOGS_FILE, logs);

    let updatedXP = getUserXP(req.session.userId);
    if (completed) {
        updatedXP = addXP(req.session.userId, 40);
    }

    let hygieneStreak = calculateStreak(req.session.userId, 'hygiene');
    if (completed) {
        await sendTelegramAlert(`🧼 *HYGIENE CARE CONQUERED!*\n⭐ *XP Gained:* +40 (Level ${updatedXP.level})\n🔥 *Hygiene Streak:* ${hygieneStreak} Days.`);
    }

    res.json({ success: true, message: "Hygiene status updated.", hygieneStreak, ...updatedXP });
});

app.post('/api/telegram/trigger-sunday-hygiene', requireAuth, async (req, res) => {
    const tasks = readJSON(HYGIENE_TASKS_FILE).filter(t => t.frequency === 'sunday');
    let message = `🌟 *SUNDAY GROOMING COMMAND (MONSTER MODE)*\nToday is Sunday! Complete your special grooming vectors:\n`;
    tasks.forEach(t => { message += `• ${t.name} ○ PENDING\n`; });
    message += `\n"Take care of yourself like an elite athlete." 🧼✨`;

    await sendTelegramAlert(message);
    res.json({ success: true, message: "Sunday hygiene checklist dispatched to Telegram bot!" });
});

app.listen(PORT, () => {
    console.log(`🚀 MONSTER MODE Server running at http://localhost:${PORT}`);
});

// External Ping Route to Keep Server Alive & Trigger Cron Checks
app.get('/api/cron/ping', (req, res) => {
    console.log("⏰ [Cron Ping Received]: Keeping server awake and active.");
    res.json({ success: true, message: "Monster Mode server is wide awake!" });
});