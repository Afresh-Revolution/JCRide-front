import requests
from app.config import API_URL

class ApiError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)

def _request(method, endpoint, token=None, **kwargs):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.request(method, f"{API_URL}{endpoint}", headers=headers, timeout=10, **kwargs)
    except requests.RequestException as exc:
        raise ApiError(f"Could not reach API: {exc}") from exc
    if not response.ok:
        try:
            detail = response.json().get("message", response.text)
        except ValueError:
            detail = response.text or response.reason
        raise ApiError(detail, response.status_code)
    return response.json() if response.content else {}

def login(email, password):
    return _request("POST", "/api/v1/auth/login", json={"email": email, "password": password})

def register(name, email, password, role):
    return _request("POST", "/api/v1/auth/register", json={"name": name, "email": email, "password": password, "role": role})

def request_ride(token, pickup, dropoff):
    return _request("POST", "/api/v1/rides/request", token=token, json={"pickup": pickup, "dropoff": dropoff})

def set_availability(token, online):
    return _request("POST", "/api/v1/drivers/availability", token=token, json={"online": online})
