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

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect();

const provisionQueue = new Queue('number provisioning', { connection: redisClient });

const db = new sqlite3.Database('./numbers.db');

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    current_number TEXT,
    number_history TEXT,
    created_at INTEGER
  )
`);

const twilioClient = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

app.post('/api/provision', async (req, res) => {
  const { userId } = req.body;
  const job = await provisionQueue.add('provision', { userId });
  res.json({ jobId: job.id, status: 'queued' });
});

provisionQueue.process('provision', async (job) => {
  const { userId } = job.data;
  const number = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: process.env.NUMBER_POOL[Math.floor(Math.random() * process.env.NUMBER_POOL.length)],
    voiceUrl: 'http://your-domain.com/voice',
    smsUrl: 'http://your-domain.com/sms'
  });

  db.get('SELECT current_number FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (row && row.current_number) {
      twilioClient.incomingPhoneNumbers(row.current_number).update({ voiceUrl: null, smsUrl: null });
    }
  });

  const history = await getUserHistory(userId);
  history.push(row?.current_number);

  db.run(
    'INSERT OR REPLACE INTO users (user_id, current_number, number_history, created_at) VALUES (?, ?, ?, ?)',
    [userId, number.phoneNumber, JSON.stringify(history), Date.now()]
  );

  io.to(userId).emit('number_provisioned', { number: number.phoneNumber });
});

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;
  socket.join(userId);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));