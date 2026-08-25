import os
import sys
import webbrowser
import threading
import time
import uvicorn

def open_browser():
    time.sleep(1.2)
    url = "http://localhost:8000"
    print(f"\n=======================================================")
    print(f"🚀 Scanner OBD-II iniciado com sucesso!")
    print(f"👉 Abrindo Dashboard em: {url}")
    print(f"=======================================================\n")
    webbrowser.open(url)

if __name__ == "__main__":
    # Garante que o diretório raiz está no path
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=False)
