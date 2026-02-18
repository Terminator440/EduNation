# Security Audit – RLS (Row Level Security)

## Rezumat

- **grades** și **final_grades**: un elev vede doar notele proprii (legătura prin `students.user_id = auth.uid()`). Schimbarea ID-ului în URL sau în API (ex: `.eq('student_id', 'uuid-coleg')`) nu expune date: RLS se aplică pe server și returnează doar rândurile permise.
- **students**: remediat – înainte orice user cu `school_id` (inclusiv elevi) putea vedea toți elevii școlii. Acum:
  - **Elev**: doar rândurile unde `user_id = auth.uid()`.
  - **Părinte**: doar elevii asociați prin `parent_student_relations`.
  - **Profesori / staff**: toți elevii din școala utilizatorului (conform rolului).

## Verificare manuală în consola browserului

Autentificat ca **elev**:

```js
const { data: me } = await supabase.from('students').select('id').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single();
// Doar propriul tău student_id
console.log(me?.id);

// Încearcă să citești notele unui coleg (înlocuie UUID_COLEG cu un id de student altul)
const { data: grades } = await supabase.from('grades').select('*').eq('student_id', 'UUID_COLEG');
// Trebuie să fie [] (sau doar notele tale dacă UUID_COLEG e al tău)
console.log(grades);

// Încearcă note finale ale altui elev
const { data: fg } = await supabase.from('final_grades').select('*').eq('student_id', 'UUID_COLEG');
// Trebuie să fie []
console.log(fg);

// Lista de elevi: trebuie să conțină doar propriul tău rând
const { data: students } = await supabase.from('students').select('id, full_name, user_id');
console.log(students); // length 1, user_id = auth.uid()
```

După migrarea `20260222000003_rls_security_audit_students_grades.sql`, aceste verificări trebuie să confirme că elevul nu vede note sau final_grades ale colegilor și nu vede lista completă de elevi.

## Politici verificate

| Tabel            | Elev                          | Părinte              | Profesor / Staff                    |
|------------------|-------------------------------|----------------------|-------------------------------------|
| **grades**       | Doar note proprii (student_id → user_id = auth.uid()) | Doar note copii (parent_student_relations) | După clasă/subject + school_id      |
| **final_grades** | Doar note finale proprii      | Doar note finale copii | După clasă/subject sau toate din școală |
| **students**     | Doar propriul rând (user_id = auth.uid()) | Doar copiii asociați | Toți elevii din școală              |

Toate politicile relevante cer acum explicit `auth.uid() IS NOT NULL` unde e cazul, astfel că requesturile neautentificate nu trec RLS.
