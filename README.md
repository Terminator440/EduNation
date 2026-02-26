# EduNation (Eduro)

Catalog școlar digital modern – **produs SaaS pentru școli și licee** – construit cu **Vite + React + TypeScript + Supabase**. Multi-tenant, RBAC, audit log, validări server-side și GDPR.

## 📋 Cuprins

- [Scopul Proiectului](#scopul-proiectului)
- [Stack Tehnic](#stack-tehnic)
- [Arhitectură](#arhitectură)
- [Multi-tenant și Roluri](#multi-tenant-și-roluri)
- [Securitate](#securitate)
- [Setup](#setup)
- [Testare](#testare)
- [Dezvoltare](#dezvoltare)
- [Deploy](#deploy)

## 🎯 Scopul Proiectului

EduNation este un **catalog digital SaaS** pentru școli și licee, conceput astfel încât:

- ✅ **Multi-tenant**: fiecare școală este izolată (school_id pe toate tabelele relevante, RLS)
- ✅ **RBAC**: roluri (admin/director, teacher, student, parent) cu permisiuni granulare
- ✅ **Audit log**: toate modificările de note/absențe sunt înregistrate; soft delete unde e cazul
- ✅ **Validări server-side**: note 1–10, blocare modificări după încheiere semestru, profesor doar la clasele alocate
- ✅ **GDPR**: export date utilizator, ștergere cont (soft delete)
- ✅ **Backend structurat**: api / services / repositories; logica critică în RPC-uri Supabase
- ✅ **Notificări**: in-app și (opțional) email la note noi / absențe
- ✅ **Rapoarte**: export CSV/PDF, situație școlară, catalog (jsPDF)

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
├── api/                   # Punct de intrare API (client Supabase, RPC)
├── repositories/          # Data access (DB); business logic în services/RPC
├── features/              # Module pe funcționalități (grades, attendance, admin, ...)
├── contexts/              # SchoolContext (multi-tenant)
├── components/            # UI reutilizabile (EmptyState, ErrorState, Spinner)
├── hooks/                 # useAuth, useSchool, usePermissions
├── lib/                   # permissions, logger, gdpr, error-handler
└── integrations/supabase/ # Client și tipuri generate
```

### Principii de Design

1. **Feature-Based Organization**: Fiecare feature are propriul director cu servicii și queries
2. **Separation of Concerns**: Logica de business este separată de UI
3. **Service Layer**: Toate apelurile Supabase trec prin servicii, nu direct din componente
4. **React Query**: Gestionarea datelor server se face prin hooks React Query
5. **Error Handling**: Sistem centralizat de gestionare erori cu notificări toast
6. **Type Safety**: TypeScript strict mode pentru siguranță maximă

### Multi-tenant și Roluri

- **Școli (schools)**: fiecare utilizator aparține unei școli (`profiles.school_id`). Tabelele `classes`, `students`, `grades`, `attendance`, `subjects` au `school_id`; RLS filtrează după `get_user_school_id()`.
- **Context școală**: `SchoolProvider` + `useSchool()` expun `schoolId` și detaliile școlii curente.
- **Roluri (app_role)**: `student`, `parent`, `teacher`, `homeroom_teacher`, `secretariat`, `director`, `uat_admin`, `developer`. Rolurile sunt în `user_roles`; permisiunile granulare sunt mapate în `lib/permissions.ts` și expuse prin `usePermissions()` și `RequirePermission`.

### Securitate

1. **RLS (Row Level Security)** – sursa de adevăr: toate interogările sunt filtrate după `school_id` și rol (profesor vede doar clasele alocate, elev doar notele proprii).
2. **Validări server-side**: note 1–10, semestru închis (nu se pot modifica notele), profesor doar la clasele asignate – verificate în RPC-uri (`add_grade`, `update_grade`, `delete_grade`) și în funcții helper (`user_can_edit_grade`, `is_semester_locked_for_grade`).
3. **Audit**: `audit_log` / `audit_logs` și `grade_audit` înregistrează modificări; soft delete pe `grades`/`attendance` (`deleted_at`).
4. **GDPR**: RPC `export_my_data` pentru export date personale; RPC `soft_delete_my_account` pentru ștergere cont (anonimizare profile). Jurnal acces: `login_logs`, `access_logs`.
5. **UI**: `ProtectedRoute` pe rute; `usePermissions().can(permission)` și `<RequirePermission permission="...">` pentru ascundere butoane/secțiuni.

**În producție, RLS și RPC-urile sunt autoritatea finală.**

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
   # Recomandat (sursa principală)
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co

   # Opțional: dacă lipsește URL, aplicația îl poate construi din project id
   VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF

   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_ANON_KEY

   # Opțional (pentru scripturi/CLI, NU prefixa cu VITE_)
   SUPABASE_DB_URL=postgresql://postgres:<password>@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
   DATABASE_URL=postgresql://postgres:<password>@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
   
   # Opțional: cod pentru înregistrare staff
   VITE_STAFF_SIGNUP_CODE=CHANGE_ME_TO_A_LONG_RANDOM_STRING
   
   # Opțional: bootstrap admin accounts
   VITE_BOOTSTRAP_ADMIN_EMAILS=admin@example.com
   ```

   Verifică rapid configurația Supabase:
   ```bash
   npm run check:supabase
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
- ✅ Mismatch URL/API key Supabase este detectat la startup
- ✅ Separarea clară între control UI și securitate DB
- ✅ Model de roluri extensibil pentru scenarii administrative complexe
- ✅ Error handling global cu notificări utilizator
- ✅ Retry logic pentru erori temporare de rețea

### Troubleshooting login: `NetworkError when attempting to fetch resource`

1. Rulează `npm run check:supabase`.
2. Verifică că:
   - `VITE_SUPABASE_URL` este de forma `https://<project_ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` este anon key din același proiect
   - dacă folosești `SUPABASE_DB_URL`/`DATABASE_URL`, host-ul DB conține același `<project_ref>`
   - URL-ul proiectului rezolvă DNS și endpoint-ul `/auth/v1/health` răspunde
3. Dacă folosești doar `VITE_SUPABASE_PROJECT_ID`, aplicația construiește automat URL-ul.

## 📚 Resurse

- [Documentație Vite](https://vitejs.dev/)
- [Documentație React](https://react.dev/)
- [Documentație Supabase](https://supabase.com/docs)
- [Documentație React Query](https://tanstack.com/query/latest)
- [Documentație Vitest](https://vitest.dev/)

## 📝 Licență

Proiect privat - toate drepturile rezervate.

---

**Cum se rulează proiectul:** `npm install` → `cp .env.example .env` (completează cu Supabase URL și anon key) → `npm run dev`. Aplică migrațiile Supabase: `supabase db push`.

**TODO-uri opționale rămase:** integrare Sentry pentru error logging; teste E2E Playwright (flux profesor adaugă notă / elev vede notă); trigger email la notă nouă/absență (backend); paginare pe toate listele mari.
