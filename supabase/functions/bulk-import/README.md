# Edge Function: bulk-import

Creează utilizatori în masă (auth.users + profiles + students/user_roles) pentru elevi și profesori.

## Variabile de mediu

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – setate automat în Supabase.
- **`SUPABASE_ANON_KEY`** – trebuie setată manual (Secret) pentru a verifica JWT-ul apelantului. Folosiți cheia anon (publică) din Dashboard → Settings → API.

## Autorizare

Doar utilizatori cu roluri `director`, `secretariat` sau `uat_admin` și cu `school_id` setat în profil pot apela funcția. Trimiteți header-ul `Authorization: Bearer <access_token>`.

## Body

```json
{
  "rows": [
    {
      "role": "student",
      "email": "elev@example.ro",
      "full_name": "Nume Elev",
      "cnp": "1900101123456",
      "phone": null,
      "class_id": "uuid-clasa"
    }
  ]
}
```

Pentru profesori, `class_id` se omite. Validarea (email, CNP, clasă existentă) se face în frontend și prin RPC `validate_bulk_import_rows` înainte de apelarea acestei funcții.
