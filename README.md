# Baseline Wellness

A personal nutrition, bodyweight, and strength tracker built with FastAPI,
SQLAlchemy, PostgreSQL, Next.js, and React.

## Run with Docker

```bash
docker volume create macrotracker_macro_data
docker compose up --build
```

Open:

- App: http://localhost:3000
- API docs: http://localhost:8000/docs

The Docker Compose project is named `baseline-wellness`, independent of the
checkout directory. PostgreSQL data is retained in the external
`macrotracker_macro_data` Docker volume; its original name is preserved to keep
existing data through the project rename. The volume creation command above is
safe to repeat and leaves an existing volume intact. The API creates its tables
on startup.

## Local development

Start PostgreSQL (the Compose database is convenient):

```bash
docker volume create macrotracker_macro_data
docker compose up db -d
```

Then run the API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

And the web app in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Optional environment variables:

- Backend: `DATABASE_URL`, `FRONTEND_URL`
- Frontend build: `NEXT_PUBLIC_API_URL`

## Export history

Open **Export** beside **View trends** or in the trends navigation. Choose an
inclusive date range, then download or copy JSON for discussion with a chatbot.
The file includes every date, recorded bodyweights, food/meal entries and all
tracked nutrient totals, strength sets, and cardio sessions. Units and notes
explain missing logs and already-scaled food quantities.

The same JSON is available from `GET /export?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
on the API. Exports support up to 3,660 days per request. Unlogged bodyweights and
daily nutrition totals are `null`; missing training is represented by empty arrays.
