import { InlineKeyboard } from "grammy";
import { bandLabel } from "./ranker.js";
import { assertSafeHttpsUrl } from "./security.js";
import type { RankedJob, UserProfile } from "./types.js";

export const BOT_USERNAME = "jobmatch_tools_bot";
export const BOT_LINK = `https://t.me/${BOT_USERNAME}`;
export const SCREENER_USERNAME = "cv_screener_bot";
export const SCREENER_LINK = `https://t.me/${SCREENER_USERNAME}`;

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const BRANDING_FOOTER = [
  "",
  "—",
  `<b>JobMatch Helper</b> · <a href="${BOT_LINK}">@${BOT_USERNAME}</a>`,
].join("\n");

export const mainKeyboard = new InlineKeyboard()
  .text("Cari job match", "match")
  .text("Search", "search")
  .row()
  .text("Alerts", "alerts")
  .text("Bantuan", "help");

export const prefsKeyboard = new InlineKeyboard()
  .text("Lewati", "skip_prefs")
  .text("Batal", "cancel");

export const cancelKeyboard = new InlineKeyboard().text("Batal", "cancel");

export const afterResultKeyboard = new InlineKeyboard()
  .text("Match lagi", "rematch")
  .text("Update CV", "update_cv")
  .row()
  .text("Search", "search")
  .text("Alerts", "alerts")
  .row()
  .text("Selesai", "done");

export const returningMatchKeyboard = new InlineKeyboard()
  .text("Pakai profil", "rematch")
  .text("Update CV", "update_cv")
  .row()
  .text("Batal", "cancel");

export const alertsKeyboard = (enabled: boolean) => {
  const kb = new InlineKeyboard();
  if (enabled) {
    kb.text("Nonaktifkan", "alerts_off");
  } else {
    kb.text("Aktifkan", "alerts_on");
  }
  return kb.row().text("Profil", "profile").text("Selesai", "done");
};

export const profileKeyboard = new InlineKeyboard()
  .text("Update CV", "update_cv")
  .text("Hapus profil", "clear_profile")
  .row()
  .text("Alerts", "alerts")
  .text("Selesai", "done");

export const START_MESSAGE = [
  "Halo! Selamat datang di <b>JobMatch Helper</b>.",
  "Upload CV-mu, kami carikan lowongan yang paling cocok.",
  "",
  "Sumber: katalog Indonesia + Adzuna (Singapore/global) — bukan seluruh internet.",
  "",
  "<b>Cara pakai</b>",
  "1. Ketuk <b>Cari job match</b> atau /match",
  "2. (Opsional) tulis preferensi: lokasi / remote / role",
  "3. Upload CV PDF — boleh langsung di step pertama",
  "",
  "Hasil: Top 5 job + skor kecocokan.",
  "Bisa juga /search manual, atau /alerts untuk notifikasi lowongan baru.",
  "",
  "<i>Privacy: CV diproses di memori. Kami hanya simpan keyword skill untuk match &amp; alert.</i>",
  BRANDING_FOOTER,
].join("\n");

export const HELP_MESSAGE = [
  "<b>Bantuan JobMatch Helper</b>",
  "",
  "/match — cari job dari CV",
  "/search — cari by judul / keyword",
  "/alerts — notifikasi lowongan baru",
  "/profile — lihat profil tersimpan",
  "/done — selesai memakai bot",
  "/cancel — batalkan session",
  "/help — bantuan singkat",
  "",
  `Mau cek 1 JD lebih dalam? Pakai <a href="${SCREENER_LINK}">@${SCREENER_USERNAME}</a>`,
  BRANDING_FOOTER,
].join("\n");

export const ASK_PREFS_MESSAGE = [
  "<b>Cari job match</b>",
  "",
  "Opsional: kirim preferensi singkat (lokasi / remote / role).",
  "Atau langsung upload CV PDF sekarang — preferensi boleh dilewati.",
  "",
  "Contoh: Remote · Jakarta, frontend · fullstack",
].join("\n");

export const ASK_CV_MESSAGE = [
  "<b>CV-mu</b>",
  "",
  "Kirim CV sebagai file <b>PDF</b>.",
  "",
  "<i>Privacy: CV diproses di memori, tidak disimpan.</i>",
].join("\n");

export const ASK_CV_PDF_ONLY_MESSAGE = [
  "<b>CV-mu</b>",
  "Kirim CV sebagai file <b>PDF</b> (bukan teks, foto, sticker, atau voice).",
].join("\n");

export const ASK_SEARCH_MESSAGE = [
  "<b>Search lowongan</b>",
  "",
  "Kirim judul atau keyword. Lokasi opsional:",
  "• <code>frontend engineer</code>",
  "• <code>react, jakarta</code>",
  "• <code>backend where:bandung</code>",
].join("\n");

export const IDLE_HINT_MESSAGE = [
  "Halo jobseeker!",
  "Bot ini bantu cari lowongan yang cocok dengan CV kamu!",
  "",
  "Pesan tadi di luar alur — no worries.",
  "Yuk mulai: /match · /search · /help",
  BRANDING_FOOTER,
].join("\n");

export const CANCEL_MESSAGE = [
  "Session dibatalkan.",
  "Kalau mau coba lagi, ketuk <b>Cari job match</b> atau /match.",
  BRANDING_FOOTER,
].join("\n");

export const DONE_MESSAGE = [
  "<b>Done using JobMatch Helper</b>",
  "Terima kasih sudah memakai JobMatch Helper!",
  "Semoga segera dapat peluang yang pas.",
  BRANDING_FOOTER,
].join("\n");

export const EMPTY_RESULTS_MESSAGE = [
  "Belum ketemu job yang cukup related.",
  "",
  "Coba:",
  "• Update CV agar skill lebih eksplisit (/match)",
  "• Ubah keyword (/search)",
  `• Atau cek 1 JD lebih dalam di @${SCREENER_USERNAME}`,
  BRANDING_FOOTER,
].join("\n");

export const RETURNING_MATCH_MESSAGE = [
  "<b>Welcome back</b>",
  "",
  "Pakai skill tersimpan untuk cari job, atau upload CV baru.",
].join("\n");

export const SAME_CV_MESSAGE = [
  "CV ini sudah pernah diproses.",
  "",
  "Ketuk <b>Match lagi</b>, atau kirim PDF lain untuk update profil.",
].join("\n");

export function formatResultsMessage(ranked: RankedJob[], headline = "Hasil JobMatch"): string {
  const lines: string[] = [
    `<b>${escapeHtml(headline)}</b>`,
    "",
    "Dari katalog Indonesia + Adzuna, ini yang paling related:",
    "",
  ];

  ranked.forEach((row, index) => {
    const { job, score, band } = row;
    const source =
      job.source === "indo" ? "ID" : job.source === "adzuna" ? "SG" : "?";
    const title = escapeHtml(job.title);
    const company = escapeHtml(job.company);
    const location = escapeHtml(job.location);
    const matched = score.matched.length
      ? escapeHtml(score.matched.slice(0, 6).join(", "))
      : "—";
    const gap = score.missing.length
      ? escapeHtml(score.missing.slice(0, 6).join(", "))
      : "—";
    const safeUrl = assertSafeHttpsUrl(job.url);
    const link = safeUrl
      ? ` <a href="${escapeHtml(safeUrl)}">buka</a>`
      : "";

    lines.push(
      `<b>${index + 1}. ${title}</b> — ${company} (${score.score}%) <i>(${source})</i>`,
      `   ${bandLabel(band)}`,
      `   Lokasi: ${location}${link}`,
      `   Match: ${matched}`,
      `   Gap: ${gap}`,
      "",
    );
  });

  lines.push(
    `Tip: mau cek 1 JD lebih dalam? Pakai <a href="${SCREENER_LINK}">@${SCREENER_USERNAME}</a>`,
    BRANDING_FOOTER,
  );

  return lines.join("\n");
}

export function formatProfileMessage(profile: UserProfile): string {
  const keywords = profile.keywords.slice(0, 25).map(escapeHtml).join(", ") || "—";
  const prefs = profile.prefsText ? escapeHtml(profile.prefsText) : "—";
  const alerts = profile.alertsEnabled ? "Aktif" : "Nonaktif";

  return [
    "<b>Profil JobMatch</b>",
    "",
    `<b>Skills</b>: ${keywords}`,
    `<b>Preferensi</b>: ${prefs}`,
    `<b>Alerts</b>: ${alerts}`,
    "",
    "PDF tidak disimpan — hanya keyword skill di atas.",
    BRANDING_FOOTER,
  ].join("\n");
}

export function formatAlertsStatus(profile: UserProfile | undefined): string {
  if (!profile || profile.keywords.length === 0) {
    return [
      "<b>Alerts</b>",
      "",
      "Belum ada profil. Jalankan /match dan upload CV dulu.",
      BRANDING_FOOTER,
    ].join("\n");
  }

  const status = profile.alertsEnabled ? "Aktif" : "Nonaktif";
  return [
    "<b>Alerts</b>",
    "",
    `Status: <b>${status}</b>`,
    "• Instant: match kuat (≥70%)",
    "• Digest harian: 09:00 WIB untuk match solid",
    "",
    "Kami pantau lowongan Adzuna + katalog Indonesia vs skill tersimpanmu.",
    BRANDING_FOOTER,
  ].join("\n");
}

export function formatInstantAlert(row: RankedJob): string {
  const { job, score, band } = row;
  const safeUrl = assertSafeHttpsUrl(job.url);
  const source = job.source === "indo" ? "ID" : "SG";
  return [
    "🔔 <b>Strong match baru</b>",
    "",
    `<b>${escapeHtml(job.title)}</b> — ${escapeHtml(job.company)} (${score.score}%) <i>(${source})</i>`,
    bandLabel(band),
    `Lokasi: ${escapeHtml(job.location)}`,
    safeUrl ? `<a href="${escapeHtml(safeUrl)}">Buka lowongan</a>` : "",
    BRANDING_FOOTER,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDigestMessage(rows: RankedJob[]): string {
  const lines = [
    "☀️ <b>Daily job digest</b>",
    "",
    "Lowongan terkait background-mu:",
    "",
  ];

  rows.forEach((row, i) => {
    const { job, score } = row;
    const safeUrl = assertSafeHttpsUrl(job.url);
    const source = job.source === "indo" ? "ID" : "SG";
    const link = safeUrl ? ` — <a href="${escapeHtml(safeUrl)}">buka</a>` : "";
    lines.push(
      `${i + 1}. <b>${escapeHtml(job.title)}</b> — ${escapeHtml(job.company)} (${score.score}%) <i>(${source})</i>${link}`,
    );
  });

  lines.push(BRANDING_FOOTER);
  return lines.join("\n");
}
