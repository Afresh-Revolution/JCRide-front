from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from flask import Flask

from app.config import SECRET_KEY, get_api_url, get_google_maps_api_key
from app.driver_portal.routes import driver_portal_bp
from app.routes.admin import admin_bp
from app.routes.main import main_bp
from app.routes.pwa import pwa_bp
from app.services.navigation_guard import enforce_navigation_guard
from app.static_utils import static_url


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = SECRET_KEY
    app.config["API_URL"] = get_api_url()
    app.config["GOOGLE_MAPS_API_KEY"] = get_google_maps_api_key()
    app.register_blueprint(main_bp)
    app.register_blueprint(pwa_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(driver_portal_bp)

    app.before_request(enforce_navigation_guard)

    app.jinja_env.globals["static_url"] = static_url

    @app.context_processor
    def inject_globals():
        maps_key = get_google_maps_api_key()
        app.config["GOOGLE_MAPS_API_KEY"] = maps_key
        return {
            "static_url": static_url,
            "google_maps_api_key": maps_key,
            "has_google_maps": bool(maps_key),
        }

    @app.get("/api-config-check")
    def api_config_check():
        """Dev helper: confirms backend URL + Google Maps env wiring."""
        from app.config import BACKEND_ENV_PATHS, ENV_PATH

        maps_key = get_google_maps_api_key()
        return {
            "api_url": get_api_url(),
            "env_file": str(ENV_PATH),
            "backend_env_files": [str(p) for p in BACKEND_ENV_PATHS if p.exists()],
            "google_maps": {
                "env_var": "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
                "loaded": bool(maps_key),
                "key_suffix": maps_key[-6:] if maps_key else "",
                "provider": "google" if maps_key else "leaflet_fallback",
            },
        }

    return app
