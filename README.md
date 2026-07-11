# SlotMerge

Runnable foundation for the SlotMerge MVP.

## Development

1. Install dependencies with `pnpm install`.
2. Set `DATABASE_URL` to a PostgreSQL database URL.
3. Set `SESSION_SECRET` to a high-entropy string of at least 32 characters.
4. Apply migrations with `pnpm db:migrate`.
5. Start the app with one command: `pnpm dev`.

The initial app shell intentionally ships no product workflows beyond the protected `/me` foundation.
