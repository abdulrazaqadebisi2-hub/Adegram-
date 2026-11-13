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
    return { id: c.id, name: c.name, type: c.type, avatar: c.avatar,
