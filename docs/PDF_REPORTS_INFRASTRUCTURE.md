# Infrastructură rapoarte PDF

Pregătire pentru generarea rapoartelor PDF: situație elev, foaie matricolă, catalog per clasă.

## Surse de date în DB

- **Export date elev (GDPR)**: RPC `public.export_student_data(p_student_id)` returnează JSON cu datele elevului. Poate fi folosit pentru situație elev / foaie matricolă.
- **Medii cu teză**: RPC `public.calculate_semester_average_with_teza(p_student_id, p_subject_id, p_semester, p_academic_year, p_teza_weight)` returnează `partial_average`, `teza_grade`, `weighted_average`, `final_grade_rounded`.
- **Medii generale**: RPC `public.calculate_student_averages(...)` pentru medii pe materii/semestru.
- **Catalog clasă**: interogări pe `grades`, `students`, `subjects`, `classes` filtrate pe `class_id` și semestru/an; RLS limitează la școala utilizatorului.

## Implementare recomandată

1. **Edge Function (Supabase)** sau serviciu backend care:
   - primește parametri (ex: `student_id`, `class_id`, `report_type: 'situatie' | 'foaie_matricola' | 'catalog_clasa'`);
   - apelează RPC-urile și tabelele de mai sus (cu service role key pentru a bypassa RLS unde e necesar);
   - generează PDF (ex: cu bibliotecă Node.js: `pdfkit`, `puppeteer` sau `@react-pdf/renderer` pe server).
2. **Frontend**: buton „Descarcă PDF” care apelează Edge Function sau API-ul de rapoarte și descarcă fișierul returnat.

## Securitate

- RLS și RPC-urile existente (ex: `export_student_data`) restricționează accesul la date la școala utilizatorului / drepturi director/admin.
- Edge Function trebuie să verifice JWT și să permită doar roluri autorizate (director, secretariat, admin) înainte de a genera raportul.
