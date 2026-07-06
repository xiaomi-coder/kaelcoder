const { Pool } = require('pg');
const https = require('https');

const SUPABASE_URL = 'https://zdtovfhvyzugmelebmlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdG92Zmh2eXp1Z21lbGVibWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTM1NDIsImV4cCI6MjA4ODk4OTU0Mn0.fLkmnlsI5wuo2h-ly9ToR0fVXRinlZeCESUeyP5qbjk';

const RAILWAY_URL = 'postgresql://postgres:DLicMBUqrmvRdvoDdqLitHeppMDiSWQN@reseau.proxy.rlwy.net:53854/railway';

const pool = new Pool({
  connectionString: RAILWAY_URL,
  ssl: { rejectUnauthorized: false }
});

function fetchSupabase(table) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?select=*`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    console.log('📥 Supabase dan users yuklanmoqda...');
    const users = await fetchSupabase('users');
    console.log(`✅ ${users.length} ta foydalanuvchi topildi`);

    console.log('📥 Supabase dan settings yuklanmoqda...');
    const settings = await fetchSupabase('settings');
    console.log(`✅ ${settings.length} ta sozlama topildi`);

    // Insert users
    let success = 0, skip = 0;
    for (const u of users) {
      try {
        await pool.query(
          `INSERT INTO users 
          (id, username, password_hash, raw_password, tier, hwid, created_at, expires_at, total_minutes, last_online, is_blocked, download_count, last_ip)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (id) DO NOTHING`,
          [u.id, u.username, u.password_hash, u.raw_password, u.tier, u.hwid,
           u.created_at, u.expires_at, u.total_minutes || 0, u.last_online,
           u.is_blocked || false, u.download_count || 0, u.last_ip]
        );
        success++;
      } catch (err) {
        console.log(`  ⚠️  ${u.username} o'tkazilmadi: ${err.message}`);
        skip++;
      }
    }
    console.log(`\n👥 Users: ${success} ta o'tkazildi, ${skip} ta o'tkazilmadi`);

    // Insert settings
    for (const s of settings) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,$3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [s.key, s.value, s.updated_at]
      );
    }
    console.log(`⚙️  Settings: ${settings.length} ta o'tkazildi`);

    // Final check
    const count = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`\n🎉 TAYYOR! Railway bazasida hozir: ${count.rows[0].count} ta foydalanuvchi`);

  } catch (err) {
    console.error('❌ Xato:', err.message);
  } finally {
    await pool.end();
  }
})();
