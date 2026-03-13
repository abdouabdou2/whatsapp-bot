const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const app = express();
let lastQR = null;

// إنشاء سيرفر ويب بسيط لعرض الـ QR
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ جاري تجهيز الرمز.. انتظر ثواني وحدث الصفحة.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 رابط الـ QR الثابت جاهز على المنفذ ${PORT}`));

async function startBot() {
    await mongoose.connect(process.env.MONGODB_URI);
    const { state, saveCreds } = await useMultiFileAuthState('session_stable_v3');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Windows", "Chrome", "122.0.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            lastQR = qr; // تخزين الـ QR لعرضه في الرابط الثابت
            console.log("📢 تم تحديث الـ QR. افتحه من رابط الدومين الخاص بك.");
        }
        if (connection === 'open') console.log("🚀 متصل الآن!");
    });
}

startBot();
