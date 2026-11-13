// Adegram FINAL - NO MONGODB - ONLY GROQ_API_KEY - Memory Storage
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ONLY 1 ENV VARIABLE =====
const GROQ_KEY = process.env.GROQ_API_KEY;

// Hardcoded - you no need to put for Render
const JWT_SECRET = 'adegram-final-secret-2026';

// ===== WORKING MODEL - NOV 2026 - LLAMA DON DIE FOR FREE ACCOUNTS =====
const GROQ_MODEL = 'openai/gpt-oss-20b';

// ===== MEMORY STORAGE - NO MONGODB =====
let users = [];
let chats = [];
let messages = [];
let statuses = [];

function newId(){ return Date.now().toString() + Math.random().toString(36).substr(2,5); }
function timeNow(){ return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }

// Seed Adegram AI
let aiChat = { id: 'ai-chat-1', name: 'Adegram AI', type: 'ai', avatar: '✨', createdBy: 'system', createdAt: new Date() };
chats.push(aiChat);
messages.push({ id: newId(), chatId: 'ai-chat-1', sender: 'Adegram AI', senderId: 'ai', text: 'Hi! I am Adegram AI ✨ Built by Abdulrazaq, powered by Groq. Ask me anything! I fit help for business, games, school, coding, VRChat.', type: 'text', time: timeNow(), createdAt: new Date() });

if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage = multer.diskStorage({ destination: 'uploads/', filename: (req,file,cb)=>cb(null, Date.now()+'-'+file.originalname) });
const upload = multer({ storage });

function auth(req,res,next){
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'No token'});
  try{ req.user = jwt.verify(token, JWT_SECRET); next(); }catch{ return res.status(401).json({error:'Invalid token'}); }
}

// ========== AUTH - NO OTP ==========
app.post('/api/register', async (req,res)=>{
  const { name, phone, password } = req.body;
  if(!name || !phone || !password) return res.status(400).json({error:'Fill name, phone and password'});
  if(users.find(u=>u.phone===phone)) return res.status(400).json({error:'Phone already registered. Login instead.'});
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: newId(), name, phone, password: hashed, avatar: name[0].toUpperCase(), about: 'Hey there! I am using Adegram', createdAt: new Date() };
  users.push(user);
  const token = jwt.sign({ id: user.id, name, phone }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name, phone, avatar: user.avatar } });
});

app.post('/api/login', async (req,res)=>{
  const { phone, password } = req.body;
  const user = users.find(u=>u.phone===phone);
  if(!user) return res.status(400).json({error:'User not found. Register first.'});
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).json({error:'Wrong password'});
  const token = jwt.sign({ id: user.id, name: user.name, phone }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, phone, avatar: user.avatar } });
});

app.get('/api/me', auth, async (req,res)=>{
  const u = users.find(x=>x.id===req.user.id);
  if(!u) return res.status(404).json({error:'Not found'});
  res.json({ id: u.id, name: u.name, phone: u.phone, avatar: u.avatar });
});

// ========== CHATS ==========
app.get('/api/chats', auth, async (req,res)=>{
  const out = chats.map(c=>{
    const last = [...messages].reverse().find(m=>m.chatId===c.id);
    return { id: c.id, name: c.name, type: c.type, avatar: c.avatar, last: last ? (last.text||'📎 File') : 'Say hi 👋', time: last?.time || '' };
  });
  res.json(out.reverse());
});

app.post('/api/chats', auth, async (req,res)=>{
  const { name, type } = req.body;
  const c = { id: newId(), name, type: type||'chat', avatar: name[0].toUpperCase(), members: [req.user.id], createdBy: req.user.id, createdAt: new Date() };
  chats.push(c); io.emit('new_chat', c);
  res.json({ id: c.id, name: c.name, type: c.type, avatar: c.avatar });
});

// ========== MESSAGES + GROQ AI ==========
app.get('/api/messages/:chatId', auth, async (req,res)=>{
  res.json(messages.filter(m=>m.chatId===req.params.chatId));
});

app.post('/api/messages', auth, async (req,res)=>{
  const { chatId, text } = req.body;
  const chat = chats.find(c=>c.id===chatId);
  if(!chat) return res.status(404).json({error:'Chat not found'});
  const msg = { id: newId(), chatId, sender: req.user.name, senderId: req.user.id, text, type: 'text', time: timeNow(), createdAt: new Date() };
  messages.push(msg); io.emit('new_message', msg);

  if(chat.type === 'ai'){
    io.emit('typing', { chatId, user: 'Adegram AI' });
    try{
      if(!GROQ_KEY){
        const aiMsg = { id: newId(), chatId, sender: 'Adegram AI', senderId: 'ai', text: '⚠️ GROQ_API_KEY never set for Render. Go Render > Environment > Add GROQ_API_KEY, then redeploy.', type: 'text', time: timeNow(), createdAt: new Date() };
        messages.push(aiMsg); io.emit('new_message', aiMsg); return res.json({ userMsg: msg, aiMsg });
      }
      const history = messages.filter(m=>m.chatId===chatId).slice(-12);
      const msgsForAI = [{ role: 'system', content: 'You are Adegram AI, built by Abdulrazaq. Friendly, helpful, speak Nigerian Pidgin + English when user speaks Pidgin. Help with business, games, school, coding, VRChat, Fiverr. Answer short and clear.' }];
      history.forEach(m=> msgsForAI.push({ role: m.senderId==='ai'?'assistant':'user', content: m.text }));
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, messages: msgsForAI, temperature: 0.7, max_tokens: 1000 })
      });
      const data = await response.json();
      let aiText = data.choices ? data.choices[0].message.content : 'Groq Error: ' + (data.error?.message || 'Check GROQ_API_KEY in Render');
      const aiMsg = { id: newId(), chatId, sender: 'Adegram AI', senderId: 'ai', text: aiText, type: 'text', time: timeNow(), createdAt: new Date() };
      messages.push(aiMsg); io.emit('new_message', aiMsg);
      return res.json({ userMsg: msg, aiMsg });
    }catch(e){
      const aiMsg = { id: newId(), chatId, sender: 'Adegram AI', senderId: 'ai', text: 'Network error: '+e.message, type: 'text', time: timeNow(), createdAt: new Date() };
      messages.push(aiMsg); io.emit('new_message', aiMsg); return res.json({ userMsg: msg, aiMsg });
    }
  }
  res.json(msg);
});

app.post('/api/upload', auth, upload.single('file'), async (req,res)=>{
  const { chatId } = req.body;
  const url = `/uploads/${req.file.filename}`;
  const m = { id: newId(), chatId, sender: req.user.name, senderId: req.user.id, text: req.file.originalname, type: req.file.mimetype.startsWith('image/')?'image':'file', fileUrl: url, fileName: req.file.originalname, time: timeNow(), createdAt: new Date() };
  messages.push(m); io.emit('new_message', m); res.json(m);
});

app.get('/api/status', auth, async (req,res)=> res.json(statuses));
app.post('/api/status', auth, async (req,res)=>{
  const s = { id: newId(), user: req.user.name, text: req.body.text, time: timeNow(), createdAt: new Date() };
  statuses.push(s); io.emit('new_status', s); res.json(s);
});

io.on('connection', (socket)=>{
  socket.on('typing', d=> socket.broadcast.emit('typing', d));
  socket.on('join_call', d=> socket.broadcast.emit('incoming_call', d));
  socket.on('call_accept', d=> socket.broadcast.emit('call_accepted', d));
  socket.on('call_end', d=> socket.broadcast.emit('call_ended', d));
});

app.get('/api/health', (req,res)=> res.json({ status: 'Adegram FINAL Running - NO MongoDB - 1 ENV Only', users: users.length, chats: chats.length, messages: messages.length, groqConfigured: !!GROQ_KEY, model: GROQ_MODEL }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`✅ Adegram FINAL on ${PORT} | Groq: ${GROQ_KEY?'Set':'Missing - Add GROQ_API_KEY'} | Model: ${GROQ_MODEL}`));
