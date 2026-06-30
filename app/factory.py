from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from flask import Flask

from app.config import SECRET_KEY, get_api_url
from app.driver_portal.routes import driver_portal_bp
from app.routes.admin import admin_bp
from app.routes.main import main_bp
from app.static_utils import static_url


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = SECRET_KEY
    app.config["API_URL"] = get_api_url()
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(driver_portal_bp)

    app.jinja_env.globals["static_url"] = static_url

    @app.context_processor
    def inject_static_url():
        return {"static_url": static_url}

    @app.get("/api-config-check")
    def api_config_check():
        """Dev helper: confirms which backend URL the app is using."""
        return {"api_url": get_api_url(), "env_file": str(app.root_path)}

    return app
