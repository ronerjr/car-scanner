import os
import csv
import time
from typing import Dict, Any, List

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

class TelemetryLogger:
    def __init__(self):
        self.is_recording = False
        self.current_filename = ""
        self.samples_count = 0
        self.session_start = 0.0
        self.fieldnames = [
            "timestamp", "time_elapsed", "voltage", "rpm", "speed",
            "ect", "iat", "map", "maf", "tps", "timing_advance",
            "stft", "ltft", "o2_b1s1", "fuel_pressure", "oil_pressure",
            "ethanol_percent", "engine_load"
        ]
        os.makedirs(DATA_DIR, exist_ok=True)

    def start_recording(self, session_prefix: str = "partida") -> str:
        timestamp_str = time.strftime("%Y%m%d_%H%M%S")
        self.current_filename = os.path.join(DATA_DIR, f"{session_prefix}_{timestamp_str}.csv")
        self.session_start = time.time()
        self.samples_count = 0
        self.is_recording = True

        with open(self.current_filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=self.fieldnames)
            writer.writeheader()

        return self.current_filename

    def record_frame(self, data: Dict[str, Any]):
        if not self.is_recording or not self.current_filename:
            return

        now = time.time()
        row = {
            "timestamp": now,
            "time_elapsed": round(now - self.session_start, 3),
            "voltage": data.get("voltage", ""),
            "rpm": data.get("rpm", ""),
            "speed": data.get("speed", ""),
            "ect": data.get("ect", ""),
            "iat": data.get("iat", ""),
            "map": data.get("map", ""),
            "maf": data.get("maf", ""),
            "tps": data.get("tps", ""),
            "timing_advance": data.get("timing_advance", ""),
            "stft": data.get("stft", ""),
            "ltft": data.get("ltft", ""),
            "o2_b1s1": data.get("o2_b1s1", ""),
            "fuel_pressure": data.get("fuel_pressure", ""),
            "oil_pressure": data.get("oil_pressure", ""),
            "ethanol_percent": data.get("ethanol_percent", ""),
            "engine_load": data.get("engine_load", "")
        }

        try:
            with open(self.current_filename, "a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=self.fieldnames)
                writer.writerow(row)
            self.samples_count += 1
        except Exception:
            pass

    def stop_recording(self) -> Dict[str, Any]:
        self.is_recording = False
        duration = round(time.time() - self.session_start, 2)
        fn = self.current_filename
        cnt = self.samples_count
        self.current_filename = ""
        return {
            "filename": os.path.basename(fn),
            "full_path": fn,
            "samples": cnt,
            "duration_seconds": duration
        }

    def list_logs(self) -> List[Dict[str, Any]]:
        if not os.path.exists(DATA_DIR):
            return []
        files = []
        for f in sorted(os.listdir(DATA_DIR), reverse=True):
            if f.endswith(".csv"):
                fp = os.path.join(DATA_DIR, f)
                files.append({
                    "filename": f,
                    "size_kb": round(os.path.getsize(fp) / 1024.0, 1),
                    "created_at": time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(os.path.getctime(fp)))
                })
        return files
