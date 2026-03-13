const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");

async function startBot() {
    // توليد جلسة جديدة كل مرة لضمان ظهور QR جديد فوراً
    const { state, saveCreds } = await useMultiFileAuthState("session_" + Date.now());
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "fatal" }), // هذا السطر سيحذف كل التحذيرات الصفراء
        printQRInTerminal: false,
        auth: state,
        browser: ["المدرسة الرقمية", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update;

        if (qr) {
            console.log("\n\n================================================");
            console.log("🔗 رابط الـ QR CODE الخاص بك جاهز (انسخه وافتحه):");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("================================================\n\n");
        }

        if (connection === "open") {
            console.log("✅✅✅ مبروك! البوت متصل الآن بنجاح.");
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startBot();
