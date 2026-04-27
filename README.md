# Backend deployment on Render (free tier)
# 1. Push code to GitHub
# 2. Create new Web Service on render.com
# 3. Connect repository
# 4. Set environment variables:
#    TWILIO_SID=your_account_sid
#    TWILIO_AUTH_TOKEN=your_auth_token
#    REDIS_URL=your_redis_url (use upstash.com for free Redis)
# 5. Build command: npm install
# 6. Start command: node server.js

# For truly unlimited numbers without Twilio costs:
# Use a SIP trunk provider with flat-rate DIDs
# Or self-host with JMP (https://jmp.chat)
