const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { useMongoAuthState } = require('baileys-mongodb-storage');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');

const app = express();
let lastQR = null;

app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ جاري إنشاء الرمز... حدث الصفحة بعد قليل.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 السيرفر يعمل على المنفذ ${PORT}`));

async function startBot() {
    // 1. الاتصال بقاعدة البيانات
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ متصل بـ MongoDB");

    // 2. إعداد الجلسة داخل القاعدة مباشرة (بدون ملفات محلياً)
    const collection = mongoose.connection.db.collection('auth_session_v1');
    const { state, saveCreds } = await useMongoAuthState(collection);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'fatal' }),
        browser: ["Windows", "Chrome", "11.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("🆕 رمز QR جديد ظهر! امسحه الآن:");
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log("🚀 تم الاتصال بنجاح! الجلسة محفوظة في القاعدة الآن.");
            lastQR = null;
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });
}

startBot();
