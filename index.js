#!/usr/bin/env node
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const Pino = require("pino");
const chalk = require("chalk");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// --- UTILS ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- ADMIN FUNCTIONS ---
async function promoteToAdmin(sock, groupJid, number) {
  const jid = number + "@s.whatsapp.net";
  try {
    await sock.groupParticipantsUpdate(groupJid, [jid], "promote");
    console.log(chalk.green(`✅ ${number} is now admin in group`));
  } catch (err) {
    console.log(chalk.red("❌ Failed to promote:", err.message));
  }
}

async function demoteAdmin(sock, groupJid, number) {
  const jid = number + "@s.whatsapp.net";
  try {
    await sock.groupParticipantsUpdate(groupJid, [jid], "demote");
    console.log(chalk.green(`✅ ${number} demoted from admin in group`));
  } catch (err) {
    console.log(chalk.red("❌ Failed to demote:", err.message));
  }
}

// --- BOT START ---
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  // Pairing code prompt
  if (!state.creds.registered) {
    rl.question("Enter your WhatsApp Number (e.g., 923xxxxxxx): ", async (num) => {
      const code = await sock.requestPairingCode(num);
      console.log(chalk.yellow("\nPAIRING CODE:"), chalk.green(code));
      console.log(chalk.cyan("Check your WhatsApp → Linked Devices → Link a device\n"));
      rl.close();
    });
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") console.log(chalk.green("✅ Bot Connected"));
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) startBot();
    }
  });

  // --- MESSAGE HANDLER ---
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    console.log(chalk.blue(`[MSG] ${from}: ${text}`));

    // Menu Commands
    if (text === "!menu") {
      await sock.sendMessage(from, {
        text:
`🤖 BOT MENU
!menu - Show this menu
!ping - Check bot alive
!admins - Show group admins
!promote <groupJid> <number> - Promote admin
!demote <groupJid> <number> - Demote admin`
      });
    }

    if (text === "!ping") {
      await sock.sendMessage(from, { text: "Pong ✅ Bot Alive" });
    }

    if (text === "!admins" && from.endsWith("@g.us")) {
      const meta = await sock.groupMetadata(from);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id.split("@")[0])
        .join("\n");
      await sock.sendMessage(from, { text: `👮 Group Admins:\n${admins}` });
    }

    // Promote / Demote commands
    if (text.startsWith("!promote")) {
      const parts = text.split(" ");
      if (parts.length === 3) await promoteToAdmin(sock, parts[1], parts[2]);
    }

    if (text.startsWith("!demote")) {
      const parts = text.split(" ");
      if (parts.length === 3) await demoteAdmin(sock, parts[1], parts[2]);
    }
  });
}

startBot();