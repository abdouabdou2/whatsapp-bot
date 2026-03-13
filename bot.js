const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const pino = require('pino');

// دالة بدء البوت
async function startBot() {
    console.log("🔄 جاري تشغيل المحرك...");

    // 1. الاتصال بقاعدة البيانات MongoDB
    const mongoURI = process.env.MONGODB_URI;
    try {
        await mongoose.connect(mongoURI);
        console.log("✅ متصل بـ MongoDB بنجاح");
    } catch (err) {
        console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
        return; // توقف إذا لم يتصل بالقاعدة
    }

    // 2. إعداد الجلسة (استخدام اسم مجلد جديد تماماً لتجنب التضارب)
    const { state, saveCreds } = await useMultiFileAuthState('session_clean_v1');
    const { version } = await fetchLatestBaileysVersion();

    // 3. إعداد اتصال الواتساب
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false, // سنستخدم الرابط بدلاً من الرموز المشوهة
        // هوية متصفح حديثة جداً لتجنب خطأ "Impossible de connecter"
        browser: ["Windows", "Chrome", "122.0.6261.112"]
    });

    // حفظ تحديثات الجلسة تلقائياً
    sock.ev.on('creds.update', saveCreds);

    // مراقبة حالة الاتصال
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // إذا ظهر رمز QR جديد
        if (qr) {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
            console.log("------------------------------------------");
            console.log("📢 امسح الرمز من الرابط التالي فوراً:");
            console.log(qrUrl);
            console.log("------------------------------------------");
        }

        // عند فتح الاتصال بنجاح
        if (connection === 'open') {
            console.log("🚀 مبروك! البوت متصل الآن ومحمي سحابياً.");
        }

        // عند حدوث انقطاع
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("⚠️ انقطع الاتصال.. جاري إعادة المحاولة:", shouldReconnect);
            if (shouldReconnect) startBot();
        }
    });

    // 4. منطق الاستجابة للرسائل (مثال بسيط)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        if (text === 'بدء') {
            await sock.sendMessage(from, { text: "أهلاً بك في مدرستنا! اكتب 'درس' لمشاهدة المحتوى." });
        }
    });
}

// تشغيل البوت
startBot();
