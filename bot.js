const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");

async function startBot() {
    // استخدام مجلد جلسة ثابت لضمان عدم تكرار الطلبات غير الضرورية
    const { state, saveCreds } = await useMultiFileAuthState("bot_session");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "fatal" }), // إخفاء التحذيرات المزعجة
        printQRInTerminal: false,
        auth: state,
        browser: ["المدرسة الرقمية", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update;

        if (qr) {
            // إضافة Timestamp للرابط لإجبار المتصفح على تحديث الصورة
            const timestamp = Date.now();
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}&t=${timestamp}`;
            
            console.log("\n\n🔄 --- تم تحديث كود الـ QR الآن --- 🔄");
            console.log("رابط الكود الجديد (اضغط عليه فوراً):");
            console.log(qrUrl);
            console.log("------------------------------------------\n\n");
        }

        if (connection === "open") {
            console.log("✅✅✅ مبروك! البوت متصل الآن بنجاح.");
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startBot();
