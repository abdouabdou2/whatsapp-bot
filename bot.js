const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const pino = require('pino');

async function startBot() {
    // 1. الاتصال بـ MongoDB
    const mongoURI = process.env.MONGODB_URI;
    try {
        await mongoose.connect(mongoURI);
        console.log("✅ متصل بـ MongoDB");
    } catch (err) {
        console.error("❌ خطأ في قاعدة البيانات:", err);
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false,
        // --- [ التحديث الجديد هنا ] ---
        // جعل الواتساب يعتقد أنك تتصل من متصفح Chrome حديث على نظام macOS
        browser: ["Mac OS", "Chrome", "122.0.6261.112"] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
            console.log("------------------------------------------");
            console.log("📢 رابط الـ QR المحدث (افتحه وامسحه):");
            console.log(qrUrl);
            console.log("------------------------------------------");
        }

        if (connection === 'open') {
            console.log("🚀 مبروك! تم الاتصال بنجاح وتجاوز مشكلة الربط.");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });
}

startBot();
