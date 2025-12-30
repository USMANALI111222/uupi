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

// ---------------- UTILS ----------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- ADMIN FUNCTIONS ----------------
async function promoteAdmin(sock, groupJid, number) {
  try {
    await sock.groupParticipantsUpdate(
      groupJid,
      [number + "@s.whatsapp.net"],
      "promote"
    );
    console.log(chalk.green("✅ Admin promoted:", number));
  } catch (e) {
    console.log(chalk.red("❌ Promote failed:", e.message));
  }
}

async function demoteAdmin(sock, groupJid, number) {
  try {
    await sock.groupParticipantsUpdate(
      groupJid,
      [number + "@s.whatsapp.net"],
      "demote"
    );
    console.log(chalk.yellow("⚠️ Admin demoted:", number));
  } catch (e) {
    console.log(chalk.red("❌ Demote failed:", e.message));
  }
}

// ---------------- BOT START ----------------
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

  // ---------- PAIRING ----------
  if (!state.creds.registered) {
    rl.question(
      chalk.cyan("Enter your WhatsApp Number (e.g., 923xxxxxxxxx): "),
      async (num) => {
        const code = await sock.requestPairingCode(num.trim());
        console.log(chalk.yellow("\nPAIRING CODE:"), chalk.green(code));
        console.log(
          chalk.blue(
            "WhatsApp → Linked Devices → Link a Device → Enter Code\n"
          )
        );
        rl.close();
      }
    );
  }

  // ---------- CONNECTION ----------
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log(chalk.green("\n✅ BOT CONNECTED SUCCESSFULLY\n"));
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log(chalk.yellow("Reconnecting..."));
        startBot();
      }
    }
  });

  // ---------- MESSAGE HANDLER ----------
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log(chalk.gray(`[MSG] ${from} : ${text}`));

    // -------- MENU --------
    if (text === "!menu") {
      await sock.sendMessage(from, {
        text:
`🤖 *TERMUX BOT MENU*

!menu
!ping
!admins
!promote <groupJid> <number>
!demote <groupJid> <number>

⚠️ Admin commands work only if YOU are admin`
      });
    }

    if (text === "!ping") {
      await sock.sendMessage(from, { text: "🏓 Pong! Bot Alive" });
    }

    // -------- ADMINS LIST --------
    if (text === "!admins" && from.endsWith("@g.us")) {
      const meta = await sock.groupMetadata(from);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => "• " + p.id.split("@")[0])
        .join("\n");

      await sock.sendMessage(from, {
        text: `👮 *Group Admins*\n\n${admins}`
      });
    }

    // -------- PROMOTE --------
    if (text.startsWith("!promote")) {
      const [, groupJid, number] = text.split(" ");
      if (groupJid && number) {
        await promoteAdmin(sock, groupJid, number);
      }
    }

    // -------- DEMOTE --------
    if (text.startsWith("!demote")) {
      const [, groupJid, number] = text.split(" ");
      if (groupJid && number) {
        await demoteAdmin(sock, groupJid, number);
      }
    }
  });
}

startBot();