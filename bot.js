const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');

const app = express();
let lastQR = null;
let sock = null;

// 🌐 سيرفر الويب لعرض الـ QR
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ جاري تجهيز الرمز.. انتظر 15 ثانية وحدث الصفحة. إذا طال الانتظار، تأكد من سجلات Railway.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

app.get('/', (req, res) => res.send("✅ البوت يعمل بنجاح! اذهب إلى /qr لمسح الرمز."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server is running on port ${PORT}`));

// 🔌 دالة الاتصال بقاعدة البيانات (مرة واحدة فقط)
async function connectDB() {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ متصل بقاعدة البيانات بنجاح");
    } catch (err) {
        console.error("❌ فشل اتصال القاعدة:", err.message);
    }
}

async function startBot() {
    await connectDB();
    
    // استخدام اسم جلسة جديد لتجاوز أي تعليق سابق
    const { state, saveCreds } = await useMultiFileAuthState('session_stable_final');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: true, // سنطبع الرمز في السجل أيضاً كاحتياط
        browser: ["Windows", "Chrome", "122.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("🆕 تم توليد رمز QR جديد. متاح على الرابط الخاص بك.");
        }

        if (connection === 'open') {
            console.log("🚀 تم الاتصال بنجاح! البوت الآن نشط.");
            lastQR = null;
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ انقطع الاتصال (السبب: ${statusCode}). إعادة محاولة: ${shouldReconnect}`);
            if (shouldReconnect) {
                // تأخير بسيط قبل إعادة التشغيل لتجنب الـ Loop
                setTimeout(() => startBot(), 5000);
            }
        }
    });
}

startBot();
