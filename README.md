# Usta Kassa v0.3 — sartaroshlar va mijozlar platformasi ✂️

Ikkita Telegram bot va ikkita Mini App bitta serverga (Google Apps Script) ulangan:

| | Kim uchun | Fayl |
|---|---|---|
| **Usta boti** | sartarosh / sartaroshxona egasi | `index.html` |
| **Mijoz boti** | mijozlar | `mijoz.html` |
| **Server** | ikkala bot, baza, eslatmalar | `server/Platform.gs` |

**Nima o'zgardi (v0.3):**
- **Ro'yxatdan o'tish va kirish.** Raqam Telegram orqali tasdiqlanadi, keyin parol qo'yiladi. Ro'yxatdan o'tgach, kirish oynasida telefon raqam va parol bilan kiriladi. Eski foydalanuvchilar uchun ro'yxatdan o'tish ixtiyoriy.
- **Mijozlar uchun:** yaqin sartaroshlarni topish (masofa bilan), qidirish, sevimlilar, bo'sh vaqtni tanlab yozilish, bronlarim.
- **Bildirishnomalar:**
  - mijoz yozilsa, usta botiga "✅ Tasdiqlash / ❌ Rad etish" tugmali xabar keladi;
  - javob mijoz botiga boradi;
  - tashrifdan oldin mijozga eslatma ketadi: kechqurun va 2 soat qolganda.
- **Sartaroshxona egasi** o'z ustalarini telefon raqami orqali qo'shadi. Ustalar sartaroshxonaning manzili va joylashuvini oladi.
- **Kassa ma'lumotlari** serverda saqlanadi. Boshqa telefondan kirsangiz, hammasi tiklanadi.

---

## O'rnatish (bir marta, ~15 daqiqa)

### 1. Mijoz botini yarating
@BotFather → `/newbot` → nom va username bering (masalan `sartarosh_top_bot`). **Tokenni** saqlab qo'ying.
Usta boti sizda allaqachon bor, uning tokeni ham kerak bo'ladi.

### 2. Serverni o'rnating (Google)
1. [sheets.new](https://sheets.new) → yangi jadval, nomi: **Usta Platforma**. Bu umumiy baza bo'ladi.
2. **Kengaytmalar → Apps Script** → `server/Platform.gs` ichidagi kodni to'liq joylang → 💾.
3. **Deploy → New deployment → Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**

   **Deploy** ni bosing → `https://script.google.com/macros/s/…/exec` havolasini nusxalang.
4. ⚙️ **Project Settings → Script Properties** ga 5 ta qator qo'shing:

   | Property | Value |
   |---|---|
   | `USTA_BOT_TOKEN` | usta botining tokeni |
   | `MIJOZ_BOT_TOKEN` | mijoz botining tokeni |
   | `WEB_APP_URL` | 3-qadamdagi `…/exec` havola |
   | `USTA_APP_URL` | `https://xusniddin-del.github.io/usta-kassa/` |
   | `MIJOZ_APP_URL` | `https://xusniddin-del.github.io/usta-kassa/mijoz.html` |

5. Editor'da yuqoridagi ro'yxatdan **setup** funksiyasini tanlang → **▶ Run** → ruxsat bering ("Advanced → Go to…").
   Execution log'da hammasi ✅ bo'lishi kerak. Shu bilan ikkala bot ulanadi, menyu tugmalari qo'yiladi va har 15 daqiqalik eslatma ishga tushadi.

> Tokenlar faqat Script Properties'da turadi. GitHub'ga ham, ilovalarga ham yozilmaydi.

### 3. Ilovalarni sozlang
`index.html` va `mijoz.html` fayllarining boshida `PLATFORM` bloki bor. Ikkalasiga bir xil `API_URL` (`…/exec`) va bot username'larini yozing:

```js
const PLATFORM = {
  API_URL: "https://script.google.com/macros/s/…/exec",
  MIJOZ_BOT: "sartarosh_top_bot"
};
```

### 4. GitHub'ga yuklang
Repo'ga `index.html` (eskisining ustidan), `mijoz.html` va `server/` papkasini yuklang → **Commit changes**.

### 5. (Ixtiyoriy) Usta havolasi
Usta "Mijozlarga havolamni ulashish" tugmasini bossa, mijoz to'g'ridan-to'g'ri o'sha ustaning sahifasiga tushadi. Buning uchun:
@BotFather → mijoz boti → **Bot Settings → Configure Mini App → Enable** → `mijoz.html` havolasi.

---

## Qanday ishlaydi

1. **Usta** usta botini ochadi → **Ro'yxatdan o'tish** → 📱 raqamni ulashadi → ism va parol yozadi → **Kirish**.
2. **Yana → Profil** bo'limini to'ldiradi: rasm, manzil, 📍 joylashuv, ish vaqti, xizmatlar va narxlar. Keyin **"Mijozlar botida ko'rinish: Yoqilgan"** ni tanlaydi.
3. **Mijoz** mijoz botini ochadi → ro'yxatdan o'tadi → 📍 bilan yaqin sartaroshni topadi → xizmat, sana va vaqtni tanlaydi → **Yozilish**.
4. Usta botiga xabar keladi → **✅ Tasdiqlash** → mijozga "Broningiz tasdiqlandi" xabari boradi.
5. Mijoz kelganda usta ilovada **Onlayn bronlar → Keldi** ni bosadi. Tashrif kassaga yoziladi va mijozga "Rahmat" xabari ketadi.

Jadvalning **Users / Shops / Bookings** varaqlarida hamma narsani ko'rib turasiz.

## ⭐ Reklama va tavsiyalar
Mijoz ilovasining bosh sahifasida **"⭐ Tavsiya etamiz"** bo'limi bor. U mijoz qayerda bo'lishidan qat'i nazar ko'rinadi:
1. **Reklama**: "Usta Platforma" jadvalidagi **Reklama** varag'iga qator qo'shasiz:
   - `phone`: ustaning raqami (`998901234567`);
   - `until`: qaysi kungacha (`2026-12-31`);
   - `title`: izoh.

   Bu usta "Reklama" belgisi bilan birinchi chiqadi. Bir nechta reklama bo'lsa, ular har soatda navbat bilan almashadi.
2. **🔥 Ommabop**: oxirgi 60 kunda eng ko'p mijoz qabul qilgan ustalar avtomatik chiqadi.
3. **🆕 Yangi**: yangi ro'yxatdan o'tgan ustalar ham avtomatik chiqadi.

Yaqin atrofda (15 km) sartarosh bo'lmasa, mijozga tavsiya etilganlardan tanlash taklif qilinadi.
Usta ilovasidagi **Profil → ⭐ Tavsiyalarda chiqish** kartochkasida reklama holati ko'rinadi. `index.html` dagi `PLATFORM.ADMIN` ga Telegram username'ingizni yozsangiz, ustalar sizga "Reklama berish" tugmasi orqali yozadi.

## Bilib qo'ying
- Google'ning bepul limitlari shahar miqyosidagi bir necha yuz usta va minglab mijozga bemalol yetadi.
- Server kodini o'zgartirsangiz: **Deploy → Manage deployments → ✏️ → New version** qiling. Havola o'zgarmaydi.
- Eski `google/Code.gs` (shaxsiy jadval) endi kerak emas. Usta platformaga kirsa, kassasi serverda saqlanadi.
