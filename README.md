# RestaurantCall AI

Hackathon MVP for a restaurant phone ordering workflow. The backend exposes menu, order, stock, Twilio, WebSocket, and Stripe webhook surfaces. The frontend provides staff sign-in, a live kitchen board, and menu availability controls.

## Run locally

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/login`. The default demo credentials are `staff` / `securepassword`; configure them through `frontend/.env.local` for a real demo. Set `NEXT_PUBLIC_API_URL` to the deployed FastAPI URL. Backend secrets belong in `backend/.env` and are never committed.

## Tax calculation

The MVP uses an 825 basis-point tax rate (8.25%) and calculates tax on the combined integer-cent subtotal. Fractional tax cents are floored consistently, so a subtotal of 3097 cents produces 255 tax cents from the exact pre-rounded value 255.5025.

## Production wiring

Replace the in-memory stores in `backend/app/main.py` with the supplied PostgreSQL/Alembic schema, then configure Twilio’s voice webhook to `POST /twilio/voice`, expose `/twilio/stream` over `wss://`, and set the backend-only `AI_API_KEY`, `AI_BASE_URL=https://api.flatrouter.com/v1`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`. Deploy the frontend to Vercel and the backend with `uvicorn app.main:app --host 0.0.0.0 --port $PORT` on Render. FlatRouter is OpenAI-compatible for HTTP API calls; verify that the selected model and realtime WebSocket support are enabled before production voice testing.

## Tests

```powershell
cd backend
pytest
```
