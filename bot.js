const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // سنطبعه يدوياً لتجنب مشاكل الشاشة
        auth: state,
        browser: ["المدرسة الرقمية", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n\n📸 --- امسح الكود التالي للربط --- 📸\n");
            qrcode.generate(qr, { small: true });
            console.log("\n🔗 رابط مباشر للكود (افتحه في صفحة جديدة):");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("\n-----------------------------------\n\n");
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("✅ تم الاتصال بنجاح.. المدرسة جاهزة!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (body === "أهلا") {
            await sock.sendMessage(from, { text: "أهلاً بك في بوت المدرسة الرقمية! 🎓" });
        }
    });
}

startBot();
