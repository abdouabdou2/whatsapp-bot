const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');

const app = express();
let lastQR = null;

// 🌐 صفحة الـ QR (للمتصفح)
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ الرمز لم يتولد بعد.. انتظر قليلاً وحدث الصفحة.");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

app.get('/', (req, res) => res.send("✅ Bot is Online and Running on Railway!"));

// 🛠️ تثبيت المنفذ على 8080 ليتوافق مع Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server active on port ${PORT}`));

async function startBot() {
    try {
        // 1. الاتصال بقاعدة البيانات
        if (mongoose.connection.readyState === 0) {
            console.log("⏳ جاري الاتصال بـ MongoDB...");
            await mongoose.connect(process.env.MONGODB_URI);
            console.log("✅ متصل بقاعدة البيانات بنجاح");
        }

        // 2. إعداد الجلسة (اسم جديد لإجبار توليد QR جديد)
        const { state, saveCreds } = await useMultiFileAuthState('session_final_fix_v10');
        const { version } = await fetchLatestBaileysVersion();

        // 3. إنشاء اتصال واتساب
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true, // يطبع الرمز في الـ Logs
            logger: pino({ level: 'fatal' }),
            browser: ["Chrome (Linux)", "Chrome", "114.0.5735.199"]
        });

        sock.ev.on('creds.update', saveCreds);

        // 4. مراقبة حالة الاتصال والـ QR
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                lastQR = qr;
                console.log("\n-------------------------------------------");
                console.log("👇 امسح الرمز المربع بالأسفل للربط 👇");
                qrcodeTerminal.generate(qr, { small: true });
                console.log("رابط مباشر للرمز: https://whatsapp-bot-production-d7eb.up.railway.app/qr");
                console.log("-------------------------------------------\n");
            }

            if (connection === 'open') {
                console.log("🚀 مبروك! البوت متصل الآن بنجاح.");
                lastQR = null;
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = reason !== DisconnectReason.loggedOut;
                console.log(`❌ انقطع الاتصال. السبب: ${reason}. إعادة محاولة: ${shouldReconnect}`);
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 10000); // إعادة محاولة بعد 10 ثواني
                }
            }
        });

    } catch (err) {
        console.error("💥 خطأ فادح في التشغيل:", err);
        setTimeout(() => startBot(), 10000);
    }
}

// البدء
startBot();
