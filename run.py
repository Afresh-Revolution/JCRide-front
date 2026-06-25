from app.config import HOST, PORT
from app.factory import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=True)
