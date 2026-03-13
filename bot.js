const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');

const app = express();
let lastQR = null;

// 🌐 رابط الـ QR للمتصفح
app.get('/qr', (req, res) => {
    if (!lastQR) return res.send("⏳ الرمز لم يتولد بعد.. انتظر ثواني وحدث الصفحة (Refresh).");
    res.setHeader('Content-Type', 'image/png');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`);
});

app.get('/', (req, res) => res.send("✅ Bot Status: Online"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server active on port ${PORT}`));

async function startBot() {
    try {
        // 1. الاتصال بـ MongoDB أولاً
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log("✅ متصل بقاعدة البيانات بنجاح");
        }

        // 2. استخدام اسم جلسة جديد تماماً لتجنب خطأ undefined السابق
        // ملاحظة: يمكنك تغيير v1 إلى v2 إذا احتجت لتصفير الجلسة مرة أخرى
        const { state, saveCreds } = await useMultiFileAuthState('session_database_v1');
        const { version } = await fetchLatestBaileysVersion();

        // 3. إعدادات الاتصال
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true, // لإظهار الرمز في السجلات (Logs)
            logger: pino({ level: 'fatal' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            syncFullHistory: false, // لتقليل استهلاك الذاكرة وتجنب التعليق
            shouldSyncHistoryMessage: () => false
        });

        sock.ev.on('creds.update', saveCreds);

        // 4. معالجة تحديثات الاتصال والـ QR
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                lastQR = qr;
                console.log("\n-------------------------------------------");
                console.log("👇 امسح الرمز المربع بالأسفل الآن 👇");
                qrcodeTerminal.generate(qr, { small: true });
                console.log("أو استخدم الرابط: https://whatsapp-bot-production-d7eb.up.railway.app/qr");
                console.log("-------------------------------------------\n");
            }

            if (connection === 'open') {
                console.log("🚀 مبروك! تم الاتصال بنجاح والبوت نشط الآن.");
                lastQR = null;
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ انقطع الاتصال (السبب: ${reason})`);
                
                // إعادة المحاولة التلقائية إلا إذا قام المستخدم بحذف الجهاز
                if (reason !== DisconnectReason.loggedOut) {
                    console.log("🔄 جاري إعادة المحاولة خلال 10 ثوانٍ...");
                    setTimeout(() => startBot(), 10000);
                } else {
                    console.log("⚠️ تم تسجيل الخروج. يرجى حذف مجلد الجلسة وإعادة البدء.");
                }
            }
        });

    } catch (err) {
        console.error("💥 خطأ فادح:", err.message);
        setTimeout(() => startBot(), 10000);
    }
}

// تشغيل البوت
startBot();
