from pathlib import Path

from dotenv import load_dotenv

# Load .env before any app imports so API_URL is correct everywhere
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

from app.config import HOST, PORT, get_api_url
from app.factory import create_app

app = create_app()

if __name__ == "__main__":
    print(f"JC-Ride frontend -> API_URL={get_api_url()}")
    print(f"Env file: {Path(__file__).resolve().parent / '.env'}")
    app.run(host=HOST, port=PORT, debug=True)
