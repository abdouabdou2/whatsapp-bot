const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal'); // لإظهار الرمز في السجلات كاحتياط

const app = express();
let lastQR = null;
 
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ الرمز لم يتولد بعد.. حدث الصفحة كل 5 ثوانٍ.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

app.get('/', (req, res) => res.send("✅ Bot is Online"));

const PORT = process.env.PORT || 8080; // تأكيد العمل على المنفذ الذي اكتشفه Railway
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server active on port ${PORT}`));

async function startBot() {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI).catch(e => console.log("DB Error:", e));
    }

    // تغيير اسم الجلسة لضمان اتصال جديد تماماً
    const { state, saveCreds } = await useMultiFileAuthState('session_new_start_v9');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: true, // سأقوم بطباعة الرمز في الـ Logs كأعمدة سوداء
        browser: ["Windows", "Chrome", "122.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("🆕 QR Code Updated! If URL fails, look at the terminal logs below.");
            // طباعة الرمز في السجلات كأعمدة (احتياط)
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log("🚀 مبروك! البوت متصل الآن بنجاح.");
            lastQR = null;
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startBot(), 5000);
        }
    });
}

startBot();
