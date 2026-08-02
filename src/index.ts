import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createAdzunaClient } from "./adzuna.js";
import { startDigestScheduler } from "./alerts/digest.js";
import { startAlertPoller } from "./alerts/poller.js";
import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createIndoCatalog } from "./indoCatalog.js";
import { createJobSearch } from "./jobSearch.js";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
}

const config = loadConfig();

if (!config.botToken) {
  console.error("Missing BOT_TOKEN. Copy .env.example to .env and set your token.");
  process.exit(1);
}

if (!config.adzunaAppId || !config.adzunaAppKey) {
  console.warn(
    "Warning: ADZUNA_APP_ID / ADZUNA_APP_KEY not set. Adzuna search will fail until configured.",
  );
}

openDb(config.dataDir);
const adzuna = createAdzunaClient(config);
const indo = createIndoCatalog({
  dataDir: config.dataDir,
  indoJobsPath: config.indoJobsPath,
});
const jobSearch = createJobSearch({ adzuna, indo, config });
const bot = createBot(config.botToken, config, jobSearch);

await bot.api.setMyCommands([
  { command: "start", description: "Mulai & cara pakai" },
  { command: "match", description: "Cari job dari CV" },
  { command: "search", description: "Cari by judul/keyword" },
  { command: "alerts", description: "Notifikasi lowongan baru" },
  { command: "profile", description: "Lihat profil tersimpan" },
  { command: "cancel", description: "Batalkan session" },
  { command: "done", description: "Selesai + thank you" },
  { command: "help", description: "Bantuan singkat" },
]);

startAlertPoller(bot.api, jobSearch, config);
startDigestScheduler(bot.api, jobSearch, config);

bot.start({
  onStart: (info) => {
    console.log(`JobMatch Helper bot @${info.username} is running (polling).`);
  },
});
