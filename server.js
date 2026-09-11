const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');
const { getServerToday, validateDateAccess } = require('./server/services/dateService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Render / Production Reverse Proxy Fix
app.set('trust proxy', 1);

// Database File Paths
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
const USER_XP_FILE = path.join(__dirname, 'user_xp.json');
const LANDING_BG_FILE = path.join(__dirname, 'landing_bg.json');
const DASHBOARD_BG_FILE = path.join(__dirname, 'dashboard_bg.json');
const NOTES_REMINDERS_FILE = path.join(__dirname, 'notes_reminders.json');
const SYSTEM_LOCK_FILE = path.join(__dirname, 'system_lock.json');
const USERS_AUTH_FILE = path.join(__dirname, 'users_auth.json');
const MATES_FILE = path.join(__dirname, 'mates.json');
const GATEWAY_TEXT_FILE = path.join(__dirname, 'gateway_text.json'); 

// 🔥 NEW LAUNCH DATE SET TO 12-09-2026 🔥
const MONSTER_LAUNCH_DATE = "2026-09-12";
const MASTER_USER_ID = "admin_master_user";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Secure Telegram Notification Dispatcher
async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
    } catch (err) {
        console.error('Telegram dispatch error:', err);
    }
}

// Robust JSON Persistence Reader with Starter Items
function readJSON(file) {
    if (!fs.existsSync(file)) {
        let initial = [];
        if (file === HABITS_FILE) {
            initial = [
                { id: 'hab_1', userId: MASTER_USER_ID, name: '🌅 5 AM Wakeup & Deep Work', category: 'Discipline', description: 'Early morning momentum', startDate: MONSTER_LAUNCH_DATE },
                { id: 'hab_2', userId: MASTER_USER_ID, name: '📵 Zero Social Media Scroll', category: 'Focus', description: 'Dopamine detox', startDate: MONSTER_LAUNCH_DATE },
                { id: 'hab_3', userId: MASTER_USER_ID, name: '📖 Read 10 Pages Daily', category: 'Mindset', description: 'Core knowledge expansion', startDate: MONSTER_LAUNCH_DATE }
            ];
        } else if (file === WORKOUTS_FILE) {
            initial = [
                { id: 'w_1', userId: MASTER_USER_ID, name: 'Pushups', sets: 4, value: 25, unit: 'reps', category: 'Strength', startDate: MONSTER_LAUNCH_DATE },
                { id: 'w_2', userId: MASTER_USER_ID, name: 'Pullups', sets: 3, value: 10, unit: 'reps', category: 'Strength', startDate: MONSTER_LAUNCH_DATE },
                { id: 'w_3', userId: MASTER_USER_ID, name: 'Core Planks', sets: 3, value: 60, unit: 'secs', category: 'Endurance', startDate: MONSTER_LAUNCH_DATE }
            ];
        } else if (file === STUDY_CATEGORIES_FILE) {
            initial = [
                { id: 's_1', userId: MASTER_USER_ID, name: 'Web Dev & Fullstack Architecture', dailyTargetMinutes: 120, startDate: MONSTER_LAUNCH_DATE, endDate: '' },
                { id: 's_2', userId: MASTER_USER_ID, name: 'Data Structures & Algorithms', dailyTargetMinutes: 90, startDate: MONSTER_LAUNCH_DATE, endDate: '' }
            ];
        } else if (file === HYGIENE_TASKS_FILE) {
            initial = [
                { id: 'h1', userId: MASTER_USER_ID, name: '🧴 Hair Care Routine', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h2', userId: MASTER_USER_ID, name: '🧼 Face Cleansing & Care', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE },
                { id: 'h3', userId: MASTER_USER_ID, name: '🚿 Cold Shower & Body Grooming', frequency: 'daily', startDate: MONSTER_LAUNCH_DATE }
            ];
        } else if (file === USERS_AUTH_FILE) {
            const salt = bcrypt.genSaltSync(10);
            initial = [
                { id: 'u_admin', email: 'admin@monstermode.com', passwordHash: bcrypt.hashSync('MonsterAdmin@2026', salt), role: 'ADMIN' },
                { id: 'u_tracker', email: 'jaiminvankar520@gmail.com', passwordHash: bcrypt.hashSync('Jay#monster', salt), role: 'TRACKER_USER' }
            ];
        } else if (file === MATES_FILE) {
            initial = [];
        } else if (file === GATEWAY_TEXT_FILE) { 
            initial = { headline: "BECOME A<br>MONSTER.<br>DOMINATE REALITY.", subtext: "Pure discipline. Zero excuses. Absolute control." };
        } else if (file === USER_XP_FILE || file === HYDRATION_FILE || file === EXAM_MODE_FILE || file === SANCTUARY_FILE || file === LANDING_BG_FILE || file === DASHBOARD_BG_FILE || file === NOTES_REMINDERS_FILE || file === SYSTEM_LOCK_FILE) {
            initial = {};
            if (file === HYDRATION_FILE) initial[MASTER_USER_ID] = { goal: 3000, glassSize: 250, logs: {} };
            if (file === EXAM_MODE_FILE) initial[MASTER_USER_ID] = { enabled: false, targetMinutes: 90 };
            if (file === SANCTUARY_FILE) initial[MASTER_USER_ID] = { enabled: false, activatedAt: null, reason: "" };
            if (file === USER_XP_FILE) initial[MASTER_USER_ID] = { xp: 0, level: 1 };
            if (file === LANDING_BG_FILE) initial = { url: "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" };
            if (file === DASHBOARD_BG_FILE) initial = { color: "#07090f" };
            if (file === NOTES_REMINDERS_FILE) initial = { [MASTER_USER_ID]: [] };
            if (file === SYSTEM_LOCK_FILE) initial = { locked: false, lockedAt: null };
        }
        fs.writeFileSync(file, JSON.stringify(initial, null, 2));
    }
    try {
        let content = fs.readFileSync(file, 'utf8');
        let parsed = JSON.parse(content);
        if (file === NOTES_REMINDERS_FILE && Array.isArray(parsed)) {
            let converted = { [MASTER_USER_ID]: parsed };
            fs.writeFileSync(file, JSON.stringify(converted, null, 2));
            return converted;
        }
        return parsed;
    } catch (err) {
        return file.includes('data.json') || file.includes('mode.json') || file.includes('xp.json') || file.includes('bg.json') || file.includes('lock.json') || file.includes('notes_reminders.json') || file.includes('gateway_text.json') ? {} : [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getSystemLockStatus() {
    let lockData = readJSON(SYSTEM_LOCK_FILE);
    if (!lockData || lockData.locked === undefined) {
        lockData = { locked: false, lockedAt: null };
        writeJSON(SYSTEM_LOCK_FILE, lockData);
    }
    return lockData;
}

function getLandingBg() {
    let bgData = readJSON(LANDING_BG_FILE);
    if (!bgData || !bgData.url) {
        bgData = { url: "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" };
        writeJSON(LANDING_BG_FILE, bgData);
    }
    return bgData;
}

function getDashboardBg() {
    let bgData = readJSON(DASHBOARD_BG_FILE);
    if (!bgData || !bgData.color) {
        bgData = { color: "#07090f" };
        writeJSON(DASHBOARD_BG_FILE, bgData);
    }
    return bgData;
}

function getHydrationData(userId = MASTER_USER_ID) {
    let data = readJSON(HYDRATION_FILE);
    if (!data[userId]) {
        data[userId] = { goal: 3000, glassSize: 250, logs: {} };
        writeJSON(HYDRATION_FILE, data);
    }
    return data[userId];
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
    if (!data[userId]) {
        data[userId] = { enabled: false, targetMinutes: 90 };
        writeJSON(EXAM_MODE_FILE, data);
    }
    return data[userId];
}

function getSanctuaryData(userId = MASTER_USER_ID) {
    let data = readJSON(SANCTUARY_FILE);
    if (!data[userId]) {
        data[userId] = { enabled: false, activatedAt: null, reason: "" };
        writeJSON(SANCTUARY_FILE, data);
    }
    return data[userId];
}

function addXP(userId = MASTER_USER_ID, amount) {
    let xpData = readJSON(USER_XP_FILE);
    if (!xpData[userId]) xpData[userId] = { xp: 0, level: 1 };
    xpData[userId].xp += amount;
    xpData[userId].level = Math.floor(xpData[userId].xp / 500) + 1;
    writeJSON(USER_XP_FILE, xpData);
    return xpData[userId];
}

function getUserXP(userId = MASTER_USER_ID) {
    let xpData = readJSON(USER_XP_FILE);
    if (!xpData[userId]) {
        xpData[userId] = { xp: 0, level: 1 };
        writeJSON(USER_XP_FILE, xpData);
    }
    return xpData[userId];
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

function runServerSyncEngine(userId = MASTER_USER_ID, targetDate) {
    const today = getServerToday();
    if (targetDate > today || targetDate < MONSTER_LAUNCH_DATE) {
        return { allWorkoutsDone: false, studyDone: false, hydrationDone: false, totalStudiedMinutes: 0, totalTargetMinutes: 0 };
    }
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
    let studyDone = totalTargetMinutes > 0 && totalStudiedMinutes >= totalTargetMinutes && categories.length > 0 && sessions.length > 0;

    let hydData = getHydrationData(userId);
    let consumed = hydData.logs[targetDate] || 0;
    let hydrationDone = consumed >= (hydData.goal || 3000);

    return { allWorkoutsDone, studyDone, hydrationDone, totalStudiedMinutes, totalTargetMinutes };
}

// Express App Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'monster_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
}));

// ======================================================================
// 🛡️ SECURITY HTML INTERCEPTOR (HARDCORE OPTION 1 FOR SINGLE USER)
// ======================================================================
app.use((req, res, next) => {
    const trackerPages = ['/dashboard', '/dashboard.html', '/tracker', '/tracker.html', '/workout', '/workout.html', '/study', '/study.html', '/hygiene', '/hygiene.html', '/hydration', '/hydration.html'];
    const isTrackerPage = trackerPages.some(page => req.path === page);

    if (isTrackerPage) {
        if (!req.session || !req.session.userId) {
            return res.redirect('/index.html');
        }

        let lockStatus = getSystemLockStatus();
        
        // 🔴 STRICT BLOCK: In Single-User Mode, if system is locked, YOU are blocked too!
        if (lockStatus.locked) {
            return res.send(`
                <!DOCTYPE html>
                <html lang="en" class="dark">
                <head>
                    <meta charset="UTF-8">
                    <title>HARDCORE LOCK ACTIVE</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-[#07090f] text-white min-h-screen flex items-center justify-center p-4">
                    <div class="bg-[#121520] p-8 rounded-3xl border-2 border-red-500/50 max-w-md w-full text-center space-y-4 shadow-[0_0_50px_rgba(239,68,68,0.4)]">
                        <span class="text-5xl animate-pulse">🛑</span>
                        <h2 class="text-3xl font-black uppercase text-red-500 tracking-wider">HARDCORE LOCK</h2>
                        <p class="text-sm text-slate-300">The entire tracking system is currently in HARD LOCK. No execution vectors can be accessed.</p>
                        <button onclick="window.location.href='control-panel.html'" class="w-full mt-6 py-4 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl text-xs uppercase tracking-widest cursor-pointer shadow-lg shadow-red-600/30 transition">
                            Open Control Panel
                        </button>
                    </div>
                </body>
                </html>
            `);
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Standard API Auth Guard
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "🔒 Unauthorized access. Please log in first." });
    }
    next();
}

// Tracker API Guard
function trackerApiGuard(req, res, next) {
    let lockStatus = getSystemLockStatus();
    if (lockStatus.locked) {
        return res.status(403).json({ error: "🛡️ HARDCORE LOCK: System is totally locked." });
    }
    next();
}

console.log("🔥 MONSTER MODE: Production Server & Telegram Cron System Active.");

// ================= TELEGRAM CRON SCHEDULER =================
cron.schedule('0 7 * * *', async () => {
    const msg = `🌅 *MONSTER MODE ON — MORNING AUDIT*\n\n"Discipline equals absolute freedom."\n\n✅ Check your Daily Hydration & Hygiene targets.\n🔥 Stay locked in and crush your goals today!`;
    await sendTelegramMessage(msg);
}, { timezone: 'Asia/Kolkata' });

async function sendTelegramMessage(message) {
    await sendTelegramNotification(message);
}

// 🔥 FIX: Server Timezone Issue (Convert explicitly to IST / Indian Time)
cron.schedule('* * * * *', async () => {
    try {
        let notesData = readJSON(NOTES_REMINDERS_FILE);
        
        let istTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        let istNow = new Date(istTimeStr);
        
        let todayStr = istNow.getFullYear() + "-" + String(istNow.getMonth() + 1).padStart(2, '0') + "-" + String(istNow.getDate()).padStart(2, '0');
        
        let currentHours = String(istNow.getHours()).padStart(2, '0');
        let currentMinutes = String(istNow.getMinutes()).padStart(2, '0');
        let currentTimeStr = `${currentHours}:${currentMinutes}`;

        let updated = false;
        for (let userId in notesData) {
            let items = notesData[userId];
            if (!Array.isArray(items)) continue;

            for (let item of items) {
                if (item.isReminder && !item.notifiedToday && item.date === todayStr && item.time === currentTimeStr) {
                    await sendTelegramMessage(`⏰ *MONSTER REMINDER ALERT*\n\n📌 *${item.title}*\n📝 ${item.description || 'No details.'}\n\n🔥 *Execute immediately!*`);
                    item.notifiedToday = true;
                    updated = true;
                }
            }
        }
        if (updated) writeJSON(NOTES_REMINDERS_FILE, notesData);
    } catch (err) {
        console.error("Reminder Cron Error:", err);
    }
});

// ================= 🔐 SYSTEM LOCK/UNLOCK =================
app.get('/api/system-lock', (req, res) => {
    let lockData = getSystemLockStatus();
    res.json({ success: true, ...lockData });
});

app.post('/api/system-lock', requireAuth, async (req, res) => {
    const { locked, adminPassword, password } = req.body;
    const pwdToVerify = adminPassword || password;
    
    // 🔥 3FA MASTER KEY
    if (pwdToVerify !== "Jay_monster_mode_on") {
        return res.status(403).json({ error: "❌ Wrong Password! Incorrect Admin Master Password for System Control." });
    }
    
    let currentLockData = getSystemLockStatus();
    let newLockStatus = locked !== undefined ? locked : true;

    // 🛑 SPAM FIX: Jo status already same hoy to telegram msg nai moklavano
    if (currentLockData.locked === newLockStatus) {
        return res.json({ 
            success: true, 
            message: `System is already ${newLockStatus ? 'LOCKED' : 'UNLOCKED'}.`, 
            ...currentLockData 
        });
    }
    
    // Status change thay to j save karo ane 1 j vaar message moklo
    let lockData = { locked: newLockStatus, lockedAt: newLockStatus ? new Date().toISOString() : null };
    writeJSON(SYSTEM_LOCK_FILE, lockData);
    
    const actionText = lockData.locked ? "System is now in Hardcore Lock." : "System Unlocked.";
    await sendTelegramNotification(`🛡️ *SYSTEM CONTROL*\nStatus changed to: *${lockData.locked ? 'HARDCORE LOCKED 🛑' : 'UNLOCKED 🟢'}*`);
    
    res.json({ success: true, message: actionText, ...lockData });
});

app.post('/api/verify-action-password', requireAuth, (req, res) => {
    const { actionType, password } = req.body;
    let validPassword = "";
    if (actionType === 'add') validPassword = "Jay#add@monster";
    else if (actionType === 'edit') validPassword = "Jay#edit@monster";
    else if (actionType === 'delete') validPassword = "Jay#del@monster";

    if (password !== validPassword) {
        return res.status(403).json({ error: `🔒 Wrong Password! Invalid Action Password for ${actionType.toUpperCase()}.` });
    }
    res.json({ success: true, message: "Action authorized successfully." });
});

// 🔥 NEW: Gateway Text API
app.get('/api/gateway-text', (req, res) => {
    let textData = readJSON(GATEWAY_TEXT_FILE);
    res.json({ success: true, ...textData });
});

app.post('/api/control-panel/gateway-text', requireAuth, (req, res) => {
    const { headline, subtext, password } = req.body;
    if (password !== "Jay#edit@monster") {
        return res.status(403).json({ error: "Unauthorized Password." });
    }
    writeJSON(GATEWAY_TEXT_FILE, { headline, subtext });
    res.json({ success: true, message: "Gateway text updated successfully." });
});

app.get('/api/landing-bg', (req, res) => { res.json({ success: true, ...getLandingBg() }); });
app.post('/api/control-panel/landing-bg', requireAuth, (req, res) => {
    const { url, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized." });
    }
    if (!url) return res.status(400).json({ error: "Image URL is required." });
    writeJSON(LANDING_BG_FILE, { url });
    res.json({ success: true, message: "Landing background updated successfully." });
});

app.get('/api/dashboard-bg', (req, res) => { res.json({ success: true, ...getDashboardBg() }); });
app.post('/api/control-panel/dashboard-bg', requireAuth, (req, res) => {
    const { color, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized." });
    }
    if (!color) return res.status(400).json({ error: "Background color is required." });
    writeJSON(DASHBOARD_BG_FILE, { color });
    res.json({ success: true, message: "Dashboard background color updated successfully." });
});


// ================= AUTHENTICATION & MULTI-LAYER LOGIN ROUTES =================

// LAYER 1: Email + Password -> Generates OTP (2FA)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    let users = readJSON(USERS_AUTH_FILE);
    let user = users.find(u => u.email === email);

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "Wrong Password! Invalid email or password." });
    }

    // 🔒 CHECK 1: If system is locked, reject IMMEDIATELY. Don't even send OTP.
    let lockStatus = getSystemLockStatus();
    if (lockStatus.locked && user.role !== 'ADMIN') {
        return res.status(403).json({ error: "🛑 HARDCORE LOCK: System is locked. Tracker access denied.", locked: true });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.pendingAuth = { userId: user.id, role: user.role, email: user.email, otp: otp, isAdminPortal: false };

    await sendTelegramNotification(`🔐 *SECURITY ALERT: LOGIN ATTEMPT*\n\nPortal: *TRACKER*\nUser: \`${user.email}\`\n\nYour Authorization Code is: \`${otp}\``);
    res.json({ success: true, requireOtp: true, message: "Authorization code sent to your Telegram." });
});

// LAYER 1 (ADMIN): Email + Password -> Generates OTP (2FA)
app.post('/api/control-panel/login', async (req, res) => {
    const { email, password } = req.body;
    let users = readJSON(USERS_AUTH_FILE);
    let user = users.find(u => u.email === email && u.role === 'ADMIN');

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "🔒 Access Denied! Invalid Admin credentials." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.pendingAuth = { userId: user.id, role: user.role, email: user.email, otp: otp, isAdminPortal: true };

    await sendTelegramNotification(`🔐 *SECURITY ALERT: ADMIN LOGIN ATTEMPT*\n\nPortal: *CONTROL PANEL*\nUser: \`${user.email}\`\n\nYour Admin Authorization Code is: \`${otp}\``);
    res.json({ success: true, requireOtp: true, message: "Admin authorization code sent to your Telegram." });
});

// LAYER 2: OTP Verification
app.post('/api/auth/verify-otp', async (req, res) => {
    const { otp, portal } = req.body;

    if (!req.session.pendingAuth) {
        return res.status(400).json({ error: "Session expired or invalid. Please try logging in again." });
    }

    if (req.session.pendingAuth.otp !== otp) {
        return res.status(401).json({ error: "❌ Incorrect OTP Code! Access Denied." });
    }

    // 🛡️ SECURITY BREACH CHECK: Verify the portal context matches the initial login
    if (portal === 'admin' && !req.session.pendingAuth.isAdminPortal) {
        delete req.session.pendingAuth;
        return res.status(403).json({ error: "❌ Security Breach Detected! Invalid portal execution flow." });
    }

    // 🔒 CHECK 2: THE ULTIMATE DOUBLE-LOCK VALIDATION
    // Even if OTP is 100% correct, check the lock status right before granting access!
    let lockStatus = getSystemLockStatus();
    if (lockStatus.locked && portal !== 'admin') {
        delete req.session.pendingAuth; // Destroy the session immediately
        return res.status(403).json({ error: "🛑 HARDCORE LOCK: Portal is currently locked by Admin. Correct OTP Denied.", locked: true });
    }

    if (portal === 'admin') {
        // Admin needs 3FA, move to next step
        req.session.pendingAuth.otpVerified = true;
        return res.json({ success: true, require3fa: true, message: "OTP Verified. Awaiting Master Control Key." });
    } else {
        // Tracker user is done after 2FA
        req.session.userId = req.session.pendingAuth.userId;
        req.session.role = req.session.pendingAuth.role;
        req.session.email = req.session.pendingAuth.email;
        const emailToLog = req.session.email;
        
        delete req.session.pendingAuth;

        await sendTelegramNotification(`🐲 *MONSTER MODE ON*\n🟢 *TRACKER PORTAL LOGIN SUCCESSFUL*\nUser: \`${emailToLog}\`\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
        return res.json({ success: true, message: "Login successful!" });
    }
});

// LAYER 3 (ADMIN ONLY): Master Key Verification
app.post('/api/control-panel/verify-3fa', async (req, res) => {
    const { masterKey } = req.body;

    if (!req.session.pendingAuth || !req.session.pendingAuth.otpVerified) {
        return res.status(400).json({ error: "Invalid security flow. OTP verification required first." });
    }

    // 🔥 3FA MASTER KEY
    if (masterKey !== "Jay_monster_mode_on") {
        return res.status(401).json({ error: "❌ Invalid Master Key! 3FA Access Denied." });
    }

    req.session.userId = req.session.pendingAuth.userId;
    req.session.role = req.session.pendingAuth.role;
    req.session.email = req.session.pendingAuth.email;
    req.session.controlPanelAuth = true;

    const emailToLog = req.session.email;
    delete req.session.pendingAuth;

    await sendTelegramNotification(`🐲 *MONSTER MODE ON*\n🟢 *ADMIN PANEL LOGIN SUCCESSFUL (3FA VERIFIED)*\nUser: \`${emailToLog}\`\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

    res.json({ success: true, message: "Admin Login full clearance granted." });
});

app.post('/api/auth/logout', async (req, res) => {
    let email = req.session.email || 'User';
    req.session.destroy(async () => {
        try {
            await sendTelegramNotification(`🐲 *MONSTER MODE ON*\n🔴 *TRACKER PORTAL LOGOUT*\nUser: ${email}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
        } catch (e) {}
        res.json({ success: true, message: "Logged out successfully." });
    });
});

app.get('/api/auth/session', requireAuth, (req, res) => {
    let xpInfo = getUserXP(req.session.userId || MASTER_USER_ID);
    res.json({ authenticated: true, email: req.session.email || "jaiminvankar520@gmail.com", role: req.session.role || 'TRACKER_USER', ...xpInfo });
});

app.post('/api/control-panel/logout', async (req, res) => { 
    req.session.controlPanelAuth = false; 
    try {
        await sendTelegramNotification(`🐲 *MONSTER MODE ON*\n🛑 *ADMIN PANEL LOGOUT*\nStatus: Session Ended\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
    } catch (e) {}
    res.json({ success: true, message: "Control Panel logged out." }); 
});

app.get('/api/control-panel/session', requireAuth, (req, res) => { res.json({ authenticated: true, email: "jaiminvankar520@gmail.com" }); });

// ================= EXAM & SANCTUARY MODES =================
app.get('/api/exam-mode', requireAuth, trackerApiGuard, (req, res) => {
    let data = getExamModeData(req.session.userId || MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/exam-mode', requireAuth, trackerApiGuard, async (req, res) => {
    const { enabled, targetMinutes } = req.body;
    let data = readJSON(EXAM_MODE_FILE);
    let userId = req.session.userId || MASTER_USER_ID;
    let minutes = targetMinutes ? parseInt(targetMinutes) : 90;
    data[userId] = { enabled: enabled !== undefined ? enabled : false, targetMinutes: minutes };
    writeJSON(EXAM_MODE_FILE, data);
    res.json({ success: true, message: "Exam Mode updated." });
});

app.get('/api/sanctuary', requireAuth, trackerApiGuard, (req, res) => {
    let data = getSanctuaryData(req.session.userId || MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/sanctuary', requireAuth, trackerApiGuard, async (req, res) => {
    const { enabled, reason } = req.body;
    let data = readJSON(SANCTUARY_FILE);
    let userId = req.session.userId || MASTER_USER_ID;
    let today = getServerToday();
    
    let currentStatus = data[userId] ? data[userId].enabled : false;
    let newStatus = enabled !== undefined ? enabled : false;

    // 🛑 SPAM FIX: Status change thay to j message moklo
    if (currentStatus !== newStatus) {
        data[userId] = { enabled: newStatus, activatedAt: newStatus ? today : null, reason: reason || "Emergency Recovery" };
        writeJSON(SANCTUARY_FILE, data);
        await sendTelegramNotification(`⚠️ *SANCTUARY PROTOCOL*\nUser toggled sanctuary to: *${newStatus ? 'ON' : 'OFF'}*`);
    } else {
        if(data[userId]) {
            data[userId].reason = reason || data[userId].reason;
        } else {
            data[userId] = { enabled: newStatus, activatedAt: null, reason: reason || "Emergency Recovery" };
        }
        writeJSON(SANCTUARY_FILE, data);
    }
    
    res.json({ success: true, message: "Sanctuary updated.", ...data[userId] });
});

// ================= HYDRATION API =================
app.get('/api/hydration', requireAuth, trackerApiGuard, (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let userId = req.session.userId || MASTER_USER_ID;
    let hydData = getHydrationData(userId);
    let consumed = hydData.logs[targetDate] || 0;
    let percent = Math.min(Math.round((consumed / hydData.goal) * 100), 100);
    let hydrationStreak = calculateHydrationStreak(userId);
    res.json({ success: true, goal: hydData.goal, glassSize: hydData.glassSize, consumed, percent, hydrationStreak, history: hydData.logs, serverDate: targetDate });
});

app.post('/api/hydration/drink', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.body.date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let userId = req.session.userId || MASTER_USER_ID;
    let hydData = getHydrationData(userId);
    let current = hydData.logs[targetDate] || 0;
    let added = hydData.glassSize || 250;
    let newTotal = current + added;
    hydData.logs[targetDate] = newTotal;
    let dataAll = readJSON(HYDRATION_FILE);
    dataAll[userId] = hydData;
    writeJSON(HYDRATION_FILE, dataAll);
    let percent = Math.min(Math.round((newTotal / hydData.goal) * 100), 100);
    let hydrationStreak = calculateHydrationStreak(userId);
    res.json({ success: true, consumed: newTotal, percent, hydrationStreak, ...getUserXP(userId) });
});

app.post('/api/hydration/settings', requireAuth, trackerApiGuard, (req, res) => {
    const { goal, glassSize } = req.body;
    let userId = req.session.userId || MASTER_USER_ID;
    let hydData = getHydrationData(userId);
    if (goal) hydData.goal = parseInt(goal);
    if (glassSize) hydData.glassSize = parseInt(glassSize);
    let dataAll = readJSON(HYDRATION_FILE);
    dataAll[userId] = hydData;
    writeJSON(HYDRATION_FILE, dataAll);
    res.json({ success: true, message: "Hydration settings updated." });
});

// ================= NOTES & REMINDERS API =================
app.get('/api/notes-reminders', requireAuth, trackerApiGuard, (req, res) => {
    let data = readJSON(NOTES_REMINDERS_FILE);
    let userId = req.session.userId || MASTER_USER_ID;
    let items = Array.isArray(data) ? data : (data[userId] || data[MASTER_USER_ID] || []);
    res.json({ success: true, items, ...getUserXP(userId) });
});

app.post('/api/notes-reminders', requireAuth, trackerApiGuard, (req, res) => {
    const { title, description, isReminder, date, time, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding note." });
    }
    if (!title) return res.status(400).json({ error: "Title is required." });
    let data = readJSON(NOTES_REMINDERS_FILE);
    let userId = req.session.userId || MASTER_USER_ID;
    let items = Array.isArray(data) ? data : (data[userId] || data[MASTER_USER_ID] || []);
    const newItem = { id: Date.now().toString(), userId, title, description: description || "", isReminder: isReminder ? true : false, date: date || getServerToday(), time: time || "", completed: false, notifiedToday: false, createdAt: new Date().toISOString() };
    items.push(newItem);
    writeJSON(NOTES_REMINDERS_FILE, { [MASTER_USER_ID]: items, [userId]: items });
    res.json({ success: true, item: newItem });
});

app.post('/api/notes-reminders/:id/toggle', requireAuth, trackerApiGuard, (req, res) => {
    let data = readJSON(NOTES_REMINDERS_FILE);
    let userId = req.session.userId || MASTER_USER_ID;
    let items = Array.isArray(data) ? data : (data[userId] || data[MASTER_USER_ID] || []);
    const index = items.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Item not found." });
    
    items[index].completed = !items[index].completed;
    writeJSON(NOTES_REMINDERS_FILE, { [MASTER_USER_ID]: items, [userId]: items });
    res.json({ success: true, completed: items[index].completed });
});

app.delete('/api/notes-reminders/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized delete password." });
    }
    let data = readJSON(NOTES_REMINDERS_FILE);
    let userId = req.session.userId || MASTER_USER_ID;
    let items = Array.isArray(data) ? data : (data[userId] || data[MASTER_USER_ID] || []);
    const index = items.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Item not found." });
    items.splice(index, 1);
    writeJSON(NOTES_REMINDERS_FILE, { [MASTER_USER_ID]: items, [userId]: items });
    res.json({ success: true, message: "Item deleted." });
});

// ================= 📋 HABIT TRACKER API =================
app.get('/api/habits', requireAuth, trackerApiGuard, (req, res) => {
    const habits = readJSON(HABITS_FILE);
    const logs = readJSON(HABIT_LOGS_FILE);
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    const habitsWithStatus = habits.map(habit => {
        const targetLog = logs.find(l => l.habitId === habit.id && l.date === targetDate);
        const habitLogs = logs.filter(l => l.habitId === habit.id && l.completed);
        return { ...habit, completedToday: targetLog ? targetLog.completed : false, streak: targetDate < MONSTER_LAUNCH_DATE ? 0 : habitLogs.length, serverToday: today };
    });
    res.json({ success: true, habits: habitsWithStatus, serverDate: targetDate, dateStatus, ...getUserXP(req.session.userId || MASTER_USER_ID) });
});

app.post('/api/habits', requireAuth, trackerApiGuard, (req, res) => {
    const { name, category, description, endDate, startDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding habit." });
    }
    if (!name) return res.status(400).json({ error: "Habit name required." });
    const habits = readJSON(HABITS_FILE);
    const newHabit = { id: 'hab_' + Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, name, category: category || "General", description: description || "", startDate: startDate || MONSTER_LAUNCH_DATE, endDate: endDate || "", createdAt: new Date().toISOString() };
    habits.push(newHabit);
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, habit: newHabit });
});

app.put('/api/habits/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { name, category, description, startDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing habit." });
    }
    let habits = readJSON(HABITS_FILE);
    const index = habits.findIndex(h => h.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Habit not found." });
    habits[index].name = name || habits[index].name;
    habits[index].category = category !== undefined ? category : habits[index].category;
    habits[index].description = description !== undefined ? description : habits[index].description;
    habits[index].startDate = startDate || habits[index].startDate;
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, message: "Habit updated." });
});

app.delete('/api/habits/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting habit." });
    }
    let habits = readJSON(HABITS_FILE);
    const index = habits.findIndex(h => h.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Habit not found." });
    habits.splice(index, 1);
    writeJSON(HABITS_FILE, habits);
    res.json({ success: true, message: "Habit deleted." });
});

app.post('/api/habits/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    const habitId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let logs = readJSON(HABIT_LOGS_FILE);
    let index = logs.findIndex(l => l.habitId === habitId && l.date === targetDate);
    if (index > -1) logs[index].completed = completed;
    else logs.push({ id: Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, habitId, date: targetDate, completed });
    writeJSON(HABIT_LOGS_FILE, logs);
    let userId = req.session.userId || MASTER_USER_ID;
    let updatedXP = getUserXP(userId);
    if (completed) updatedXP = addXP(userId, 50);
    res.json({ success: true, completed, ...updatedXP });
});

// ================= 🏋️ WORKOUT TRACKER API =================
app.get('/api/workouts', requireAuth, trackerApiGuard, (req, res) => {
    const workouts = readJSON(WORKOUTS_FILE);
    const logs = readJSON(WORKOUT_LOGS_FILE);
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const workoutsWithStatus = workouts.map(w => {
        const log = logs.find(l => l.workoutId === w.id && l.date === targetDate);
        return { ...w, completed: log ? log.completed : false };
    });
    const syncResult = runServerSyncEngine(req.session.userId || MASTER_USER_ID, targetDate);
    const currentStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : calculateWorkoutStreak(req.session.userId || MASTER_USER_ID);
    res.json({ success: true, workouts: workoutsWithStatus, allDone: syncResult.allWorkoutsDone, currentStreak, serverDate: targetDate, ...getUserXP(req.session.userId || MASTER_USER_ID) });
});

app.post('/api/workouts', requireAuth, trackerApiGuard, (req, res) => {
    const { name, sets, value, reps, unit, category, startDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding workout." });
    }
    if (!name) return res.status(400).json({ error: "Exercise name required." });
    const workouts = readJSON(WORKOUTS_FILE);
    const newWorkout = { id: 'w_' + Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, name, sets: sets || 3, value: value || reps || 10, unit: unit || 'reps', category: category || "Strength", startDate: startDate || MONSTER_LAUNCH_DATE, createdAt: new Date().toISOString() };
    workouts.push(newWorkout);
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, workout: newWorkout });
});

app.put('/api/workouts/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { name, sets, value, unit, category, startDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing workout." });
    }
    let workouts = readJSON(WORKOUTS_FILE);
    const index = workouts.findIndex(w => w.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Workout not found." });
    workouts[index].name = name || workouts[index].name;
    workouts[index].sets = sets !== undefined ? sets : workouts[index].sets;
    workouts[index].value = value !== undefined ? value : workouts[index].value;
    workouts[index].unit = unit || workouts[index].unit;
    workouts[index].category = category || workouts[index].category;
    workouts[index].startDate = startDate || workouts[index].startDate;
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, message: "Workout updated." });
});

app.delete('/api/workouts/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting workout." });
    }
    let workouts = readJSON(WORKOUTS_FILE);
    const index = workouts.findIndex(w => w.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Workout not found." });
    workouts.splice(index, 1);
    writeJSON(WORKOUTS_FILE, workouts);
    res.json({ success: true, message: "Workout deleted." });
});

app.post('/api/workouts/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    const workoutId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let logs = readJSON(WORKOUT_LOGS_FILE);
    let index = logs.findIndex(l => l.workoutId === workoutId && l.date === targetDate);
    if (index > -1) logs[index].completed = completed;
    else logs.push({ id: Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, workoutId, date: targetDate, completed });
    writeJSON(WORKOUT_LOGS_FILE, logs);
    let userId = req.session.userId || MASTER_USER_ID;
    let updatedXP = getUserXP(userId);
    if (completed) updatedXP = addXP(userId, 100);
    const syncResult = runServerSyncEngine(userId, targetDate);
    res.json({ success: true, allWorkoutsDone: syncResult.allWorkoutsDone, ...updatedXP });
});

// ================= 📚 STUDY TRACKER API =================
app.get('/api/study/categories', requireAuth, trackerApiGuard, (req, res) => {
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    res.json({ success: true, categories });
});

app.post('/api/study/categories', requireAuth, trackerApiGuard, (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding study category." });
    }
    if (!name) return res.status(400).json({ error: "Category name required." });
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    const newCat = { id: 's_' + Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, name: name.trim(), dailyTargetMinutes: parseInt(dailyTargetMinutes) || 120, startDate: startDate || MONSTER_LAUNCH_DATE, endDate: endDate || "", createdAt: new Date().toISOString() };
    categories.push(newCat);
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, category: newCat });
});

app.put('/api/study/categories/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing study category." });
    }
    let categories = readJSON(STUDY_CATEGORIES_FILE);
    const index = categories.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Category not found." });
    categories[index].name = name ? name.trim() : categories[index].name;
    categories[index].dailyTargetMinutes = dailyTargetMinutes !== undefined ? parseInt(dailyTargetMinutes) : categories[index].dailyTargetMinutes;
    categories[index].startDate = startDate || categories[index].startDate;
    categories[index].endDate = endDate !== undefined ? endDate : categories[index].endDate;
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, message: "Category updated." });
});

app.delete('/api/study/categories/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting study category." });
    }
    let categories = readJSON(STUDY_CATEGORIES_FILE);
    const index = categories.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Category not found." });
    categories.splice(index, 1);
    writeJSON(STUDY_CATEGORIES_FILE, categories);
    res.json({ success: true, message: "Category deleted." });
});

app.get('/api/study/sessions', requireAuth, trackerApiGuard, (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const categories = readJSON(STUDY_CATEGORIES_FILE);
    const sessions = readJSON(STUDY_SESSIONS_FILE).filter(s => s.date === targetDate);
    const syncResult = runServerSyncEngine(req.session.userId || MASTER_USER_ID, targetDate);
    res.json({ success: true, categories, sessions, totalTargetMinutes: syncResult.totalTargetMinutes, totalStudiedMinutes: syncResult.totalStudiedMinutes, isDone: syncResult.studyDone, serverDate: targetDate, ...getUserXP(req.session.userId || MASTER_USER_ID) });
});

app.post('/api/study/sessions', requireAuth, trackerApiGuard, async (req, res) => {
    const { categoryId, topic, durationMinutes, date } = req.body;
    if (!categoryId || !durationMinutes) return res.status(400).json({ error: "Required fields missing." });
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    const sessions = readJSON(STUDY_SESSIONS_FILE);
    const newSession = { id: Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, categoryId, topic: topic || "Deep Work", durationMinutes: parseInt(durationMinutes), date: targetDate, createdAt: new Date().toISOString() };
    sessions.push(newSession);
    writeJSON(STUDY_SESSIONS_FILE, sessions);
    let userId = req.session.userId || MASTER_USER_ID;
    let updatedXP = addXP(userId, parseInt(durationMinutes) * 2);
    res.json({ success: true, session: newSession, ...updatedXP });
});

app.delete('/api/study/sessions/:id', requireAuth, trackerApiGuard, async (req, res) => {
    let sessions = readJSON(STUDY_SESSIONS_FILE);
    const index = sessions.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Session not found." });
    sessions.splice(index, 1);
    writeJSON(STUDY_SESSIONS_FILE, sessions);
    res.json({ success: true, message: "Session deleted." });
});

// ================= 🧼 HYGIENE TRACKER API =================
app.get('/api/hygiene', requireAuth, trackerApiGuard, (req, res) => {
    const tasks = readJSON(HYGIENE_TASKS_FILE);
    const logs = readJSON(HYGIENE_LOGS_FILE);
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let targetDateObj = new Date(targetDate);
    let isSunday = targetDateObj.getDay() === 0;
    const tasksWithStatus = tasks.map(t => {
        const log = logs.find(l => l.taskId === t.id && l.date === targetDate);
        return { ...t, completed: log ? log.completed : false, isSundayTask: t.frequency === 'sunday' };
    });
    let applicableTasks = tasksWithStatus.filter(t => t.frequency === 'daily' || (isSunday && t.frequency === 'sunday'));
    let allDone = applicableTasks.length > 0 && applicableTasks.every(t => t.completed);
    res.json({ success: true, tasks: tasksWithStatus, applicableTasks, allDone, serverDate: targetDate, ...getUserXP(req.session.userId || MASTER_USER_ID) });
});

app.post('/api/hygiene', requireAuth, trackerApiGuard, (req, res) => {
    const { name, frequency, startDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding hygiene task." });
    }
    if (!name) return res.status(400).json({ error: "Task name required." });
    const tasks = readJSON(HYGIENE_TASKS_FILE);
    const newTask = { id: 'h_' + Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, name, frequency: frequency || 'daily', startDate: startDate || MONSTER_LAUNCH_DATE };
    tasks.push(newTask);
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, task: newTask });
});

app.put('/api/hygiene/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { name, frequency, startDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing hygiene task." });
    }
    let tasks = readJSON(HYGIENE_TASKS_FILE);
    const index = tasks.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Task not found." });
    tasks[index].name = name || tasks[index].name;
    tasks[index].frequency = frequency !== undefined ? frequency : tasks[index].frequency;
    tasks[index].startDate = startDate || tasks[index].startDate;
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, message: "Task updated." });
});

app.delete('/api/hygiene/:id', requireAuth, trackerApiGuard, (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting hygiene task." });
    }
    let tasks = readJSON(HYGIENE_TASKS_FILE);
    const index = tasks.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Task not found." });
    tasks.splice(index, 1);
    writeJSON(HYGIENE_TASKS_FILE, tasks);
    res.json({ success: true, message: "Task deleted." });
});

app.post('/api/hygiene/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    const taskId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let logs = readJSON(HYGIENE_LOGS_FILE);
    let index = logs.findIndex(l => l.taskId === taskId && l.date === targetDate);
    if (index > -1) logs[index].completed = completed;
    else logs.push({ id: Date.now().toString(), userId: req.session.userId || MASTER_USER_ID, taskId, date: targetDate, completed });
    writeJSON(HYGIENE_LOGS_FILE, logs);
    let userId = req.session.userId || MASTER_USER_ID;
    let updatedXP = getUserXP(userId);
    if (completed) updatedXP = addXP(userId, 40);
    res.json({ success: true, ...updatedXP });
});

app.get('/api/monster-coach', (req, res) => {
    res.json({ success: true, message: "Monster Coach active." });
});

app.listen(PORT, () => {
    console.log(`🚀 MONSTER MODE Server running at http://localhost:${PORT}`);
});