const express = require('express');
const { createAccount } = require('../bot');
const db = require('../db');

const router = express.Router();

// ==================== Paylov.uz Webhook ====================
// Paylov token kelganda shu endpoint ishlatiladi
// POST /api/payment/webhook
router.post('/webhook', async (req, res) => {
  try {
    const PAYLOV_TOKEN = process.env.PAYLOV_TOKEN;

    // Paylov dan kelgan so'rovni tekshirish
    // (Paylov dasturchilari token berishganda bu qismni to'liq to'ldiramiz)
    const { order_id, status, merchant_trans_id } = req.body;

    if (status !== 'success' && status !== 'completed') {
      return res.json({ success: false, message: 'Payment not completed' });
    }

    // Pending orderni topish
    const orderResult = await db.query(
      `SELECT * FROM pending_orders WHERE id = $1 AND status = 'pending'`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return res.json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Akkaunt yaratish va xaridorga yuborish
    await createAccount(null, order.telegram_user_id, order.days, null);

    res.json({ success: true });
  } catch(e) {
    console.error('[Payment] Webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
