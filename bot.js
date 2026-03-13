const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

// --- [ 1. جلب رابط القاعدة من المتغيرات التي أضفتها ] ---
const mongoURI = process.env.MONGODB_URI;

async function startBot() {
    // الاتصال بـ MongoDB
    try {
        await mongoose.connect(mongoURI);
        console.log("✅ تم الاتصال بقاعدة البيانات.. الجلسة محمية!");
    } catch (err) {
        console.error("❌ فشل الاتصال بـ MongoDB:", err);
    }

    // إعداد الجلسة (ستستخدم مجلد auth_info كواجهة مؤقتة للقاعدة)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: true, // سيظهر الـ QR في سجلات (Logs) ريلوي للمرة الأولى
        browser: ["WhatsApp School", "Chrome", "1.0.0"]
    });

    // حفظ التحديثات تلقائياً
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("⚠️ افتح سجلات ريلوي وامسح رمز QR Code الآن!");
        }

        if (connection === 'open') {
            console.log("🚀 تم الاتصال بنجاح! مدرستك الآن تعمل 24/7 بدون انقطاع.");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    // --- [ منطق الدروس ] ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        if (text === 'درس') {
            const videoPath = './lessons/1/main_video.mp4';
            if (fs.existsSync(videoPath)) {
                await sock.sendMessage(from, { video: fs.readFileSync(videoPath), caption: "شاهد الدرس بتركيز." });
            } else {
                await sock.sendMessage(from, { text: "أهلاً بك! يرجى التأكد من رفع ملفات الدروس إلى GitHub داخل مجلد lessons." });
            }
        }
    });
}

startBot();
