const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
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

app.get('/', (req, res) => res.send("✅ Bot is Online"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 السيرفر يعمل على المنفذ ${PORT}`));

async function startBot() {
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log("✅ متصل بـ MongoDB");
        }

        // استخدام الـ Collection لحفظ الجلسة
        const collection = mongoose.connection.db.collection('auth_session_stable');
        const { state, saveCreds } = await useMongoAuthState(collection);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'fatal' }),
            browser: ["Chrome (Linux)", "Chrome", "114.0.5735.199"]
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                lastQR = qr;
                console.log("\n-------------------------------------------");
                console.log("🆕 رمز QR جديد جاهز! امسحه الآن:");
                qrcodeTerminal.generate(qr, { small: true });
                console.log("-------------------------------------------\n");
            }

            if (connection === 'open') {
                console.log("🚀 مبروك! تم الاتصال بنجاح والجلسة آمنة في القاعدة.");
                lastQR = null;
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                    console.log("🔄 إعادة محاولة الاتصال...");
                    setTimeout(() => startBot(), 5000);
                }
            }
        });
    } catch (error) {
        console.error("💥 خطأ فادح:", error);
        setTimeout(() => startBot(), 10000);
    }
}

startBot();
