// =============================================================
//  ShiftHub — VIP tariflari (yagona manba)
//  bot.js ham, routes/admin.js ham shu fayldan oladi, shunda
//  narxlar ikki joyda ikki xil bo'lib qolmaydi.
// =============================================================

const PLANS = {
  d1:   { label: "☀️ 1 kunlik — 10,000 so'm",   days: 1,   amount: 10000  },
  d7:   { label: "📅 7 kunlik — 30,000 so'm",   days: 7,   amount: 30000  },
  d15:  { label: "🗓 15 kunlik — 50,000 so'm",  days: 15,  amount: 50000  },
  d30:  { label: "🏆 30 kunlik — 90,000 so'm",  days: 30,  amount: 90000  },
  d90:  { label: "💎 90 kunlik — 200,000 so'm", days: 90,  amount: 200000 },
  d365: { label: "👑 1 yillik — 600,000 so'm",  days: 365, amount: 600000 },
};

// days -> plan (bot admin_confirm_<id>_<days> ko'rinishida faqat kun yuboradi)
function planByDays(days) {
  const d = parseInt(days, 10);
  return Object.values(PLANS).find(p => p.days === d) || null;
}

module.exports = { PLANS, planByDays };
