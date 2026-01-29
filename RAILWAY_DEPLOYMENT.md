# 🚂 Railway.app Deployment Rehberi

Bu rehber, Minecraft AFK Client Bot'u Railway.app'e deploy etmeniz için adım adım yol gösterir.

## 📋 Ön Gereksinimler

1. [Railway.app](https://railway.app) hesabı (GitHub ile giriş yapabilirsiniz)
2. GitHub hesabı (projeyi yüklemek için)

## 🚀 Deployment Adımları

### 1️⃣ Projeyi GitHub'a Yükleyin

#### Yeni Repository Oluşturma

```bash
# Proje dizinine gidin
cd afk-client-bot

# Git başlatın
git init

# Dosyaları ekleyin
git add .

# İlk commit
git commit -m "Initial commit: AFK Client Bot"

# GitHub'da yeni bir repository oluşturun (web arayüzünden)
# Sonra aşağıdaki komutları çalıştırın:

git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/REPO_ADINIZ.git
git push -u origin main
```

### 2️⃣ Railway'de Yeni Proje Oluşturun

1. [Railway.app](https://railway.app) hesabınıza giriş yapın
2. Dashboard'da **"New Project"** butonuna tıklayın
3. **"Deploy from GitHub repo"** seçeneğini seçin
4. GitHub repository'nizi seçin (ilk kez kullanıyorsanız, Railway'e GitHub erişimi vermeniz istenecek)

### 3️⃣ Otomatik Deployment

Railway otomatik olarak:
- ✅ `package.json` dosyasını algılayacak
- ✅ `npm install` çalıştıracak
- ✅ `npm start` ile uygulamayı başlatacak
- ✅ Bir PORT atayacak ve environment variable olarak sağlayacak

### 4️⃣ Domain Ekleyin

1. Railway dashboard'da projenize tıklayın
2. **"Settings"** sekmesine gidin
3. **"Domains"** bölümünde **"Generate Domain"** butonuna tıklayın
4. Railway otomatik olarak bir `.railway.app` domain oluşturacak

Örnek: `https://afk-client-bot-production-xxxx.up.railway.app`

### 5️⃣ Uygulamanızı Test Edin

1. Oluşturulan domain'i tarayıcınızda açın
2. Login sayfası görünmelidir
3. Varsayılan kullanıcı bilgileriyle giriş yapın:
   - Kullanıcı: `admin`
   - Şifre: `Adm1nP@ss2024XYZ`

## 🔧 Railway Yapılandırması

### Environment Variables (Opsiyonel)

Railway dashboard'dan environment variable ekleyebilirsiniz:

1. **"Variables"** sekmesine gidin
2. Değişken ekleyin:
   - `PORT` - Railway otomatik olarak ayarlar (manuel eklemeye gerek yok)
   - `NODE_ENV=production` - Production modu için

### Railway.json Açıklaması

```json
{
  "build": {
    "builder": "NIXPACKS",          // Railway'in build sistemi
    "buildCommand": "npm install"   // Build komutu
  },
  "deploy": {
    "startCommand": "npm start",    // Başlatma komutu
    "restartPolicyType": "ON_FAILURE", // Hata durumunda yeniden başlat
    "restartPolicyMaxRetries": 10   // Max 10 deneme
  }
}
```

## 📊 Monitoring ve Logs

### Logları Görüntüleme

Railway Dashboard'da:
1. Projenize tıklayın
2. **"Deployments"** sekmesine gidin
3. En son deployment'a tıklayın
4. **"View Logs"** butonuna tıklayın

### Railway CLI ile Loglar

```bash
# Railway CLI yükleyin
npm i -g @railway/cli

# Login olun
railway login

# Logları izleyin
railway logs
```

## 🔄 Güncelleme

Kodunuzu güncellemek için:

```bash
# Değişiklikleri commit edin
git add .
git commit -m "Update: açıklama"

# GitHub'a push edin
git push

# Railway otomatik olarak yeni deploy edecek!
```

## 💾 Veri Saklama

Railway'de veriler **ephemeral** (geçici) depolarda saklanır:
- ✅ `afk_data.json` dosyası her deployment'ta silinmez
- ⚠️ Ancak Railway container yeniden başlatıldığında veriler kaybolabilir

### Kalıcı Veri İçin (İleri Seviye)

Railway Volume kullanın:
1. Dashboard'da **"Add Volume"** seçin
2. Mount path: `/app`
3. Size: 1GB (ücretsiz plan için yeterli)

## 💰 Maliyet

Railway Ücretsiz Plan:
- ✅ $5 ücretsiz kredi/ay
- ✅ 500 saat çalışma süresi/ay
- ✅ Yeterli küçük projeler için

**Not**: AFK bot 7/24 çalışırsa, aylık ~720 saat = ücretsiz planı aşar. Sadece ihtiyaç olduğunda çalıştırın veya ücretli plana geçin.

## 🛠️ Sorun Giderme

### Build Hatası

```bash
# Railway loglarını kontrol edin
railway logs

# Lokal test
npm install
npm start
```

### Port Hatası

Railway otomatik PORT atar. Kodda şu şekilde kullanın:
```javascript
const PORT = process.env.PORT || 3000;
```

### Bağlantı Sorunu

- Domain'in doğru olduğundan emin olun
- Railway dashboard'dan "Healthy" durumunda olup olmadığını kontrol edin

### Veri Kaybı

Railway container yeniden başlatıldığında `afk_data.json` kaybolabilir. 
Çözüm: Railway Volume kullanın veya external database (PostgreSQL, MongoDB) ekleyin.

## 🎯 Production İpuçları

### 1. Şifreleri Değiştirin

`server.js` dosyasında varsayılan şifreleri değiştirin:

```javascript
const users = {
  'admin': {
    password: 'YENİ_GÜÇ LÜ_ŞİFRE',  // Değiştirin!
    role: 'admin',
    fullAccess: true
  }
};
```

### 2. Session Secret Değiştirin

```javascript
app.use(session({
  secret: 'KENDİ_SECRET_KEY_INİZ',  // Değiştirin!
  // ...
}));
```

### 3. HTTPS Kullanın

Railway otomatik olarak HTTPS sağlar, ancak WebSocket bağlantılarında `wss://` kullandığınızdan emin olun.

## 📞 Destek

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Railway Status: https://status.railway.app

## ✅ Kontrol Listesi

Deployment öncesi kontrol edin:

- [ ] GitHub repository oluşturuldu
- [ ] Tüm dosyalar commit edildi
- [ ] `.gitignore` doğru yapılandırıldı
- [ ] `package.json` dependency'leri güncel
- [ ] Railway hesabı oluşturuldu
- [ ] GitHub ile Railway bağlandı
- [ ] Deployment başarılı
- [ ] Domain oluşturuldu
- [ ] Uygulama çalışıyor
- [ ] Login test edildi
- [ ] AFK ekleme test edildi
- [ ] Discord webhook test edildi

---

🎉 **Tebrikler!** Artık AFK Client Bot'unuz Railway.app'te çalışıyor!

Herhangi bir sorunla karşılaşırsanız Railway loglarını kontrol edin veya issue açın.
