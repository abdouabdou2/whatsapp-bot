const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs-extra');
const path = require('path');
const qrcode = require('qrcode-terminal');

// --- [ إعدادات الإدارة والمسارات ] ---
const adminNumbers = ["21625124609", "246828029222949", "22248585761"];
const baseDir = './lessons';
const usersFile = './users.json';
const sessionFolder = './session_data';

// التأكد من وجود المجلدات الأساسية
fs.ensureDirSync(baseDir);

const loadData = () => fs.existsSync(usersFile) ? fs.readJsonSync(usersFile) : {};
const saveData = (data) => fs.writeJsonSync(usersFile, data, { spaces: 2 });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // مهم جداً لأوراكل
        logger: P({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح.. المدرسة جاهزة للطلاب!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isAdmin = adminNumbers.some(num => from.includes(num));
        const caption = msg.message.videoMessage?.caption || msg.message.audioMessage?.caption || "";
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || caption).trim();

        let users = loadData();
        let student = users[from];

        // --- [ نظام المدير ] ---
        if (isAdmin) {
            if (text.startsWith('مستخدم جديد')) {
                const p = text.split(' ');
                users[p[2]] = { name: p[3], current: parseInt(p[4]), status: 'IDLE', currentSentenceIndex: 1, stats: [] };
                saveData(users);
                return sock.sendMessage(from, { text: `✅ تم تفعيل الطالب: ${p[3]}` });
            }

            if (msg.message.videoMessage && text.startsWith('رفع فيديو')) {
                const lessonNum = text.split(' ')[2];
                const buffer = await downloadMedia(msg.message.videoMessage, 'video');
                await fs.outputFile(path.join(baseDir, lessonNum, 'main_video.mp4'), buffer);
                return sock.sendMessage(from, { text: `✅ تم رفع فيديو الدرس ${lessonNum}.` });
            }

            if (msg.message.videoMessage && text.startsWith('رفع جملة')) {
                const lines = text.split('\n').map(l => l.trim());
                const parts = lines[0].split(' ');
                const [lessonNum, sentNum] = [parts[2], parts[3]];
                await fs.outputFile(path.join(baseDir, lessonNum, 'metadata', `${sentNum}.txt`), `${lines[1]}\n${lines[2]}`);
                const buffer = await downloadMedia(msg.message.videoMessage, 'video');
                await fs.outputFile(path.join(baseDir, lessonNum, 'clips', `${sentNum}.mp4`), buffer);
                return sock.sendMessage(from, { text: `✅ تم حفظ الجملة ${sentNum} للدرس ${lessonNum}.` });
            }
        }

        // --- [ نظام الطالب ] ---
        if (student) {
            const lessonDir = path.join(baseDir, student.current.toString());

            if (text === 'درس') {
                const vPath = path.join(lessonDir, 'main_video.mp4');
                if (fs.existsSync(vPath)) {
                    await sock.sendMessage(from, { video: fs.readFileSync(vPath), caption: `📺 الدرس (${student.current}) يا ${student.name}.\nشاهد بتركيز ثم أرسل *(تم)*.` });
                    student.status = 'WAITING_FOR_READY';
                    saveData(users);
                } else {
                    await sock.sendMessage(from, { text: `⏳ نعتذر يا ${student.name}، الدرس قيد التجهيز.` });
                }
                return;
            }

            if (text === 'تم' && student.status === 'WAITING_FOR_READY') {
                student.status = 'CLIP_PRACTICE';
                student.currentSentenceIndex = 1;
                await sendClipStep(sock, from, student);
                saveData(users);
                return;
            }

            if (student.status === 'CLIP_PRACTICE' && !msg.message.audioMessage) {
                const metaPath = path.join(lessonDir, 'metadata', `${student.currentSentenceIndex}.txt`);
                if (fs.existsSync(metaPath)) {
                    const target = fs.readFileSync(metaPath, 'utf-8').split('\n')[0].trim().toLowerCase().replace(/[.,!?;]/g, "");
                    if (text.toLowerCase().replace(/[.,!?;]/g, "") === target) {
                        student.stats.push({ index: student.currentSentenceIndex, time: (Date.now() - student.startTime) / 1000 });
                        student.currentSentenceIndex++;
                        await sendClipStep(sock, from, student);
                        saveData(users);
                    } else if (text !== 'تم') {
                        await sock.sendMessage(from, { text: "❌ نطق غير مطابق تماماً. حاول مجدداً." });
                    }
                }
                return;
            }

            if (student.status === 'AUDIO_TRANSLATION_PHASE' && msg.message.audioMessage) {
                student.currentSentenceIndex++;
                await sendTranslationStep(sock, from, student);
                saveData(users);
                return;
            }
        }

        // --- [ نظام الغرباء / LID ] ---
        if (!student && !isAdmin) {
            return sock.sendMessage(from, { text: `مرحباً بك! 🎓\nأنت غير مسجل. انسخ هذا المعرف وأرسله للأستاذ:\n\n\`${from}\`` });
        }
    });
}

// الدوال المساعدة
async function downloadMedia(m, type) {
    const stream = await downloadContentFromMessage(m, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

async function sendClipStep(sock, from, student) {
    const clipPath = path.join(baseDir, student.current.toString(), 'clips', `${student.currentSentenceIndex}.mp4`);
    if (fs.existsSync(clipPath)) {
        student.startTime = Date.now();
        await sock.sendMessage(from, { video: fs.readFileSync(clipPath), caption: `🎥 الجملة (${student.currentSentenceIndex}): انطقها بالكيبورد.` });
    } else {
        student.status = 'AUDIO_TRANSLATION_PHASE';
        student.currentSentenceIndex = 1;
        await sendTranslationStep(sock, from, student);
    }
}

async function sendTranslationStep(sock, from, student) {
    const metaPath = path.join(baseDir, student.current.toString(), 'metadata', `${student.currentSentenceIndex}.txt`);
    if (fs.existsSync(metaPath)) {
        const arabic = fs.readFileSync(metaPath, 'utf-8').split('\n')[1].trim();
        await sock.sendMessage(from, { text: `🎯 كيف تقول: "${arabic}"\n🎙️ سجل صوتك.` });
    } else {
        await sendFinalReport(sock, from, student);
    }
}

async function sendFinalReport(sock, from, student) {
    await sock.sendMessage(from, { text: `🎬 تم الإنجاز! سيراجع الأستاذ أداءك قريباً.` });
    // إخطار المدير
    const avg = student.stats.length > 0 ? (student.stats.reduce((a,b)=>a+b.time,0)/student.stats.length).toFixed(1) : 0;
    const alert = `🔔 أتمّ الطالب *${student.name}* الدرس ${student.current}.\nمتوسط السرعة: ${avg} ثانية.`;
    for (let admin of adminNumbers) { await sock.sendMessage(admin + "@s.whatsapp.net", { text: alert }); }
    
    student.status = 'IDLE';
    student.current++;
    saveData(loadData());
}

startBot();
