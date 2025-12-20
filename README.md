# EduRO

Catalog școlar digital (Vite + React + Supabase) generat/iterat în Lovable.

## Rulare locală

### 1) Cerințe
- Node.js 18+ (sau Bun)
- Un proiect Supabase (URL + anon key)

### 2) Configurează variabilele de mediu
Copiază fișierul exemplu și completează valorile:

```sh
cp .env.example .env
```

Variabile necesare:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key Supabase)

> Important: `.env` este ignorat de Git. Nu comite chei reale.

### 3) Instalează dependențele și pornește
Cu Bun (recomandat aici, există `bun.lockb`):

```sh
bun install
bun run dev
```

Cu npm:

```sh
npm i
npm run dev
```

## Supabase

Migrațiile se află în `supabase/migrations/`.

Pentru producție:
- confirmă că RLS (Row Level Security) e activ pe toate tabelele
- confirmă că politicile pentru roluri corespund exact rolurilor din aplicație (`student`, `parent`, `teacher`, `homeroom_teacher`, `secretariat`, `director`, `uat_admin`)

## CI

Repository-ul include un workflow GitHub Actions care rulează lint + build la push/PR pe `main`.

## Deploy

### Deploy în Lovable
În Lovable: Share → Publish.

### Deploy în alt hosting (Vercel/Netlify/etc.)
- rulează build: `bun run build` (sau `npm run build`)
- setează variabilele de mediu în platforma de deploy:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

## Note despre producție

- Variabilele de mediu sunt validate la startup. Dacă lipsesc, aplicația va da eroare explicită (mai bine decât “merge pe local, moare în prod”).
- Rolurile sunt enforce-uite atât în UI (routing), cât și în DB (RLS). Pentru producție, DB este “adevărul”.
