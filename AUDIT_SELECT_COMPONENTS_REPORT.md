# Raport audit componente Select / Dropdown

## Rezumat

Au fost auditate toate componentele de tip Select și Dropdown din aplicație. Problema principală era selecțiile care nu persistau sau dropdown-urile fără state de loading/empty corect.

---

## Componente afectate și soluții aplicate

### 1. **Schedule.tsx** – Select clasă (orar)

| Verificare | Înainte | După |
|------------|---------|------|
| value controlat | value={selectedClassId} – OK | value={selectedClassId \|\| undefined} |
| onValueChange | setSelectedClassId – OK | – |
| Inițializare | useMemo pentru setState (incorect) | useEffect pentru setState |
| Validare selecție | Lipsă | Reset când clasa nu mai există în listă |
| disabled | Lipsă | disabled când loading sau listă goală |
| placeholder | Fix | loading / empty / selectable |

**Cauză**: Folosirea `useMemo` pentru efecte colaterale (setState) – hook-ul corect este `useEffect`.

**Soluție**: Înlocuit `useMemo` cu `useEffect`, adăugat `disabled`, placeholder pentru loading/empty și validare pentru `selectedClassId`.

---

### 2. **Reports.tsx** – Select clasă

| Verificare | Înainte | După |
|------------|---------|------|
| value | value={classId} | value={classId \|\| undefined} |
| disabled | loading && classes.length === 0 | loading \|\| classes.length === 0 |
| placeholder | – | loading / empty / selectable |

**Cauză**: Condiția de disabled era prea restrânsă; la finalul loading-ului cu listă goală, dropdown-ul devenea activ fără opțiuni.

**Soluție**: `disabled={loading || classes.length === 0}` și placeholder explicit pentru fiecare stare.

---

### 3. **Reports.tsx** – Select elev

| Verificare | Înainte | După |
|------------|---------|------|
| value | value={selectedStudentId} | value={selectedStudentId \|\| undefined} |

**Soluție**: Adăugat `|| undefined` pentru a evita `value=""` când Radix Select se așteaptă la `undefined` pentru placeholder.

---

### 4. **SecretariatDashboard.tsx** – Select clasă (adăugare elev)

| Verificare | Înainte | După |
|------------|---------|------|
| value | value={newStudentClassId} | value={newStudentClassId \|\| undefined} |
| disabled | classesQuery.isLoading | classesQuery.isLoading \|\| classes.length === 0 |

**Cauză**: Dropdown-ul rămânea activ și cu listă goală după încărcare.

**Soluție**: `disabled` și când lista de clase este goală, plus `value={newStudentClassId || undefined}`.

---

### 5. **TeacherDashboard.tsx** – Select materie (notă și prezență)

| Verificare | Înainte | După |
|------------|---------|------|
| value | value={newGrade.subjectId} | value={newGrade.subjectId \|\| undefined} |
| disabled | Lipsă | subjects.length === 0 |
| placeholder | "Selectează materia" | "Nu există materii" când listă goală |

**Cauză**: Fără materii, dropdown-ul arăta opțiuni goale și nu exista feedback clar.

**Soluție**: `disabled={subjects.length === 0}` și placeholder pentru cazul fără materii.

---

### 6. **DeveloperDirectorInvites.tsx** – Select școală

| Verificare | Înainte | După |
|------------|---------|------|
| value | value={selectedSchoolId} | value={selectedSchoolId \|\| undefined} |
| disabled | loadingSchools | loadingSchools \|\| schoolsError |
| placeholder | – | "Nu aveți acces la aceste date" la eroare RLS |

**Cauză**: La eroare (ex. RLS), dropdown-ul părea activ fără explicație.

**Soluție**: `disabled` când există eroare și mesaj explicit: „Nu aveți acces la aceste date”.

---

## Componente verificate, fără modificări

### TakeAttendance.tsx – Select status prezență
- value: `statuses[s.id] ?? "present"` – OK
- onValueChange – OK
- State inițial – OK

### SchoolCalendar.tsx – Select tip eveniment
- value: `newEvent.type` – inițializat cu 'event' – OK
- onValueChange – OK

### Schedule.tsx – Select vizualizare (Pe clasă / Orarul meu)
- value: `viewMode` – OK
- onValueChange – OK

### RoleSwitcher – DropdownMenu
- DropdownMenu cu DropdownMenuItem – nu e Select controlat
- Comportament corect cu `onClick` pentru schimbare rol

### CreateInvitationDialog – Select rol și valabilitate
- value și onValueChange – OK
- State resetat la deschidere – OK

### HomeroomDashboard – Checkbox pentru selecție absențe
- Folosește Checkbox, nu Select – OK

### Grades.tsx – Tabel cu click pentru selecție
- Folosește `selectedRowKey` și click pe rând – nu e Select

---

## Pattern normalizat aplicat

1. **loading state**: `disabled={loading}` și placeholder „Se încarcă...”
2. **empty state**: `disabled={array.length === 0}` și placeholder „Nu există [resurse]”
3. **error state (RLS)**: `disabled={!!error}` și placeholder „Nu aveți acces la aceste date”
4. **value**: `value={val || undefined}` pentru a evita `value=""` incompatibil cu Radix
5. **onValueChange**: legat clar de state-ul componentelor

---

## Pagini critice verificate

| Pagină | Rol | Status |
|--------|-----|--------|
| Attendance | student, parent | OK – nu are Select |
| TakeAttendance | teacher, homeroom | OK |
| Grades | student, parent | OK |
| Reports | teacher, homeroom, secretariat, director | OK – corecții aplicate |
| SecretariatDashboard | secretariat | OK – corecții aplicate |
| Invitations | director, developer | OK – corecții aplicate |
| Schedule | teacher, homeroom, director | OK – corecții aplicate |
| RoleSwitcher | toți | OK |

---

## Concluzie

- Toate Select-urile au acum `value` și `onValueChange` corect legate de state.
- Au fost adăugate `disabled` și placeholder pentru loading, empty și error.
- `useMemo` pentru efecte colaterale a fost înlocuit cu `useEffect` în Schedule.
- Nu au fost găsite componente orfane sau dropdown-uri cu opțiuni hardcodate fără logică.
