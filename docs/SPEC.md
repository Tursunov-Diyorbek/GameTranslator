# GameTranslator — spetsifikatsiya

O‘yindagi matnni skrinshot orqali o‘qib, o‘zbekchaga tarjima qiladigan va qisqa izoh beradigan veb-ilova.

## Maqsad

O‘yin paytida kerakli joyni suratga olish → surat avtomatik saytga tushishi → sun’iy intellekt matnni o‘qishi → o‘zbekcha tarjima + qisqa izoh chiqishi. Tarjima imkon qadar tez bo‘lishi kerak.

## Asosiy oqim

1. Foydalanuvchi **Sozlamalar**da bitta klaviatura harfini (A–Z) biriktiradi. Standart: `T`.
2. Gemini API kalitini kiritadi (brauzer `localStorage`da saqlanadi).
3. **Start** bosiladi → brauzer o‘yin oynasi/ekranini ulashni so‘raydi (`getDisplayMedia`).
4. Ulanish muvaffaqiyatli bo‘lsa holat **Faol**. **Stop** oqimni uzadi, holat **Faol emas**.
5. Faol paytda biriktirilgan harf bosilsa (yoki «Suratga olish» tugmasi):
   - ulangan ekrandan kadр olinadi;
   - kesish (crop) oynasi ochiladi;
   - foydalanuvchi kerakli joyni sichqoncha bilan belgilaydi;
   - belgilash tugashi bilan surat **avtomatik** tarjimaga yuboriladi (qo‘shimcha «yuklash» tugmasi yo‘q).
6. Natija: asl matn, o‘zbekcha tarjima, qisqa izoh, skrinshot. Tarixda saqlanadi.

## Tezlik qoidalari

- Ekran ulanishi Start paytida bir marta olinadi, har safar qayta so‘ralmaydi.
- Kadr `video` oqimidan darhol olinadi.
- JPEG, sifat ~0.75, eng katta tomoni 1280px.
- Bitta AI so‘rovi: OCR + tarjima + izoh.
- Gemini Flash, `thinkingBudget: 0`, past temperatura, JSON javob.
- Backend yo‘q — bevosita Gemini (ortiqcha tarmoq sakrashi yo‘q).

## Brauzer cheklovi

Sayt o‘yin **fokusda** bo‘lganda global klavishni eshitolmaydi. Shuning uchun:

- Start dan keyin tarjimon oynasi ochiq qolishi kerak (ikkinchi monitor yoki yon panel yaxshi).
- Harf ishlashi uchun tarjimon oynasi fokusda bo‘lishi kerak.
- Fokus bo‘lmasa ham **Suratga olish** tugmasi ishlaydi.

Keyinchalik desktop (global hotkey) qo‘shilishi mumkin — hozircha veb.

## UI

- Til: o‘zbekcha.
- Qorong‘i, HUD uslubidagi zamonaviy interfeys.
- Start/Stop, holat indikator, sozlamalar, jonli preview, natija kartasi, tarix.
- Crop: Enter = butun surat, Esc = bekor.

## Sozlamalar (`localStorage`)

- `hotkey`: bitta harf
- `apiKey`: Gemini kaliti
- `history`: oxirgi 20 tarjima

## AI chiqishi

```json
{
  "original": "ekrandagi asl matn",
  "translation": "o‘zbekcha tarjima",
  "note": "bu matn nima haqida — 1–2 jumla"
}
```

Matn bo‘lmasa ham JSON qaytadi, `note`da sabab yoziladi.
