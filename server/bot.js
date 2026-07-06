const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID);
const PAYMENT_CARD = process.env.PAYMENT_CARD || '8600 XXXX XXXX XXXX'; // Railway Variables ga qo'shing

const PLANS = {
  daily:   { label: "☀️ Kunlik — 5,000 so'm",   days: 1,  amount: 5000  },
  weekly:  { label: "📅 Haftalik — 25,000 so'm", days: 7,  amount: 25000 },
  monthly: { label: "🏆 Oylik — 70,000 so'm",    days: 30, amount: 70000 },
};

function randomStr(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

let botInstance = null;

function initBot() {
  if (!TOKEN) {
    console.log('[Bot] BOT_TOKEN not set — bot disabled');
    return null;
  }

  const bot = new TelegramBot(TOKEN, { polling: true });
  botInstance = bot;

  // ==================== /start ====================
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Do\'st';

    bot.sendMessage(chatId,
      `🎮 *ShiftHub CS2 — Sotib olish boti*\n\n` +
      `Salom, *${name}*! 👋\n\n` +
      `Counter-Strike 2 uchun PRO cheat dasturi.\n` +
      `ESP • Aimbot • BHop • Triggerbot • va boshqalar\n\n` +
      `📦 *Obuna narxlari:*\n` +
      `☀️ Kunlik — *5,000 so'm* (1 kun)\n` +
      `📅 Haftalik — *25,000 so'm* (7 kun)\n` +
      `🏆 Oylik — *70,000 so'm* (30 kun)\n\n` +
      `👇 Birini tanlang:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "☀️ Kunlik — 5,000 so'm", callback_data: 'buy_daily' }],
            [{ text: "📅 Haftalik — 25,000 so'm", callback_data: 'buy_weekly' }],
            [{ text: "🏆 Oylik — 70,000 so'm", callback_data: 'buy_monthly' }],
            [{ text: '👤 Akkauntim', callback_data: 'myaccount' },
             { text: '❓ Yordam', callback_data: 'help' }],
          ]
        }
      }
    );
  });

  // ==================== Callback Query ====================
  bot.on('callback_query', async (query) => {
    try {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const username = query.from.username || '—';
      const data = query.data;

      bot.answerCallbackQuery(query.id).catch(() => {});

      if (data.startsWith('buy_')) {
        const planKey = data.replace('buy_', '');
        const plan = PLANS[planKey];
        if (!plan) return;

        // Pending orderni saqlash
        try {
          await db.query(
            `INSERT INTO pending_orders (id, telegram_user_id, telegram_username, days, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [uuidv4(), userId, username, plan.days, plan.amount]
          );
        } catch(e) {
          console.error('[Bot] Order save error:', e.message);
        }

        bot.sendMessage(chatId,
          `✅ *${plan.label}* tanlandi!\n\n` +
          `💰 *To'lov miqdori:* ${plan.amount.toLocaleString()} so'm\n` +
          `📅 *Obuna muddati:* ${plan.days} kun\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `💳 *Karta raqami:*\n\`${PAYMENT_CARD}\`\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `📸 To'lovdan so'ng *chek (screenshot)*ni shu chatga yuboring.\n` +
          `Admin tekshirib, akkaunt yuboradi (odatda 5-10 daqiqa).\n\n` +
          `Yoki bot orqali savol yozishingiz mumkin.`,
          { parse_mode: 'Markdown' }
        );

        if (!isNaN(ADMIN_ID)) {
          bot.sendMessage(ADMIN_ID,
            `🔔 *Yangi buyurtma!*\n\n` +
            `👤 Foydalanuvchi: @${username} (ID: \`${userId}\`)\n` +
            `📦 *Obuna:* ${plan.label}\n` +
            `📅 *Muddat:* ${plan.days} kun\n\n` +
            `✅ *Tasdiqlash uchun (pul tushgach):*\n` +
            `/confirm ${userId} ${plan.days}`,
            { parse_mode: 'Markdown' }
          );
        }
      }

      if (data === 'myaccount') {
        bot.sendMessage(chatId,
          `👤 *Akkaunt ma'lumotlari*\n\n` +
          `🌐 Akkauntingizni tekshirish uchun:\n` +
          `[www.shifthub.uz](https://www.shifthub.uz) → *LOGIN* tugmasi`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      }

      if (data === 'help') {
        bot.sendMessage(chatId,
          `📞 *Admin bilan bog'lanish*\n\n` +
          `Pastdagi maydonga o'z savolingizni yoki muammongizni yozing. Xabaringiz to'g'ridan-to'g'ri adminga yuboriladi va u shu bot orqali sizga javob qaytaradi! 👇`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (e) {
      console.error('[Bot] callback_query error:', e);
    }
  });

  // ==================== Messages (Live Support / Forwarding) ====================
  bot.on('message', (msg) => {
    try {
      if (msg.text && msg.text.startsWith('/')) return; // Komandalarni o'tkazib yuborish
      if (msg.chat.type !== 'private') return; // Faqat shaxsiy yozishmalar

      const userId = msg.from.id;

      // Agar xabar admindan kelsa va u reply qilgan bo'lsa, foydalanuvchiga javob yuboramiz
      if (userId === ADMIN_ID) {
        if (msg.reply_to_message && msg.reply_to_message.forward_from) {
          const targetId = msg.reply_to_message.forward_from.id;
          bot.copyMessage(targetId, msg.chat.id, msg.message_id).catch(() => {
             bot.sendMessage(ADMIN_ID, "❌ Mijozga xabar yuborib bo'lmadi (balki botni bloklagan).");
          });
          return;
        } else if (msg.reply_to_message && msg.reply_to_message.text) {
          // Fallback, agar forward yashiringan bo'lsa (ID regex orqali qidiramiz)
          const textMatches = msg.reply_to_message.text.match(/ID:\s(\d+)/);
          if (textMatches && textMatches[1]) {
             const targetId = parseInt(textMatches[1]);
             bot.copyMessage(targetId, msg.chat.id, msg.message_id).catch(() => {});
             return;
          }
        }
        // Agar reply bo'lmasa, e'tiborsiz qoldiradi (adminning o'zi yozgan boshqa xabarlar)
      } else {
        // Oddiy mijoz yozsa, adminga yuboramiz
        if (!isNaN(ADMIN_ID)) {
          // Xabarni adminga forward qilamiz (shunda admin reply qila oladi)
          bot.forwardMessage(ADMIN_ID, msg.chat.id, msg.message_id).catch((e) => {
            // Ba'zi hollarda privacy sozlamalari tufayli forward ishlamaydi, shu sababli matnni uzatamiz
            bot.sendMessage(ADMIN_ID, `📩 *Mijozdan xabar*\nID: ${msg.from.id}\nUsername: @${msg.from.username || '—'}\n\n${msg.text || '[Fayl/Rasm]'}`, { parse_mode: 'Markdown' });
            bot.copyMessage(ADMIN_ID, msg.chat.id, msg.message_id);
          });
        }
      }
    } catch(e) {
      console.error('[Bot] message error:', e);
    }
  });

  // ==================== Admin: /confirm <userId> <days> ====================
  bot.onText(/\/confirm (\d+) (\d+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, '❌ Faqat admin uchun!');
    }
    const targetId = parseInt(match[1]);
    const days = parseInt(match[2]);
    await createAccount(bot, targetId, days, msg.chat.id);
  });

  // ==================== Admin: /adddays <username> <days> ====================
  bot.onText(/\/adddays (\S+) (\d+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const uname = match[1].toLowerCase();
    const days = parseInt(match[2]);

    try {
      const result = await db.query(
        `UPDATE users SET
           expires_at = GREATEST(expires_at, NOW()) + (INTERVAL '1 day' * $1),
           tier = 'pro'
         WHERE username = $2
         RETURNING username, expires_at`,
        [days, uname]
      );

      if (result.rows.length === 0) {
        return bot.sendMessage(msg.chat.id, `❌ \`${uname}\` topilmadi!`, { parse_mode: 'Markdown' });
      }

      const exp = new Date(result.rows[0].expires_at).toLocaleDateString('uz-UZ');
      bot.sendMessage(msg.chat.id, `✅ \`${uname}\` ga *${days}* kun qo'shildi!\nTugash: *${exp}*`, { parse_mode: 'Markdown' });
    } catch(e) {
      bot.sendMessage(msg.chat.id, `❌ Xato: ${e.message}`);
    }
  });

  // ==================== Admin: /block <username> ====================
  bot.onText(/\/block (\S+)/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const uname = match[1].toLowerCase();
    try {
      await db.query(`UPDATE users SET is_blocked = true WHERE username = $1`, [uname]);
      bot.sendMessage(msg.chat.id, `🚫 \`${uname}\` bloklandi!`, { parse_mode: 'Markdown' });
    } catch(e) {
      bot.sendMessage(msg.chat.id, `❌ Xato: ${e.message}`);
    }
  });

  // ==================== Admin: /users ====================
  bot.onText(/\/users/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    try {
      const result = await db.query(
        `SELECT username, tier, expires_at, is_blocked FROM users ORDER BY created_at DESC LIMIT 15`
      );
      let text = `👥 *So'nggi 15 foydalanuvchi:*\n\n`;
      result.rows.forEach(u => {
        const exp = new Date(u.expires_at);
        const expired = exp < new Date();
        const status = u.is_blocked ? '🚫' : expired ? '❌' : '✅';
        text += `${status} \`${u.username}\` — ${u.tier.toUpperCase()} | ${exp.toLocaleDateString()}\n`;
      });
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch(e) {
      bot.sendMessage(msg.chat.id, `❌ Xato: ${e.message}`);
    }
  });

  // ==================== Admin: /help ====================
  bot.onText(/\/help/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id,
      `🛠 *Admin buyruqlari:*\n\n` +
      `/confirm <telegram_id> <kunlar> — Akkaunt yaratish\n` +
      `/adddays <username> <kunlar> — Kunlar qo'shish\n` +
      `/block <username> — Bloklash\n` +
      `/users — So'nggi foydalanuvchilar\n` +
      `/help — Bu xabar`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('polling_error', (err) => {
    console.error('[Bot] Polling error:', err.message);
  });

  console.log('[Bot] ✅ ShiftHub Telegram bot ishga tushdi!');
  return bot;
}

// Akkaunt yaratish funksiyasi (paylov webhook ham ishlatadi)
async function createAccount(bot, telegramUserId, days, adminChatId) {
  const b = bot || botInstance;
  try {
    const username = 'sh_' + randomStr(7);
    const password = randomStr(10);
    const passwordHash = await bcrypt.hash(password, 10);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await db.query(
      `INSERT INTO users
       (username, password_hash, raw_password, tier, expires_at, total_minutes, download_count, is_blocked)
       VALUES ($1, $2, $3, 'pro', $4, 0, 0, false)`,
      [username, passwordHash, password, expiresAt.toISOString()]
    );

    const expStr = expiresAt.toLocaleDateString('uz-UZ');

    await b.sendMessage(telegramUserId,
      `🎉 *To'lov tasdiqlandi! Akkauntingiz tayyor!*\n\n` +
      `🎮 *ShiftHub CS2 Cheat — PRO*\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔑 *Login:* \`${username}\`\n` +
      `🔐 *Parol:* \`${password}\`\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📅 Tugash sanasi: *${expStr}* (${days} kun)\n\n` +
      `📥 *Yuklab olish:*\n` +
      `1. [www.shifthub.uz](https://www.shifthub.uz) → *YUKLAB OLISH* tugmasi\n` +
      `2. Yoki to'g'ridan dasturga login qiling\n\n` +
      `⚠️ Login va parolni boshqa joyda ham saqlang!\n` +
      `❓ Muammo bo'lsa: @bakoev_me`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );

    if (adminChatId) {
      b.sendMessage(adminChatId,
        `✅ Akkaunt yaratildi!\n\`${username}\` — ${days} kun`,
        { parse_mode: 'Markdown' }
      );
    }

    // Pending orderni yopish
    await db.query(
      `UPDATE pending_orders SET status = 'completed'
       WHERE telegram_user_id = $1 AND status = 'pending'`,
      [telegramUserId]
    );

  } catch(e) {
    console.error('[Bot] createAccount error:', e.message);
    if (adminChatId && b) {
      b.sendMessage(adminChatId, `❌ Xato: ${e.message}`);
    }
  }
}

module.exports = { initBot, createAccount };
