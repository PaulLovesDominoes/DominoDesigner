from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# The built frontend (produced by `npm run build` in ../frontend) lives here.
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@app.get("/")
def index():
    return FileResponse(DIST / "index.html")


# Mounted after the "/" route above so the explicit root route still wins for
# the exact root path; every other path (e.g. /assets/index-*.js) falls through
# to the built files under dist/.
app.mount("/", StaticFiles(directory=DIST), name="static")
