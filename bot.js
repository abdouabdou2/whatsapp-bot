const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");

async function startBot() {
    // استخدام ذاكرة مؤقتة لضمان توليد QR جديد
    const { state, saveCreds } = await useMultiFileAuthState("session_" + Math.floor(Math.random() * 1000));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "fatal" }), // إخفاء كافة التحذيرات والرسائل المزعجة
        printQRInTerminal: false,
        auth: state,
        browser: ["المدرسة الرقمية", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update;

        if (qr) {
            console.log("\n\n************************************************");
            console.log("🔗 رابط الـ QR CODE الخاص بك جاهز الآن:");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("************************************************\n\n");
        }

        if (connection === "open") {
            console.log("✅✅✅ تم الاتصال بنجاح! البوت يعمل الآن.");
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startBot();
