EduNation

Catalog școlar digital modern construit cu Vite + React + Supabase.
Proiect orientat pe arhitectură sigură, separare clară a responsabilităților și control riguros al accesului pe roluri.

Scopul proiectului

EduNation este o aplicație web pentru gestionarea situației școlare, concepută astfel încât:

să ofere acces diferențiat pe roluri (elev, părinte, profesor etc.)

să asigure protecția datelor prin politici la nivel de bază de date (RLS)

să fie scalabilă și ușor de extins

să respecte principiul „database-ul este sursa adevărului”

Structura și logica aplicației sunt controlate manual.

Stack Tehnologic

Frontend:

React

Vite

TypeScript

Backend & Bază de date:

Supabase (PostgreSQL + Auth + RLS)

CI:

GitHub Actions (lint + build automat la push/PR)

Arhitectură și securitate

Controlul accesului este implementat pe două niveluri:

UI (routing și interfață) – ascunde funcționalități în funcție de rol

Database (Row Level Security) – restricționează efectiv accesul la date

Roluri implementate:

student

parent

teacher

homeroom_teacher

secretariat

director

uat_admin

În producție, RLS este autoritatea finală. UI-ul doar reflectă permisiunile.

Rulare locală
1) Cerințe

Node.js 18+ sau Bun

Proiect Supabase (URL + anon key)

2) Configurare mediu
cp .env.example .env


Variabile necesare:

VITE_SUPABASE_URL

VITE_SUPABASE_PUBLISHABLE_KEY

Fișierul .env este ignorat de Git. Cheile reale nu trebuie comise.

3) Instalare și pornire

Cu Bun:

bun install
bun run dev


Cu npm:

npm install
npm run dev

Supabase

Migrațiile se află în:

supabase/migrations/

Aplicare migrații: `supabase db push` (sau din Dashboard → SQL Editor). Dacă apare eroarea „Could not find the function public.create_invitation(...)”, rulează conținutul fișierului `supabase/migrations/20260214100000_ensure_create_invitation_rpc.sql` în SQL Editor, apoi reîncarcă aplicația.

Pentru producție:

verificați că RLS este activ pe toate tabelele

validați politicile pentru fiecare rol

confirmați că permisiunile din DB corespund exact logicii aplicației

Deploy

Alte platforme (Vercel, Netlify etc.)

bun run build sau npm run build

setați variabilele de mediu:

VITE_SUPABASE_URL

VITE_SUPABASE_PUBLISHABLE_KEY

Considerații pentru producție

Variabilele de mediu sunt validate la startup

Orice lipsă produce eroare explicită

Separarea clară între control UI și securitate DB

Model de roluri extensibil pentru scenarii administrative complexe