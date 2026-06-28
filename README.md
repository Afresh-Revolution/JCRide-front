# JC-Ride Frontend (Flask)

Python frontend for **JC-Ride**, a ride-sharing platform. Flask serves server-rendered HTML pages (Jinja2 templates) and communicates with the backend API ([JCRide-back](https://github.com/Afresh-Revolution/JCRide-back)).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| Web framework | [Flask](https://flask.palletsprojects.com/) |
| Templates | Jinja2 |
| Forms | Flask-WTF / WTForms |
| HTTP client | requests |
| Config | python-dotenv |
| Dev server | Flask debug mode + watchdog (auto-reload) |
| Styling | CSS |

## Prerequisites

- **Python 3.11+** (tested with 3.13)
- **Git**
- **JCRide-back** running at `http://localhost:8000` (required for login, registration, and ride flows)

## Project Structure

```
JCRide-front/
├── app/
│   ├── factory.py              # Flask app factory
│   ├── config.py               # Environment settings (.env)
│   ├── routes/main.py          # Page routes
│   ├── services/api_client.py  # Calls JCRide-back API
│   ├── templates/              # Jinja2 HTML pages
│   └── static/                 # CSS, JS, images (source)
├── public/                     # Vercel CDN static output (build copies app/static here)
├── scripts/vercel_build.py     # Vercel build: app/static → public/static
├── wsgi.py                     # Vercel WSGI entry point
├── pyproject.toml              # Python + Vercel config
├── run.py                      # Local dev entry point
├── requirements.txt
├── .env.example
└── .env                        # Local config (not committed)
```

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Afresh-Revolution/JCRide-front.git
cd JCRide-front
```

### 2. Create and activate a virtual environment

**Windows (PowerShell):**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If activation is blocked by execution policy, run once (current user):

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**macOS / Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

Your shell prompt should show `(venv)` when the environment is active.

### 3. Install dependencies

With the virtual environment **activated**, install all packages:

```bash
pip install -r requirements.txt
```

This installs Flask, `python-dotenv`, `requests`, Flask-WTF, watchdog, and pytest.

### 4. Configure environment

Copy the example file and edit values as needed:

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_APP` | `run.py` | Flask entry point |
| `FLASK_ENV` | `development` | Development mode |
| `SECRET_KEY` | — | Session signing key (change in production) |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `5000` | Server port |
| `API_URL` | `http://localhost:8000` | JCRide-back API base URL |

### 5. Start the backend (separate terminal)

Clone and run [JCRide-back](https://github.com/Afresh-Revolution/JCRide-back) so the API is available at the URL set in `API_URL`.

### 6. Run the frontend

With `(venv)` active:

```bash
python run.py
```

Open **http://localhost:5000** (or **http://127.0.0.1:5000**).

You should see:

```
 * Serving Flask app 'app.factory'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

The dev server auto-reloads when you change Python or template files.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError: No module named 'dotenv'` | Virtual env not activated or deps not installed. Run `.\venv\Scripts\Activate.ps1` (Windows) or `source venv/bin/activate`, then `pip install -r requirements.txt`. |
| `Activate.ps1` cannot be loaded | See execution policy step in setup §2. |
| Login/register/ride errors | Ensure JCRide-back is running and `API_URL` in `.env` matches it. |
| Port already in use | Change `PORT` in `.env` or stop the process using port 5000. |

---

## Deploy to Vercel

This frontend is a Flask WSGI app. Vercel detects it automatically and runs it as a serverless function. Static assets (CSS, JS, images) are copied into `public/static/` during the Vercel build so they are served from the CDN.

**Important:** Deploy [JCRide-back](https://github.com/Afresh-Revolution/JCRide-back) separately first (Railway, Render, Fly.io, etc.). Set `API_URL` on Vercel to that backend’s public HTTPS URL.

### Deployment files

| File | Purpose |
|------|---------|
| `wsgi.py` | Vercel entry point (`app` instance) |
| `pyproject.toml` | Python version, dependencies, Vercel entrypoint, build script |
| `scripts/vercel_build.py` | Copies `app/static/` → `public/static/` at build time |
| `.python-version` | Python runtime (3.12) |

### Environment variables (Vercel project settings)

Add these under **Project → Settings → Environment Variables** for **Production** (and Preview if you want preview deploys to hit a staging API):

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes | long random string | Signs Flask sessions and CSRF tokens |
| `API_URL` | Yes | `https://your-api.example.com` | Public URL of JCRide-back |
| `FLASK_ENV` | No | `production` | Use `production` on Vercel |

Do **not** commit `.env` or secrets to Git. Configure them only in the Vercel dashboard or via the CLI.

### Option A — Deploy from Git (recommended)

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and **Import** the repository.
3. Vercel should detect **Flask** with zero manual framework setup.
4. Confirm the build settings (usually auto-filled):
   - **Build Command:** `python scripts/vercel_build.py` (from `pyproject.toml`)
   - **Install Command:** `pip install -r requirements.txt`
   - **Output Directory:** leave empty (Flask backend preset)
5. Add `SECRET_KEY` and `API_URL` environment variables.
6. Click **Deploy**.

Each push to your default branch triggers a production deployment. Pull requests get preview URLs automatically.

### Option B — Deploy with Vercel CLI

Install the CLI (requires [Node.js](https://nodejs.org/) or use `npx`):

```bash
npm i -g vercel
```

From the project root:

```bash
# Log in (first time only)
vercel login

# Preview deployment
vercel

# Production deployment
vercel --prod
```

Set secrets before or after the first deploy:

```bash
vercel env add SECRET_KEY production
vercel env add API_URL production
```

Pull env vars for local testing with the Vercel dev server:

```bash
pip install -r requirements.txt
vercel dev
```

Open the URL shown in the terminal (typically `http://localhost:3000`).

### After deploy — verify

1. Open your Vercel URL (e.g. `https://jcride-front.vercel.app`).
2. Confirm the landing page loads and styles/images appear (`/static/css/landing.css`, hero images).
3. Test login/register — if requests fail, check that `API_URL` points to a reachable backend and CORS/network settings on the API allow your Vercel domain.
4. Open `/admin/login` and sign in with admin credentials from the backend.

### Custom domain

In the Vercel project: **Settings → Domains → Add**. Update any backend allowlists or CORS origins to include the new domain.

### Troubleshooting (Vercel)

| Issue | Fix |
|-------|-----|
| 404 on all routes | Ensure `wsgi.py` exists and exports `app`. Redeploy after adding it. |
| Unstyled pages / missing images | Build must run `scripts/vercel_build.py`. Check deploy logs for “Copied app/static”. |
| Login/API errors | Verify `API_URL` in Vercel env vars (no trailing slash). Confirm JCRide-back is live. |
| Session/auth issues | Set a strong, unique `SECRET_KEY` in Production env vars. |
| Deploy bundle too large | Keep `JCRide-back/`, `venv/`, and test files out of Git. |

---

## How the Project Runs

### Architecture

```
Browser  →  Flask (this repo)  →  JCRide-back API
              │
              ├── Jinja2 templates (HTML pages)
              ├── Session (login state)
              └── api_client.py (REST calls)
```

### User flows

**Rider:** Home → Register/Login → Book a Ride → API creates ride request

**Driver:** Register as driver → Login → Driver Dashboard → Go Online → API updates availability

### Routes

| URL | Page |
|-----|------|
| `/` | Home |
| `/login` | Sign in |
| `/register` | Create account |
| `/ride` | Book a ride |
| `/driver` | Driver dashboard |
| `/logout` | Sign out |

---

## Related Repositories

| Repo | Purpose |
|------|---------|
| [JCRide-front](https://github.com/Afresh-Revolution/JCRide-front) | Flask frontend (this repo) |
| [JCRide-back](https://github.com/Afresh-Revolution/JCRide-back) | Backend API |

## License

MIT — see [LICENSE](LICENSE).
