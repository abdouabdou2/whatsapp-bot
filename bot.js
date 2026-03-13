const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const pino = require('pino');

async function startBot() {
    console.log("🔄 جاري بدء المحرك وتجهيز المدرسة...");

    // 1. الاتصال بـ MongoDB
    const mongoURI = process.env.MONGODB_URI;
    try {
        await mongoose.connect(mongoURI);
        console.log("------------------------------------------");
        console.log("✅ متصل بـ MongoDB بنجاح!");
        console.log("------------------------------------------");
    } catch (err) {
        console.error("❌ خطأ في الاتصال بالقاعدة:", err.message);
        return;
    }

    // 2. إعداد الجلسة (استخدام اسم مجلد جديد لضمان عدم وجود تعارض)
    const { state, saveCreds } = await useMultiFileAuthState('session_fixed_v2');
    const { version } = await fetchLatestBaileysVersion();

    // 3. إعداد اتصال الواتساب مع هوية متصفح حديثة
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false, // تعطيل الرموز المشوهة في السجلات
        browser: ["Windows", "Chrome", "122.0.0.0"] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // --- [ الحل الذكي لمشكلة الـ QR ] ---
        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
            console.log("------------------------------------------");
            console.log("📢 امسح الرمز من هذا الرابط (افتحه في صفحة جديدة):");
            console.log(qrImageUrl);
            console.log("------------------------------------------");
        }

        if (connection === 'open') {
            console.log("------------------------------------------");
            console.log("🚀 مبروك! البوت متصل الآن وجاهز لاستقبال الطلاب.");
            console.log("------------------------------------------");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("⚠️ انقطع الاتصال.. إعادة محاولة:", shouldReconnect);
            if (shouldReconnect) startBot();
        }
    });

    // 4. استقبال الرسائل
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        // رد تجريبي للتأكد من العمل
        if (text === 'بدء' || text === 'سلام') {
            await sock.sendMessage(from, { text: "أهلاً بك في بوت المدرسة! اكتب 'درس' للبدء." });
        }
    });
}

// تشغيل البوت
startBot();
