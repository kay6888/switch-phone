// package.json
{
  "name": "unlimited-switch",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2",
    "twilio": "^4.19.0",
    "sqlite3": "^5.1.6",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "bull": "^4.11.5",
    "redis": "^4.6.5"
  }
}

// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Twilio = require('twilio');
const sqlite3 = require('sqlite3').verbose();
const { Queue } = require('bull');
const { createClient } = require('redis');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Redis connection for queue
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect();

// Queue for provisioning numbers
const provisionQueue = new Queue('number provisioning', { connection: redisClient });

// SQLite database
const db = new sqlite3.Database('./numbers.db');

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    current_number TEXT,
    number_history TEXT,
    created_at INTEGER
  )
`);

// Twilio client
const twilioClient = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Provision new number endpoint
app.post('/api/provision', async (req, res) => {
  const { userId } = req.body;
  
  // Add to queue immediately - no limits checking
  const job = await provisionQueue.add('provision', { userId });
  
  res.json({ jobId: job.id, status: 'queued' });
});

// Queue worker
provisionQueue.process('provision', async (job) => {
  const { userId } = job.data;
  
  // Purchase new number from Twilio
  const number = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: process.env.NUMBER_POOL[Math.floor(Math.random() * process.env.NUMBER_POOL.length)],
    voiceUrl: 'http://your-domain.com/voice',
    smsUrl: 'http://your-domain.com/sms'
  });
  
  // Get user's old number
  db.get('SELECT current_number FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (row && row.current_number) {
      // Release old number back to pool or release it
      twilioClient.incomingPhoneNumbers(row.current_number).update({ voiceUrl: null, smsUrl: null });
    }
  });
  
  // Update database
  const history = await getUserHistory(userId);
  history.push(row?.current_number);
  
  db.run(
    'INSERT OR REPLACE INTO users (user_id, current_number, number_history, created_at) VALUES (?, ?, ?, ?)',
    [userId, number.phoneNumber, JSON.stringify(history), Date.now()]
  );
  
  // Notify client via WebSocket
  io.to(userId).emit('number_provisioned', { number: number.phoneNumber });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;
  socket.join(userId);
});

httpServer.listen(3000, () => console.log('Server running on port 3000'));
