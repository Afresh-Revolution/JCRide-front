# JC-Ride Frontend (Flask)

Python frontend for **JC-Ride**, a ride-sharing platform. Flask serves server-rendered HTML pages (Jinja2 templates) and communicates with the backend API ([JCRide-back](https://github.com/Afresh-Revolution/JCRide-back)).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| Web framework | [Flask](https://flask.palletsprojects.com/) |
| Templates | Jinja2 |
| HTTP client | requests |
| Styling | CSS |

## Prerequisites

- **Python 3.11+**
- **Git**
- Backend API running (optional for UI-only dev)

## Project Structure

```
JC-Ride/
├── app/
│   ├── factory.py           # Flask app factory
│   ├── config.py            # Environment settings
│   ├── routes/main.py       # Page routes
│   ├── services/api_client.py  # Calls JCRide-back API
│   ├── templates/           # Jinja2 HTML pages
│   └── static/css/          # Stylesheets
├── run.py                   # Entry point
├── requirements.txt
└── .env.example
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

**macOS / Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment

```bash
cp .env.example .env
```

Set `API_URL` to your backend (default: `http://localhost:8000`).

### 5. Run the app

```bash
python run.py
```

Open **http://localhost:5000**

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
