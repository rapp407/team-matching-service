# Database Setup Guide

## Migrations

Folder `migrations/` berisi SQL scripts untuk membuat schema database.

### Menjalankan Migration

#### Opsi 1: Via pgAdmin UI (Paling Mudah)
1. Buka pgAdmin di http://localhost:8080/
2. Login dengan email `admin@local.dev` dan password `admin123`
3. Buka database `mydb`
4. Klik "Query Tool" (ikon SQL)
5. Copy-paste isi file `migrations/001_initial_schema.sql`
6. Tekan Ctrl+Enter atau klik tombol Run

#### Opsi 2: Via CLI (psql)
Pastikan Docker container PostgreSQL sudah jalan, kemudian:

```bash
docker exec postgres-container psql -U admin -d mydb -f /dev/stdin < migrations/001_initial_schema.sql
```

Atau kalau psql installed di lokal:
```bash
psql -h localhost -U admin -d mydb -f migrations/001_initial_schema.sql
```
Password: `secret123`

#### Opsi 3: Via Node.js Script (Future)
Nanti bisa buat migration runner dengan package seperti `node-pg-migrate` atau `knex`.

## Backup & Reset

Kalau ingin reset database:
```bash
docker exec postgres-container psql -U admin -d mydb -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

Kemudian jalankan migration lagi.

## Verifikasi

Setelah migration, cek tabel di pgAdmin:
1. Expand database `mydb`
2. Expand `Schemas > public > Tables`
3. Harus ada 5 tabel: `pool_entries`, `teams`, `team_members`, `team_invites`, `team_join_requests`
