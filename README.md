## Acuvia Scaffolding

This repo is currently scaffold-only and intentionally does not include full app implementations yet.

Required top-level app folders:

- `apps/backend`
- `apps/nurse-ui`
- `apps/patient-ui`

## Current Structure

```txt
.
├── apps
│   ├── backend
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── routes/
│   │   │   └── services/
│   │   ├── README.md
│   │   └── package.json
│   ├── nurse-ui
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── screens/
│   │   │   └── services/
│   │   ├── assets/
│   │   ├── .env.example
│   │   ├── README.md
│   │   └── package.json
│   └── patient-ui
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   └── services/
│       ├── public/
│       ├── .env.example
│       ├── README.md
│       └── package.json
└── package.json
```

## Notes

- Backend is intended to use direct Supabase Postgres connection string (`SUPABASE_DB_URL`) once implementation starts.
- `nurse-ui` is intended for React Native + Expo (Expo Go testable) implementation later.
- `patient-ui` is intended for the web portal implementation later.
