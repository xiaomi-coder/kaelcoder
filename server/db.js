const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database tables if they don't exist
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_orders (
        id UUID PRIMARY KEY,
        telegram_user_id BIGINT,
        telegram_username TEXT,
        days INTEGER,
        amount INTEGER,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[DB] pending_orders table ready');

    // --- sotuvlar / daromad ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        admin_name  TEXT NOT NULL,
        admin_role  TEXT NOT NULL DEFAULT 'seller',
        user_id     UUID,
        username    TEXT NOT NULL,
        plan_key    TEXT,
        days        INTEGER NOT NULL,
        amount      BIGINT  NOT NULL,
        source      TEXT NOT NULL DEFAULT 'panel',
        action      TEXT NOT NULL DEFAULT 'create',
        note        TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_admin ON sales(admin_name);`);
    console.log('[DB] sales table ready');

    // --- sozlamalar (anonim yuklab olishlar hisoblagichi shu yerda) ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      INSERT INTO settings (key, value) VALUES ('anon_downloads', '0')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('[DB] settings table ready');
  } catch(e) {
    console.error('[DB] initDb error:', e.message);
  }
}

initDb();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
