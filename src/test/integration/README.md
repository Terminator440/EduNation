# Teste de integrare – securitate

Testele din acest folder verifică scenarii critice de securitate (RLS pe grades) prin apeluri directe la API-ul Supabase, cu utilizatori autentificați.

## Ce testează

1. **Un elev încearcă să modifice o notă** – trebuie să eșueze (elevii nu au policy UPDATE pe `grades`).
2. **Un profesor încearcă să pună o notă într-un semestru închis** – trebuie să eșueze (RLS verifică `is_semester_locked_for_grade`).
3. **Un părinte încearcă să vadă notele altui copil** – trebuie să primească 0 rânduri (RLS filtrează după `parent_student_relations`).
4. **Cross-School Access**: un profesor de la Școala A încearcă să citească (SELECT) notele unui elev de la Școala B (Liceul Cucu) – trebuie să primească 0 rânduri (RLS filtrează după `school_id`).

Dacă un test **trece** (operația reușește) acolo unde securitatea ar fi trebuit să blocheze, este raportat în suite-ul **Security report** și fail-uiește build-ul.

## Configurare

- **Obligatoriu**: `VITE_SUPABASE_URL` și `VITE_SUPABASE_PUBLISHABLE_KEY` (de ex. din `.env` sau `.env.test`). Fără ele, toate testele din acest fișier sunt **skip**.
- **Opțional** (pentru rularea efectivă a scenariilor):
  - `VITE_TEST_STUDENT_EMAIL` / `VITE_TEST_STUDENT_PASSWORD` – elev care are cel puțin o notă.
  - `VITE_TEST_TEACHER_EMAIL` / `VITE_TEST_TEACHER_PASSWORD` – profesor (pentru testul semestru închis și pentru a obține id-uri elevi la testul părinte).
  - `VITE_TEST_PARENT_EMAIL` / `VITE_TEST_PARENT_PASSWORD` – părinte legat de cel puțin un copil.
  - `VITE_TEST_TEACHER_SCHOOL_B_EMAIL` / `VITE_TEST_TEACHER_SCHOOL_B_PASSWORD` – profesor de la o altă școală (ex. Liceul Cucu / Școala B), pentru testul Cross-School Access.
  - `VITE_TEST_DIRECTOR_EMAIL` / `VITE_TEST_DIRECTOR_PASSWORD` – director sau secretariat (aceeași școală ca profesorul); folosit pentru setup/cleanup la testul **Semestru Închis**: blochează temporar semestrul 2022/1, rulează testul, apoi revine la starea inițială. Fără aceste credențiale, testul rulează doar dacă există deja un semestru blocat; altfel se afișează un warning.

Exemplu `.env.test` (nu se versiona cu parole reale):

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_TEST_STUDENT_EMAIL=elev@test.local
VITE_TEST_STUDENT_PASSWORD=***
VITE_TEST_TEACHER_EMAIL=profesor@test.local
VITE_TEST_TEACHER_PASSWORD=***
VITE_TEST_PARENT_EMAIL=parinte@test.local
VITE_TEST_PARENT_PASSWORD=***
VITE_TEST_TEACHER_SCHOOL_B_EMAIL=profesor.liceul.cucu@test.local
VITE_TEST_TEACHER_SCHOOL_B_PASSWORD=***
VITE_TEST_DIRECTOR_EMAIL=director@test.local
VITE_TEST_DIRECTOR_PASSWORD=***
```

## Rulare

```bash
npm run test -- --run src/test/integration/grades-security.integration.test.ts
```

**Testul 2 (Semestru Închis)** are logică de setup/cleanup:
- Dacă ai configurat **director** (`VITE_TEST_DIRECTOR_EMAIL` / `VITE_TEST_DIRECTOR_PASSWORD`): se creează sau se marchează temporar semestrul 2022/1 ca blocat (`is_locked = true`), se rulează testul, apoi se face cleanup (revenire la starea inițială).
- Fără director: se încearcă blocarea semestrului ca **profesor** (eșuează din cauza RLS); se afișează un **warning** clar. Testul asertează blocarea doar dacă există deja un semestru blocat în DB.
