const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');

const app = express();
let lastQR = null;

// 🌐 واجهة الـ QR للمتصفح
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ جاري توليد الرمز.. انتظر 10 ثوانٍ ثم حدث الصفحة.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

app.get('/', (req, res) => res.send("✅ Bot is Online"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server active on port ${PORT}`));

async function startBot() {
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log("✅ متصل بقاعدة البيانات بنجاح");
        }

        // ⚠️ ملاحظة: قمت بتغيير اسم الجلسة إلى v20 لضمان مسح أي تعليق سابق
        const { state, saveCreds } = await useMultiFileAuthState('session_v20_clean');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true, // سيطبع الرمز في الـ Logs كأولوية
            logger: pino({ level: 'fatal' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                lastQR = qr;
                console.log("\n-------------------------------------------");
                console.log("📢 الرمز جاهز! امسحه الآن من السجلات بالأسفل:");
                qrcodeTerminal.generate(qr, { small: true });
                console.log("-------------------------------------------\n");
            }

            if (connection === 'open') {
                console.log("🚀 مبروك! البوت متصل الآن بنجاح.");
                lastQR = null;
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // إذا كان الخطأ undefined أو انقطاع مفاجئ، نعيد التشغيل فوراً
                console.log(`❌ انقطع الاتصال. السبب: ${reason}`);
                if (reason !== DisconnectReason.loggedOut) {
                    setTimeout(() => startBot(), 5000);
                }
            }
        });

    } catch (err) {
        console.error("💥 خطأ فادح:", err.message);
        setTimeout(() => startBot(), 10000);
    }
}

startBot();
