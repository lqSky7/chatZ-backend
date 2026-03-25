require("dotenv").config({ path: "../.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        pass_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create chatrooms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatrooms (
        id SERIAL PRIMARY KEY,
        code TEXT,
        pass_hash TEXT,
        type TEXT NOT NULL CHECK(type IN ('group', 'dm'))
      )
    `);

    // Add creator_id for group ownership on existing deployments
    await pool.query(`
      ALTER TABLE chatrooms
      ADD COLUMN IF NOT EXISTS creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create room_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_members (
        room_id INTEGER NOT NULL REFERENCES chatrooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (room_id, user_id)
      )
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES chatrooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Track pending join requests that must be reviewed by room creators
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_join_requests (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES chatrooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(room_id, user_id)
      )
    `);

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

async function dbRun(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

module.exports = { initDB, dbRun, dbGet, dbAll, pool };
