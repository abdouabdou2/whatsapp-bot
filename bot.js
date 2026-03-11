const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const qrcode = require("qrcode-terminal");

// --- [ إعدادات الإدارة والمسارات ] ---
const adminNumbers = ["21625124609"]; // ضع رقمك هنا بالصيغة الدولية بدون +
const baseDir = './lessons';
const usersFile = './users.json';
const sessionFolder = './session_data';

fs.ensureDirSync(baseDir);

const loadData = () => fs.existsSync(usersFile) ? fs.readJsonSync(usersFile) : { users: [] };
const saveData = (data) => fs.writeJsonSync(usersFile, data);

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // سنطبع الكود يدوياً لضمان ظهوره في Railway
        auth: state,
        browser: ["المدرسة الرقمية", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("========================================");
            console.log("📸 امسح الكود أدناه للربط:");
            qrcode.generate(qr, { small: true }); // توليد كود صغير الحجم للهاتف
            console.log("رابط احتياطي إذا لم يظهر المربع:");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("========================================");
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
        const isOwner = adminNumbers.some(num => from.includes(num));

        if (body === "أهلا") {
            await sock.sendMessage(from, { text: "أهلاً بك في بوت المدرسة الرقمية! 🎓" });
        }
    });
}

startBot();
