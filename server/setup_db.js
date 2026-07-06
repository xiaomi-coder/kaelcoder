const { Pool } = require('pg');

// Test with the same DATABASE_URL format Railway uses internally
const url = 'postgresql://postgres:DLicMBUqrmvRdvoDdqLitHeppMDiSWQN@reseau.proxy.rlwy.net:53854/railway';

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('✅ DB bilan ulanish muvaffaqiyatli!');
    console.log('📋 Jadvallar:', res.rows.map(r => r.table_name));
    
    const settings = await pool.query("SELECT * FROM settings");
    console.log('⚙️  Settings:', settings.rows);
  } catch (err) {
    console.error('❌ DB Xato:', err.message);
  } finally {
    await pool.end();
  }
})();
