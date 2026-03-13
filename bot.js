const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // تم تعطيل الرسم اليدوي نهائياً
        auth: state,
        browser: ["المدرسة الرقمية", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n\n🔗 --- رابط الـ QR Code الخاص بك جاهز --- 🔗");
            console.log("اضغط مطولاً على الرابط التالي وافتحه في صفحة جديدة:");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("-------------------------------------------\n\n");
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("✅ تم الاتصال بنجاح.. المدرسة جاهزة للعمل!");
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startBot();
