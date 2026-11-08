# Usta Kassa ✂️

Sartarosh uchun Telegram Mini App: bugungi kassa (naqd, karta, nasiya, chegirma), xarajatlar, qarzdorlar, mijozlar bazasi, eslatmalar, navbatlar va oylik hisobot.
Ma'lumotlar telefonda saqlanadi va avtomatik **Google Sheets**'ga yoziladi.

## Fayllar

| Fayl | Nima |
|---|---|
| `index.html` | Mini App (GitHub Pages orqali ochiladi) |
| `google/Code.gs` | Google Sheets uchun Apps Script kodi |

## 1. Google Sheets'ni ulash (5 daqiqa)

1. [sheets.new](https://sheets.new) — yangi jadval oching, nom bering (masalan, *Usta Kassa*).
2. **Kengaytmalar → Apps Script**. Ochilgan oynadagi kodni o'chirib, `google/Code.gs` ichidagisini joylang.
3. Saqlang (💾). Keyin ⚙️ **Project Settings → Script Properties → Add script property**:
   - *Property:* `KALIT`
   - *Value:* o'zingiz o'ylab topgan maxfiy so'z (masalan, `usta-mrg-7421`)
   → **Save script properties**.
4. **Joylashtirish → Yangi joylashtirish** → ⚙️ **Veb-ilova**:
   - *Kim nomidan bajariladi:* **Men**
   - *Kimga ruxsat:* **Hamma (Anyone)**
5. **Joylashtirish** → Google ruxsat so'raydi → **Ruxsat berish** (agar "tasdiqlanmagan ilova" desa: *Advanced → Go to …*).
6. Berilgan `https://script.google.com/macros/s/…/exec` havolani nusxalang.
7. Ilovada: **Yana → Sozlamalar → Google Sheets** → havola va kalitni kiriting → **Ulash**.

Shundan keyin jadvalda varaqlar paydo bo'ladi: *Tashriflar, Mijozlar, Qarzdorlar, Qarz to'lovlari, Xarajatlar, Navbatlar, Oylik hisobot*.

> Kodni o'zgartirsangiz: **Joylashtirish → Joylashtirishlarni boshqarish → ✏️ → Versiya: Yangi** — havola o'zgarmaydi.

## 2. Botga ulash

@BotFather → `/mybots` → botingiz → **Bot Settings → Menu Button** → GitHub Pages havolasini kiriting (masalan `https://xusniddin-del.github.io/usta-kassa/`) → tugma nomi: *Kassa*.

## Eslatmalar

- Boshqa telefondan Telegram orqali kirsangiz, Google Sheets ulanishi o'zi tiklanadi (Telegram CloudStorage).
- Internet bo'lmasa ham ishlaydi — ulanganda yuboradi.
- Ikki telefonda bir vaqtda yozilsa, yozuvlar birlashtiriladi.
- Rasmlar va PIN-kod faqat telefonda qoladi, jadvalga yuborilmaydi.
- Kalitni hech kimga bermang: havola va kalitni bilgan odam ma'lumotlarni o'qiy oladi.
