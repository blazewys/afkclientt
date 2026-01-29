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

// Login sayfası rotası
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  } else {
    res.sendFile(path.join(__dirname, 'login.html'));
  }
});

// Dashboard rotası
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
  
  if (!user) {
    return res.json({ success: false, message: 'Kullanıcı bulunamadı!' });
  }
  
  if (user.password !== password) {
    return res.json({ success: false, message: 'Şifre yanlış!' });
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

// ========== AFK BOT YÖNETİMİ ==========

// AFK'ları kaydetmek için dosya
const AFK_DATA_FILE = path.join(__dirname, 'afk_data.json');

// AFK'ları yükle
function loadAFKs() {
  try {
    if (fs.existsSync(AFK_DATA_FILE)) {
      const data = fs.readFileSync(AFK_DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('AFK yükleme hatası:', error);
  }
  return [];
}

// AFK'ları kaydet
function saveAFKs(afks) {
  try {
    fs.writeFileSync(AFK_DATA_FILE, JSON.stringify(afks, null, 2));
    return true;
  } catch (error) {
    console.error('AFK kaydetme hatası:', error);
    return false;
  }
}

// AFK listesi
let afkList = loadAFKs();

// Aktif botlar - Geliştirilmiş durum yönetimi
let activeBots = new Map();

// Discord webhook konfigürasyonu
let discordConfig = {
  webhookUrl: '',
  messageId: null,
  channelId: null,
  notificationWebhookUrl: '' // Bildirim webhook'u
};

// Discord mesaj ID'sini kaydetmek için dosya
const DISCORD_DATA_FILE = path.join(__dirname, 'discord_data.json');

function loadDiscordData() {
  try {
    if (fs.existsSync(DISCORD_DATA_FILE)) {
      const data = fs.readFileSync(DISCORD_DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Discord data yükleme hatası:', error);
  }
  return { webhookUrl: '', messageId: null, channelId: null, notificationWebhookUrl: '' };
}

function saveDiscordData() {
  try {
    fs.writeFileSync(DISCORD_DATA_FILE, JSON.stringify(discordConfig, null, 2));
  } catch (error) {
    console.error('Discord data kaydetme hatası:', error);
  }
}

// Discord verilerini yükle
discordConfig = loadDiscordData();

// ========== DISCORD NOTIFICATION ==========
async function sendDiscordNotification(title, message, color = 0xef4444, mention = true) {
  if (!discordConfig.notificationWebhookUrl) {
    return;
  }

  try {
    const embed = {
      title: title,
      description: message,
      color: color,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'AFK Bot Bildirimi'
      }
    };

    const payload = {
      embeds: [embed]
    };

    // @everyone mention ekle
    if (mention) {
      payload.content = '@everyone';
    }

    await axios.post(discordConfig.notificationWebhookUrl, payload);
    log(`Discord bildirimi gönderildi: ${title}`, 'info');
  } catch (error) {
    console.error('Discord bildirim hatası:', error.message);
  }
}

// ========== WEBSOCKET BROADCAST ==========
function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        console.error('WebSocket broadcast hatası:', error);
      }
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

// ========== DURUM GÜNCELLEMELERİ ==========
// Tüm bot durumlarını broadcast et
function broadcastBotStatuses() {
  const statuses = Array.from(activeBots.entries()).map(([afkId, botData]) => {
    const afk = afkList.find(a => a.id === afkId);
    return {
      afkId: afkId,
      username: afk?.username || 'Unknown',
      status: botData.status,
      connectedAt: botData.connectedAt,
      lastUpdate: Date.now()
    };
  });

  broadcastToClients({
    type: 'bot_statuses',
    statuses: statuses
  });
}

// Her bot için durum güncellemesi gönder
function updateBotStatus(afkId, status, extraData = {}) {
  const botData = activeBots.get(afkId);
  if (botData) {
    botData.status = status;
    botData.lastStatusUpdate = Date.now();
    
    // Özel durum güncellemeleri
    Object.assign(botData, extraData);
  }

  const afk = afkList.find(a => a.id === afkId);
  
  // Durum değişikliğini broadcast et
  broadcastToClients({
    type: 'bot_status_update',
    afkId: afkId,
    username: afk?.username || 'Unknown',
    status: status,
    timestamp: Date.now(),
    ...extraData
  });

  // Discord'u güncelle (debounce ile)
  scheduleDiscordUpdate();
}

// ========== CHAT FONKSİYONLARI ==========
function broadcastChatMessage(afkId, message, sender = 'server') {
  const chatData = {
    type: 'chat_message',
    afkId: afkId,
    message: message,
    sender: sender,
    timestamp: new Date().toISOString()
  };
  broadcastToClients(chatData);
}

// ========== DISCORD FONKSİYONLARI ==========
function formatUptime(connectedAt) {
  const uptime = Date.now() - connectedAt;
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}s ${minutes % 60}d`;
  } else if (minutes > 0) {
    return `${minutes}d ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Discord güncelleme zamanlayıcısı (debounce)
let discordUpdateTimer = null;
let lastDiscordUpdate = 0;
const DISCORD_UPDATE_COOLDOWN = 3000; // 3 saniye minimum bekleme

function scheduleDiscordUpdate() {
  // Eğer zaten bir timer varsa iptal et
  if (discordUpdateTimer) {
    clearTimeout(discordUpdateTimer);
  }

  // Son güncellemeden bu yana geçen süre
  const timeSinceLastUpdate = Date.now() - lastDiscordUpdate;
  
  // Eğer cooldown süresi geçmediyse, kalan süre kadar bekle
  const delay = Math.max(DISCORD_UPDATE_COOLDOWN - timeSinceLastUpdate, 100);
  
  discordUpdateTimer = setTimeout(async () => {
    await updateDiscordEmbed();
    lastDiscordUpdate = Date.now();
    discordUpdateTimer = null;
  }, delay);
}

async function updateDiscordEmbed() {
  if (!discordConfig.webhookUrl) {
    return;
  }

  try {
    const embed = {
      title: '🤖 AFK Bot Durumları',
      color: 0x5865F2,
      fields: [],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Son Güncelleme'
      }
    };

    // Tüm AFK'ları embed'e ekle
    for (const afk of afkList) {
      const bot = activeBots.get(afk.id);
      let status = '🔴 Kapalı';
      let details = 'Bot aktif değil';

      if (bot && bot.instance) {
        if (bot.status === 'connected') {
          status = '🟢 Aktif';
          details = `✅ Bağlı\n⏱️ ${formatUptime(bot.connectedAt)}`;
        } else if (bot.status === 'connecting') {
          status = '🟡 Bağlanıyor';
          details = 'Sunucuya bağlanılıyor...';
        } else if (bot.status === 'login') {
          status = '🟡 Giriş Yapılıyor';
          details = 'Şifre doğrulanıyor...';
        } else if (bot.status === 'kicked' || bot.status === 'error') {
          status = '🔴 Hata';
          details = bot.errorMessage || 'Bağlantı hatası';
        }
      }

      embed.fields.push({
        name: `${status} ${afk.username}`,
        value: `**Sunucu:** ${afk.server}\n${details}`,
        inline: true
      });
    }

    if (embed.fields.length === 0) {
      embed.fields.push({
        name: 'ℹ️ Bilgi',
        value: 'Henüz hiç AFK eklenmemiş',
        inline: false
      });
    }

    const payload = {
      embeds: [embed]
    };

    // Webhook URL'den gerekli bilgileri çıkar
    const webhookMatch = discordConfig.webhookUrl.match(/webhooks\/(\d+)\/([^\/]+)/);
    if (!webhookMatch) {
      log('Geçersiz webhook URL!', 'error');
      return;
    }

    const webhookId = webhookMatch[1];
    const webhookToken = webhookMatch[2];

    // Eğer messageId varsa mesajı güncelle, yoksa yeni mesaj gönder
    if (discordConfig.messageId) {
      const editUrl = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${discordConfig.messageId}`;
      await axios.patch(editUrl, payload);
    } else {
      const sendUrl = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}?wait=true`;
      const response = await axios.post(sendUrl, payload);
      
      if (response.data && response.data.id) {
        discordConfig.messageId = response.data.id;
        discordConfig.channelId = response.data.channel_id;
        saveDiscordData();
        log('Discord mesajı oluşturuldu ve ID kaydedildi', 'success');
      }
    }
  } catch (error) {
    console.error('Discord güncelleme hatası:', error.message);
    if (error.response?.status === 404) {
      discordConfig.messageId = null;
      saveDiscordData();
      log('Discord mesajı bulunamadı, yeni mesaj oluşturulacak', 'warning');
    }
  }
}

// ========== BOT FONKSİYONLARI ==========
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startAFKBot(afk) {
  if (activeBots.has(afk.id)) {
    log(`${afk.username} zaten çalışıyor!`, 'warning');
    return;
  }

  log(`${afk.username} başlatılıyor...`, 'info');

  const botOptions = {
    host: afk.server,
    port: afk.port || 25565,
    username: afk.username,
    version: afk.version || '1.20.1',
    auth: afk.auth || 'offline',
    hideErrors: false,
    checkTimeoutInterval: 60000,
    keepAlive: true
  };

  if (afk.auth === 'microsoft') {
    botOptions.auth = 'microsoft';
  }

  try {
    const bot = mineflayer.createBot(botOptions);
    bot.loadPlugin(pathfinder);

    const botData = {
      instance: bot,
      status: 'connecting',
      connectedAt: Date.now(),
      loginCompleted: false,
      townyJoined: false,
      chatMessages: [],
      reconnectAttempts: 0,
      lastStatusUpdate: Date.now()
    };

    activeBots.set(afk.id, botData);
    updateBotStatus(afk.id, 'connecting');

    // Heartbeat - her 5 saniyede bir durum kontrolü
    const heartbeatInterval = setInterval(() => {
      if (activeBots.has(afk.id)) {
        const currentBotData = activeBots.get(afk.id);
        if (currentBotData.instance && currentBotData.status === 'connected') {
          // Bot hala bağlı, durumu güncelle
          broadcastBotStatuses();
        }
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 5000);

    bot.on('login', async () => {
      log(`${afk.username} giriş yapıldı!`, 'success');
      updateBotStatus(afk.id, 'login');
    });

    bot.on('spawn', async () => {
      log(`${afk.username} spawn oldu!`, 'success');
      updateBotStatus(afk.id, 'connected', { connectedAt: Date.now() });
      
      // Başarılı bağlantıdan sonra reconnect sayacını sıfırla
      const wasReconnecting = botData.reconnectAttempts > 0;
      botData.reconnectAttempts = 0;
      
      // Eğer yeniden bağlanma sonrası başarılıysa bildir
      if (wasReconnecting) {
        await sendDiscordNotification(
          '✅ Bot Yeniden Bağlandı',
          `**${afk.username}** başarıyla yeniden bağlandı!\n**Sunucu:** ${afk.server}`,
          0x10b981,
          false // @everyone mention olmasın
        );
      }
    });

    bot.on('end', async (reason) => {
      log(`${afk.username} bağlantısı kesildi: ${reason}`, 'warning');
      clearInterval(heartbeatInterval);
      
      // Discord bildirimi gönder
      await sendDiscordNotification(
        '🔴 Bot Bağlantısı Kesildi',
        `**${afk.username}** sunucudan düştü!\n**Sebep:** ${reason}\n**Sunucu:** ${afk.server}`,
        0xef4444,
        true
      );
      
      updateBotStatus(afk.id, 'disconnected', { 
        errorMessage: `Bağlantı kesildi: ${reason}` 
      });
      
      activeBots.delete(afk.id);
      await scheduleDiscordUpdate();
      
      // Otomatik yeniden bağlanma denemesi - maksimum 5 deneme
      if (botData.reconnectAttempts < 5) {
        botData.reconnectAttempts++;
        
        // Her deneme için bekleme süresini artır + rastgele gecikme ekle
        // 1. deneme: 15-25 saniye
        // 2. deneme: 30-45 saniye
        // 3. deneme: 60-90 saniye
        // 4. deneme: 120-180 saniye
        // 5. deneme: 180-300 saniye
        const baseDelay = Math.min(15000 * Math.pow(2, botData.reconnectAttempts - 1), 180000);
        const randomDelay = Math.random() * baseDelay * 0.5; // %50'ye kadar rastgele ekleme
        const totalDelay = baseDelay + randomDelay;
        
        log(`${afk.username} için ${botData.reconnectAttempts}. yeniden bağlanma denemesi ${Math.round(totalDelay / 1000)} saniye sonra...`, 'info');
        
        setTimeout(() => {
          if (!activeBots.has(afk.id)) {
            log(`${afk.username} yeniden bağlanıyor...`, 'info');
            startAFKBot(afk);
          }
        }, totalDelay);
      } else {
        log(`${afk.username} için maksimum yeniden bağlanma denemesi aşıldı`, 'error');
        
        // Son bildirim - artık yeniden denemeyeceği
        await sendDiscordNotification(
          '❌ Bot Yeniden Bağlanamadı',
          `**${afk.username}** maksimum yeniden bağlanma denemesini aştı!\n**Son Sebep:** ${reason}\n**Sunucu:** ${afk.server}`,
          0x991b1b,
          true
        );
      }
    });

    bot.on('kicked', async (reason) => {
      const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
      log(`${afk.username} atıldı: ${reasonText}`, 'error');
      clearInterval(heartbeatInterval);
      
      // Discord bildirimi gönder
      await sendDiscordNotification(
        '⛔ Bot Sunucudan Atıldı',
        `**${afk.username}** sunucudan atıldı!\n**Sebep:** ${reasonText}\n**Sunucu:** ${afk.server}`,
        0xdc2626,
        true
      );
      
      updateBotStatus(afk.id, 'kicked', { 
        errorMessage: `Atıldı: ${reasonText}` 
      });
      
      activeBots.delete(afk.id);
      await scheduleDiscordUpdate();
      
      // Kicked durumunda da yeniden bağlanmayı dene (daha az deneme ile)
      if (botData.reconnectAttempts < 3) {
        botData.reconnectAttempts++;
        
        // Kicked için daha uzun bekleme süreleri
        // 1. deneme: 30-60 saniye
        // 2. deneme: 90-150 saniye  
        // 3. deneme: 180-300 saniye
        const baseDelay = Math.min(30000 * Math.pow(2, botData.reconnectAttempts - 1), 180000);
        const randomDelay = Math.random() * baseDelay;
        const totalDelay = baseDelay + randomDelay;
        
        log(`${afk.username} atıldıktan sonra ${botData.reconnectAttempts}. bağlanma denemesi ${Math.round(totalDelay / 1000)} saniye sonra...`, 'info');
        
        setTimeout(() => {
          if (!activeBots.has(afk.id)) {
            log(`${afk.username} yeniden bağlanıyor...`, 'info');
            startAFKBot(afk);
          }
        }, totalDelay);
      } else {
        log(`${afk.username} için maksimum yeniden bağlanma denemesi aşıldı (kicked)`, 'error');
        
        // Son bildirim
        await sendDiscordNotification(
          '❌ Bot Yeniden Bağlanamadı (Kicked)',
          `**${afk.username}** atıldıktan sonra yeniden bağlanamadı!\n**Son Sebep:** ${reasonText}\n**Sunucu:** ${afk.server}`,
          0x991b1b,
          true
        );
      }
    });

    bot.on('error', async (err) => {
      log(`${afk.username} hata: ${err.message}`, 'error');
      updateBotStatus(afk.id, 'error', { 
        errorMessage: err.message 
      });
    });

    bot.on('messagestr', async (msg) => {
      if (botData.chatMessages.length >= 100) {
        botData.chatMessages.shift();
      }
      botData.chatMessages.push({
        message: msg,
        timestamp: new Date().toISOString()
      });
      
      broadcastChatMessage(afk.id, msg, 'server');

      // Login kontrolü
      if (!botData.loginCompleted && msg.toLowerCase().includes('login')) {
        log(`${afk.username} için login gereksinimi tespit edildi`, 'info');
        await sleep(500);
        bot.chat(`/login ${afk.password}`);
      }

      // Login başarılı
      if (!botData.loginCompleted && (msg.includes('başarıyla giriş') || msg.includes('successfully') || msg.includes('logged in'))) {
        log(`${afk.username} login başarılı!`, 'success');
        botData.loginCompleted = true;

        await sleep(3000);
        const townyCmd = afk.townyCommand || '/towny';
        log(`${afk.username} için ${townyCmd} komutu gönderiliyor...`, 'info');
        bot.chat(townyCmd);
      }

      // Towny başarılı
      if (botData.loginCompleted && !botData.townyJoined) {
        if (msg.includes('towny') || msg.includes('welcome') || msg.includes('transferred') || 
            msg.includes('switching') || msg.includes('connected to') || msg.includes('lobby')) {
          log(`${afk.username} towny sunucusuna girildi!`, 'success');
          botData.townyJoined = true;
          updateBotStatus(afk.id, 'connected');
        }
      }
    });

    // Timeout - login için
    setTimeout(async () => {
      if (!botData.loginCompleted) {
        log(`${afk.username} için login timeout`, 'warning');
        botData.loginCompleted = true;
        await sleep(1000);
        const townyCmd = afk.townyCommand || '/towny';
        bot.chat(townyCmd);
      }
    }, 20000);

    // Timeout - towny için
    setTimeout(async () => {
      if (botData.loginCompleted && !botData.townyJoined) {
        log(`${afk.username} için towny timeout, direkt bağlı sayılıyor`, 'info');
        botData.townyJoined = true;
        updateBotStatus(afk.id, 'connected');
      }
    }, 30000);

  } catch (error) {
    log(`${afk.username} bot başlatma hatası: ${error.message}`, 'error');
    activeBots.delete(afk.id);
    await scheduleDiscordUpdate();
  }
}

async function stopAFKBot(afkId) {
  const botData = activeBots.get(afkId);
  if (botData && botData.instance) {
    const afk = afkList.find(a => a.id === afkId);
    log(`${afk ? afk.username : afkId} durduruluyor...`, 'warning');
    
    try {
      botData.instance.quit();
    } catch (error) {
      console.error('Bot durdurma hatası:', error);
    }
    
    activeBots.delete(afkId);
    updateBotStatus(afkId, 'stopped');
    await scheduleDiscordUpdate();
  }
}

// ========== API ENDPOINTS ==========

// AFK listesini getir
app.get('/api/afks', isAuthenticated, (req, res) => {
  const afksWithStatus = afkList.map(afk => {
    const bot = activeBots.get(afk.id);
    return {
      ...afk,
      isActive: bot ? true : false,
      status: bot ? bot.status : 'stopped',
      uptime: bot ? Date.now() - bot.connectedAt : 0
    };
  });
  res.json({ success: true, afks: afksWithStatus });
});

// Yeni AFK ekle
app.post('/api/afks', isAuthenticated, (req, res) => {
  const { username, password, server, port, version, auth, townyCommand } = req.body;

  if (!username || !password || !server) {
    return res.json({ success: false, message: 'Kullanıcı adı, şifre ve sunucu gerekli!' });
  }

  const newAFK = {
    id: Date.now().toString(),
    username,
    password,
    server,
    port: port || 25565,
    version: version || '1.20.1',
    auth: auth || 'offline',
    townyCommand: townyCommand || '',
    createdAt: new Date().toISOString()
  };

  afkList.push(newAFK);
  
  if (saveAFKs(afkList)) {
    log(`Yeni AFK eklendi: ${username}`, 'success');
    broadcastToClients({ type: 'afk_list_updated' });
    res.json({ success: true, message: 'AFK başarıyla eklendi!', afk: newAFK });
  } else {
    res.json({ success: false, message: 'AFK kaydedilemedi!' });
  }
});

// AFK sil
app.delete('/api/afks/:id', isAuthenticated, async (req, res) => {
  const afkId = req.params.id;
  
  await stopAFKBot(afkId);
  
  const index = afkList.findIndex(a => a.id === afkId);
  if (index !== -1) {
    const afk = afkList[index];
    afkList.splice(index, 1);
    
    if (saveAFKs(afkList)) {
      log(`AFK silindi: ${afk.username}`, 'warning');
      broadcastToClients({ type: 'afk_list_updated' });
      res.json({ success: true, message: 'AFK başarıyla silindi!' });
    } else {
      res.json({ success: false, message: 'AFK silinemedi!' });
    }
  } else {
    res.json({ success: false, message: 'AFK bulunamadı!' });
  }
});

// AFK başlat
app.post('/api/afks/:id/start', isAuthenticated, async (req, res) => {
  const afkId = req.params.id;
  const afk = afkList.find(a => a.id === afkId);

  if (!afk) {
    return res.json({ success: false, message: 'AFK bulunamadı!' });
  }

  if (activeBots.has(afkId)) {
    return res.json({ success: false, message: 'Bot zaten çalışıyor!' });
  }

  await startAFKBot(afk);
  res.json({ success: true, message: `${afk.username} başlatıldı!` });
});

// AFK durdur
app.post('/api/afks/:id/stop', isAuthenticated, async (req, res) => {
  const afkId = req.params.id;
  const afk = afkList.find(a => a.id === afkId);

  if (!afk) {
    return res.json({ success: false, message: 'AFK bulunamadı!' });
  }

  if (!activeBots.has(afkId)) {
    return res.json({ success: false, message: 'Bot zaten durmuş!' });
  }

  await stopAFKBot(afkId);
  res.json({ success: true, message: `${afk.username} durduruldu!` });
});

// Chat mesajlarını getir
app.get('/api/afks/:id/chat', isAuthenticated, (req, res) => {
  const afkId = req.params.id;
  const botData = activeBots.get(afkId);
  
  if (!botData) {
    return res.json({ success: false, message: 'Bot aktif değil!' });
  }
  
  res.json({ 
    success: true, 
    messages: botData.chatMessages || []
  });
});

// Mesaj gönder
app.post('/api/afks/:id/chat', isAuthenticated, (req, res) => {
  const afkId = req.params.id;
  const { message } = req.body;
  
  if (!message) {
    return res.json({ success: false, message: 'Mesaj boş olamaz!' });
  }
  
  const botData = activeBots.get(afkId);
  
  if (!botData || !botData.instance) {
    return res.json({ success: false, message: 'Bot aktif değil!' });
  }
  
  try {
    botData.instance.chat(message);
    
    if (botData.chatMessages.length >= 100) {
      botData.chatMessages.shift();
    }
    botData.chatMessages.push({
      message: `[${afkList.find(a => a.id === afkId)?.username}] ${message}`,
      timestamp: new Date().toISOString()
    });
    
    broadcastChatMessage(afkId, `[${afkList.find(a => a.id === afkId)?.username}] ${message}`, 'bot');
    
    log(`${afkList.find(a => a.id === afkId)?.username} mesaj gönderdi: ${message}`, 'info');
    res.json({ success: true, message: 'Mesaj gönderildi!' });
  } catch (error) {
    res.json({ success: false, message: 'Mesaj gönderilemedi: ' + error.message });
  }
});

// Discord webhook ayarla
app.post('/api/discord/webhook', isAuthenticated, (req, res) => {
  const { webhookUrl } = req.body;

  if (!webhookUrl) {
    return res.json({ success: false, message: 'Webhook URL gerekli!' });
  }

  discordConfig.webhookUrl = webhookUrl;
  discordConfig.messageId = null;
  saveDiscordData();

  log('Discord webhook güncellendi', 'success');
  res.json({ success: true, message: 'Webhook kaydedildi!' });
});

// Discord webhook getir
app.get('/api/discord/webhook', isAuthenticated, (req, res) => {
  res.json({ 
    success: true, 
    webhookUrl: discordConfig.webhookUrl,
    notificationWebhookUrl: discordConfig.notificationWebhookUrl 
  });
});

// Discord notification webhook ayarla
app.post('/api/discord/notification-webhook', isAuthenticated, (req, res) => {
  const { webhookUrl } = req.body;

  if (!webhookUrl) {
    return res.json({ success: false, message: 'Webhook URL gerekli!' });
  }

  discordConfig.notificationWebhookUrl = webhookUrl;
  saveDiscordData();

  log('Discord bildirim webhook güncellendi', 'success');
  res.json({ success: true, message: 'Bildirim webhook kaydedildi!' });
});

// ========== WEBSOCKET CONNECTION ==========
wss.on('connection', (ws) => {
  console.log('Yeni WebSocket bağlantısı');
  
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket bağlantısı kuruldu'
  }));

  // İlk bağlantıda mevcut durumları gönder
  broadcastBotStatuses();
  
  ws.on('close', () => {
    console.log('WebSocket bağlantısı kapandı');
  });

  ws.on('error', (error) => {
    console.error('WebSocket hatası:', error);
  });
});

// ========== SERVER START ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 AFK Client Bot Server: http://localhost:${PORT}`);
  console.log(`📊 WebSocket Server Aktif`);
});

// Düzenli durum broadcast'i (her 10 saniyede bir)
setInterval(() => {
  if (activeBots.size > 0) {
    broadcastBotStatuses();
  }
}, 10000);

// Düzenli Discord güncelleme (her 60 saniyede bir)
setInterval(async () => {
  if (activeBots.size > 0 && discordConfig.webhookUrl) {
    await updateDiscordEmbed();
  }
}, 60000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM alındı, botlar durduruluyor...');
  
  for (const [afkId, botData] of activeBots.entries()) {
    try {
      if (botData.instance) {
        botData.instance.quit();
      }
    } catch (error) {
      console.error('Bot durdurma hatası:', error);
    }
  }
  
  process.exit(0);
});
