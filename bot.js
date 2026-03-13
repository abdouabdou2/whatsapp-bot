const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");

async function startBot() {
    // استخدام اسم جلسة فريد في كل مرة لضمان عدم حدوث تداخل
    const { state, saveCreds } = await useMultiFileAuthState("session_new_start");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "fatal" }),
        printQRInTerminal: false,
        auth: state,
        // إضافة إعدادات المتصفح مهمة جداً للقبول
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
            console.log("\n\n🔄 --- امسح الكود الجديد الآن --- 🔄");
            console.log(qrUrl);
            console.log("----------------------------------\n\n");
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("❌ انقطع الاتصال، جاري المحاولة مرة أخرى...");
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("\n\n✅✅✅ مبروووك! تم الاتصال بنجاح.. المدرسة تعمل!");
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startBot();
