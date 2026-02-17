# EduNation

Catalog școlar digital modern construit cu **Vite + React + TypeScript + Supabase**. Proiect orientat pe arhitectură sigură, separare clară a responsabilităților și control riguros al accesului pe roluri.

## 📋 Cuprins

- [Scopul Proiectului](#scopul-proiectului)
- [Stack Tehnic](#stack-tehnic)
- [Arhitectură](#arhitectură)
- [Setup](#setup)
- [Testare](#testare)
- [Dezvoltare](#dezvoltare)
- [Deploy](#deploy)

## 🎯 Scopul Proiectului

EduNation este o aplicație web pentru gestionarea situației școlare, concepută astfel încât:

- ✅ să ofere acces diferențiat pe roluri (elev, părinte, profesor, director etc.)
- ✅ să asigure protecția datelor prin politici la nivel de bază de date (RLS)
- ✅ să fie scalabilă și ușor de extins
- ✅ să respecte principiul „database-ul este sursa adevărului"
- ✅ să ofere experiență utilizator excelentă cu feedback vizual pentru toate acțiunile

## 🛠 Stack Tehnic

### Frontend
- **React 18** - Biblioteca UI
- **TypeScript** - Tipizare strictă pentru siguranță
- **Vite** - Build tool rapid și modern
- **Tailwind CSS** - Stilizare utilitară
- **React Router** - Navigare și routing
- **React Query (TanStack Query)** - Gestionare state server și caching
- **Radix UI** - Componente UI accesibile
- **Sonner** - Notificări toast moderne

### Backend & Bază de Date
- **Supabase** - PostgreSQL + Authentication + Row Level Security (RLS)
- **Supabase JS Client** - Client oficial pentru integrare

### Testare
- **Vitest** - Framework de testare rapid
- **React Testing Library** - Testare componentă React
- **jsdom** - Environment DOM pentru teste

### Tooling
- **ESLint** - Linting cu reguli stricte
- **TypeScript Strict Mode** - Verificare tipuri strictă
- **GitHub Actions** - CI/CD automat

## 🏗 Arhitectură

Proiectul folosește o **arhitectură bazată pe Features** care separă clar logica de business de interfața utilizatorului.

### Structura Directoarelor

```
src/
├── features/              # Module de business organizate pe funcționalități
│   ├── auth/
│   │   └── services/     # Servicii de autentificare
│   ├── grades/
│   │   └── services/     # Servicii pentru note
│   ├── attendance/
│   │   └── services/     # Servicii pentru prezență
│   ├── academics/
│   │   └── queries.ts    # React Query hooks pentru date academice
│   ├── secretariat/
│   │   └── queries.ts    # React Query hooks pentru secretariat
│   └── calendar/
│       └── queries.ts    # React Query hooks pentru calendar
│
├── components/            # Componente UI reutilizabile
│   ├── ui/               # Componente UI de bază (Button, Card, etc.)
│   ├── layouts/          # Layout-uri (DashboardLayout)
│   └── dashboard/        # Componente specifice dashboard
│
├── pages/                 # Pagini/rute ale aplicației
├── hooks/                 # Custom React hooks
├── lib/                   # Utilitare și helpers
│   ├── error-handler.ts   # Gestionare erori globală cu toast
│   └── supabase-helpers.ts # Helpers pentru Supabase
│
└── integrations/          # Integrări externe (Supabase client)
```

### Principii de Design

1. **Feature-Based Organization**: Fiecare feature are propriul director cu servicii și queries
2. **Separation of Concerns**: Logica de business este separată de UI
3. **Service Layer**: Toate apelurile Supabase trec prin servicii, nu direct din componente
4. **React Query**: Gestionarea datelor server se face prin hooks React Query
5. **Error Handling**: Sistem centralizat de gestionare erori cu notificări toast
6. **Type Safety**: TypeScript strict mode pentru siguranță maximă

### Securitate

Controlul accesului este implementat pe două niveluri:

1. **UI (routing și interfață)** – ascunde funcționalități în funcție de rol
2. **Database (Row Level Security)** – restricționează efectiv accesul la date

**Roluri implementate:**
- `student` - Elev
- `parent` - Părinte
- `teacher` - Profesor
- `homeroom_teacher` - Diriginte
- `secretariat` - Secretariat
- `director` - Director
- `uat_admin` - Administrator UAT
- `developer` - Dezvoltator

**În producție, RLS este autoritatea finală. UI-ul doar reflectă permisiunile.**

## 🚀 Setup

### Cerințe

- **Node.js 18+** sau Bun
- **Proiect Supabase** (URL + anon key)

### Instalare

1. **Clonează repository-ul**
   ```bash
   git clone <repository-url>
   cd eduro
   ```

2. **Instalează dependențele**
   ```bash
   npm install
   # sau
   bun install
   ```

3. **Configurează variabilele de mediu**
   ```bash
   cp .env.example .env
   ```

   Editează `.env` și adaugă valorile tale:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_ANON_KEY
   
   # Opțional: cod pentru înregistrare staff
   VITE_STAFF_SIGNUP_CODE=CHANGE_ME_TO_A_LONG_RANDOM_STRING
   
   # Opțional: bootstrap admin accounts
   VITE_BOOTSTRAP_ADMIN_EMAILS=admin@example.com
   ```

4. **Pornește serverul de dezvoltare**
   ```bash
   npm run dev
   # sau
   bun run dev
   ```

   Aplicația va fi disponibilă la `http://localhost:8080`

### Supabase Setup

Migrațiile se află în `supabase/migrations/`

**Aplicare migrații:**
```bash
supabase db push
```

Sau din Supabase Dashboard → SQL Editor

**Notă:** Dacă apare eroarea „Could not find the function public.create_invitation(...)", rulează conținutul fișierului `supabase/migrations/20260214100000_ensure_create_invitation_rpc.sql` în SQL Editor.

**Pentru producție:**
- Verifică că RLS este activ pe toate tabelele
- Validează politicile pentru fiecare rol
- Confirmă că permisiunile din DB corespund exact logicii aplicației

## 🧪 Testare

Proiectul folosește **Vitest** și **React Testing Library** pentru testare.

### Rulare Teste

```bash
# Rulează testele în mod watch (recomandat pentru dezvoltare)
npm test

# Rulează testele o singură dată
npm test -- --run

# Deschide UI interactiv pentru testare
npm run test:ui

# Generează raport de coverage
npm run test:coverage
```

### Structura Testelor

Testele sunt organizate alături de codul sursă:

```
src/
├── features/
│   └── auth/
│       └── services/
│           ├── auth.service.ts
│           └── auth.service.test.ts    # Teste pentru serviciu
│
└── components/
    └── ui/
        ├── button.tsx
        └── button.test.tsx             # Teste pentru componentă
```

### Exemple de Teste

- **Teste pentru servicii**: Mock Supabase client și verifică logica de business
- **Teste pentru componente**: Render și interacțiuni utilizator
- **Coverage**: Target 100% pentru servicii critice

## 💻 Dezvoltare

### Adăugare Feature Nou

1. **Creează structura feature-ului**
   ```
   src/features/nou-feature/
   ├── services/
   │   └── nou-feature.service.ts
   └── queries.ts
   ```

2. **Implementează serviciul**
   - Folosește `handleServiceError()` pentru erori
   - Folosește `showSuccessMessage()` pentru confirmări
   - Returnează tipuri TypeScript clare

3. **Creează React Query hooks**
   - Folosește `useQuery` pentru date readonly
   - Folosește `useMutation` pentru modificări

4. **Adaugă teste**
   - Teste pentru serviciu
   - Teste pentru componente (dacă e cazul)

### Error Handling

Toate serviciile folosesc sistemul centralizat de gestionare erori:

```typescript
import { handleServiceError, showSuccessMessage } from "@/lib/error-handler";

try {
  // Operatiune Supabase
  if (error) {
    handleServiceError(error, "Context acțiune");
    throw error;
  }
  showSuccessMessage("Succes", "Descriere acțiune");
} catch (error) {
  handleServiceError(error, "Context acțiune");
  throw error;
}
```

### React Query Configuration

QueryClient este configurat cu:
- **Retry logic**: Reîncearcă automat la erori de rețea (max 2 încercări)
- **Exponential backoff**: Delay progresiv între încercări
- **Stale time**: 5 minute pentru date cached
- **No retry pentru mutations**: Mutările nu se reîncearcă automat

## 📦 Deploy

### Build pentru Producție

```bash
npm run build
# sau
bun run build
```

Build-ul va fi generat în directorul `dist/`

### Variabile de Mediu

Setează următoarele variabile în platforma de hosting:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_STAFF_SIGNUP_CODE` (opțional)
- `VITE_BOOTSTRAP_ADMIN_EMAILS` (opțional)

### Platforme Recomandate

- **Vercel** - Deploy automat din Git
- **Netlify** - Deploy automat din Git
- **Supabase Hosting** - Integrare nativă

### Considerații pentru Producție

- ✅ Variabilele de mediu sunt validate la startup
- ✅ Orice lipsă produce eroare explicită
- ✅ Separarea clară între control UI și securitate DB
- ✅ Model de roluri extensibil pentru scenarii administrative complexe
- ✅ Error handling global cu notificări utilizator
- ✅ Retry logic pentru erori temporare de rețea

## 📚 Resurse

- [Documentație Vite](https://vitejs.dev/)
- [Documentație React](https://react.dev/)
- [Documentație Supabase](https://supabase.com/docs)
- [Documentație React Query](https://tanstack.com/query/latest)
- [Documentație Vitest](https://vitest.dev/)

## 📝 Licență

Proiect privat - toate drepturile rezervate.

---

**Notă:** Acest README este menit să ofere o înțelegere rapidă a proiectului. Pentru detalii tehnice specifice, consultă codul sursă și comentariile inline.
