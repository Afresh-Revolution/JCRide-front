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
│   └── static/css/             # Stylesheets
├── run.py                      # Entry point
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

## Driver Portal

A dedicated driver UI lives in `app/driver_portal/`. See `app/driver_portal/README.md` for how components connect.

| URL | Page |
|-----|------|
| `/driver-portal/login` | Driver sign in |
| `/driver-portal/register` | Driver registration (step 1) |
| `/driver-portal/dashboard` | Driver dashboard |

Start the app and open **http://localhost:5000/driver-portal/login**

---

## Related Repositories

| Repo | Purpose |
|------|---------|
| [JCRide-front](https://github.com/Afresh-Revolution/JCRide-front) | Flask frontend (this repo) |
| [JCRide-back](https://github.com/Afresh-Revolution/JCRide-back) | Backend API |

## License

MIT — see [LICENSE](LICENSE).
