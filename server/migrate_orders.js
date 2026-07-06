require('dotenv').config();
const db = require('./db');

async function migrate() {
  try {
    await db.query(`
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
    console.log('pending_orders table created');
  } catch (err) {
    console.error('Error creating table', err);
  } finally {
    process.exit(0);
  }
}

migrate();
