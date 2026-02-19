# Strategie de rezolvare a conflictelor (Offline Sync)

## Principiu

Când aplicația revine online după lucru offline:

1. **Audit log-urile mai noi au prioritate** – Nu se suprascrie niciodată o înregistrare din `audit_logs` cu o versiune mai veche. Serverul păstrează `created_at` și `old_data`/`new_data`.
2. **Note și absențe** – Modificările se fac prin soft delete (`deleted_at`) și INSERT/UPDATE. La sync:
   - Clientul trimite operațiile locale (queue de mutații) către API.
   - Serverul aplică doar dacă semestrul nu e blocat și RLS permite.
   - Dacă un rând a fost deja modificat pe server (ex: alt device), se consideră **server-wins** pentru acel rând; clientul primește eroare de conflict și poate reîncărca datele (React Query invalidează cache).
3. **Evitarea request-urilor inutile** – Folosim React Query cu `staleTime` și `invalidateQueries` la mutații, astfel încât la reconectare refetch-ul să aducă starea actuală de pe server.

## Implementare recomandată

- Păstrarea unei cozi locale de mutații (ex: IndexedDB) doar pentru cazul în care request-ul eșuează (rețea); la succes, mutația e ștearsă din coadă.
- La revenirea online: procesare coadă în ordine; la eroare 409/conflict, nu suprascrie pe server, reîncarcă resursa și notifică utilizatorul.
