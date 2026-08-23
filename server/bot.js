const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const TOKEN = process.env.BOT_TOKEN;
// Bir nechta admin: ADMIN_TELEGRAM_ID = "111111111,222222222"
// Bitta qiymat yozilsa ham ishlaydi (eskisi bilan mos).
const ADMIN_IDS = String(process.env.ADMIN_TELEGRAM_ID || '')
  .split(',')
  .map(x => parseInt(x.trim(), 10))
  .filter(x => !isNaN(x));

// Eski kod bilan moslik uchun: birinchi admin "asosiy"
const ADMIN_ID = ADMIN_IDS[0];

function isAdmin(id) {
  return ADMIN_IDS.includes(id);
}

// Xabarni barcha adminlarga yuborish
function notifyAdmins(send) {
  ADMIN_IDS.forEach(id => { try { send(id); } catch (e) { /* birov bloklagan bo'lishi mumkin */ } });
}
const PAYMENT_CARD      = process.env.PAYMENT_CARD || '8600 XXXX XXXX XXXX';   // Railway Variables
const PAYMENT_CARD_NAME = process.env.PAYMENT_CARD_NAME || '';                 // karta egasining ismi

const { PLANS, planByDays } = require('./plans');

function randomStr(len) {
  // O'xshash belgilarni olib tashladik: i, I, l (kichik), o, O, 0, 1. (L katta harfi qo'shildi).
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
      `🎮 <b>ShiftHub CS2 — Sotib olish boti</b>\n\n` +
      `Salom, <b>${name}</b>! 👋\n\n` +
      `Counter-Strike 2 uchun VIP dastur.\n` +
      `ESP • Aimbot • BHop • Triggerbot • va boshqalar\n\n` +
      `📦 <b>VIP obuna narxlari:</b>\n` +
      `☀️ 1 kunlik — <b>10,000 so'm</b>\n` +
      `📅 7 kunlik — <b>30,000 so'm</b>\n` +
      `🗓 15 kunlik — <b>50,000 so'm</b>\n` +
      `🏆 30 kunlik — <b>90,000 so'm</b>\n` +
      `💎 90 kunlik — <b>200,000 so'm</b>\n` +
      `👑 1 yillik — <b>600,000 so'm</b>  — eng foydali\n\n` +
      `👇 Birini tanlang:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "☀️ 1 kun — 10,000", callback_data: 'buy_d1' },
             { text: "📅 7 kun — 30,000", callback_data: 'buy_d7' }],
            [{ text: "🗓 15 kun — 50,000", callback_data: 'buy_d15' },
             { text: "🏆 30 kun — 90,000", callback_data: 'buy_d30' }],
            [{ text: "💎 90 kun — 200,000", callback_data: 'buy_d90' },
             { text: "👑 1 yil — 600,000", callback_data: 'buy_d365' }],
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
      const msgId = query.message.message_id;

      bot.answerCallbackQuery(query.id).catch(() => {});

      if (data.startsWith('buy_')) {
        const planKey = data.replace('buy_', '');
        const plan = PLANS[planKey];
        if (!plan) return;

        // Pending orderni saqlash
        try {
          // Oldin eski pending order bo'lsa uni cancelled qilamiz
          await db.query(`UPDATE pending_orders SET status = 'cancelled' WHERE telegram_user_id = $1 AND status = 'pending'`, [userId]);
          
          await db.query(
            `INSERT INTO pending_orders (id, telegram_user_id, telegram_username, days, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [uuidv4(), userId, username, plan.days, plan.amount]
          );
        } catch(e) {
          console.error('[Bot] Order save error:', e.message);
        }

        bot.sendMessage(chatId,
          `✅ <b>${plan.label}</b> tanlandi!\n\n` +
          `💰 <b>To'lov miqdori:</b> ${plan.amount.toLocaleString()} so'm\n` +
          `📅 <b>Obuna muddati:</b> ${plan.days} kun\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `💳 <b>Karta raqami:</b>\n<code>${PAYMENT_CARD}</code>\n` +
          (PAYMENT_CARD_NAME ? `👤 <b>Karta egasi:</b> ${PAYMENT_CARD_NAME}\n` : '') +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `To'lovni amalga oshirgach, "To'lov qildim" tugmasini bosing yoki to'g'ridan-to'g'ri chekni (screenshot) shu chatga yuboring.`,
          { 
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ To'lov qildim", callback_data: 'user_paid' }],
                [{ text: "❌ Bekor qilish", callback_data: 'user_cancel' }]
              ]
            }
          }
        );
      }

      if (data === 'user_paid') {
        bot.sendMessage(chatId, `📸 <b>Iltimos, to'lov chekini (screenshot) rasmini shu yerga yuboring.</b>\nShundan so'ng u adminga tasdiqlash uchun jo'natiladi.`, { parse_mode: 'HTML' });
      }

      if (data === 'user_cancel') {
        await db.query(`UPDATE pending_orders SET status = 'cancelled' WHERE telegram_user_id = $1 AND status = 'pending'`, [userId]);
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});
        bot.sendMessage(chatId, `❌ Buyurtma bekor qilindi. Boshqa ta'rif tanlashingiz mumkin.`, { parse_mode: 'HTML' });
      }

      if (data.startsWith('admin_confirm_')) {
        if (!isAdmin(userId)) return;
        const parts = data.split('_');
        const targetId = parseInt(parts[2]);
        const days = parseInt(parts[3]);
        
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});

        // Ikki admin bir vaqtda bosishi mumkin — buyurtmani atomik "band" qilamiz,
        // aks holda bitta to'lovga ikkita akkaunt yaratilib ketadi.
        const claim = await db.query(
          `UPDATE pending_orders SET status = 'confirmed'
           WHERE telegram_user_id = $1 AND status = 'pending' RETURNING id`,
          [targetId]
        );
        if (claim.rowCount === 0) {
          bot.sendMessage(chatId, "ℹ️ Bu buyurtma allaqachon ko'rib chiqilgan.").catch(() => {});
          return;
        }

        await createAccount(bot, targetId, days, userId);

        // Qolgan adminlarga kim tasdiqlaganini bildiramiz
        const who = query.from.username ? '@' + query.from.username : String(userId);
        ADMIN_IDS.filter(id => id !== userId).forEach(id => {
          bot.sendMessage(id, `✅ To'lov tasdiqlandi (${who}) — ${days} kunlik akkaunt berildi.`).catch(() => {});
        });
      }

      if (data.startsWith('admin_reject_')) {
        if (!isAdmin(userId)) return;
        const targetId = parseInt(data.split('_')[2]);
        
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});

        // Tasdiqlashdagi kabi: buyurtmani atomik band qilamiz, aks holda
        // ikkala admin bossa mijozga xabar ikki marta boradi.
        const claimR = await db.query(
          `UPDATE pending_orders SET status = 'rejected'
           WHERE telegram_user_id = $1 AND status = 'pending' RETURNING id`,
          [targetId]
        );
        if (claimR.rowCount === 0) {
          bot.sendMessage(chatId, "ℹ️ Bu buyurtma allaqachon ko'rib chiqilgan.").catch(() => {});
          return;
        }
        const whoR = query.from.username ? '@' + query.from.username : String(userId);
        notifyAdmins(id => bot.sendMessage(id, `❌ To'lov rad etildi (${whoR}).`).catch(() => {}));
        bot.sendMessage(targetId, `❌ <b>Kechirasiz, sizning to'lov chekingiz qabul qilinmadi (rad etildi).</b>\nAgar xatolik bo'lsa admin bilan bog'laning.`, { parse_mode: 'HTML' });
      }

      if (data === 'admin_users') {
        if (!isAdmin(userId)) return;
        try {
          const result = await db.query(
            `SELECT username, tier, expires_at, is_blocked FROM users ORDER BY created_at DESC LIMIT 15`
          );
          let text = `👥 <b>So'nggi 15 foydalanuvchi:</b>\n\n`;
          result.rows.forEach(u => {
            const exp = new Date(u.expires_at);
            const expired = exp < new Date();
            const status = u.is_blocked ? '🚫' : expired ? '❌' : '✅';
            text += `${status} <code>${u.username}</code> — ${u.tier.toUpperCase()} | ${exp.toLocaleDateString()}\n`;
          });
          bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        } catch(e) {
          bot.sendMessage(chatId, `❌ Xato: ${e.message}`);
        }
      }

      if (data === 'admin_adddays') {
        if (!isAdmin(userId)) return;
        bot.sendMessage(chatId, `➕ <b>Vaqt qo'shish</b>\nFoydalanuvchiga kun qo'shish uchun quyidagi buyruqni yozing:\n<code>/adddays sh_ab12c3 10</code>`, { parse_mode: 'HTML' });
      }

      if (data === 'admin_block') {
        if (!isAdmin(userId)) return;
        bot.sendMessage(chatId, `🚫 <b>Bloklash</b>\nFoydalanuvchini bloklash uchun quyidagi buyruqni yozing:\n<code>/block sh_ab12c3</code>`, { parse_mode: 'HTML' });
      }

      if (data === 'admin_stats') {
        if (!isAdmin(userId)) return;
        try {
          const res = await db.query(`SELECT COUNT(*) as c FROM users`);
          bot.sendMessage(chatId, `📊 <b>Statistika</b>\n\nJami ro'yxatdan o'tgan foydalanuvchilar: <b>${res.rows[0].c}</b> ta.`, { parse_mode: 'HTML' });
        } catch(e) {
          bot.sendMessage(chatId, `❌ Xato: ${e.message}`);
        }
      }

      if (data === 'myaccount') {
        bot.sendMessage(chatId,
          `👤 <b>Akkaunt ma'lumotlari</b>\n\n` +
          `🌐 Akkauntingizni tekshirish uchun:\n` +
          `<a href="https://www.shifthub.uz">www.shifthub.uz</a> → <b>LOGIN</b> tugmasi`,
          { parse_mode: 'HTML', disable_web_page_preview: true }
        );
      }

      if (data === 'help') {
        bot.sendMessage(chatId,
          `📞 <b>Admin bilan bog'lanish</b>\n\n` +
          `Pastdagi maydonga o'z savolingizni yoki muammongizni yozing. Xabaringiz to'g'ridan-to'g'ri adminga yuboriladi va u shu bot orqali sizga javob qaytaradi! 👇`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (e) {
      console.error('[Bot] callback_query error:', e);
    }
  });

  // ==================== Messages (Live Support / Forwarding / Receipt) ====================
  bot.on('message', async (msg) => {
    try {
      if (msg.text && msg.text.startsWith('/')) return; // Komandalarni o'tkazib yuborish
      if (msg.chat.type !== 'private') return; // Faqat shaxsiy yozishmalar

      const userId = msg.from.id;

      // 1. Agar rasm/chek yuborilgan bo'lsa (pending order mavjud bo'lsa barchaga, hatto adminga ham ishlaydi)
      if (msg.photo || msg.document) {
        const pendingRes = await db.query(`SELECT * FROM pending_orders WHERE telegram_user_id = $1 AND status = 'pending'`, [userId]);
        if (pendingRes.rows.length > 0) {
          const order = pendingRes.rows[0];
          
          if (ADMIN_IDS.length) {
            notifyAdmins(adminId => bot.copyMessage(adminId, msg.chat.id, msg.message_id, {
              caption: `🔔 <b>Yangi to'lov cheki!</b>\n\n👤 Foydalanuvchi: @${msg.from.username || '—'} (ID: <code>${userId}</code>)\n📦 <b>Muddat:</b> ${order.days} kun\n💰 <b>Summa:</b> ${order.amount} so'm`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: "✅ Tasdiqlash va Parol berish", callback_data: `admin_confirm_${userId}_${order.days}` }],
                  [{ text: "❌ Rad etish", callback_data: `admin_reject_${userId}` }]
                ]
              }
            }).catch(() => {}));
          }
          bot.sendMessage(msg.chat.id, "✅ <b>Chek adminga yuborildi.</b>\nIltimos, tasdiqlanishini kuting (odatda 5-10 daqiqa).", { parse_mode: 'HTML' });
          return;
        }
      }

      // 2. Agar xabar admindan kelsa va u qandaydir mijozga reply qilgan bo'lsa
      if (isAdmin(userId) && msg.reply_to_message) {
        if (msg.reply_to_message.forward_from) {
          const targetId = msg.reply_to_message.forward_from.id;
          bot.copyMessage(targetId, msg.chat.id, msg.message_id).catch(() => {
             bot.sendMessage(userId, "❌ Mijozga xabar yuborib bo'lmadi (balki botni bloklagan).").catch(() => {});
          });
          return;
        } else if (msg.reply_to_message.text) {
          const textMatches = msg.reply_to_message.text.match(/ID:\s(\d+)/);
          if (textMatches && textMatches[1]) {
             const targetId = parseInt(textMatches[1]);
             bot.copyMessage(targetId, msg.chat.id, msg.message_id).catch(() => {});
             return;
          }
        }
      }

      // 3. Qolgan holatlarda: Oddiy mijoz yozmoqda (rasm yoki text), forward qilamiz
      if (!isAdmin(userId) && ADMIN_IDS.length) {
        notifyAdmins(adminId => {
          bot.forwardMessage(adminId, msg.chat.id, msg.message_id).catch(() => {
            bot.sendMessage(adminId, `📩 <b>Mijozdan xabar</b>\nID: ${msg.from.id}\nUsername: @${msg.from.username || '—'}\n\n${msg.text || '[Fayl/Rasm]'}`, { parse_mode: 'HTML' }).catch(() => {});
            bot.copyMessage(adminId, msg.chat.id, msg.message_id).catch(() => {});
          });
        });
      }

    } catch(e) {
      console.error('[Bot] message error:', e);
    }
  });

  // ==================== Tekshiruv: /whoami ====================
  // Hamma uchun ochiq. Bot sizning ID ingizni va admin ekanligingizni aytadi.
  bot.onText(/\/whoami/, (msg) => {
    const id = msg.from.id;
    const ok = isAdmin(id);
    bot.sendMessage(msg.chat.id,
      `\u{1F50E} <b>Tekshiruv</b>\n\n` +
      `\u{1F464} Sizning ID: <code>${id}</code>\n` +
      `\u{1F6E1} Admin: <b>${ok ? "HA \u2705" : "YO'Q \u274C"}</b>\n\n` +
      `\u{1F4CB} Botdagi admin ro'yxati:\n<code>${ADMIN_IDS.length ? ADMIN_IDS.join(', ') : "(bo'sh)"}</code>` +
      (ok ? `\n\n\u{1F6E1} Admin panel: /admin` : ''),
      { parse_mode: 'HTML' }
    );
  });

  // ==================== Admin Panel: /admin ====================
  bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) {
      // Avval jim qolardi — odam "bot ishlamayapti" deb o'ylardi.
      bot.sendMessage(msg.chat.id,
        `\u26D4 Sizda admin huquqi yo'q.\n\n` +
        `Sizning ID: <code>${msg.from.id}</code>\n` +
        `Agar bu xato bo'lsa, shu raqamni egasiga yuboring.`,
        { parse_mode: 'HTML' }
      );
      return;
    }
    bot.sendMessage(msg.chat.id, 
      `🛡 <b>Admin Panel</b>\nQuyidagi tugmalardan birini tanlang:`, 
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "👥 So'nggi foydalanuvchilar", callback_data: 'admin_users' }],
            [{ text: "➕ Vaqt qo'shish", callback_data: 'admin_adddays' }, { text: "🚫 Bloklash", callback_data: 'admin_block' }],
            [{ text: "📊 Statistika (tez kunda)", callback_data: 'admin_stats' }]
          ]
        }
      }
    );
  });


  // ==================== Admin: /confirm <userId> <days> ====================
  bot.onText(/\/confirm (\d+) (\d+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, '❌ Faqat admin uchun!');
    }
    const targetId = parseInt(match[1]);
    const days = parseInt(match[2]);
    await createAccount(bot, targetId, days, msg.chat.id);
  });

  // ==================== Admin: /adddays <username> <days> ====================
  bot.onText(/\/adddays (\S+) (\d+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
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
        return bot.sendMessage(msg.chat.id, `❌ <code>${uname}</code> topilmadi!`, { parse_mode: 'HTML' });
      }

      const exp = new Date(result.rows[0].expires_at).toLocaleDateString('uz-UZ');
      bot.sendMessage(msg.chat.id, `✅ <code>${uname}</code> ga <b>${days}</b> kun qo'shildi!\nTugash: <b>${exp}</b>`, { parse_mode: 'HTML' });
    } catch(e) {
      bot.sendMessage(msg.chat.id, `❌ Xato: ${e.message}`);
    }
  });

  // ==================== Admin: /block <username> ====================
  bot.onText(/\/block (\S+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const uname = match[1].toLowerCase();
    try {
      await db.query(`UPDATE users SET is_blocked = true WHERE username = $1`, [uname]);
      bot.sendMessage(msg.chat.id, `🚫 <code>${uname}</code> bloklandi!`, { parse_mode: 'HTML' });
    } catch(e) {
      bot.sendMessage(msg.chat.id, `❌ Xato: ${e.message}`);
    }
  });

  // ==================== Admin: /users ====================
  bot.onText(/\/users/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    try {
      const result = await db.query(
        `SELECT username, tier, expires_at, is_blocked FROM users ORDER BY created_at DESC LIMIT 15`
      );
      let text = `👥 <b>So'nggi 15 foydalanuvchi:</b>\n\n`;
      result.rows.forEach(u => {
        const exp = new Date(u.expires_at);
        const expired = exp < new Date();
        const status = u.is_blocked ? '🚫' : expired ? '❌' : '✅';
        text += `${status} <code>${u.username}</code> — ${u.tier.toUpperCase()} | ${exp.toLocaleDateString()}\n`;
      });
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    } catch(e) {
      bot.sendMessage(msg.chat.id, `❌ Xato: ${e.message}`);
    }
  });

  // ==================== Admin: /help ====================
  bot.onText(/\/help/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    bot.sendMessage(msg.chat.id,
      `🛠 <b>Admin buyruqlari:</b>\n\n` +
      `/confirm &lt;telegram_id&gt; &lt;kunlar&gt; — Akkaunt yaratish\n` +
      `/adddays &lt;username&gt; &lt;kunlar&gt; — Kunlar qo'shish\n` +
      `/block &lt;username&gt; — Bloklash\n` +
      `/users — So'nggi foydalanuvchilar\n` +
      `/help — Bu xabar`,
      { parse_mode: 'HTML' }
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

    // Sotuvni daromad hisobiga yozamiz
    try {
      const plan = planByDays(days);
      await db.query(
        `INSERT INTO sales (admin_name, admin_role, user_id, username, plan_key, days, amount, source, action)
         SELECT 'bot', 'bot', id, username, $1, $2, $3, 'bot', 'create' FROM users WHERE username = $4`,
        [plan ? Object.keys(PLANS).find(k => PLANS[k].days === plan.days) : null,
         days, plan ? plan.amount : 0, username]
      );
    } catch (e) {
      console.error('[Sales] yozib bo\'lmadi:', e.message);
    }

    const expStr = expiresAt.toLocaleDateString('uz-UZ');

    await b.sendMessage(telegramUserId,
      `🎉 <b>To'lov tasdiqlandi! Akkauntingiz tayyor!</b>\n\n` +
      `🎮 <b>ShiftHub CS2 — VIP</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔑 <b>Login:</b> <code>${username}</code>\n` +
      `🔐 <b>Parol:</b> <code>${password}</code>\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📅 Tugash sanasi: <b>${expStr}</b> (${days} kun)\n\n` +
      `📥 <b>Yuklab olish:</b>\n` +
      `1. <a href="https://www.shifthub.uz">www.shifthub.uz</a> → <b>YUKLAB OLISH</b> tugmasi\n` +
      `2. Yoki to'g'ridan dasturga login qiling\n\n` +
      `⚠️ Login va parolni boshqa joyda ham saqlang!\n` +
      `❓ Muammo bo'lsa yozishingiz mumkin.`,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );

    if (adminChatId) {
      b.sendMessage(adminChatId,
        `✅ Akkaunt yaratildi!\n<code>${username}</code> — ${days} kun`,
        { parse_mode: 'HTML' }
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
