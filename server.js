// server.js - The easy version
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Create database
const db = new sqlite3.Database('./numbers.db');
db.run(`CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  current_number TEXT,
  number_history TEXT,
  created_at INTEGER
)`);

// Generate a random US number (for demo - no Twilio needed)
function generateNumber() {
  const areaCodes = ['212', '310', '415', '617', '206', '512', '303', '702'];
  const area = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const prefix = Math.floor(Math.random() * 900 + 100);
  const line = Math.floor(Math.random() * 9000 + 1000);
  return `+1 (${area}) ${prefix}-${line}`;
}

// Get current number
app.get('/api/number', (req, res) => {
  let userId = req.headers['x-user-id'];
  if (!userId) {
    userId = Math.random().toString(36).substring(7);
    res.setHeader('X-User-Id', userId);
  }
  
  db.get('SELECT current_number, number_history FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (row) {
      res.json({ number: row.current_number, history: JSON.parse(row.number_history || '[]') });
    } else {
      const newNumber = generateNumber();
      db.run('INSERT INTO users (user_id, current_number, number_history, created_at) VALUES (?, ?, ?, ?)',
        [userId, newNumber, JSON.stringify([]), Date.now()]);
      res.json({ number: newNumber, history: [] });
    }
  });
});

// Switch to a new number (no limits!)
app.post('/api/switch', (req, res) => {
  let userId = req.headers['x-user-id'];
  if (!userId) {
    userId = Math.random().toString(36).substring(7);
    res.setHeader('X-User-Id', userId);
  }
  
  db.get('SELECT current_number, number_history FROM users WHERE user_id = ?', [userId], (err, row) => {
    const oldNumber = row ? row.current_number : null;
    const oldHistory = row && row.number_history ? JSON.parse(row.number_history) : [];
    
    const newNumber = generateNumber();
    const newHistory = oldNumber ? [...oldHistory, oldNumber] : oldHistory;
    
    db.run('INSERT OR REPLACE INTO users (user_id, current_number, number_history, created_at) VALUES (?, ?, ?, ?)',
      [userId, newNumber, JSON.stringify(newHistory), Date.now()]);
    
    res.json({ number: newNumber, history: newHistory });
  });
});

// Delete current number and get a fresh one (complete reset)
app.delete('/api/number', (req, res) => {
  let userId = req.headers['x-user-id'];
  if (userId) {
    db.run('DELETE FROM users WHERE user_id = ?', [userId]);
  }
  res.json({ message: 'Number deleted. Get a new one by calling GET /api/number' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
