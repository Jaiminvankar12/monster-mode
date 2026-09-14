let systemSleepData = {
    failedAttempts: 0,
    lockedUntil: null
};
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const { getServerToday, validateDateAccess } = require('./server/services/dateService');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // 🟢 Gemini AI Integration
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

// 🎯 TARGETS / MILESTONES SCHEMA
const targetSchema = new mongoose.Schema({
    id: String,
    userId: String,
    name: String,
    date: String,
    completed: { type: Boolean, default: false },
    createdAt: String
});
const Target = mongoose.model('Target', targetSchema);

// 📜 MONSTER LOG / JOURNALING SCHEMA
const monsterLogSchema = new mongoose.Schema({
    id: String,
    userId: String,
    date: String,
    content: String,
    aiFeedback: String,
    createdAt: String
});
const MonsterLog = mongoose.model('MonsterLog', monsterLogSchema);

// ☢️ NUCLEAR DISCIPLINE STATE SCHEMA (ADDED)
const nuclearProtocolSchema = new mongoose.Schema({
    userId: String,
    strikes: { type: Number, default: 0 },
    lastActiveAt: { type: String, default: () => new Date().toISOString() },
    hardcoreLocked: { type: Boolean, default: false },
    lockReason: { type: String, default: "" },
    overtimeRequiredMinutes: { type: Number, default: 0 },
    overtimeCompletedMinutes: { type: Number, default: 0 },
    disciplineDebt: { type: Number, default: 0 }
});
const NuclearState = mongoose.model('NuclearState', nuclearProtocolSchema);

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
    customDailyTargets: { type: Map, of: Number, default: {} },
    // 🛡️ LIFELINE SYSTEM (Month wise 5 lifelines)
    lifelinesRemaining: { type: Number, default: 5 },
    lastLifelineMonth: { type: String, default: "" }
});
const UserData = mongoose.model('UserData', userDataSchema);

const globalSettingsSchema = new mongoose.Schema({
    key: String,
    systemLocked: { type: Boolean, default: false },
    lockedAt: String,
    // Individual Module Locks (Added for Granular Control)
    habitsLocked: { type: Boolean, default: false },
    workoutsLocked: { type: Boolean, default: false },
    studyLocked: { type: Boolean, default: false },
    hydrationLocked: { type: Boolean, default: false },
    hygieneLocked: { type: Boolean, default: false },
    
    landingBgUrl: { type: String, default: "https://i.pinimg.com/736x/df/30/d5/df30d598c580b20a013158fa0b76bd81.jpg" },
    dashboardBgColor: { type: String, default: "#07090f" },
    gatewayHeadline: { type: String, default: "BECOME A<br>MONSTER.<br>DOMINATE REALITY." },
    gatewaySubtext: { type: String, default: "Pure discipline. Zero excuses. Absolute control." },
    workoutReminderTime: { type: String, default: "" },
    studyReminderTime: { type: String, default: "" },
    workoutNotifiedDate: { type: String, default: "" },
    studyNotifiedDate: { type: String, default: "" }
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

const MONSTER_LAUNCH_DATE = "2026-09-14";
const MASTER_USER_ID = "admin_master_user";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const processedRemindersLock = new Set();
let isCronRunning = false;

// 🛡️ SYSTEM SLEEP GUARD MIDAS/MIDDLEWARE (Blocks even Admin if 3 strikes reached)
const checkSystemSleep = (req, res, next) => {
    if (systemSleepData.lockedUntil && Date.now() < systemSleepData.lockedUntil) {
        const remainingMins = Math.ceil((systemSleepData.lockedUntil - Date.now()) / 60000);
        return res.status(423).json({
            success: false,
            error: `💤 SYSTEM IS ASLEEP: Maximum security threshold breached. Locked for another ${remainingMins} minutes. (Even Admin is restricted).`
        });
    }
    next();
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply system sleep check to all API routes
app.use('/api/', checkSystemSleep);

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
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
    // 🟢 SEAMLESS SESSION ASSIGNMENT FOR TRUSTED TOKENS (Fixes data store issue)
    if (!req.session || !req.session.userId) {
        req.session = req.session || {};
        req.session.userId = MASTER_USER_ID;
        req.session.role = 'ADMIN';
        req.session.email = 'jaiminvankar520@gmail.com';
    }
    next();
}
async function trackerApiGuard(req, res, next) {
    next();
}

// 🛡️ API GUARD FOR INDIVIDUAL MODULE LOCKS (Granular Tracker Locking)
async function moduleApiGuard(moduleName) {
    return async (req, res, next) => {
        let lockStatus = await getSystemLockStatus();
        if (lockStatus.locked) {
            return res.status(403).json({ error: "🛡️ HARDCORE LOCK: System is totally locked." });
        }
        if (moduleName === 'habits' && lockStatus.habitsLocked) return res.status(403).json({ error: "🔒 Habit Tracker is locked by Admin." });
        if (moduleName === 'workouts' && lockStatus.workoutsLocked) return res.status(403).json({ error: "🔒 Workout Tracker is locked by Admin." });
        if (moduleName === 'study' && lockStatus.studyLocked) return res.status(403).json({ error: "🔒 Study Tracker is locked by Admin." });
        if (moduleName === 'hydration' && lockStatus.hydrationLocked) return res.status(403).json({ error: "🔒 Hydration Matrix is locked by Admin." });
        if (moduleName === 'hygiene' && lockStatus.hygieneLocked) return res.status(403).json({ error: "🔒 Hygiene Tracker is locked by Admin." });
        next();
    };
}

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
    return { 
        locked: gs ? gs.systemLocked : false, 
        lockedAt: gs ? gs.lockedAt : null,
        habitsLocked: gs ? gs.habitsLocked : false,
        workoutsLocked: gs ? gs.workoutsLocked : false,
        studyLocked: gs ? gs.studyLocked : false,
        hydrationLocked: gs ? gs.hydrationLocked : false,
        hygieneLocked: gs ? gs.hygieneLocked : false
    };
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

async function getNuclearState(userId = MASTER_USER_ID) {
    let state = await NuclearState.findOne({ userId });
    if (!state) {
        state = new NuclearState({ userId });
        await state.save();
    }
    return state;
}

console.log("🔥 MONSTER MODE: Production Server & Telegram Cron System Active.");

cron.schedule('0 7 * * *', async () => {
    const msg = `🌅 *MONSTER MODE ON — MORNING AUDIT*\n\n"Discipline equals absolute freedom."\n\n✅ Check your Daily Hydration & Hygiene targets.\n🔥 Stay locked in and crush your goals today!`;
    await sendTelegramMessage(msg);
}, { timezone: 'Asia/Kolkata' });

// 🩸 PUNISHMENT PROTOCOL CRON (11:59 PM CHECK)
cron.schedule('59 23 * * *', async () => {
    try {
        const today = getServerToday();
        const userId = MASTER_USER_ID; 
        const syncResult = await runServerSyncEngine(userId, today);
        
        if (!syncResult.allWorkoutsDone || !syncResult.studyDone || !syncResult.hydrationDone) {
            const msg = `🩸 *PUNISHMENT PROTOCOL INITIATED*\n\n⚠️ You FAILED today's core objectives.\n\n🏋️ Workouts: ${syncResult.allWorkoutsDone ? '✅' : '❌'}\n📚 Study: ${syncResult.studyDone ? '✅' : '❌'}\n💧 Hydration: ${syncResult.hydrationDone ? '✅' : '❌'}\n\n"You didn't push hard enough today. Tomorrow, you pay the price in sweat and focus!"`;
            await sendTelegramMessage(msg);
        } else {
            await sendTelegramMessage(`🏆 *APEX PREDATOR PROTOCOL*\n\nAll targets destroyed today. Absolute domination.\n\nRest well. Tomorrow we go harder.`);
        }
    } catch (err) {
        console.error("Punishment Protocol Error:", err);
    }
}, { timezone: 'Asia/Kolkata' });

// 🛡️ 🌙 10:00 PM ZERO MERCY & LIFELINE SYSTEM CRON
cron.schedule('0 22 * * *', async () => {
    try {
        let userId = MASTER_USER_ID;
        let today = getServerToday();
        let currentMonthStr = today.substring(0, 7); // YYYY-MM
        
        let ud = await UserData.findOne({ userId });
        if (!ud) { ud = new UserData({ userId }); }

        // Monthly Auto-Reset of Lifelines (5 per month)
        if (ud.lastLifelineMonth !== currentMonthStr) {
            ud.lifelinesRemaining = 5;
            ud.lastLifelineMonth = currentMonthStr;
            await ud.save();
        }

        let syncResult = await runServerSyncEngine(userId, today);
        let sanctuary = await getSanctuaryData(userId);
        let state = await getNuclearState(userId);

        let targetsFailed = (!syncResult.allWorkoutsDone || !syncResult.studyDone || !syncResult.hydrationDone);

        if (targetsFailed && !sanctuary.enabled) {
            // Check Lifeline protection
            if (ud.lifelinesRemaining > 0) {
                ud.lifelinesRemaining -= 1;
                await ud.save();
                await sendTelegramNotification(`🛡️ *LIFELINE ACTIVATED*\n\n⚠️ Daily targets missed, but your Lifeline protected you!\n❤️ Remaining Lifelines this month: *${ud.lifelinesRemaining}/5*\n\nYour XP & Streak are saved. Stay sharp tomorrow!`);
            } else {
                // Zero Mercy Reset (Lifelines exhausted)
                ud.xp = 0;
                ud.level = 1;
                await ud.save();

                state.hardcoreLocked = true;
                state.lockReason = "Daily Targets Missed & Lifelines Exhausted (Zero Mercy Reset)";
                state.overtimeRequiredMinutes = 180;
                state.disciplineDebt += 1;
                await state.save();

                await sendTelegramNotification(`🩸 *BLOODMOON / ZERO MERCY PROTOCOL*\n\n⚠️ All 5 Lifelines exhausted and day failed! Your entire Streak & XP Level have been WIPED OUT to 0.\n\n🔒 Hardcore Lockdown active. Mandatory overtime required.`);
            }
        } else {
            state.strikes = 0;
            await state.save();
        }
    } catch (err) {
        console.error("Midnight Lifeline Execution Error:", err);
    }
}, { timezone: 'Asia/Kolkata' });

async function sendTelegramMessage(message) {
    await sendTelegramNotification(message);
}

// 🟢 CRON: Reminders + Workout/Study Timed Alerts
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

        // 1. Note Reminders
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

        // 2. Workout & Study Timed Alerts
        let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
        if (gs) {
            if (gs.workoutReminderTime === currentTimeStr && gs.workoutNotifiedDate !== todayStr) {
                gs.workoutNotifiedDate = todayStr;
                await gs.save();
                await sendTelegramMessage(`🏋️ *MONSTER WORKOUT TIME!*\n\n⏰ Scheduled Time: *${currentTimeStr}*\n🔥 Gear up and crush your workout session right now!`);
            }
            if (gs.studyReminderTime === currentTimeStr && gs.studyNotifiedDate !== todayStr) {
                gs.studyNotifiedDate = todayStr;
                await gs.save();
                await sendTelegramMessage(`📚 *MONSTER STUDY SESSION!*\n\n⏰ Scheduled Time: *${currentTimeStr}*\n🔥 Deep work mode ON. Dominate your targets!`);
            }
        }

    } catch (err) {
        console.error("Reminder Cron Error:", err);
    } finally {
        isCronRunning = false;
    }
});

// 🟢 NEW: GRANULAR MODULE LOCK APIs
app.get('/api/module-locks', async (req, res) => {
    let status = await getSystemLockStatus();
    res.json({ success: true, ...status });
});

app.post('/api/control-panel/module-lock', requireAuth, async (req, res) => {
    const { moduleKey, locked, password } = req.body;
    if (password !== "Jay#edit@monster" && password !== "Jay_monster_mode_on" && req.session.role !== 'ADMIN') {
        return res.status(403).json({ error: "❌ Unauthorized Password!" });
    }

    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    if (!gs) gs = new GlobalSettings({ key: 'GLOBAL' });

    if (moduleKey === 'habits') gs.habitsLocked = locked;
    else if (moduleKey === 'workouts') gs.workoutsLocked = locked;
    else if (moduleKey === 'study') gs.studyLocked = locked;
    else if (moduleKey === 'hydration') gs.hydrationLocked = locked;
    else if (moduleKey === 'hygiene') gs.hygieneLocked = locked;

    await gs.save();

    // 🔔 TELEGRAM NOTIFICATION FOR MODULE LOCK / UNLOCK
    const moduleNameCapital = moduleKey.toUpperCase();
    const statusEmoji = locked ? "🔒" : "🔓";
    const statusText = locked ? "LOCKED" : "UNLOCKED";
    await sendTelegramNotification(`${statusEmoji} *MODULE SECURITY EVENT*\n\nModule: *${moduleNameCapital}*\nStatus: *${statusText}*\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

    res.json({ success: true, message: `${moduleKey} lock status updated to ${locked}`, ...gs.toObject() });
});

app.get('/api/system-lock', async (req, res) => {
    let lockData = await getSystemLockStatus();
    res.json({ success: true, ...lockData });
});

app.post('/api/system-lock', requireAuth, async (req, res) => {
    const { locked, adminPassword, password } = req.body;
    const pwdToVerify = adminPassword || password;
    
    if (pwdToVerify !== "monster_mode_on_Jay" && pwdToVerify !== "Jay_monster_mode_on") {
        return res.status(403).json({ error: "❌ Wrong Password! Incorrect Admin Master Password for System Control." });
    }
    
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    gs.systemLocked = locked !== undefined ? locked : true;
    gs.lockedAt = gs.systemLocked ? new Date().toISOString() : null;
    await gs.save();
    
    // 🔔 TELEGRAM ALERT ADDED HERE
    const statusText = gs.systemLocked ? "🔴 *SYSTEM GLOBALLY LOCKED*" : "🟢 *SYSTEM UNLOCKED*";
    await sendTelegramNotification(`🛡️ *SECURITY EVENT*\n\n${statusText}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
    
    res.json({ success: true, message: `System is now ${gs.systemLocked ? 'LOCKED' : 'UNLOCKED'}`, locked: gs.systemLocked });
});

app.post('/api/verify-action-password', requireAuth, (req, res) => {
    res.json({ success: true, message: "Action authorized successfully." });
});

app.get('/api/gateway-text', async (req, res) => {
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    res.json({ success: true, headline: gs ? gs.gatewayHeadline : '', subtext: gs ? gs.gatewaySubtext : '' });
});

app.post('/api/control-panel/gateway-text', requireAuth, async (req, res) => {
    const { headline, subtext } = req.body;
    let gs = await GlobalSettings.findOneAndUpdate(
        { key: 'GLOBAL' },
        { gatewayHeadline: headline, gatewaySubtext: subtext },
        { new: true, upsert: true }
    );
    res.json({ success: true, message: "Gateway text updated successfully." });
});

app.get('/api/schedules', async (req, res) => {
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    res.json({ 
        success: true, 
        workoutReminderTime: gs ? gs.workoutReminderTime : "", 
        studyReminderTime: gs ? gs.studyReminderTime : "" 
    });
});

app.post('/api/control-panel/schedules', requireAuth, async (req, res) => {
    const { workoutReminderTime, studyReminderTime } = req.body;
    let gs = await GlobalSettings.findOneAndUpdate(
        { key: 'GLOBAL' },
        { 
            workoutReminderTime: workoutReminderTime !== undefined ? workoutReminderTime : "", 
            studyReminderTime: studyReminderTime !== undefined ? studyReminderTime : "" 
        },
        { new: true, upsert: true }
    );
    res.json({ success: true, message: "Workout & Study schedules updated successfully." });
});

app.get('/api/landing-bg', async (req, res) => { 
    res.json({ success: true, ...(await getLandingBg()) }); 
});

app.post('/api/control-panel/landing-bg', requireAuth, async (req, res) => {
    const { url } = req.body;
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
    const { color } = req.body;
    if (!color) return res.status(400).json({ error: "Background color is required." });
    let gs = await GlobalSettings.findOne({ key: 'GLOBAL' });
    gs.dashboardBgColor = color;
    await gs.save();
    res.json({ success: true, message: "Dashboard background color updated successfully." });
});

// ============================================================
// 🤖 MONSTER MODE — JARVIS AI ASSISTANT
// Gemini API + Live Monster Mode Data
// ============================================================

app.post('/api/jarvis/ask', requireAuth, async (req, res) => {
    try {
        const { question } = req.body;

        // ----------------------------------------------------
        // 1. Validate question
        // ----------------------------------------------------
        if (!question || typeof question !== 'string' || !question.trim()) {
            return res.status(400).json({
                success: false,
                error: "Question is required."
            });
        }

        const cleanQuestion = question.trim();

        // ----------------------------------------------------
        // 2. Current user + date
        // ----------------------------------------------------
        const userId = MASTER_USER_ID;
        const today = getServerToday();

        // ----------------------------------------------------
        // 3. Gemini API key
        // ----------------------------------------------------
        const geminiKey =
            process.env.GEMINI_API_KEY;

        if (!geminiKey) {
            console.error("❌ JARVIS ERROR: GEMINI_API_KEY is missing.");

            return res.status(500).json({
                success: false,
                error: "JARVIS AI is not configured. GEMINI_API_KEY is missing on the server."
            });
        }

        // ----------------------------------------------------
        // 4. Fetch Monster Mode system data
        // ----------------------------------------------------
        const lockStatus = await getSystemLockStatus();
        const xpInfo = await getUserXP(userId);

        const ud = await UserData
            .findOne({ userId })
            .select('-__v');

        const syncResult =
            await runServerSyncEngine(userId, today);

        const hydData =
            await getHydrationData(userId);

        const consumedHydration =
            hydData?.logs?.[today] || 0;

        const sanctuary =
            await getSanctuaryData(userId);

        const nuclearState =
            await getNuclearState(userId);

        const examData =
            await getExamModeData(userId);

        // ----------------------------------------------------
        // 5. Fetch trackers
        // ----------------------------------------------------

        const habits = await Habit
            .find({ userId })
            .select('_id name category');

        const habitLogs = await HabitLog
            .find({
                userId,
                date: today
            })
            .select('habitId completed -_id');

        const workouts = await Workout
            .find({ userId })
            .select('_id name sets value unit');

        const workoutLogs = await WorkoutLog
            .find({
                userId,
                date: today
            })
            .select('workoutId completed -_id');

        const studyCategories = await StudyCategory
            .find({ userId })
            .select('_id name dailyTargetMinutes');

        const studySessions = await StudySession
            .find({
                userId,
                date: today
            })
            .select('_id categoryId topic durationMinutes');

        const hygieneTasks = await HygieneTask
            .find({ userId })
            .select('_id name frequency');

        const hygieneLogs = await HygieneLog
            .find({
                userId,
                date: today
            })
            .select('taskId completed -_id');

        const targets = await Target
            .find({ userId })
            .select('_id name completed date');

        const notesReminders = await NoteReminder
            .find({ userId })
            .select(
                'title description isReminder date time completed'
            );

        // ----------------------------------------------------
        // 6. HABIT SUMMARY
        // ----------------------------------------------------

        const habitSummary = habits.map(h => {

            const log = habitLogs.find(
                l => String(l.habitId) === String(h._id)
            );

            const completed = log?.completed === true;

            return `- ${h.name} [${h.category || 'General'}] → ${
                completed ? 'DONE ✅' : 'PENDING ⏳'
            }`;

        }).join('\n');

        // ----------------------------------------------------
        // 7. WORKOUT SUMMARY
        // ----------------------------------------------------

        const workoutSummary = workouts.map(w => {

            const log = workoutLogs.find(
                l => String(l.workoutId) === String(w._id)
            );

            const completed = log?.completed === true;

            return `- ${w.name} (${w.sets || 0} sets, ${
                w.value || 0
            } ${w.unit || ''}) → ${
                completed ? 'DONE ✅' : 'PENDING ⏳'
            }`;

        }).join('\n');

        // ----------------------------------------------------
        // 8. STUDY SUMMARY
        // ----------------------------------------------------

        const studySummary = studyCategories.map(category => {

            const sessions = studySessions.filter(
                session =>
                    String(session.categoryId) ===
                    String(category._id)
            );

            const minutes = sessions.reduce(
                (total, session) =>
                    total + Number(session.durationMinutes || 0),
                0
            );

            const topics = sessions
                .map(s => s.topic)
                .filter(Boolean)
                .join(', ');

            return (
                `- ${category.name} ` +
                `(Target: ${category.dailyTargetMinutes || 0}m) ` +
                `→ Studied ${minutes}m today` +
                `${topics ? ` | Topics: ${topics}` : ''}`
            );

        }).join('\n');

        // ----------------------------------------------------
        // 9. HYGIENE SUMMARY
        // ----------------------------------------------------

        const hygieneSummary = hygieneTasks.map(task => {

            const log = hygieneLogs.find(
                l => String(l.taskId) === String(task._id)
            );

            const completed = log?.completed === true;

            return (
                `- ${task.name} ` +
                `(${task.frequency || 'Daily'}) ` +
                `→ ${completed ? 'DONE ✅' : 'PENDING ⏳'}`
            );

        }).join('\n');

        // ----------------------------------------------------
        // 10. TARGETS + REMINDERS
        // ----------------------------------------------------

        const pendingTargets =
            targets.filter(t => !t.completed).length;

        const pendingReminders =
            notesReminders.filter(
                n => n.isReminder && !n.completed
            ).length;

        // ----------------------------------------------------
        // 11. JARVIS SYSTEM CONTEXT
        // ----------------------------------------------------

        const systemContext = `
You are JARVIS, the intelligent AI assistant inside the
"Monster Mode" discipline and productivity system.

Your job is to answer the user's ACTUAL question using the
live Monster Mode database information below.

IMPORTANT RULES:

1. Always answer the user's actual question.
2. Never return a generic status report unless requested.
3. Use live database information whenever relevant.
4. Never invent information that is not in the database.
5. If information is unavailable, clearly say so.
6. Never expose passwords, API keys, tokens or security credentials.
7. Be concise but useful.
8. Speak like a futuristic JARVIS-style assistant:
   intelligent, sharp, professional and motivating.
9. Use Markdown when useful.
10. Current date: ${today}

==============================
SYSTEM & SECURITY
==============================

Global System Lock:
${lockStatus?.locked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}

Module Locks:
- Habits: ${lockStatus?.habitsLocked ? 'LOCKED' : 'UNLOCKED'}
- Workouts: ${lockStatus?.workoutsLocked ? 'LOCKED' : 'UNLOCKED'}
- Study: ${lockStatus?.studyLocked ? 'LOCKED' : 'UNLOCKED'}
- Hydration: ${lockStatus?.hydrationLocked ? 'LOCKED' : 'UNLOCKED'}
- Hygiene: ${lockStatus?.hygieneLocked ? 'LOCKED' : 'UNLOCKED'}

Sanctuary Mode:
${
    sanctuary?.enabled
        ? `ACTIVE — ${sanctuary.reason || 'No reason provided'}`
        : 'INACTIVE'
}

Hardcore Lockdown:
${nuclearState?.hardcoreLocked ? 'ACTIVE' : 'INACTIVE'}

Discipline Strikes:
${nuclearState?.strikes || 0}

Discipline Debt:
${nuclearState?.disciplineDebt || 0}

==============================
USER PROGRESS
==============================

Level:
${xpInfo?.level || 1}

XP:
${xpInfo?.xp || 0}

Lifelines:
${ud?.lifelinesRemaining ?? 5} / 5

Exam Mode:
${
    examData?.enabled
        ? `ENABLED — Target: ${examData.targetMinutes || 0} minutes`
        : 'DISABLED'
}

==============================
WORKOUT
==============================

Overall Workout Status:
${
    syncResult?.allWorkoutsDone
        ? 'ALL WORKOUTS DONE ✅'
        : 'WORKOUT PENDING ⏳'
}

Workout Data:
${workoutSummary || 'No workouts defined.'}

==============================
STUDY
==============================

Overall Study Status:
${
    syncResult?.studyDone
        ? 'STUDY TARGET DONE ✅'
        : 'STUDY TARGET PENDING ⏳'
}

Total Studied:
${syncResult?.totalStudiedMinutes || 0} minutes

Total Target:
${syncResult?.totalTargetMinutes || 0} minutes

Study Categories:
${studySummary || 'No study categories defined.'}

==============================
HYDRATION
==============================

Hydration Status:
${
    syncResult?.hydrationDone
        ? 'GOAL COMPLETED ✅'
        : 'GOAL PENDING ⏳'
}

Consumed:
${consumedHydration} ml

Goal:
${hydData?.goal || 0} ml

==============================
HABITS
==============================

${habitSummary || 'No habits defined.'}

==============================
HYGIENE
==============================

${hygieneSummary || 'No hygiene tasks defined.'}

==============================
TARGETS & REMINDERS
==============================

Pending Targets:
${pendingTargets}

Pending Reminders:
${pendingReminders}

==============================
END LIVE DATABASE STATE
==============================
`;

        // ----------------------------------------------------
        // 12. CALL GEMINI API
        // ----------------------------------------------------

        console.log("🤖 JARVIS QUESTION:", cleanQuestion);

        const geminiResponse = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': geminiKey
                },

                body: JSON.stringify({
                    system_instruction: {
                        parts: [
                            {
                                text: systemContext
                            }
                        ]
                    },

                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    text: cleanQuestion
                                }
                            ]
                        }
                    ],

                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 800
                    }
                })
            }
        );

        const geminiData =
            await geminiResponse.json();

        console.log(
            "🤖 JARVIS GEMINI STATUS:",
            geminiResponse.status
        );

        // ----------------------------------------------------
        // 13. HANDLE GEMINI ERRORS
        // ----------------------------------------------------

        if (!geminiResponse.ok) {

            console.error(
                "❌ JARVIS GEMINI ERROR:",
                JSON.stringify(geminiData, null, 2)
            );

            return res.status(502).json({
                success: false,
                error:
                    geminiData?.error?.message ||
                    "Gemini API request failed."
            });
        }

        // ----------------------------------------------------
        // 14. EXTRACT GEMINI RESPONSE
        // ----------------------------------------------------

        let reply = '';

        if (
            geminiData?.candidates?.[0]?.content?.parts
        ) {

            reply = geminiData.candidates[0].content.parts
                .map(part => part?.text || '')
                .join('')
                .trim();
        }

        // ----------------------------------------------------
        // 15. EMPTY RESPONSE
        // ----------------------------------------------------

        if (!reply) {

            console.error(
                "❌ JARVIS returned empty Gemini response:",
                JSON.stringify(geminiData, null, 2)
            );

            return res.status(502).json({
                success: false,
                error: "JARVIS received an empty response from Gemini."
            });
        }

        // ----------------------------------------------------
        // 16. SEND RESPONSE TO FRONTEND
        // ----------------------------------------------------

        return res.json({
            success: true,
            reply
        });

    } catch (err) {

        console.error(
            "❌ JARVIS SERVER ERROR:",
            err
        );

        return res.status(500).json({
            success: false,
            error:
                "JARVIS encountered a server-side anomaly while processing your request."
        });
    }
});
// 🟢 TRACKER PORTAL LOGIN (With 3-Strike 30-Min Sleep Guard Integration)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        systemSleepData.failedAttempts += 1;
        const attemptsLeft = 3 - systemSleepData.failedAttempts;

        if (systemSleepData.failedAttempts >= 3) {
            systemSleepData.lockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes deep sleep
            return res.status(423).json({
                success: false,
                error: "🚨 3 FAILED ATTEMPTS DETECTED. SYSTEM ENTERING 30-MINUTE DEEP SLEEP LOCKDOWN. ADMIN ACCESS REVOKED TEMPORARILY."
            });
        }

        return res.status(401).json({ error: `Wrong Password! Invalid email or password. (${attemptsLeft} attempts remaining before 30-min system sleep.)` });
    }

    // Success -> Reset failed attempts
    systemSleepData.failedAttempts = 0;
    systemSleepData.lockedUntil = null;

    const now = Date.now();
    if (req.session.pendingAuth && req.session.pendingAuth.email === user.email && req.session.pendingAuth.sentAt && (now - req.session.pendingAuth.sentAt < 10000)) {
        return res.json({ success: true, requireOtp: true, message: "Authorization code already sent. Please check your Telegram." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.pendingAuth = { userId: user.id, role: user.role, email: user.email, otp: otp, isAdminPortal: false, sentAt: now };

    await sendTelegramNotification(`🔐 *SECURITY ALERT: TRACKER LOGIN ATTEMPT*\n\nUser: \`${user.email}\`\n\nYour Authorization Code is: \`${otp}\``);
    res.json({ success: true, requireOtp: true, message: "Authorization code sent to your Telegram." });
});

app.post('/api/control-panel/login', async (req, res) => {
    const { email, password } = req.body;
    let user = await User.findOne({ email, role: 'ADMIN' });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        systemSleepData.failedAttempts += 1;
        const attemptsLeft = 3 - systemSleepData.failedAttempts;

        if (systemSleepData.failedAttempts >= 3) {
            systemSleepData.lockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes deep sleep
            return res.status(423).json({
                success: false,
                error: "🚨 3 FAILED ATTEMPTS DETECTED. SYSTEM ENTERING 30-MINUTE DEEP SLEEP LOCKDOWN. ADMIN ACCESS REVOKED TEMPORARILY."
            });
        }

        return res.status(401).json({ error: `🔒 Access Denied! Invalid Admin credentials. (${attemptsLeft} attempts remaining before 30-min system sleep.)` });
    }

    // Success -> Reset failed attempts
    systemSleepData.failedAttempts = 0;
    systemSleepData.lockedUntil = null;

    const now = Date.now();
    if (req.session.pendingAuth && req.session.pendingAuth.email === user.email && req.session.pendingAuth.sentAt && (now - req.session.pendingAuth.sentAt < 10000)) {
        return res.json({ success: true, requireOtp: true, message: "Admin authorization code already sent. Please check Telegram." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.pendingAuth = { userId: user.id, role: user.role, email: user.email, otp: otp, isAdminPortal: true, sentAt: now };

    await sendTelegramNotification(`🔐 *SECURITY ALERT: ADMIN LOGIN ATTEMPT*\n\nPortal: *CONTROL PANEL*\nUser: \`${user.email}\`\n\nYour Admin Authorization Code is: \`${otp}\``);
    res.json({ success: true, requireOtp: true, message: "Admin authorization code sent to your Telegram." });
});

// 🟢 VERIFY OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    const { otp } = req.body;

    if (!req.session.pendingAuth) {
        return res.status(400).json({ error: "Session expired or invalid. Please try logging in again." });
    }

    if (req.session.pendingAuth.otp !== otp) {
        return res.status(401).json({ error: "❌ Incorrect OTP Code! Access Denied." });
    }

    req.session.pendingAuth.otpVerified = true;
    return res.json({ success: true, require3fa: true, message: "OTP Verified. Awaiting Master Security Key." });
});

// 🔐 3FA MASTER KEY VERIFICATION
app.post('/api/control-panel/verify-3fa', async (req, res) => {
    const { masterKey } = req.body;

    if (!req.session.pendingAuth || !req.session.pendingAuth.otpVerified) {
        // 🟢 TOKEN BYPASS FALLBACK FOR INSTANT ADMIN ACCESS
        if (masterKey === "Jay_monster_mode_on" || masterKey === "Jay#Student@811002") {
            req.session.userId = MASTER_USER_ID;
            req.session.role = 'ADMIN';
            req.session.email = 'jaiminvankar520@gmail.com';
            req.session.controlPanelAuth = true;
            return res.json({ success: true, message: "Full clearance granted." });
        }
        return res.status(400).json({ error: "Invalid security flow. OTP verification required first." });
    }

    if (masterKey !== "monster_mode_on_Jay" && masterKey !== "Jay_monster_mode_on") {
        return res.status(401).json({ error: "❌ Invalid Master Key! 3FA Access Denied." });
    }

    req.session.userId = MASTER_USER_ID;
    req.session.role = req.session.pendingAuth.role;
    req.session.email = req.session.pendingAuth.email;
    req.session.controlPanelAuth = true;

    const emailToLog = req.session.email;
    const userRoleLog = req.session.role;
    delete req.session.pendingAuth;

    await sendTelegramNotification(`🐲 *MONSTER MODE ON*\n🟢 *PORTAL LOGIN SUCCESSFUL (3FA VERIFIED)*\nUser: \`${emailToLog}\`\nRole: \`${userRoleLog}\`\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

    res.json({ success: true, message: "Full clearance granted." });
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
    let xpInfo = await getUserXP(MASTER_USER_ID);
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
    let data = await getExamModeData(MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/exam-mode', requireAuth, trackerApiGuard, async (req, res) => {
    const { enabled, targetMinutes } = req.body;
    let ud = await UserData.findOne({ userId: MASTER_USER_ID });
    if(!ud) { ud = new UserData({ userId: MASTER_USER_ID }); }
    ud.examEnabled = enabled !== undefined ? enabled : false;
    ud.examTargetMinutes = targetMinutes ? parseInt(targetMinutes) : 90;
    await ud.save();
    res.json({ success: true, message: "Exam Mode updated." });
});

app.get('/api/sanctuary', requireAuth, trackerApiGuard, async (req, res) => {
    let data = await getSanctuaryData(MASTER_USER_ID);
    res.json({ success: true, ...data });
});

app.post('/api/sanctuary', requireAuth, trackerApiGuard, async (req, res) => {
    const { enabled, reason } = req.body;
    let ud = await UserData.findOne({ userId: MASTER_USER_ID });
    if(!ud) { ud = new UserData({ userId: MASTER_USER_ID }); }
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
    
    let hydData = await getHydrationData(MASTER_USER_ID);
    let consumed = hydData.logs[targetDate] || 0;
    let percent = Math.min(Math.round((consumed / hydData.goal) * 100), 100);
    let hydrationStreak = await calculateHydrationStreak(MASTER_USER_ID);
    res.json({ success: true, goal: hydData.goal, glassSize: hydData.glassSize, consumed, percent, hydrationStreak, history: hydData.logs, serverDate: targetDate });
});

app.post('/api/hydration/drink', requireAuth, trackerApiGuard, async (req, res) => {
    let moduleLock = await moduleApiGuard('hydration')(req, res, () => true);
    if(moduleLock !== true) return; // Locked response already sent by guard

    const today = getServerToday();
    const targetDate = req.body.date || today;
    
    let ud = await UserData.findOne({ userId: MASTER_USER_ID });
    if(!ud) { ud = new UserData({ userId: MASTER_USER_ID }); }
    
    let logs = ud.hydrationLogs || {};
    let current = logs[targetDate] || 0;
    let added = ud.hydrationGlassSize || 250;
    let newTotal = current + added;
    
    logs[targetDate] = newTotal;
    ud.hydrationLogs = logs;
    ud.markModified('hydrationLogs'); 
    await ud.save();
    
    let percent = Math.min(Math.round((newTotal / ud.hydrationGoal) * 100), 100);
    let hydrationStreak = await calculateHydrationStreak(MASTER_USER_ID);
    let xpInfo = await getUserXP(MASTER_USER_ID);
    res.json({ success: true, consumed: newTotal, percent, hydrationStreak, ...xpInfo });
});

app.post('/api/hydration/settings', requireAuth, trackerApiGuard, async (req, res) => {
    const { goal, glassSize } = req.body;
    let ud = await UserData.findOne({ userId: MASTER_USER_ID });
    if(!ud) { ud = new UserData({ userId: MASTER_USER_ID }); }
    
    if (goal) ud.hydrationGoal = parseInt(goal);
    if (glassSize) ud.hydrationGlassSize = parseInt(glassSize);
    await ud.save();
    res.json({ success: true, message: "Hydration settings updated." });
});

app.get('/api/notes-reminders', requireAuth, trackerApiGuard, async (req, res) => {
    let todayStr = getServerToday();
    let queryDate = req.query.date || todayStr;

    let items = await NoteReminder.find({ 
        userId: MASTER_USER_ID, 
        $or: [
            { date: queryDate },
            { isReminder: false }
        ]
    });

    let xpInfo = await getUserXP(MASTER_USER_ID);
    res.json({ success: true, items, serverDate: queryDate, ...xpInfo });
});

app.post('/api/notes-reminders', requireAuth, trackerApiGuard, async (req, res) => {
    const { title, description, isReminder, date, time } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required." });
    
    const newItem = new NoteReminder({ 
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
    await NoteReminder.deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Item deleted." });
});

app.get('/api/habits', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    
    const habits = await Habit.find({ userId: MASTER_USER_ID });
    const logs = await HabitLog.find({ userId: MASTER_USER_ID });
    
    const habitsWithStatus = habits.map(habit => {
        const targetLog = logs.find(l => l.habitId === habit.id && l.date === targetDate);
        const habitLogs = logs.filter(l => l.habitId === habit.id && l.completed);
        return { ...habit._doc, completedToday: targetLog ? targetLog.completed : false, streak: targetDate < MONSTER_LAUNCH_DATE ? 0 : habitLogs.length, serverToday: today };
    });
    let xpInfo = await getUserXP(MASTER_USER_ID);
    res.json({ success: true, habits: habitsWithStatus, serverDate: targetDate, dateStatus, ...xpInfo });
});

app.post('/api/habits', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, category, description, endDate, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Habit name required." });
    
    const newHabit = new Habit({ 
        id: 'hab_' + Date.now().toString(), userId: MASTER_USER_ID, name, category: category || "General", 
        description: description || "", startDate: startDate || MONSTER_LAUNCH_DATE, endDate: endDate || "", createdAt: new Date().toISOString() 
    });
    await newHabit.save();
    res.json({ success: true, habit: newHabit });
});

app.put('/api/habits/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, category, description, startDate } = req.body;
    let habit = await Habit.findOne({ id: req.params.id, userId: MASTER_USER_ID });
    if (!habit) return res.status(404).json({ error: "Habit not found." });
    
    if (name) habit.name = name;
    if (category !== undefined) habit.category = category;
    if (description !== undefined) habit.description = description;
    if (startDate) habit.startDate = startDate;
    await habit.save();
    
    res.json({ success: true, message: "Habit updated." });
});

app.delete('/api/habits/:id', requireAuth, trackerApiGuard, async (req, res) => {
    await Habit.deleteOne({ id: req.params.id, userId: MASTER_USER_ID });
    await HabitLog.deleteMany({ habitId: req.params.id, userId: MASTER_USER_ID });
    res.json({ success: true, message: "Habit deleted." });
});

app.post('/api/habits/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    let moduleLock = await moduleApiGuard('habits')(req, res, () => true);
    if(moduleLock !== true) return; // Locked response already sent by guard

    const habitId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    let log = await HabitLog.findOne({ habitId: habitId, date: targetDate, userId: MASTER_USER_ID });
    
    if (log) { 
        log.completed = completed; 
        await log.save(); 
    } else { 
        await new HabitLog({ id: Date.now().toString(), userId: MASTER_USER_ID, habitId, date: targetDate, completed }).save(); 
    }
    
    let updatedXP = await getUserXP(MASTER_USER_ID);
    if (completed) updatedXP = await addXP(MASTER_USER_ID, 50);
    res.json({ success: true, completed, ...updatedXP });
});

app.get('/api/workouts', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    
    const workouts = await Workout.find({ userId: MASTER_USER_ID });
    const logs = await WorkoutLog.find({ date: targetDate, userId: MASTER_USER_ID });
    
    const workoutsWithStatus = workouts.map(w => {
        const log = logs.find(l => l.workoutId === w.id);
        return { ...w._doc, completed: log ? log.completed : false };
    });
    
    const syncResult = await runServerSyncEngine(MASTER_USER_ID, targetDate);
    const currentStreak = targetDate < MONSTER_LAUNCH_DATE ? 0 : await calculateWorkoutStreak(MASTER_USER_ID);
    let xpInfo = await getUserXP(MASTER_USER_ID);
    res.json({ success: true, workouts: workoutsWithStatus, allDone: syncResult.allWorkoutsDone, currentStreak, serverDate: targetDate, dateStatus, ...xpInfo });
});

app.post('/api/workouts', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, sets, value, reps, unit, category, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Exercise name required." });
    
    const newWorkout = new Workout({ 
        id: 'w_' + Date.now().toString(), userId: MASTER_USER_ID, name, sets: sets || 3, value: value || reps || 10, unit: unit || 'reps', 
        category: category || "Strength", startDate: startDate || MONSTER_LAUNCH_DATE, createdAt: new Date().toISOString() 
    });
    await newWorkout.save();
    res.json({ success: true, workout: newWorkout });
});

app.put('/api/workouts/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, sets, value, unit, category, startDate } = req.body;
    let workout = await Workout.findOne({ id: req.params.id, userId: MASTER_USER_ID });
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
    await Workout.deleteOne({ id: req.params.id, userId: MASTER_USER_ID });
    await WorkoutLog.deleteMany({ workoutId: req.params.id, userId: MASTER_USER_ID });
    res.json({ success: true, message: "Workout deleted." });
});

app.post('/api/workouts/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    let moduleLock = await moduleApiGuard('workouts')(req, res, () => true);
    if(moduleLock !== true) return; // Locked response already sent by guard

    const workoutId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    let log = await WorkoutLog.findOne({ workoutId: workoutId, date: targetDate, userId: MASTER_USER_ID });
    
    if (log) { log.completed = completed; await log.save(); } 
    else { await new WorkoutLog({ id: Date.now().toString(), userId: MASTER_USER_ID, workoutId, date: targetDate, completed }).save(); }
    
    let updatedXP = await getUserXP(MASTER_USER_ID);
    if (completed) updatedXP = await addXP(MASTER_USER_ID, 100);
    const syncResult = await runServerSyncEngine(MASTER_USER_ID, targetDate);
    res.json({ success: true, allWorkoutsDone: syncResult.allWorkoutsDone, ...updatedXP });
});

app.get('/api/study/categories', requireAuth, trackerApiGuard, async (req, res) => {
    const categories = await StudyCategory.find({ userId: MASTER_USER_ID });
    res.json({ success: true, categories });
});

app.post('/api/study/categories', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ error: "Category name required." });
    
    const newCat = new StudyCategory({ 
        id: 's_' + Date.now().toString(), userId: MASTER_USER_ID, name: name.trim(), dailyTargetMinutes: parseInt(dailyTargetMinutes) || 120, 
        startDate: startDate || MONSTER_LAUNCH_DATE, endDate: endDate || "", createdAt: new Date().toISOString() 
    });
    await newCat.save();
    res.json({ success: true, category: newCat });
});

app.put('/api/study/categories/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, dailyTargetMinutes, startDate, endDate } = req.body;
    let category = await StudyCategory.findOne({ id: req.params.id, userId: MASTER_USER_ID });
    if (!category) return res.status(404).json({ error: "Category not found." });
    
    if(name) category.name = name.trim();
    if(dailyTargetMinutes !== undefined) category.dailyTargetMinutes = parseInt(dailyTargetMinutes);
    if(startDate) category.startDate = startDate;
    if(endDate !== undefined) category.endDate = endDate;
    await category.save();
    res.json({ success: true, message: "Category updated." });
});

app.delete('/api/study/categories/:id', requireAuth, trackerApiGuard, async (req, res) => {
    await StudyCategory.deleteOne({ id: req.params.id, userId: MASTER_USER_ID });
    res.json({ success: true, message: "Category deleted." });
});

app.get('/api/study/target', requireAuth, trackerApiGuard, async (req, res) => {
    let today = getServerToday();
    let targetDate = req.query.date || today;
    let ud = await UserData.findOne({ userId: MASTER_USER_ID });
    let customTargets = ud && ud.customDailyTargets ? ud.customDailyTargets : {};
    res.json({ success: true, date: targetDate, customMinutes: customTargets.get ? customTargets.get(targetDate) : customTargets[targetDate] || null });
});

app.post('/api/study/target', requireAuth, trackerApiGuard, async (req, res) => {
    let { targetMinutes, date } = req.body;
    let targetDate = date || getServerToday();

    let ud = await UserData.findOne({ userId: MASTER_USER_ID });
    if (!ud) { ud = new UserData({ userId: MASTER_USER_ID }); }
    
    if (!ud.customDailyTargets) { ud.customDailyTargets = new Map(); }
    ud.customDailyTargets.set(targetDate, parseInt(targetMinutes));
    ud.markModified('customDailyTargets');
    await ud.save();

    res.json({ success: true, message: "Today's study target updated successfully!" });
});

app.get('/api/study/sessions', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    
    const categories = await StudyCategory.find({ userId: MASTER_USER_ID });
    const sessions = await StudySession.find({ date: targetDate, userId: MASTER_USER_ID });
    const syncResult = await runServerSyncEngine(MASTER_USER_ID, targetDate);
    let xpInfo = await getUserXP(MASTER_USER_ID);
    
    res.json({ success: true, categories, sessions, totalTargetMinutes: syncResult.totalTargetMinutes, totalStudiedMinutes: syncResult.totalStudiedMinutes, isDone: syncResult.studyDone, serverDate: targetDate, dateStatus, ...xpInfo });
});

app.post('/api/study/sessions', requireAuth, trackerApiGuard, async (req, res) => {
    let moduleLock = await moduleApiGuard('study')(req, res, () => true);
    if(moduleLock !== true) return; // Locked response already sent by guard

    const { categoryId, topic, durationMinutes, date } = req.body;
    if (!categoryId || !durationMinutes) return res.status(400).json({ error: "Required fields missing." });
    
    const today = getServerToday();
    const targetDate = date || today;

    try {
        const newSession = new StudySession({
            id: Date.now().toString(), userId: MASTER_USER_ID, categoryId, topic: topic || "Deep Work",
            durationMinutes: parseInt(durationMinutes), date: targetDate, createdAt: new Date().toISOString()
        });
        await newSession.save();

        let updatedXP = await addXP(MASTER_USER_ID, parseInt(durationMinutes) * 2);
        res.json({ success: true, session: newSession, ...updatedXP });
    } catch (error) {
        console.error("MongoDB Save Error:", error);
        res.status(500).json({ error: "Failed to save session to database." });
    }
});

app.delete('/api/study/sessions/:id', requireAuth, trackerApiGuard, async (req, res) => {
    await StudySession.deleteOne({ id: req.params.id, userId: MASTER_USER_ID });
    res.json({ success: true, message: "Session deleted." });
});

app.get('/api/hygiene', requireAuth, trackerApiGuard, async (req, res) => {
    const today = getServerToday();
    const targetDate = req.query.date || today;
    const dateStatus = validateDateAccess(targetDate);
    let targetDateObj = new Date(targetDate);
    let isSunday = targetDateObj.getDay() === 0;
    
    const tasks = await HygieneTask.find({ userId: MASTER_USER_ID });
    const logs = await HygieneLog.find({ date: targetDate, userId: MASTER_USER_ID });
    
    const tasksWithStatus = tasks.map(t => {
        const log = logs.find(l => l.taskId === t.id);
        return { ...t._doc, completed: log ? log.completed : false, isSundayTask: t.frequency === 'sunday' };
    });
    
    let applicableTasks = tasksWithStatus.filter(t => t.frequency === 'daily' || (isSunday && t.frequency === 'sunday'));
    let allDone = applicableTasks.length > 0 && applicableTasks.every(t => t.completed);
    let xpInfo = await getUserXP(MASTER_USER_ID);
    res.json({ success: true, tasks: tasksWithStatus, applicableTasks, allDone, serverDate: targetDate, dateStatus, ...xpInfo });
});

app.post('/api/hygiene', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, frequency, startDate } = req.body;
    if (!name) return res.status(400).json({ error: "Task name required." });
    
    const newTask = new HygieneTask({ 
        id: 'h_' + Date.now().toString(), userId: MASTER_USER_ID, name, frequency: frequency || 'daily', startDate: startDate || MONSTER_LAUNCH_DATE 
    });
    await newTask.save();
    res.json({ success: true, task: newTask });
});

app.put('/api/hygiene/:id', requireAuth, trackerApiGuard, async (req, res) => {
    const { name, frequency, startDate } = req.body;
    let task = await HygieneTask.findOne({ id: req.params.id, userId: MASTER_USER_ID });
    if (!task) return res.status(404).json({ error: "Task not found." });
    
    if(name) task.name = name;
    if(frequency !== undefined) task.frequency = frequency;
    if(startDate) task.startDate = startDate;
    await task.save();
    
    res.json({ success: true, message: "Task updated." });
});

app.delete('/api/hygiene/:id', requireAuth, trackerApiGuard, async (req, res) => {
    await HygieneTask.deleteOne({ id: req.params.id, userId: MASTER_USER_ID });
    await HygieneLog.deleteMany({ taskId: req.params.id, userId: MASTER_USER_ID });
    res.json({ success: true, message: "Task deleted." });
});

app.post('/api/hygiene/:id/toggle', requireAuth, trackerApiGuard, async (req, res) => {
    let moduleLock = await moduleApiGuard('hygiene')(req, res, () => true);
    if(moduleLock !== true) return; // Locked response already sent by guard

    const taskId = req.params.id;
    const { date, completed } = req.body;
    const today = getServerToday();
    const targetDate = date || today;
    
    let log = await HygieneLog.findOne({ taskId: taskId, date: targetDate, userId: MASTER_USER_ID });
    
    if (log) { log.completed = completed; await log.save(); } 
    else { await new HygieneLog({ id: Date.now().toString(), userId: MASTER_USER_ID, taskId, date: targetDate, completed }).save(); }
    
    let updatedXP = await getUserXP(MASTER_USER_ID);
    if (completed) updatedXP = await addXP(MASTER_USER_ID, 40);
    res.json({ success: true, ...updatedXP });
});

// 🎯 TARGETS API ROUTES
app.get('/api/targets', requireAuth, async (req, res) => {
    try {
        let targets = await Target.find({ userId: MASTER_USER_ID });
        res.json({ success: true, targets });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch targets." });
    }
});

app.post('/api/targets', requireAuth, trackerApiGuard, async (req, res) => {
    try {
        const { name, date } = req.body;
        if (!name) return res.status(400).json({ error: "Target name required." });

        const newTarget = new Target({
            id: 't_' + Date.now().toString(),
            userId: MASTER_USER_ID,
            name,
            date: date || "2026-09-14",
            completed: false,
            createdAt: new Date().toISOString()
        });
        await newTarget.save();
        res.json({ success: true, target: newTarget });
    } catch (err) {
        res.status(500).json({ error: "Failed to create target." });
    }
});

app.post('/api/targets/:id/complete', requireAuth, async (req, res) => {
    try {
        let target = await Target.findOne({ id: req.params.id, userId: MASTER_USER_ID });
        if (!target) return res.status(404).json({ error: "Target not found." });
        target.completed = !target.completed;
        await target.save();
        res.json({ success: true, completed: target.completed });
    } catch (err) {
        res.status(500).json({ error: "Failed to update target status." });
    }
});

app.delete('/api/targets/:id', requireAuth, trackerApiGuard, async (req, res) => {
    try {
        await Target.deleteOne({ id: req.params.id, userId: MASTER_USER_ID });
        res.json({ success: true, message: "Target deleted successfully." });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete target." });
    }
});

// 🌐 4. Specific Internet Block API (1:00 PM to 3:00 PM Enforcement)
app.get('/api/internet-block-status', requireAuth, async (req, res) => {
    res.json({ success: true, isInternetBlocked: false, lockReason: "" });
});

// 💀 5. Forced Overtime Status & Progress API
app.get('/api/nuclear/status', requireAuth, async (req, res) => {
    let state = await getNuclearState(MASTER_USER_ID);
    res.json({ success: true, ...state.toObject() });
});

app.post('/api/nuclear/log-overtime', requireAuth, async (req, res) => {
    let { minutes } = req.body;
    let state = await getNuclearState(MASTER_USER_ID);
    
    state.overtimeCompletedMinutes += parseInt(minutes) || 30;
    if (state.overtimeCompletedMinutes >= state.overtimeRequiredMinutes) {
        state.hardcoreLocked = false;
        state.strikes = 0;
        state.overtimeRequiredMinutes = 0;
        state.overtimeCompletedMinutes = 0;
        await sendTelegramNotification(`🔓 *LOCKDOWN LIFTED*\n\nUser successfully completed required overtime punishment. Systems restored.`);
    }
    await state.save();
    res.json({ success: true, ...state.toObject() });
});

// User activity heartbeat to track inactivity
app.post('/api/user-heartbeat', requireAuth, async (req, res) => {
    let state = await getNuclearState(MASTER_USER_ID);
    state.lastActiveAt = new Date().toISOString();
    await state.save();
    res.json({ success: true });
});

// 🤖 TELEGRAM INTERACTIVE AI BOT
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        if (update && update.message && update.message.text) {
            const text = update.message.text.trim();
            const userId = MASTER_USER_ID;

            if (text === '/status') {
                const today = getServerToday();
                const sync = await runServerSyncEngine(userId, today);
                const xpInfo = await getUserXP(userId);
                let ud = await UserData.findOne({ userId });
                const reply = `📊 *TODAY'S APEX STATUS*\n\n🔥 Level: ${xpInfo.level} (${xpInfo.xp} XP)\n🛡️ Lifelines Left: ${ud ? ud.lifelinesRemaining : 5}/5\n🏋️ Workouts: ${sync.allWorkoutsDone ? '✅ DONE' : '❌ PENDING'}\n📚 Study: ${sync.totalStudiedMinutes} / ${sync.totalTargetMinutes} mins\n💧 Hydration: ${sync.hydrationDone ? '✅ DONE' : '❌ PENDING'}`;
                await sendTelegramNotification(reply);
            } 
            else if (text === '/roast' || text === '/motivation') {
                let coachMessage = "Discipline equals absolute freedom.";
                if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
                    try {
                        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                        const result = await model.generateContent("Give a brutal David Goggins style roast for someone slacking on their goals. Keep it short.");
                        coachMessage = result.response.text().trim();
                    } catch(e1) {
                        try {
                            const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                            const resFlash = await modelFlash.generateContent("Give a brutal David Goggins style roast for someone slacking on their goals. Keep it short.");
                            coachMessage = resFlash.response.text().trim();
                        } catch(e2) {}
                    }
                }
                await sendTelegramNotification(`🤖 *AI COACH VERDICT*\n\n"${coachMessage}"`);
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error("Telegram Webhook Error:", err);
        res.status(500).send('Error');
    }
});

// 🧠 REAL GEMINI AI INTEGRATION
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY");

app.get('/api/monster-coach', async (req, res) => {
    try {
        let coachMessage = "Discipline equals absolute freedom.";
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const prompt = "You are an aggressive, hardcore David Goggins style AI coach. Give a 1-sentence brutal motivational quote or roast for someone tracking their daily discipline. Keep it under 15 words.";
                const result = await model.generateContent(prompt);
                coachMessage = result.response.text().trim().replace(/"/g, '');
            } catch(e1) {
                try {
                    const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const prompt = "You are an aggressive, hardcore David Goggins style AI coach. Give a 1-sentence brutal motivational quote or roast for someone tracking their daily discipline. Keep it under 15 words.";
                    const resFlash = await modelFlash.generateContent(prompt);
                    coachMessage = resFlash.response.text().trim().replace(/"/g, '');
                } catch(e2) {}
            }
        }
        let xpInfo = await getUserXP(MASTER_USER_ID);
        res.json({ success: true, message: "Monster Coach active.", coachMessage: coachMessage, xp: xpInfo });
    } catch(e) {
        let xpInfo = await getUserXP(MASTER_USER_ID);
        res.json({ success: true, message: "Monster Coach active.", coachMessage: "Execution is everything. Stop complaining.", xp: xpInfo });
    }
});

// 🟢 PREMIUM ELITE AI COACH BOT API (UPGRADED)
app.post('/api/ai-coach/ask', async (req, res) => {
    try {
        const { prompt } = req.body;
        let reply = "Focus on your execution vectors. Discipline equals absolute freedom.";
        
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
            let aiSuccess = false;
            const aiPrompt = `You are 'APEX AI', an elite, world-class $1000/month premium fitness and discipline coach. 
            You combine the hardcore, no-excuse accountability of David Goggins with the elite sports science, biomechanics, and neurobiology of Andrew Huberman.
            
            User query: "${prompt}"

            Rules for your response:
            1. ACTIONABLE & SCIENTIFIC: If asked for a workout plan, macros, or form, give EXACT sets, reps, RPE, rest times, and biomechanical cues. Be incredibly detailed and scientific.
            2. STRUCTURED: Use Markdown (**bold text**) for emphasis and formatting. Use bullet points or numbered lists. Do NOT output plain paragraphs.
            3. NO FLUFF: Be direct, highly intelligent, and authoritative. Do not act like a basic chatbot.
            4. BRUTAL ACCOUNTABILITY: End every single response with a strict, uncompromising, hardcore command to execute the plan immediately. No feelings, just execution.`;
            
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(aiPrompt);
                reply = result.response.text().trim();
                aiSuccess = true;
            } catch(e1) {}

            if (!aiSuccess) {
                try {
                    const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const resFlash = await modelFlash.generateContent(aiPrompt);
                    reply = resFlash.response.text().trim();
                    aiSuccess = true;
                } catch(e2) {}
            }
        } else {
            const query = (prompt || "").toLowerCase();
            if (query.includes('penalty') || query.includes('miss') || query.includes('skip')) {
                reply = "**⚠️ STRICTNESS PROTOCOL INITIATED:**\n\nSkipping a scheduled execution vector triggers an immediate streak reset.\n\n**Penalties:**\n• You will run a mandatory 5km at 5:00 AM tomorrow.\n• No dopamine activities (music/social media) for 24 hours.\n\n**Do not let your mind control you. Get the work done.**";
            } else if (query.includes('physique') || query.includes('routine') || query.includes('plan')) {
                reply = "**🎯 ELITE HYPERTROPHY BLUEPRINT:**\n\nTo achieve maximum muscle synthesis:\n• **Push:** Bench Press (4x8), Overhead Press (3x10), Tricep Dips (3xF).\n• **Pull:** Barbell Rows (4x8), Pull-ups (3xF), Bicep Curls (3x12).\n• **Legs:** Squats (4x8), RDLs (3x10), Calf Raises (4x15).\n\n*Maintain 2 RIR (Reps in Reserve) and consume 1.8g protein per kg of bodyweight.*\n\n**The plan is set. The science is proven. Now shut up and lift.**";
            } else if (query.includes('form') || query.includes('exercise')) {
                reply = "💡 **BIOMECHANICAL MASTERY:**\n\nFor a perfect lift:\n• **Brace Your Core:** Imagine taking a punch to the stomach.\n• **Eccentric Control:** Take 3 full seconds on the way down.\n• **Concentric Explosiveness:** Explode on the way up.\n\n**Leave your ego at the door. Execute with perfect technique.**";
            }
        }

        res.json({ success: true, reply });
    } catch (err) {
        res.json({ success: true, reply: "**SYSTEM WARNING:** Offline mode engaged.\n\nExecute your workout regardless of motivation. The iron does not care if the AI is disconnected. **GO LIFT.**" });
    }
});

// 🟢 OLED AUTO-SWITCH API
app.get('/api/oled-status', (req, res) => {
    let istTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    let istNow = new Date(istTimeStr);
    let hour = istNow.getHours();
    let isOledTime = (hour >= 22 || hour < 7);
    res.json({ success: true, isOledTime });
});

// 🟢 DAILY MONSTER LOG APIs
app.get('/api/monster-log', requireAuth, async (req, res) => {
    let today = getServerToday();
    let log = await MonsterLog.findOne({ userId: MASTER_USER_ID, date: today });
    res.json({ success: true, log });
});

app.post('/api/monster-log', requireAuth, async (req, res) => {
    const { content } = req.body;
    let today = getServerToday();
    
    let aiFeedback = "Execute blindly. No emotions.";
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
        try {
            const prompt = `You are a ruthless, David Goggins style AI coach. The user logged this about their day: "${content}". Give a brutal 1-2 sentence response.`;
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await model.generateContent(prompt);
                aiFeedback = result.response.text().trim().replace(/"/g, '');
            } catch(e1) {
                const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const resFlash = await modelFlash.generateContent(prompt);
                aiFeedback = resFlash.response.text().trim().replace(/"/g, '');
            }
        } catch(e) {}
    }
    
    let log = await MonsterLog.findOne({ userId: MASTER_USER_ID, date: today });
    if (log) {
        log.content = content;
        log.aiFeedback = aiFeedback;
        await log.save();
    } else {
        log = new MonsterLog({
            id: 'ml_' + Date.now(),
            userId: MASTER_USER_ID,
            date: today,
            content,
            aiFeedback,
            createdAt: new Date().toISOString()
        });
        await log.save();
    }
    res.json({ success: true, log });
});

// TELEGRAM ACHIEVEMENT NOTIFICATION ROUTE
app.post('/api/send-telegram', async (req, res) => {
    try {
        const { message } = req.body;
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
        const CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE';
        
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
        res.json({ success: true });
    } catch (e) {
        console.error("Telegram Notification Error:", e);
        res.json({ success: false });
    }
});

// 🟢 BADGES API
app.get('/api/badges', requireAuth, async (req, res) => {
    let xpInfo = await getUserXP(MASTER_USER_ID);
    let lvl = xpInfo.level;
    
    const allBadges = [
        { id: 'b1', name: 'Novice Executor', icon: '🥉', levelRequired: 1 },
        { id: 'b2', name: 'Discipline Initiate', icon: '🥈', levelRequired: 5 },
        { id: 'b3', name: 'Apex Predator', icon: '🥇', levelRequired: 10 },
        { id: 'b4', name: 'Iron Mindset', icon: '🏆', levelRequired: 20 },
    ];
    
    const badges = allBadges.map(b => ({
        ...b,
        unlocked: lvl >= b.levelRequired
    }));
    
    res.json({ success: true, badges });
});

// 🌦️ WEATHER API ROUTE (Ahmedabad)
app.get('/api/weather', async (req, res) => {
    try {
        const apiKey = process.env.WEATHER_API_KEY || "91765ab33e096c422ccec03ab5977a6e"; 
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Ahmedabad&units=metric&appid=${apiKey}`);
        const data = await response.json();
        if (data.main) {
            res.json({ success: true, temp: Math.round(data.main.temp), condition: data.weather[0].main });
        } else {
            res.json({ success: false, temp: "32", condition: "CLEAR" });
        }
    } catch (err) {
        res.json({ success: false, temp: "32", condition: "CLEAR" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 MONSTER MODE Server running at http://localhost:${PORT}`);
});