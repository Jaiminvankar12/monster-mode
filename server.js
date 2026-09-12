const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const { getServerToday, validateDateAccess } = require('./server/services/dateService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// ============================================================================
// 🟢 MONGODB CLOUD CONNECTION & SCHEMAS
// ============================================================================
const MONGO_URI = "mongodb+srv://jaiminvankar520_db_user:XLVuwi5Atn2RSBE1@cluster0.iea9sdz.mongodb.net/monster_database?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("🔥 MONSTER MODE: MongoDB Atlas કનેક્ટ થઈ ગયું! (Database is LIVE)"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

const habitSchema = new mongoose.Schema({ id: String, userId: String, name: String, category: String, description: String, startDate: String, endDate: String, createdAt: String });
const Habit = mongoose.model('Habit', habitSchema);

const habitLogSchema = new mongoose.Schema({ id: String, userId: String, habitId: String, date: String, completed: Boolean });
const HabitLog = mongoose.model('HabitLog', habitLogSchema);

const workoutSchema = new mongoose.Schema({ id: String, userId: String, name: String, sets: Number, value: Number, unit: String, category: String, startDate: String, createdAt: String });
const Workout = mongoose.model('Workout', workoutSchema);

const workoutLogSchema = new mongoose.Schema({ id: String, userId: String, workoutId: String, date: String, completed: Boolean });
const WorkoutLog = mongoose.model('WorkoutLog', workoutLogSchema);

const studyCategorySchema = new mongoose.Schema({ id: String, userId: String, name: String, dailyTargetMinutes: Number, startDate: String, endDate: String, createdAt: String });
const StudyCategory = mongoose.model('StudyCategory', studyCategorySchema);

const studySessionSchema = new mongoose.Schema({ id: String, userId: String, categoryId: String, topic: String, durationMinutes: Number, date: String, createdAt: String });
const StudySession = mongoose.model('StudySession', studySessionSchema);

const hygieneTaskSchema = new mongoose.Schema({ id: String, userId: String, name: String, frequency: String, startDate: String });
const HygieneTask = mongoose.model('HygieneTask', hygieneTaskSchema);

const hygieneLogSchema = new mongoose.Schema({ id: String, userId: String, taskId: String, date: String, completed: Boolean });
const HygieneLog = mongoose.model('HygieneLog', hygieneLogSchema);

const noteReminderSchema = new mongoose.Schema({ id: String, userId: String, title: String, description: String, isReminder: Boolean, date: String, time: String, completed: Boolean, notifiedToday: Boolean, createdAt: String });
const NoteReminder = mongoose.model('NoteReminder', noteReminderSchema);

const userSchema = new mongoose.Schema({ id: String, email: String, passwordHash: String, role: String });
const User = mongoose.model('User', userSchema);

const userDataSchema = new mongoose.Schema({
    userId: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    examEnabled: { type: Boolean, default: false },
    examTargetMinutes: { type: Number, default: 90 },
    sanctuaryEnabled: { type: Boolean, default: false },
    sanctuaryActivatedAt: String,
    sanctuaryReason: String,
    hydrationGoal: { type: Number, default: 3000 },
    hydrationGlassSize: { type: Number, default: 250 },
    hydrationLogs: { type: Object, default: {} },
    customDailyTargets: { type: Map, of: Number, default: {} }
});
const UserData = mongoose.model('UserData', userDataSchema);

const globalSettingsSchema = new mongoose.Schema({
    key: String,
    systemLocked: { type: Boolean, default: false },
    lockedAt: String,
    landingBgUrl: { type: String, default: "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" },
    dashboardBgColor: { type: String, default: "#07090f" },
    gatewayHeadline: { type: String, default: "BECOME A<br>MONSTER.<br>DOMINATE REALITY." },
    gatewaySubtext: { type: String, default: "Pure discipline. Zero excuses. Absolute control." }
});
const GlobalSettings = mongoose.model('GlobalSettings', globalSettingsSchema);

async function initDB() {
    let uCount = await User.countDocuments();
    if(uCount === 0) {
        const salt = bcrypt.genSaltSync(10);
        await User.create([
            { id: 'u_admin', email: 'admin@monstermode.com', passwordHash: bcrypt.hashSync('MonsterAdmin@2026', salt), role: 'ADMIN' },
            { id: 'u_tracker', email: 'jaiminvankar520@gmail.com', passwordHash: bcrypt.hashSync('Jay#monster', salt), role: 'TRACKER_USER' }
        ]);
    }
    let gsCount = await GlobalSettings.countDocuments();
    if(gsCount === 0) {
        await GlobalSettings.create({ key: 'GLOBAL' });
    }
}
initDB();

app.set('trust proxy', 1);

const MONSTER_LAUNCH_DATE = "2026-09-13";
const MASTER_USER_ID = "admin_master_user";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const processedRemindersLock = new Set();
let isCronRunning = false;

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

async function getSystemLockStatus() {
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    return { locked: gs ? gs.systemLocked : false, lockedAt: gs ? gs.lockedAt : null };
}

async function getLandingBg() {
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    return { url: gs ? gs.landingBgUrl : "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" };
}

async function getDashboardBg() {
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    return { color: gs ? gs.dashboardBgColor : "#07090f" };
}

async function getHydrationData(userId = MASTER_USER_ID) {
    let ud = await UserData.findOne({ userId });
    if (!ud) { ud = new UserData({ userId }); await ud.save(); }
    return { goal: ud.hydrationGoal, glassSize: ud.hydrationGlassSize, logs: ud.hydrationLogs || {} };
}

async function calculateHydrationStreak(userId = MASTER_USER_ID) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;
    let hydData = await getHydrationData(userId);
    let logs = hydData.logs || {};
    let goal = hydData.goal || 3000;
    let sanctuary = await getSanctuaryData(userId);
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

async function getExamModeData(userId = MASTER_USER_ID) {
    let ud = await UserData.findOne({ userId });
    if (!ud) { ud = new UserData({ userId }); await ud.save(); }
    return { enabled: ud.examEnabled, targetMinutes: ud.examTargetMinutes };
}

async function getSanctuaryData(userId = MASTER_USER_ID) {
    let ud = await UserData.findOne({ userId });
    if (!ud) { ud = new UserData({ userId }); await ud.save(); }
    return { enabled: ud.sanctuaryEnabled, activatedAt: ud.sanctuaryActivatedAt, reason: ud.sanctuaryReason };
}

async function addXP(userId = MASTER_USER_ID, amount) {
    let ud = await UserData.findOne({ userId });
    if (!ud) { ud = new UserData({ userId }); }
    ud.xp += amount;
    ud.level = Math.floor(ud.xp / 500) + 1;
    await ud.save();
    return { xp: ud.xp, level: ud.level };
}

async function getUserXP(userId = MASTER_USER_ID) {
    let ud = await UserData.findOne({ userId });
    if (!ud) { ud = new UserData({ userId }); await ud.save(); }
    return { xp: ud.xp, level: ud.level };
}

async function calculateWorkoutStreak(userId = MASTER_USER_ID) {
    let todayStr = getServerToday();
    if (todayStr < MONSTER_LAUNCH_DATE) return 0;
    const workouts = await Workout.find({ userId });
    const logs = await WorkoutLog.find({ userId });
    if (workouts.length === 0) return 0;
    let sanctuary = await getSanctuaryData(userId);
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

async function runServerSyncEngine(userId = MASTER_USER_ID, targetDate) {
    const today = getServerToday();
    if (targetDate > today || targetDate < MONSTER_LAUNCH_DATE) {
        return { allWorkoutsDone: false, studyDone: false, hydrationDone: false, totalStudiedMinutes: 0, totalTargetMinutes: 0 };
    }
    const workouts = await Workout.find({ userId });
    const workoutLogs = await WorkoutLog.find({ userId, date: targetDate });
    const workoutsWithStatus = workouts.map(w => {
        const log = workoutLogs.find(l => l.workoutId === w.id);
        return { ...w._doc, completed: log ? log.completed : false };
    });
    const allWorkoutsDone = workoutsWithStatus.length > 0 && workoutsWithStatus.every(w => w.completed);

    const categories = await StudyCategory.find({ userId });
    const sessions = await StudySession.find({ userId, date: targetDate });
    let examData = await getExamModeData(userId);
    let totalTargetMinutes = examData.enabled ? parseInt(examData.targetMinutes) || 90 : categories.reduce((acc, c) => acc + (parseInt(c.dailyTargetMinutes) || 120), 0);
    let totalStudiedMinutes = sessions.reduce((acc, s) => acc + (parseInt(s.durationMinutes) || 0), 0);
    let studyDone = totalTargetMinutes > 0 && totalStudiedMinutes >= totalTargetMinutes && categories.length > 0 && sessions.length > 0;

    let hydData = await getHydrationData(userId);
    let consumed = hydData.logs[targetDate] || 0;
    let hydrationDone = consumed >= (hydData.goal || 3000);

    return { allWorkoutsDone, studyDone, hydrationDone, totalStudiedMinutes, totalTargetMinutes };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'monster_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(async (req, res, next) => {
    const trackerPages = ['/dashboard', '/dashboard.html', '/tracker', '/tracker.html', '/workout', '/workout.html', '/study', '/study.html', '/hygiene', '/hygiene.html', '/hydration', '/hydration.html'];
    const isTrackerPage = trackerPages.some(page => req.path === page);

    if (isTrackerPage) {
        if (!req.session || !req.session.userId) {
            return res.redirect('/index.html');
        }

        let lockStatus = await getSystemLockStatus();
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

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "🔒 Unauthorized access. Please log in first." });
    }
    next();
}

async function trackerApiGuard(req, res, next) {
    let lockStatus = await getSystemLockStatus();
    if (lockStatus.locked) {
        return res.status(403).json({ error: "🛡️ HARDCORE LOCK: System is totally locked." });
    }
    next();
}

console.log("🔥 MONSTER MODE: Production Server & Telegram Cron System Active.");

cron.schedule('0 7 * * *', async () => {
    const msg = `🌅 *MONSTER MODE ON — MORNING AUDIT*\n\n"Discipline equals absolute freedom."\n\n✅ Check your Daily Hydration & Hygiene targets.\n🔥 Stay locked in and crush your goals today!`;
    await sendTelegramMessage(msg);
}, { timezone: 'Asia/Kolkata' });

async function sendTelegramMessage(message) {
    await sendTelegramNotification(message);
}

cron.schedule('* * * * *', async () => {
    if (isCronRunning) return;
    isCronRunning = true;

    try {
        let istTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        let istNow = new Date(istTimeStr);
        
        let todayStr = istNow.getFullYear() + "-" + String(istNow.getMonth() + 1).padStart(2, '0') + "-" + String(istNow.getDate()).padStart(2, '0');
        let currentHours = String(istNow.getHours()).padStart(2, '0');
        let currentMinutes = String(istNow.getMinutes()).padStart(2, '0');
        let currentTimeStr = `${currentHours}:${currentMinutes}`;

        const reminders = await NoteReminder.find({ isReminder: true, notifiedToday: false, date: todayStr, time: currentTimeStr });

        for (let item of reminders) {
            const lockKey = `${item.id}_${todayStr}_${currentTimeStr}`;
            if (!processedRemindersLock.has(lockKey)) {
                processedRemindersLock.add(lockKey);
                item.notifiedToday = true;
                await item.save();
                
                let text = `⏰ *MONSTER REMINDER ALERT*\n\n📌 *${item.title}*\n📝 ${item.description || 'No details.'}\n\n🔥 *Execute immediately!*`;
                await sendTelegramMessage(text);
            }
        }
    } catch (err) {
        console.error("Reminder Cron Error:", err);
    } finally {
        isCronRunning = false;
    }
});

app.get('/api/system-lock', async (req, res) => {
    let lockData = await getSystemLockStatus();
    res.json({ success: true, ...lockData });
});

app.post('/api/system-lock', requireAuth, async (req, res) => {
    const { locked, adminPassword, password } = req.body;
    const pwdToVerify = adminPassword || password;
    
    if (pwdToVerify !== "Jay_monster_mode_on") {
        return res.status(403).json({ error: "❌ Wrong Password! Incorrect Admin Master Password for System Control." });
    }
    
    let currentLockData = await getSystemLockStatus();
    let newLockStatus = locked !== undefined ? locked : true;

    if (currentLockData.locked === newLockStatus) {
        return res.json({ 
            success: true, 
            message: `System is already ${newLockStatus ? 'LOCKED' : 'UNLOCKED'}.`, 
            ...currentLockData 
        });
    }
    
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    gs.systemLocked = newLockStatus;
    gs.lockedAt = newLockStatus ? new Date().toISOString() : null;
    await gs.save();
    
    const actionText = gs.systemLocked ? "System is now in Hardcore Lock." : "System Unlocked.";
    await sendTelegramNotification(`🛡️ *SYSTEM CONTROL*\nStatus changed to: *${gs.systemLocked ? 'HARDCORE LOCKED 🛑' : 'UNLOCKED 🟢'}*`);
    
    res.json({ success: true, message: actionText, locked: gs.systemLocked, lockedAt: gs.lockedAt });
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

app.get('/api/gateway-text', async (req, res) => {
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    res.json({ success: true, headline: gs ? gs.gatewayHeadline : '', subtext: gs ? gs.gatewaySubtext : '' });
});

app.post('/api/control-panel/gateway-text', requireAuth, async (req, res) => {
    const { headline, subtext, password } = req.body;
    if (password !== "Jay#edit@monster") {
        return res.status(403).json({ error: "Unauthorized Password." });
    }
    
    let gs = await GlobalSettings.findOneAndUpdate(
        { key: 'GLOBAL' },
        { gatewayHeadline: headline, gatewaySubtext: subtext },
        { new: true, upsert: true }
    );
    
    res.json({ success: true, message: "Gateway text updated successfully." });
});

app.get('/api/landing-bg', async (req, res) => { 
    res.json({ success: true, ...(await getLandingBg()) }); 
});

app.post('/api/control-panel/landing-bg', requireAuth, async (req, res) => {
    const { url, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized." });
    }
    if (!url) return res.status(400).json({ error: "Image URL is required." });
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    gs.landingBgUrl = url;
    await gs.save();
    res.json({ success: true, message: "Landing background updated successfully." });
});

app.get('/api/dashboard-bg', async (req, res) => { 
    res.json({ success: true, ...(await getDashboardBg()) }); 
});

app.post('/api/control-panel/dashboard-bg', requireAuth, async (req, res) => {
    const { color, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized." });
    }
    if (!color) return res.status(400).json({ error: "Background color is required." });
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    gs.dashboardBgColor = color;
    await gs.save();
    res.json({ success: true, message: "Dashboard background color updated successfully." });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "Wrong Password! Invalid email or password." });
    }

    let lockStatus = await getSystemLockStatus();
    if (lockStatus.locked && user.role !== 'ADMIN') {
        return res.status(403).json({ error: "🛑 HARDCORE LOCK: System is locked. Tracker access denied.", locked: true });
    }

    const now = Date.now();
    if (req.session.pendingAuth && req.session.pendingAuth.email === user.email && req.session.pendingAuth.sentAt && (now - req.session.pendingAuth.sentAt < 10000)) {
        return res.json({ success: true, requireOtp: true, message: "Authorization code already sent. Please check your Telegram." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.pendingAuth = { userId: user.id, role: user.role, email: user.email, otp: otp, isAdminPortal: false, sentAt: now };

    await sendTelegramNotification(`🔐 *SECURITY ALERT: LOGIN ATTEMPT*\n\nPortal: *TRACKER*\nUser: \`${user.email}\`\n\nYour Authorization Code is: \`${otp}\``);
    res.json({ success: true, requireOtp: true, message: "Authorization code sent to your Telegram." });
});

app.post('/api/control-panel/login', async (req, res) => {
    const { email, password } = req.body;
    let user = await User.findOne({ email, role: 'ADMIN' });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "🔒 Access Denied! Invalid Admin credentials." });
    }

    const now = Date.now();
    if (req.session.pendingAuth && req.session.pendingAuth.email === user.email && req.session.pendingAuth.sentAt && (now - req.session.pendingAuth.sentAt < 10000)) {
        return res.json({ success: true, requireOtp: true, message: "Admin authorization code already sent. Please check Telegram." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.pendingAuth = { userId: user.id, role: user.role, email: user.email, otp: otp, isAdminPortal: true, sentAt: now };

    await sendTelegramNotification(`🔐 *SECURITY ALERT: ADMIN LOGIN ATTEMPT*\n\nPortal: *CONTROL PANEL*\nUser: \`${user.email}\`\n\nYour Admin Authorization Code is: \`${otp}\``);
    res.json({ success: true, requireOtp: true, message: "Admin authorization code sent to your Telegram." });
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { otp, portal } = req.body;

    if (!req.session.pendingAuth) {
        return res.status(400).json({ error: "Session expired or invalid. Please try logging in again." });
    }

    if (req.session.pendingAuth.otp !== otp) {
        return res.status(401).json({ error: "❌ Incorrect OTP Code! Access Denied." });
    }

    if (portal === 'admin' && !req.session.pendingAuth.isAdminPortal) {
        delete req.session.pendingAuth;
        return res.status(403).json({ error: "❌ Security Breach Detected! Invalid portal execution flow." });
    }

    let lockStatus = await getSystemLockStatus();
    if (lockStatus.locked && portal !== 'admin') {
        delete req.session.pendingAuth;
        return res.status(403).json({ error: "🛑 HARDCORE LOCK: Portal is currently locked by Admin. Correct OTP Denied.", locked: true });
    }

    if (portal === 'admin') {
        req.session.pendingAuth.otpVerified = true;
        return res.json({ success: true, require3fa: true, message: "OTP Verified. Awaiting Master Control Key." });
    } else {
        req.session.userId = req.session.pendingAuth.userId;
        req.session.role = req.session.pendingAuth.role;
        req.session.email = req.session.pendingAuth.email;
        const emailToLog = req.session.email;
        
        delete req.session.pendingAuth;

        await sendTelegramNotification(`🐲 *MONSTER MODE ON*\n🟢 *TRACKER PORTAL LOGIN SUCCESSFUL*\nUser: \`${emailToLog}\`\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
        return res.json({ success: true, message: "Login successful!" });
    }
});

app.post('/api/control-panel/verify-3fa', async (req, res) => {
    const { masterKey } = req.body;

    if (!req.session.pendingAuth || !req.session.pendingAuth.otpVerified) {
        return res.status(400).json({ error: "Invalid security flow. OTP verification required first." });
    }

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

app.get('/api/auth/session', requireAuth, async (req, res) => {
    let xpInfo = await getUserXP(req.session.userId || MASTER_USER_ID);
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

app.get('/api/exam-mode', requireAuth, trackerApiGuard, async (req, res) => {
    let data = await getExamModeData(req.session.userId || MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/exam-mode', requireAuth, trackerApiGuard, async (req, res) => {
    const { enabled, targetMinutes } = req.body;
    let userId = req.session.userId || MASTER_USER_ID;
    let ud = await UserData.findOne({ userId });
    if(!ud) { ud = new UserData({ userId }); }
    ud.examEnabled = enabled !== undefined ? enabled : false;
    ud.examTargetMinutes = targetMinutes ? parseInt(targetMinutes) : 90;
    await ud.save();
    res.json({ success: true, message: "Exam Mode updated." });
});

app.get('/api/sanctuary', requireAuth, trackerApiGuard, async (req, res) => {
    let data = await getSanctuaryData(req.session.userId || MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/sanctuary', requireAuth, trackerApiGuard, async (req, res) => {
    const { enabled, reason } = req.body;
    let userId = req.session.userId || MASTER_USER_ID;
    let ud = await UserData.findOne({ userId });
    if(!ud) { ud = new UserData({ userId }); }
    let today = getServerToday();
    
    let currentStatus = ud.sanctuaryEnabled;
    let newStatus = enabled !== undefined ? enabled : false;

    if (currentStatus !== newStatus) {
        ud.sanctuaryEnabled = newStatus;
        ud.sanctuaryActivatedAt = newStatus ? today : null;
        ud.sanctuaryReason = reason || "Emergency Recovery";
        await ud.save();
        await sendTelegramNotification(`⚠️ *SANCTUARY PROTOCOL*\nUser toggled sanctuary to: *${newStatus ? 'ON' : 'OFF'}*`);
    } else {
        ud.sanctuaryReason = reason || ud.sanctuaryReason;
        await ud.save();
    }
    
    res.json({ success: true, message: "Sanctuary updated.", enabled: ud.sanctuaryEnabled, activatedAt: ud.sanctuaryActivatedAt, reason: ud.sanctuaryReason });
});

app.get('/api/hydration', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let userId = req.session.userId || MASTER_USER_ID;
    
    let hydData = await getHydrationData(userId);
    let consumed = hydData.logs[targetDate] || 0;
    let percent = Math.min(Math.round((consumed / hydData.goal) * 100), 100);
    let hydrationStreak = await calculateHydrationStreak(userId);
    res.json({ success: true, goal: hydData.goal, glassSize: hydData.glassSize, consumed, percent, hydrationStreak, history: hydData.logs, serverDate: targetDate });
});

app.post('/api/hydration/drink', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.body.date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let userId = req.session.userId || MASTER_USER_ID;
    let ud = await UserData.findOne({ userId });
    if(!ud) { ud = new UserData({ userId }); }
    
    let logs = ud.hydrationLogs || {};
    let current = logs[targetDate] || 0;
    let added = ud.hydrationGlassSize || 250;
    let newTotal = current + added;
    
    logs[targetDate] = newTotal;
    ud.hydrationLogs = logs;
    ud.markModified('hydrationLogs'); 
    await ud.save();
    
    let percent = Math.min(Math.round((newTotal / ud.hydrationGoal) * 100), 100);
    let hydrationStreak = await calculateHydrationStreak(userId);
    let xpInfo = await getUserXP(userId);
    res.json({ success: true, consumed: newTotal, percent, hydrationStreak, ...xpInfo });
});

app.post('/api/hydration/settings', requireAuth, trackerApiGuard, async (req, res) => {
    const { goal, glassSize } = req.body;
    let userId = req.session.userId || MASTER_USER_ID;
    let ud = await UserData.findOne({ userId });
    if(!ud) { ud = new UserData({ userId }); }
    
    if (goal) ud.hydrationGoal = parseInt(goal);
    if (glassSize) ud.hydrationGlassSize = parseInt(glassSize);
    await ud.save();
    res.json({ success: true, message: "Hydration settings updated." });
});

app.get('/api/notes-reminders', requireAuth, trackerApiGuard, async (req, res) => {
    let userId = req.session.userId || MASTER_USER_ID;
    let todayStr = getServerToday();
    let queryDate = req.query.date || todayStr;

    let items = await NoteReminder.find({ 
        userId, 
        $or: [
            { date: queryDate },
            { isReminder: false }
        ]
    });

    let xpInfo = await getUserXP(userId);
    res.json({ success: true, items, serverDate: queryDate, ...xpInfo });
});

app.post('/api/notes-reminders', requireAuth, trackerApiGuard, async (req, res) => {
    const { title, description, isReminder, date, time, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding note." });
    }
    if (!title) return res.status(400).json({ error: "Title is required." });
    let userId = req.session.userId || MASTER_USER_ID;
    
    const newItem = new NoteReminder({ 
        id: Date.now().toString(), 
        userId, 
        title, 
        description: description || "", 
        isReminder: isReminder ? true : false, 
        date: date || getServerToday(), 
        time: time || "", 
        completed: false, 
        notifiedToday: false, 
        createdAt: new Date().toISOString() 
    });
    await newItem.save();
    res.json({ success: true, item: newItem });
});

app.post('/api/notes-reminders/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    let item = await NoteReminder.findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: "Item not found." });
    
    item.completed = !item.completed;
    await item.save();
    res.json({ success: true, completed: item.completed });
});

app.delete('/api/notes-reminders/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized delete password." });
    }
    await NoteReminder.deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Item deleted." });
});

app.get('/api/habits', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    let userId = req.session.userId || MASTER_USER_ID;
    
    const habits = await Habit.find({ userId });
    const logs = await HabitLog.find({ userId });
    
    const habitsWithStatus = habits.map(habit => {
        const targetLog = logs.find(l => l.habitId === habit.id && l.date === targetDate);
        const habitLogs = logs.filter(l => l.habitId === habit.id && l.completed);
        return { ...habit._doc, completedToday: targetLog ? targetLog.completed : false, streak: targetDate < MONSTER_LAUNCH_DATE ? 0 : habitLogs.length, serverToday: today };
    });
    let xpInfo = await getUserXP(userId);
    res.json({ success: true, habits: habitsWithStatus, serverDate: targetDate, dateStatus, ...xpInfo });
});

app.post('/api/habits', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, category, description, endDate, startDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding habit." });
    }
    if (!name) return res.status(400).json({ error: "Habit name required." });
    let userId = req.session.userId || MASTER_USER_ID;
    
    const newHabit = new Habit({ 
        id: 'hab_' + Date.now().toString(), userId, name, category: category || "General", 
        description: description || "", startDate: startDate || MONSTER_LAUNCH_DATE, endDate: endDate || "", createdAt: new Date().toISOString() 
    });
    await newHabit.save();
    res.json({ success: true, habit: newHabit });
});

app.put('/api/habits/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, category, description, startDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing habit." });
    }
    let habit = await Habit.findOne({ id: req.params.id });
    if (!habit) return res.status(404).json({ error: "Habit not found." });
    
    if (name) habit.name = name;
    if (category !== undefined) habit.category = category;
    if (description !== undefined) habit.description = description;
    if (startDate) habit.startDate = startDate;
    await habit.save();
    
    res.json({ success: true, message: "Habit updated." });
});

app.delete('/api/habits/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting habit." });
    }
    await Habit.deleteOne({ id: req.params.id });
    await HabitLog.deleteMany({ habitId: req.params.id });
    res.json({ success: true, message: "Habit deleted." });
});

app.post('/api/habits/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    const habitId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let userId = req.session.userId || MASTER_USER_ID;
    let log = await HabitLog.findOne({ habitId: habitId, date: targetDate });
    
    if (log) { 
        log.completed = completed; 
        await log.save(); 
    } else { 
        await new HabitLog({ id: Date.now().toString(), userId, habitId, date: targetDate, completed }).save(); 
    }
    
    let updatedXP = await getUserXP(userId);
    if (completed) updatedXP = await addXP(userId, 50);
    res.json({ success: true, completed, ...updatedXP });
});

app.get('/api/workouts', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let userId = req.session.userId || MASTER_USER_ID;
    
    const workouts = await Workout.find({ userId });
    const logs = await WorkoutLog.find({ userId, date: targetDate });
    
    const workoutsWithStatus = workouts.map(w => {
        const log = logs.find(l => l.workoutId === w.id);
        return { ...w._doc, completed: log ? log.completed : false };
    });
    
    const syncResult = await runServerSyncEngine(userId, targetDate);
    const currentStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : await calculateWorkoutStreak(userId);
    let xpInfo = await getUserXP(userId);
    res.json({ success: true, workouts: workoutsWithStatus, allDone: syncResult.allWorkoutsDone, currentStreak, serverDate: targetDate, ...xpInfo });
});

app.post('/api/workouts', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, sets, value, reps, unit, category, startDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding workout." });
    }
    if (!name) return res.status(400).json({ error: "Exercise name required." });
    let userId = req.session.userId || MASTER_USER_ID;
    
    const newWorkout = new Workout({ 
        id: 'w_' + Date.now().toString(), userId, name, sets: sets || 3, value: value || reps || 10, unit: unit || 'reps', 
        category: category || "Strength", startDate: startDate || MONSTER_LAUNCH_DATE, createdAt: new Date().toISOString() 
    });
    await newWorkout.save();
    res.json({ success: true, workout: newWorkout });
});

app.put('/api/workouts/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, sets, value, unit, category, startDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing workout." });
    }
    let workout = await Workout.findOne({ id: req.params.id });
    if (!workout) return res.status(404).json({ error: "Workout not found." });
    
    if(name) workout.name = name;
    if(sets !== undefined) workout.sets = sets;
    if(value !== undefined) workout.value = value;
    if(unit) workout.unit = unit;
    if(category) workout.category = category;
    if(startDate) workout.startDate = startDate;
    await workout.save();
    
    res.json({ success: true, message: "Workout updated." });
});

app.delete('/api/workouts/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting workout." });
    }
    await Workout.deleteOne({ id: req.params.id });
    await WorkoutLog.deleteMany({ workoutId: req.params.id });
    res.json({ success: true, message: "Workout deleted." });
});

app.post('/api/workouts/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    const workoutId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let userId = req.session.userId || MASTER_USER_ID;
    let log = await WorkoutLog.findOne({ workoutId: workoutId, date: targetDate });
    
    if (log) { log.completed = completed; await log.save(); } 
    else { await new WorkoutLog({ id: Date.now().toString(), userId, workoutId, date: targetDate, completed }).save(); }
    
    let updatedXP = await getUserXP(userId);
    if (completed) updatedXP = await addXP(userId, 100);
    const syncResult = await runServerSyncEngine(userId, targetDate);
    res.json({ success: true, allWorkoutsDone: syncResult.allWorkoutsDone, ...updatedXP });
});

app.get('/api/study/categories', requireAuth, trackerApiGuard, async (req, res) => {
    const categories = await StudyCategory.find({ userId: req.session.userId || MASTER_USER_ID });
    res.json({ success: true, categories });
});

app.post('/api/study/categories', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding study category." });
    }
    if (!name) return res.status(400).json({ error: "Category name required." });
    let userId = req.session.userId || MASTER_USER_ID;
    
    const newCat = new StudyCategory({ 
        id: 's_' + Date.now().toString(), userId, name: name.trim(), dailyTargetMinutes: parseInt(dailyTargetMinutes) || 120, 
        startDate: startDate || MONSTER_LAUNCH_DATE, endDate: endDate || "", createdAt: new Date().toISOString() 
    });
    await newCat.save();
    res.json({ success: true, category: newCat });
});

app.put('/api/study/categories/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing study category." });
    }
    let category = await StudyCategory.findOne({ id: req.params.id });
    if (!category) return res.status(404).json({ error: "Category not found." });
    
    if(name) category.name = name.trim();
    if(dailyTargetMinutes !== undefined) category.dailyTargetMinutes = parseInt(dailyTargetMinutes);
    if(startDate) category.startDate = startDate;
    if(endDate !== undefined) category.endDate = endDate;
    await category.save();
    res.json({ success: true, message: "Category updated." });
});

app.delete('/api/study/categories/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting study category." });
    }
    await StudyCategory.deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Category deleted." });
});

app.get('/api/study/target', requireAuth, trackerApiGuard, async (req, res) => {
    let userId = req.session.userId || MASTER_USER_ID;
    let today = getServerToday();
    let targetDate = req.query.date || today;
    let ud = await UserData.findOne({ userId });
    let customTargets = ud && ud.customDailyTargets ? ud.customDailyTargets : {};
    res.json({ success: true, date: targetDate, customMinutes: customTargets.get ? customTargets.get(targetDate) : customTargets[targetDate] || null });
});

app.post('/api/study/target', requireAuth, trackerApiGuard, async (req, res) => {
    let { targetMinutes, date } = req.body;
    let userId = req.session.userId || MASTER_USER_ID;
    let targetDate = date || getServerToday();

    let ud = await UserData.findOne({ userId });
    if (!ud) { ud = new UserData({ userId }); }
    
    if (!ud.customDailyTargets) { ud.customDailyTargets = new Map(); }
    ud.customDailyTargets.set(targetDate, parseInt(targetMinutes));
    ud.markModified('customDailyTargets');
    await ud.save();

    res.json({ success: true, message: "Today's study target updated successfully!" });
});

app.get('/api/study/sessions', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let userId = req.session.userId || MASTER_USER_ID;
    
    const categories = await StudyCategory.find({ userId });
    const sessions = await StudySession.find({ userId, date: targetDate });
    const syncResult = await runServerSyncEngine(userId, targetDate);
    let xpInfo = await getUserXP(userId);
    
    res.json({ success: true, categories, sessions, totalTargetMinutes: syncResult.totalTargetMinutes, totalStudiedMinutes: syncResult.totalStudiedMinutes, isDone: syncResult.studyDone, serverDate: targetDate, ...xpInfo });
});

app.post('/api/study/sessions', requireAuth, trackerApiGuard, async (req, res) => {
    const { categoryId, topic, durationMinutes, date } = req.body;
    if (!categoryId || !durationMinutes) return res.status(400).json({ error: "Required fields missing." });
    
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let userId = req.session.userId || MASTER_USER_ID;

    try {
        const newSession = new StudySession({
            id: Date.now().toString(), userId, categoryId, topic: topic || "Deep Work",
            durationMinutes: parseInt(durationMinutes), date: targetDate, createdAt: new Date().toISOString()
        });
        await newSession.save();

        let updatedXP = await addXP(userId, parseInt(durationMinutes) * 2);
        res.json({ success: true, session: newSession, ...updatedXP });
    } catch (error) {
        console.error("MongoDB Save Error:", error);
        res.status(500).json({ error: "Failed to save session to database." });
    }
});

app.delete('/api/study/sessions/:id', requireAuth, trackerApiGuard, async (req, res) => {
    await StudySession.deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Session deleted." });
});

app.get('/api/hygiene', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    let targetDateObj = new Date(targetDate);
    let isSunday = targetDateObj.getDay() === 0;
    let userId = req.session.userId || MASTER_USER_ID;
    
    const tasks = await HygieneTask.find({ userId });
    const logs = await HygieneLog.find({ userId, date: targetDate });
    
    const tasksWithStatus = tasks.map(t => {
        const log = logs.find(l => l.taskId === t.id);
        return { ...t._doc, completed: log ? log.completed : false, isSundayTask: t.frequency === 'sunday' };
    });
    
    let applicableTasks = tasksWithStatus.filter(t => t.frequency === 'daily' || (isSunday && t.frequency === 'sunday'));
    let allDone = applicableTasks.length > 0 && applicableTasks.every(t => t.completed);
    let xpInfo = await getUserXP(userId);
    res.json({ success: true, tasks: tasksWithStatus, applicableTasks, allDone, serverDate: targetDate, ...xpInfo });
});

app.post('/api/hygiene', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, frequency, startDate, password } = req.body;
    if (password && password !== "Jay#add@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for adding hygiene task." });
    }
    if (!name) return res.status(400).json({ error: "Task name required." });
    let userId = req.session.userId || MASTER_USER_ID;
    
    const newTask = new HygieneTask({ 
        id: 'h_' + Date.now().toString(), userId, name, frequency: frequency || 'daily', startDate: startDate || MONSTER_LAUNCH_DATE 
    });
    await newTask.save();
    res.json({ success: true, task: newTask });
});

app.put('/api/hygiene/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, frequency, startDate, password } = req.body;
    if (password && password !== "Jay#edit@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for editing hygiene task." });
    }
    let task = await HygieneTask.findOne({ id: req.params.id });
    if (!task) return res.status(404).json({ error: "Task not found." });
    
    if(name) task.name = name;
    if(frequency !== undefined) task.frequency = frequency;
    if(startDate) task.startDate = startDate;
    await task.save();
    
    res.json({ success: true, message: "Task updated." });
});

app.delete('/api/hygiene/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { password } = req.body;
    if (password && password !== "Jay#del@monster" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized password for deleting hygiene task." });
    }
    await HygieneTask.deleteOne({ id: req.params.id });
    await HygieneLog.deleteMany({ taskId: req.params.id });
    res.json({ success: true, message: "Task deleted." });
});

app.post('/api/hygiene/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    const taskId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    if (targetDate < MONSTER_LAUNCH_DATE) return res.status(403).json({ error: "⏳ Pre-Launch Phase! Tracking officially begins on 12-09-2026." });
    if (targetDate > today) return res.status(403).json({ error: "🔒 FUTURE LOCK!" });
    
    let userId = req.session.userId || MASTER_USER_ID;
    let log = await HygieneLog.findOne({ taskId: taskId, date: targetDate });
    
    if (log) { log.completed = completed; await log.save(); } 
    else { await new HygieneLog({ id: Date.now().toString(), userId, taskId, date: targetDate, completed }).save(); }
    
    let updatedXP = await getUserXP(userId);
    if (completed) updatedXP = await addXP(userId, 40);
    res.json({ success: true, ...updatedXP });
});

app.get('/api/monster-coach', (req, res) => {
    res.json({ success: true, message: "Monster Coach active." });
});

app.listen(PORT, () => {
    console.log(`🚀 MONSTER MODE Server running at http://localhost:${PORT}`);
});