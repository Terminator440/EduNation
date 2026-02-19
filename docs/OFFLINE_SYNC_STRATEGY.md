# Strategie de rezolvare a conflictelor (Offline Sync)

## Principiu

Când aplicația revine online după lucru offline:

1. **Audit log-urile mai noi au prioritate** – Nu se suprascrie niciodată o înregistrare din `audit_logs` cu o versiune mai veche. Serverul păstrează `created_at` și `old_data`/`new_data`.
2. **Note și absențe** – Modificările se fac prin soft delete (`deleted_at`) și INSERT/UPDATE. La sync:
   - Clientul trimite operațiile locale (queue de mutații) către API.
   - Serverul aplică doar dacă semestrul nu e blocat și RLS permite.
   - Dacă un rând a fost deja modificat pe server (ex: alt device), se consideră **server-wins** pentru acel rând; clientul primește eroare de conflict și poate reîncărca datele (React Query invalidează cache).
3. **Evitarea request-urilor inutile** – Folosim React Query cu `staleTime` și `invalidateQueries` la mutații, astfel încât la reconectare refetch-ul să aducă starea actuală de pe server.

## Implementare

- **Coada de acțiuni** este persistenată în IndexedDB (`edunation_offline_queue`). La eșec de rețea (failed to fetch, offline), mutațiile pentru note și absențe sunt adăugate în coadă; la succes, mutația nu este pusă în coadă.
- **Tipuri în coadă**: `add_grade`, `update_grade`, `delete_grade`, `add_attendance`, `update_attendance`, `delete_attendance`.
- **La revenirea online** (event `online` sau deschidere tab cu conexiune): se procesează coada în ordine. La succes, rândul e șters din coadă și se invalidează cache-ul React Query. La eroare de conflict (409 / semestru blocat), rândul e șters din coadă, se notifică utilizatorul și se reîncarcă datele (invalidateQueries).
- **UI**: banner-ul de offline afișează numărul de acțiuni în așteptare când utilizatorul e fără conexiune; la adăugare în coadă se afișează toast „Salvat local. Se va sincroniza automat când revii online.”
