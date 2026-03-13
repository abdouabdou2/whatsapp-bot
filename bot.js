const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');

const app = express();
let lastQR = null;

// 🌐 صفحة الـ QR
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ جاري تجهيز الرمز.. انتظر ثواني وحدث الصفحة (Refresh).");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

app.get('/', (req, res) => res.send("✅ البوت يعمل! اذهب إلى /qr"));

// ⚠️ إجبار المنفذ على 3000 ليتوافق مع إعدادات Railway عندك
const PORT = process.env.PORT ||8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server active on port ${PORT}`));

async function startBot() {
    // الاتصال بالقاعدة مرة واحدة
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI).catch(e => console.log("DB Error:", e));
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_stable_v5');
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
            console.log("🆕 QR Code Updated");
        }

        if (connection === 'open') {
            console.log("🚀 Connected Successfully!");
            lastQR = null;
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startBot(), 10000); // تأخير 10 ثوانٍ لمنع الـ Loop
        }
    });
}

startBot();
