const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const axios = require('axios');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ========== KULLANICI HESAPLARI ==========
const users = {
  'admin': {
    password: 'Adm1nP@ss2024XYZ',
    role: 'admin',
    fullAccess: true
  },
  'othymess': {
    password: 'Othy$ecure987654',
    role: 'user',
    fullAccess: true
  },
  'emre': {
    password: 'Emr3Str0ng#12345',
    role: 'user',
    fullAccess: true
  }
};

// Session middleware
app.use(session({
  secret: 'minecraft-afk-bot-secret-key-2024-xyz',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  }
}));

// Middleware
app.use(express.json());

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ success: false, message: 'Lütfen giriş yapın!' });
}

// ========== AFK YÖNETİM SİSTEMİ ==========
const AFK_DATA_FILE = path.join(__dirname, 'afk_data.json');
let afkAccounts = [];
let activeBots = new Map(); // botId -> bot instance

// AFK verilerini yükle
function loadAFKData() {
  try {
    if (fs.existsSync(AFK_DATA_FILE)) {
      const data = fs.readFileSync(AFK_DATA_FILE, 'utf8');
      afkAccounts = JSON.parse(data);
      log(`${afkAccounts.length} AFK hesabı yüklendi`, 'success');
    }
  } catch (error) {
    log('AFK veri yükleme hatası: ' + error.message, 'error');
    afkAccounts = [];
  }
}

// AFK verilerini kaydet
function saveAFKData() {
  try {
    fs.writeFileSync(AFK_DATA_FILE, JSON.stringify(afkAccounts, null, 2));
  } catch (error) {
    log('AFK veri kaydetme hatası: ' + error.message, 'error');
  }
}

// Discord Webhook için tek embed ID'sini sakla
let discordMessageId = null;
let lastDiscordUpdate = Date.now();

// ========== WEBSOCKET BROADCAST ==========
function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function log(message, type = 'info') {
  const logData = {
    type: 'log',
    logType: type,
    message: message,
    timestamp: new Date().toISOString()
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  broadcastToClients(logData);
}

function updateAFKList() {
  broadcastToClients({
    type: 'afkList',
    data: afkAccounts.map(afk => ({
      ...afk,
      isActive: activeBots.has(afk.id)
    }))
  });
}

// ========== DISCORD WEBHOOK FONKSİYONU ==========
async function updateDiscordStatus(webhookUrl) {
  if (!webhookUrl) return;
  
  // En az 5 saniye aralıkla güncelle (rate limit)
  const now = Date.now();
  if (now - lastDiscordUpdate < 5000) return;
  lastDiscordUpdate = now;

  const activeCount = activeBots.size;
  const totalCount = afkAccounts.length;
  const inactiveCount = totalCount - activeCount;

  // AFK durumlarını hazırla
  const statusFields = afkAccounts.map(afk => {
    const isActive = activeBots.has(afk.id);
    const bot = activeBots.get(afk.id);
    
    let statusEmoji = isActive ? '🟢' : '🔴';
    let statusText = isActive ? 'Aktif' : 'Kapalı';
    let extraInfo = '';
    
    if (isActive && bot) {
      const uptime = Math.floor((Date.now() - bot.startTime) / 1000 / 60);
      extraInfo = ` | ${uptime} dk`;
    }
    
    return {
      name: `${statusEmoji} ${afk.username}`,
      value: `${statusText}${extraInfo}\nSunucu: \`${afk.server}\``,
      inline: true
    };
  });

  // Embed oluştur
  const embed = {
    title: '🤖 AFK Client Bot - Durum Paneli',
    description: `**Toplam AFK:** ${totalCount}\n**Aktif:** 🟢 ${activeCount} | **Kapalı:** 🔴 ${inactiveCount}`,
    color: activeCount > 0 ? 0x00FF00 : 0xFF0000,
    fields: statusFields.length > 0 ? statusFields : [
      { name: 'Bilgi', value: 'Henüz kayıtlı AFK hesabı yok', inline: false }
    ],
    footer: {
      text: '🔄 Otomatik güncelleme aktif'
    },
    timestamp: new Date().toISOString()
  };

  try {
    if (!discordMessageId) {
      // İlk mesaj - yeni embed gönder
      const response = await axios.post(webhookUrl, {
        embeds: [embed],
        username: 'AFK Client Bot'
      });
      
      // Discord API'den message ID alamıyoruz çünkü webhook
      // Bu yüzden her seferinde edit yerine yeni mesaj göndereceğiz
      // veya webhook'tan dönen veriyi kullanabiliriz
      log('Discord durumu güncellendi (yeni mesaj)', 'success');
    } else {
      // Mesajı düzenle (webhook ile doğrudan edit yapılamaz, yeni mesaj göndermek gerekir)
      await axios.post(webhookUrl, {
        embeds: [embed],
        username: 'AFK Client Bot'
      });
      log('Discord durumu güncellendi', 'success');
    }
  } catch (error) {
    log('Discord güncelleme hatası: ' + error.message, 'error');
  }
}

// ========== BOT YÖNETİMİ ==========
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startAFKBot(afk) {
  if (activeBots.has(afk.id)) {
    log(`${afk.username} zaten aktif!`, 'warning');
    return { success: false, message: 'Bot zaten aktif!' };
  }

  try {
    log(`${afk.username} başlatılıyor...`, 'info');
    
    const bot = mineflayer.createBot({
      host: afk.server,
      port: afk.port || 25565,
      username: afk.username,
      version: afk.version || '1.20.1',
      auth: afk.auth || 'offline',
      hideErrors: false
    });

    bot.loadPlugin(pathfinder);
    bot.afkId = afk.id;
    bot.afkUsername = afk.username;
    bot.startTime = Date.now();
    bot.loginCompleted = false;
    bot.serverJoined = false;

    // Bot event'leri
    bot.once('spawn', async () => {
      log(`${afk.username} sunucuya bağlandı!`, 'success');
      bot.serverJoined = true;
      
      // Webhook'u güncelle
      if (afk.webhookUrl) {
        await updateDiscordStatus(afk.webhookUrl);
      }
      updateAFKList();
      
      // Login kontrolü
      setTimeout(async () => {
        if (!bot.loginCompleted && afk.password) {
          log(`${afk.username} için login yapılıyor...`, 'info');
          bot.chat(`/login ${afk.password}`);
        }
      }, 2000);
    });

    bot.on('message', async (message) => {
      const msg = message.toString();
      
      // Login başarılı
      if (!bot.loginCompleted && (msg.toLowerCase().includes('başarı') || msg.toLowerCase().includes('success') || msg.toLowerCase().includes('giriş'))) {
        log(`${afk.username} login başarılı!`, 'success');
        bot.loginCompleted = true;
        
        // Eğer towny komut varsa gönder
        if (afk.townyCommand) {
          await sleep(2000);
          bot.chat(afk.townyCommand);
          log(`${afk.username} towny komutunu gönderdi`, 'info');
        }
      }
    });

    bot.on('kicked', async (reason) => {
      log(`${afk.username} sunucudan atıldı: ${reason}`, 'error');
      activeBots.delete(afk.id);
      if (afk.webhookUrl) {
        await updateDiscordStatus(afk.webhookUrl);
      }
      updateAFKList();
    });

    bot.on('error', (err) => {
      log(`${afk.username} hata: ${err.message}`, 'error');
    });

    bot.on('end', async () => {
      log(`${afk.username} bağlantısı kesildi!`, 'warning');
      activeBots.delete(afk.id);
      if (afk.webhookUrl) {
        await updateDiscordStatus(afk.webhookUrl);
      }
      updateAFKList();
    });

    activeBots.set(afk.id, bot);
    
    return { success: true, message: 'Bot başlatıldı!' };
  } catch (error) {
    log(`${afk.username} başlatma hatası: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
}

async function stopAFKBot(afkId) {
  const bot = activeBots.get(afkId);
  if (!bot) {
    return { success: false, message: 'Bot aktif değil!' };
  }

  const afk = afkAccounts.find(a => a.id === afkId);
  
  try {
    log(`${bot.afkUsername} durduruluyor...`, 'warning');
    bot.end();
    activeBots.delete(afkId);
    
    if (afk && afk.webhookUrl) {
      await updateDiscordStatus(afk.webhookUrl);
    }
    updateAFKList();
    
    return { success: true, message: 'Bot durduruldu!' };
  } catch (error) {
    log(`${bot.afkUsername} durdurma hatası: ${error.message}`, 'error');
    return { success: false, message: error.message };
  }
}

// ========== ROTALAR ==========
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  } else {
    res.sendFile(path.join(__dirname, 'login.html'));
  }
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: 'Kullanıcı adı ve şifre gerekli!' });
  }
  
  const user = users[username];
  
  if (!user || user.password !== password) {
    return res.json({ success: false, message: 'Kullanıcı adı veya şifre yanlış!' });
  }
  
  req.session.user = {
    username: username,
    role: user.role,
    fullAccess: user.fullAccess
  };
  
  res.json({ 
    success: true, 
    message: 'Giriş başarılı!',
    user: {
      username: username,
      role: user.role
    }
  });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Çıkış yapıldı!' });
});

// Current user endpoint
app.get('/api/user', isAuthenticated, (req, res) => {
  res.json({ 
    success: true, 
    user: req.session.user 
  });
});

// ========== AFK API ENDPOINTS ==========

// AFK listesini getir
app.get('/api/afk/list', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    afks: afkAccounts.map(afk => ({
      ...afk,
      isActive: activeBots.has(afk.id)
    }))
  });
});

// Yeni AFK ekle
app.post('/api/afk/add', isAuthenticated, (req, res) => {
  const { username, password, server, port, version, auth, townyCommand, webhookUrl } = req.body;
  
  if (!username || !server) {
    return res.json({ success: false, message: 'Kullanıcı adı ve sunucu gerekli!' });
  }

  // Aynı username kontrolü
  if (afkAccounts.find(afk => afk.username === username && afk.server === server)) {
    return res.json({ success: false, message: 'Bu AFK hesabı zaten kayıtlı!' });
  }

  const newAFK = {
    id: Date.now() + Math.random(),
    username,
    password: password || '',
    server,
    port: port || 25565,
    version: version || '1.20.1',
    auth: auth || 'offline',
    townyCommand: townyCommand || '',
    webhookUrl: webhookUrl || '',
    createdAt: new Date().toISOString()
  };

  afkAccounts.push(newAFK);
  saveAFKData();
  updateAFKList();
  
  log(`Yeni AFK eklendi: ${username}`, 'success');
  res.json({ success: true, message: 'AFK hesabı eklendi!', afk: newAFK });
});

// AFK sil
app.delete('/api/afk/:id', isAuthenticated, async (req, res) => {
  const afkId = parseFloat(req.params.id);
  const afkIndex = afkAccounts.findIndex(afk => afk.id === afkId);
  
  if (afkIndex === -1) {
    return res.json({ success: false, message: 'AFK hesabı bulunamadı!' });
  }

  const afk = afkAccounts[afkIndex];
  
  // Eğer bot aktifse durdur
  if (activeBots.has(afkId)) {
    await stopAFKBot(afkId);
  }

  afkAccounts.splice(afkIndex, 1);
  saveAFKData();
  updateAFKList();
  
  log(`AFK silindi: ${afk.username}`, 'warning');
  res.json({ success: true, message: 'AFK hesabı silindi!' });
});

// AFK başlat
app.post('/api/afk/:id/start', isAuthenticated, async (req, res) => {
  const afkId = parseFloat(req.params.id);
  const afk = afkAccounts.find(a => a.id === afkId);
  
  if (!afk) {
    return res.json({ success: false, message: 'AFK hesabı bulunamadı!' });
  }

  const result = await startAFKBot(afk);
  res.json(result);
});

// AFK durdur
app.post('/api/afk/:id/stop', isAuthenticated, async (req, res) => {
  const afkId = parseFloat(req.params.id);
  const result = await stopAFKBot(afkId);
  res.json(result);
});

// Tüm botları durdur
app.post('/api/afk/stopall', isAuthenticated, async (req, res) => {
  let stoppedCount = 0;
  
  for (const [afkId, bot] of activeBots.entries()) {
    try {
      await stopAFKBot(afkId);
      stoppedCount++;
    } catch (error) {
      log(`Bot durdurma hatası: ${error.message}`, 'error');
    }
  }
  
  res.json({ success: true, message: `${stoppedCount} bot durduruldu!` });
});

// Discord durumu manuel güncelle
app.post('/api/discord/update', isAuthenticated, async (req, res) => {
  const { webhookUrl } = req.body;
  
  if (!webhookUrl) {
    return res.json({ success: false, message: 'Webhook URL gerekli!' });
  }

  try {
    await updateDiscordStatus(webhookUrl);
    res.json({ success: true, message: 'Discord durumu güncellendi!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ========== WEBSOCKET CONNECTION ==========
wss.on('connection', (ws) => {
  console.log('Yeni WebSocket bağlantısı');
  
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket bağlantısı kuruldu'
  }));
  
  // AFK listesini gönder
  ws.send(JSON.stringify({
    type: 'afkList',
    data: afkAccounts.map(afk => ({
      ...afk,
      isActive: activeBots.has(afk.id)
    }))
  }));
  
  ws.on('close', () => {
    console.log('WebSocket bağlantısı kapandı');
  });
});

// ========== SERVER START ==========
const PORT = process.env.PORT || 3000;

// AFK verilerini yükle
loadAFKData();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AFK Client Bot Server çalışıyor: Port ${PORT}`);
  log('Server başlatıldı!', 'success');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM sinyali alındı, botlar durduruluyor...');
  
  for (const [afkId] of activeBots.entries()) {
    await stopAFKBot(afkId);
  }
  
  process.exit(0);
});
