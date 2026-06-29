# Driver Portal — How the files connect

This folder is the **Python brain** for the driver portal. Flask reads these files and serves HTML pages.

## File map

```
app/driver_portal/
├── routes.py      ← URLs (e.g. /driver-portal/login) → picks a page template
├── data.py        ← Sample numbers/text shown on the dashboard
└── __init__.py

app/templates/driver_portal/
├── layouts/       ← Page shells (auth split-screen, dashboard shell)
├── pages/         ← ONE file per screen — imports components below
│   ├── login.html
│   ├── register.html
│   └── dashboard.html   ← main file that stitches components together
└── components/    ← Small reusable HTML pieces
    ├── auth/      ← Login & register pieces
    └── dashboard/ ← Sidebar, header, charts, etc.

app/static/driver_portal/
├── css/           ← Styles
└── js/            ← Chart & toggle behaviour
```

## Request flow (beginner-friendly)

1. User visits `http://localhost:5000/driver-portal/login`
2. `routes.py` → `login()` function runs
3. Flask renders `pages/login.html`
4. That page `{% include %}`s `hero_section.html` + `login_form.html`
5. User submits the form → `routes.py` saves session → redirects to dashboard

## Edit one component

To change the sidebar only, edit:
`app/templates/driver_portal/components/dashboard/sidebar.html`

The dashboard page imports it automatically — no need to touch `dashboard.html` unless you add a new component.

## Change dashboard numbers

Edit `app/driver_portal/data.py` — routes pass this data into templates.
