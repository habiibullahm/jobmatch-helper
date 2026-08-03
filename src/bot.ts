import { Bot, type Context } from "grammy";
import { AdzunaError } from "./adzuna.js";
import type { AppConfig } from "./config.js";
import type { JobSearch } from "./jobSearch.js";
import { buildSearchTerms, extractKeywords, parseSearchInput } from "./keywords.js";
import {
  ASK_CV_MESSAGE,
  ASK_CV_PDF_ONLY_MESSAGE,
  ASK_PREFS_MESSAGE,
  ASK_SEARCH_MESSAGE,
  CANCEL_MESSAGE,
  DONE_MESSAGE,
  EMPTY_RESULTS_MESSAGE,
  HELP_MESSAGE,
  IDLE_HINT_MESSAGE,
  RETURNING_MATCH_MESSAGE,
  SAME_CV_MESSAGE,
  START_MESSAGE,
  afterResultKeyboard,
  alertsKeyboard,
  cancelKeyboard,
  formatAlertsStatus,
  formatProfileMessage,
  formatResultsMessage,
  mainKeyboard,
  prefsKeyboard,
  profileKeyboard,
  returningMatchKeyboard,
} from "./messages.js";
import { extractTextFromPdf } from "./pdf.js";
import { isEmptyResult, keywordsForSearch, rankJobs } from "./ranker.js";
import * as seenJobs from "./repos/seenJobs.js";
import * as users from "./repos/users.js";
import { clampUserText } from "./security.js";
import {
  SecurePdfError,
  assertAllowedCvFileSize,
  downloadTelegramFileCapped,
  wipeBuffer,
} from "./securePdf.js";
import {
  clearSession,
  getSession,
  hardClearSession,
  setLastFileUniqueId,
  setStep,
} from "./session.js";

const replyMain = {
  parse_mode: "HTML" as const,
  reply_markup: mainKeyboard,
  link_preview_options: { is_disabled: true },
};

const replyCancel = {
  parse_mode: "HTML" as const,
  reply_markup: cancelKeyboard,
  link_preview_options: { is_disabled: true },
};

function isPdfDocument(ctx: Context): boolean {
  const doc = ctx.message?.document;
  if (!doc) return false;
  const mime = doc.mime_type?.toLowerCase() ?? "";
  const name = doc.file_name?.toLowerCase() ?? "";
  return mime === "application/pdf" || name.endsWith(".pdf");
}

export function createBot(token: string, config: AppConfig, jobSearch: JobSearch): Bot {
  const bot = new Bot(token);
  void config;

  async function beginFreshMatch(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    // Update-CV / fresh match: clear stored prefs so Lewati truly skips them
    const existing = users.getUser(chatId);
    if (existing) {
      users.upsertProfile(chatId, existing.keywords, null);
    }
    setStep(chatId, "awaiting_prefs", null);
    await ctx.reply(ASK_PREFS_MESSAGE, {
      parse_mode: "HTML",
      reply_markup: prefsKeyboard,
    });
  }

  function withAdzunaNote(body: string, adzunaFailed: boolean): string {
    if (!adzunaFailed) return body;
    return `${body}\n\n<i>Catatan: Adzuna gagal sementara — hasil dari katalog Indonesia saja.</i>`;
  }

  async function beginMatch(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const profile = users.getUser(chatId);
    if (profile && profile.keywords.length > 0) {
      await ctx.reply(RETURNING_MATCH_MESSAGE, {
        parse_mode: "HTML",
        reply_markup: returningMatchKeyboard,
      });
      return;
    }
    await beginFreshMatch(ctx);
  }

  async function beginSearch(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    setStep(chatId, "awaiting_search", null);
    await ctx.reply(ASK_SEARCH_MESSAGE, replyCancel);
  }

  async function rematchWithProfile(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const profile = users.getUser(chatId);
    if (!profile || profile.keywords.length === 0) {
      await beginFreshMatch(ctx);
      return;
    }

    const status = await ctx.reply("Mencari lowongan dari profil tersimpan...");
    try {
      const terms = buildSearchTerms(profile.keywords);
      const { jobs, adzunaFailed } = await jobSearch.searchAll({
        whatOr: terms.join(" ") || "software developer",
        locationText: profile.prefsText ?? undefined,
        resultsPerPage: 20,
      });
      const ranked = rankJobs(jobs, profile.keywords, profile.prefsText);

      if (isEmptyResult(ranked)) {
        await ctx.api.editMessageText(chatId, status.message_id, EMPTY_RESULTS_MESSAGE, {
          parse_mode: "HTML",
          reply_markup: afterResultKeyboard,
          link_preview_options: { is_disabled: true },
        });
        return;
      }

      await ctx.api.editMessageText(
        chatId,
        status.message_id,
        withAdzunaNote(formatResultsMessage(ranked, "Hasil JobMatch"), adzunaFailed),
        {
          parse_mode: "HTML",
          reply_markup: afterResultKeyboard,
          link_preview_options: { is_disabled: true },
        },
      );
    } catch (error) {
      const msg =
        error instanceof AdzunaError
          ? error.message
          : "Gagal mencari lowongan. Coba lagi sebentar.";
      console.error("rematch failed", {
        chatId,
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      try {
        await ctx.api.editMessageText(chatId, status.message_id, msg, {
          reply_markup: mainKeyboard,
        });
      } catch {
        await ctx.reply(msg, replyMain);
      }
    }
  }

  async function showAlerts(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const profile = users.getUser(chatId);
    await ctx.reply(formatAlertsStatus(profile), {
      parse_mode: "HTML",
      reply_markup: alertsKeyboard(Boolean(profile?.alertsEnabled)),
      link_preview_options: { is_disabled: true },
    });
  }

  async function showProfile(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const profile = users.getUser(chatId);
    if (!profile) {
      await ctx.reply("Belum ada profil. Jalankan /match dan upload CV dulu.", replyMain);
      return;
    }
    await ctx.reply(formatProfileMessage(profile), {
      parse_mode: "HTML",
      reply_markup: profileKeyboard,
      link_preview_options: { is_disabled: true },
    });
  }

  async function cancelFlow(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    hardClearSession(chatId);
    await ctx.reply(CANCEL_MESSAGE, replyMain);
  }

  async function processCvDocument(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const document = ctx.message?.document;
    if (chatId === undefined || !document) return;

    const session = getSession(chatId);
    const fileUniqueId = document.file_unique_id;
    const fileId = document.file_id;

    if (session.lastFileUniqueId && session.lastFileUniqueId === fileUniqueId) {
      await ctx.reply(SAME_CV_MESSAGE, {
        parse_mode: "HTML",
        reply_markup: afterResultKeyboard,
      });
      return;
    }

    const status = await ctx.reply("Memproses CV & mencari lowongan...");
    let cvBuffer: Buffer | undefined;

    try {
      assertAllowedCvFileSize(document.file_size);
      const file = await ctx.getFile();
      if (!file.file_path) {
        throw new SecurePdfError("Tidak bisa mengakses file CV.");
      }

      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      cvBuffer = await downloadTelegramFileCapped(fileUrl);
      const cvText = await extractTextFromPdf(cvBuffer);
      wipeBuffer(cvBuffer);
      cvBuffer = undefined;

      if (!cvText) {
        await ctx.api.editMessageText(
          chatId,
          status.message_id,
          "Tidak ada teks yang bisa dibaca dari PDF ini (mungkin hasil scan).\nOCR belum didukung — coba PDF berbasis teks.",
          { reply_markup: cancelKeyboard },
        );
        return;
      }

      const keywords = extractKeywords(cvText);
      const prefsText = session.prefsText ?? null;
      users.upsertProfile(chatId, keywords, prefsText);

      const terms = buildSearchTerms(keywords);
      const { jobs, adzunaFailed } = await jobSearch.searchAll({
        whatOr: terms.join(" ") || "software developer",
        locationText: prefsText ?? undefined,
        resultsPerPage: 20,
      });
      const ranked = rankJobs(jobs, keywords, prefsText);

      clearSession(chatId);
      setLastFileUniqueId(chatId, fileUniqueId);

      for (const row of ranked) {
        seenJobs.markSeen(chatId, row.job.id, row.score.score, "instant");
      }

      if (isEmptyResult(ranked)) {
        await ctx.api.editMessageText(chatId, status.message_id, EMPTY_RESULTS_MESSAGE, {
          parse_mode: "HTML",
          reply_markup: afterResultKeyboard,
          link_preview_options: { is_disabled: true },
        });
        return;
      }

      await ctx.api.editMessageText(
        chatId,
        status.message_id,
        withAdzunaNote(formatResultsMessage(ranked, "Hasil JobMatch"), adzunaFailed),
        {
          parse_mode: "HTML",
          reply_markup: afterResultKeyboard,
          link_preview_options: { is_disabled: true },
        },
      );
    } catch (error) {
      if (cvBuffer) {
        wipeBuffer(cvBuffer);
        cvBuffer = undefined;
      }

      const userMessage =
        error instanceof SecurePdfError || error instanceof AdzunaError
          ? error.message
          : "Gagal memproses. Coba file lain, atau /cancel lalu /match ulang.";

      console.error("Failed to process CV/match", {
        chatId,
        fileId,
        fileUniqueId,
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      try {
        await ctx.api.editMessageText(chatId, status.message_id, userMessage, {
          reply_markup: mainKeyboard,
        });
      } catch {
        await ctx.reply(userMessage, replyMain);
      }
    }
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(START_MESSAGE, replyMain);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_MESSAGE, replyMain);
  });

  bot.command("match", async (ctx) => {
    await beginMatch(ctx);
  });

  bot.command("search", async (ctx) => {
    await beginSearch(ctx);
  });

  bot.command("alerts", async (ctx) => {
    await showAlerts(ctx);
  });

  bot.command("profile", async (ctx) => {
    await showProfile(ctx);
  });

  bot.command("cancel", async (ctx) => {
    await cancelFlow(ctx);
  });

  bot.command("done", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) hardClearSession(chatId);
    await ctx.reply(DONE_MESSAGE, replyMain);
  });

  bot.callbackQuery("match", async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginMatch(ctx);
  });

  bot.callbackQuery("update_cv", async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginFreshMatch(ctx);
  });

  bot.callbackQuery("search", async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginSearch(ctx);
  });

  bot.callbackQuery("rematch", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) setStep(chatId, "idle");
    await rematchWithProfile(ctx);
  });

  bot.callbackQuery("skip_prefs", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    setStep(chatId, "awaiting_cv", null);
    await ctx.reply(ASK_CV_MESSAGE, replyCancel);
  });

  bot.callbackQuery("cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await cancelFlow(ctx);
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(HELP_MESSAGE, replyMain);
  });

  bot.callbackQuery("done", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) hardClearSession(chatId);
    await ctx.reply(DONE_MESSAGE, replyMain);
  });

  bot.callbackQuery("alerts", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAlerts(ctx);
  });

  bot.callbackQuery("alerts_on", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const profile = users.getUser(chatId);
    if (!profile || profile.keywords.length === 0) {
      await ctx.reply(formatAlertsStatus(undefined), replyMain);
      return;
    }
    users.setAlertsEnabled(chatId, true);
    await ctx.reply(formatAlertsStatus(users.getUser(chatId)), {
      parse_mode: "HTML",
      reply_markup: alertsKeyboard(true),
      link_preview_options: { is_disabled: true },
    });
  });

  bot.callbackQuery("alerts_off", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    users.setAlertsEnabled(chatId, false);
    await ctx.reply(formatAlertsStatus(users.getUser(chatId)), {
      parse_mode: "HTML",
      reply_markup: alertsKeyboard(false),
      link_preview_options: { is_disabled: true },
    });
  });

  bot.callbackQuery("profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProfile(ctx);
  });

  bot.callbackQuery("clear_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    users.clearProfile(chatId);
    hardClearSession(chatId);
    await ctx.reply("Profil dihapus. Jalankan /match untuk mulai lagi.", replyMain);
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    if (session.step === "awaiting_prefs") {
      setStep(chatId, "awaiting_cv", clampUserText(text));
      await ctx.reply(ASK_CV_MESSAGE, replyCancel);
      return;
    }

    if (session.step === "awaiting_cv") {
      const profile = users.getUser(chatId);
      if (profile && profile.keywords.length > 0) {
        await ctx.reply(
          "Kirim PDF untuk update CV, atau /cancel lalu ketuk <b>Pakai profil</b>.",
          { parse_mode: "HTML", reply_markup: cancelKeyboard },
        );
      } else {
        await ctx.reply(ASK_CV_PDF_ONLY_MESSAGE, replyCancel);
      }
      return;
    }

    if (session.step === "awaiting_search") {
      const { what, where } = parseSearchInput(clampUserText(text, 200));
      if (!what) {
        await ctx.reply(ASK_SEARCH_MESSAGE, replyCancel);
        return;
      }

      const status = await ctx.reply("Mencari lowongan...");
      try {
        const { jobs, adzunaFailed } = await jobSearch.searchAll({
          what,
          locationText: where,
          resultsPerPage: 20,
        });
        const keywords = keywordsForSearch(what);
        const ranked = rankJobs(jobs, keywords, where);
        clearSession(chatId);

        if (isEmptyResult(ranked)) {
          await ctx.api.editMessageText(chatId, status.message_id, EMPTY_RESULTS_MESSAGE, {
            parse_mode: "HTML",
            reply_markup: afterResultKeyboard,
            link_preview_options: { is_disabled: true },
          });
          return;
        }

        const profile = users.getUser(chatId);
        let body = withAdzunaNote(formatResultsMessage(ranked, "Hasil Search"), adzunaFailed);
        if (profile && profile.keywords.length > 0 && !profile.alertsEnabled) {
          body += "\n\nTip: aktifkan /alerts supaya kami kabari lowongan baru terkait profilmu.";
        }

        await ctx.api.editMessageText(chatId, status.message_id, body, {
          parse_mode: "HTML",
          reply_markup: afterResultKeyboard,
          link_preview_options: { is_disabled: true },
        });
      } catch (error) {
        clearSession(chatId);
        const msg =
          error instanceof AdzunaError
            ? error.message
            : "Gagal mencari lowongan. Coba lagi sebentar.";
        console.error("search failed", {
          chatId,
          errorName: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        try {
          await ctx.api.editMessageText(chatId, status.message_id, msg, {
            reply_markup: mainKeyboard,
          });
        } catch {
          await ctx.reply(msg, replyMain);
        }
      }
      return;
    }

    await ctx.reply(IDLE_HINT_MESSAGE, replyMain);
  });

  bot.on(
    [
      "message:photo",
      "message:sticker",
      "message:voice",
      "message:video",
      "message:animation",
      "message:video_note",
      "message:audio",
    ],
    async (ctx) => {
      const chatId = ctx.chat.id;
      const session = getSession(chatId);

      if (session.step === "awaiting_prefs" || session.step === "awaiting_cv") {
        await ctx.reply(ASK_CV_PDF_ONLY_MESSAGE, {
          parse_mode: "HTML",
          reply_markup:
            session.step === "awaiting_prefs" ? prefsKeyboard : cancelKeyboard,
        });
        return;
      }

      if (session.step === "awaiting_search") {
        await ctx.reply(ASK_SEARCH_MESSAGE, replyCancel);
        return;
      }

      await ctx.reply(IDLE_HINT_MESSAGE, replyMain);
    },
  );

  bot.on("message:document", async (ctx) => {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);

    if (!isPdfDocument(ctx)) {
      if (session.step === "awaiting_prefs" || session.step === "awaiting_cv") {
        await ctx.reply(ASK_CV_PDF_ONLY_MESSAGE, {
          parse_mode: "HTML",
          reply_markup:
            session.step === "awaiting_prefs" ? prefsKeyboard : cancelKeyboard,
        });
        return;
      }
      await ctx.reply(IDLE_HINT_MESSAGE, replyMain);
      return;
    }

    // Flexible: PDF on first step (awaiting_prefs), awaiting_cv, or idle shortcut
    if (
      session.step === "awaiting_prefs" ||
      session.step === "awaiting_cv" ||
      session.step === "idle"
    ) {
      if (session.step === "idle") {
        setStep(chatId, "awaiting_cv");
      }
      await processCvDocument(ctx);
      return;
    }

    if (session.step === "awaiting_search") {
      await ctx.reply(ASK_SEARCH_MESSAGE, replyCancel);
      return;
    }

    await ctx.reply(IDLE_HINT_MESSAGE, replyMain);
  });

  bot.catch((err) => {
    console.error("Bot error", err);
  });

  return bot;
}
