# 🤖 Minecraft AFK Client Bot

Web tabanlı Minecraft AFK yönetim paneli. Birden fazla AFK hesabını tek bir arayüzden yönetin!

## ✨ Özellikler

- 🎮 **Birden Fazla AFK Yönetimi**: Sınırsız sayıda AFK hesabı ekleyin
- 💾 **Kalıcı Veri**: Tüm AFK hesapları sunucu yeniden başlatılsa bile kayıtlı kalır
- 🔐 **Güvenli Login Sistemi**: Çok kullanıcılı kimlik doğrulama
- 📊 **Gerçek Zamanlı İzleme**: WebSocket ile anlık durum güncellemeleri
- 🔔 **Discord Entegrasyonu**: Tek embed mesajında tüm botların durumunu görün
- 🚀 **Railway.app Uyumlu**: Kolay deployment için optimize edilmiş
- 🎨 **Modern Arayüz**: Kullanıcı dostu ve responsive tasarım

## 🚀 Railway.app Deployment

### 1. Yöntem: GitHub Üzerinden (Önerilen)

1. Bu projeyi GitHub hesabınıza fork edin veya yeni bir repository oluşturun
2. [Railway.app](https://railway.app) hesabınıza giriş yapın
3. "New Project" > "Deploy from GitHub repo" seçin
4. Repository'nizi seçin
5. Railway otomatik olarak projeyi deploy edecektir

### 2. Yöntem: Railway CLI ile

```bash
# Railway CLI'yi yükleyin
npm i -g @railway/cli

# Railway'e login olun
railway login

# Projeyi deploy edin
railway up

# Domain ekleyin
railway domain
```

### 3. Yöntem: Dockerfile ile

Railway otomatik olarak Dockerfile'ı algılayacak ve kullanacaktır.

## 📦 Kurulum (Lokal)

```bash
# Bağımlılıkları yükleyin
npm install

# Sunucuyu başlatın
npm start

# Development modunda (nodemon ile)
npm run dev
```

Tarayıcınızda `http://localhost:3000` adresine gidin.

## 🔑 Varsayılan Kullanıcılar

- **Admin**: `admin` / `Adm1nP@ss2024XYZ`
- **User 1**: `othymess` / `Othy$ecure987654`
- **User 2**: `emre` / `Emr3Str0ng#12345`

⚠️ **ÖNEMLİ**: Production'da bu şifreleri mutlaka değiştirin!

## 📖 Kullanım

### AFK Hesabı Ekleme

1. Dashboard'a giriş yapın
2. "Yeni AFK Ekle" kartında formu doldurun:
   - **Kullanıcı Adı**: Minecraft karakterinizin adı
   - **Şifre**: Premium sunucular için (opsiyonel)
   - **Sunucu IP**: Bağlanılacak sunucu
   - **Port**: Sunucu portu (varsayılan: 25565)
   - **Versiyon**: Minecraft versiyonu (örn: 1.20.1)
   - **Auth**: Offline/Microsoft/Mojang
   - **Towny Komut**: Login sonrası çalıştırılacak komut (örn: /towny)
   - **Discord Webhook**: Durum bildirimlerinin gönderileceği webhook URL
3. "AFK Hesabı Ekle" butonuna tıklayın

### Bot Başlatma/Durdurma

- **Tek Bot**: Her AFK hesabının yanındaki "▶️ Başlat" veya "⏹️ Durdur" butonunu kullanın
- **Tüm Botlar**: "⏹️ Tümünü Durdur" butonunu kullanın

### Discord Bildirimleri

Bot durumları Discord'a tek bir embed mesajında gönderilir ve otomatik olarak güncellenir:
- 🟢 **Yeşil**: Bot aktif
- 🔴 **Kırmızı**: Bot kapalı
- Her bot için çalışma süresi gösterilir

## 🔧 Yapılandırma

### Discord Webhook Alma

1. Discord sunucunuzda bir kanal seçin
2. Kanal ayarları > Entegrasyonlar > Webhook'lar
3. "Yeni Webhook" oluşturun
4. Webhook URL'ini kopyalayın
5. AFK hesabı eklerken bu URL'i girin

### Port Değiştirme

```bash
# Railway.app otomatik PORT ayarlayacaktır
# Lokal kullanım için:
PORT=3000 npm start
```

## 📁 Dosya Yapısı

```
afk-client-bot/
├── server.js           # Ana sunucu dosyası
├── dashboard.html      # Dashboard arayüzü
├── login.html          # Login sayfası
├── package.json        # Node.js bağımlılıkları
├── Dockerfile          # Docker yapılandırması
├── railway.json        # Railway yapılandırması
├── .gitignore          # Git ignore dosyası
├── afk_data.json       # AFK verileri (otomatik oluşur)
└── README.md           # Bu dosya
```

## 🛠️ Geliştirme

### Yeni Özellik Ekleme

1. `server.js` dosyasında backend kodunu yazın
2. `dashboard.html` dosyasında frontend kodunu ekleyin
3. WebSocket mesajlaşmasını kullanarak gerçek zamanlı güncellemeler sağlayın

### API Endpoints

- `POST /api/afk/add` - Yeni AFK ekle
- `GET /api/afk/list` - AFK listesini getir
- `DELETE /api/afk/:id` - AFK sil
- `POST /api/afk/:id/start` - AFK başlat
- `POST /api/afk/:id/stop` - AFK durdur
- `POST /api/afk/stopall` - Tüm botları durdur
- `POST /api/discord/update` - Discord durumunu güncelle

## 🐛 Sorun Giderme

### Bot Bağlanamıyor

- Sunucu IP ve port doğru mu kontrol edin
- Sunucu online mı kontrol edin
- Minecraft versiyonu uyumlu mu kontrol edin

### Discord Güncellenmiyor

- Webhook URL'nin doğru olduğundan emin olun
- Discord rate limit'e takılmış olabilir (5 saniye aralıklarla günceller)

### Railway Deployment Sorunları

- `railway logs` komutuyla logları kontrol edin
- Railway dashboard'undan environment variables kontrol edin

## 📝 Lisans

MIT License - İstediğiniz gibi kullanabilirsiniz!

## 🤝 Katkıda Bulunma

Pull request'ler memnuniyetle karşılanır!

## 📧 İletişim

Sorularınız için issue açabilirsiniz.

---

**Not**: Bu bot eğitim amaçlıdır. Sunucu kurallarına uygun şekilde kullanın!
"# afkclientt" 
