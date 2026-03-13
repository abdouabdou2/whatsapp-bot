const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const pino = require('pino');

async function startBot() {
    // 1. الاتصال بـ MongoDB (تأكد من وجود المتغير في Railway)
    const mongoURI = process.env.MONGODB_URI;
    try {
        await mongoose.connect(mongoURI);
        console.log("✅ متصل بـ MongoDB");
    } catch (err) {
        console.error("❌ خطأ في الاتصال بالقاعدة:", err);
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        // تم تعطيل الطباعة التقليدية لتجنب التشويش في السجلات
        printQRInTerminal: false 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // --- [ هذه هي الطريقة التي طلبتها ] ---
        if (qr) {
            // رابط واحد ثابت يتحدث تلقائياً ببيانات الـ QR الجديدة
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
            console.log("------------------------------------------");
            console.log("📢 امسح الرمز من الرابط التالي (يتحدث تلقائياً):");
            console.log(qrUrl);
            console.log("------------------------------------------");
        }

        if (connection === 'open') {
            console.log("🚀 تم الاتصال بنجاح! الجلسة الآن محفوظة في السحاب.");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    // يمكنك إضافة منطق الرسائل هنا لاحقاً
}

startBot();
