// إضافة مكتبة التشفير لحل مشكلة "crypto is not defined"
const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');

const app = express();
let lastQR = null;

// سيرفر الويب لعرض الـ QR على الرابط الثابت
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ جاري تجهيز الرمز.. انتظر 10 ثوانٍ وحدث الصفحة.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

// رسالة ترحيب عند الدخول للرابط الأساسي
app.get('/', (req, res) => {
    res.send("✅ البوت يعمل! أضف /qr للرابط لمسح الرمز.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 الرابط الثابت جاهز على المنفذ ${PORT}`));

async function startBot() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ متصل بقاعدة البيانات بنجاح");
    } catch (err) {
        console.error("❌ فشل الاتصال بالقاعدة:", err.message);
    }

    // استخدام اسم جلسة جديد تماماً لتجنب أي أخطاء سابقة
    const { state, saveCreds } = await useMultiFileAuthState('session_v4_final');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false,
        browser: ["Windows", "Chrome", "122.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("📢 تم تحديث الـ QR. متاح الآن على رابطك الخاص.");
        }

        if (connection === 'open') {
            console.log("🚀 مبروك! البوت متصل الآن بنجاح.");
            lastQR = null; // مسح الرمز بعد الاتصال
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });
}

startBot();
