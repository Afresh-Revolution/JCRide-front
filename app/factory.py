from flask import Flask

from app.config import SECRET_KEY
from app.routes.admin import admin_bp
from app.routes.main import main_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = SECRET_KEY
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)
    return app
