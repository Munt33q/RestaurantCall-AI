# Test Results

## Environment

- `Python 3.12.14`: available.
- `Node.js v24.19.0`: available.
- `npm 11.17.0`: available.
- `python -m venv .venv`: **FAILED**, exit code 1, `WinError 5 Access is denied` creating `backend/.venv`.
- `python -m pip install --target ... -r requirements.txt`: **FAILED**, package registry access denied (`WinError 10013`); no packages downloaded.
- `npm install --ignore-scripts --no-audit --no-fund --verbose`: **FAILED**, registry fetches for `next` returned `EACCES`; `node_modules` and lockfile were absent, and no competing Node/npm process was found.

- Backend Python AST syntax check: **passed**.
- Tax rounding regression coverage: **added** for configured-rate rounding, zero tax, combined items, and duplicate quantities.
- Full pytest suite after the tax fix: **PASSED**, `python -m pytest -q` from `E:\HACKATHONS\VOXO\backend` returned `6 passed in 1.20s`.
- Stripe webhook implementation source check: **passed**; live signature and persistence tests remain blocked by missing webhook secret/database.
- Backend pytest suite: **blocked** because pytest is not installed in the available Python runtime.
- Frontend dependency installation: **blocked** by an `EPERM` filesystem error during package installation.
- Next.js type check, lint, and production build: **not run** because dependencies are unavailable.
- Neon connectivity and migration smoke test: **blocked** because both database URLs are missing.
- Twilio live call: **not run** because no public deployment exists.
- Stripe webhook verification: **not run** because `STRIPE_WEBHOOK_SECRET` is missing.

The Windows host can reproduce the checks with:

```powershell
cd E:\HACKATHONS\VOXO\backend
python -m pip install -r requirements.txt
python -m pytest

cd ..\frontend
npm install
npm run build
```
