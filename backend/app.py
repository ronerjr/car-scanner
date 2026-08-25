import os
import asyncio
import json
import logging
from typing import Optional, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .elm327 import ELM327
from .simulator import ECUSimulator
from .diagnostic import DiagnosticAnalyzer
from .logger import TelemetryLogger, DATA_DIR

logger = logging.getLogger("App")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="OBD-II Car Diagnostic Scanner & Dashboard")

# Instâncias globais
elm = ELM327()
sim = ECUSimulator()
diagnostic = DiagnosticAnalyzer()
telemetry_logger = TelemetryLogger()

connection_mode = "simulation" # "hardware" ou "simulation"
connected_port = ""

# Modelos Pydantic para requisições
class ConnectRequest(BaseModel):
    mode: str # "hardware" ou "simulation"
    port: Optional[str] = None
    baudrate: Optional[int] = 38400

class ScenarioRequest(BaseModel):
    scenario: str

# Endpoints REST
@app.get("/api/ports")
def get_ports():
    ports = ELM327.list_available_ports()
    return {"ports": ports}

@app.get("/api/status")
def get_status():
    is_conn = elm.is_connected if connection_mode == "hardware" else True
    return {
        "mode": connection_mode,
        "connected": is_conn,
        "port": connected_port,
        "elm_version": elm.elm_version if connection_mode == "hardware" else "SIMULADOR VIRTUAL ECU",
        "protocol": elm.protocol_name if connection_mode == "hardware" else "ISO 15765-4 CAN (Simulado)",
        "is_recording": telemetry_logger.is_recording,
        "current_scenario": sim.scenario if connection_mode == "simulation" else None
    }

@app.post("/api/connect")
def connect(req: ConnectRequest):
    global connection_mode, connected_port
    if req.mode == "simulation":
        connection_mode = "simulation"
        connected_port = "SIMULADOR_VIRTUAL"
        diagnostic.reset_crank_stats()
        return {"status": "ok", "message": "Modo Simulador ativado com sucesso."}
    
    elif req.mode == "hardware":
        if not req.port:
            raise HTTPException(status_code=400, detail="Porta serial não especificada.")
        
        ok = elm.connect(port=req.port, baudrate=req.baudrate)
        if ok:
            connection_mode = "hardware"
            connected_port = req.port
            diagnostic.reset_crank_stats()
            return {"status": "ok", "message": f"Conectado ao dispositivo OBD-II na porta {req.port}."}
        else:
            raise HTTPException(status_code=500, detail=f"Falha ao comunicar com o ELM327 na porta {req.port}.")

@app.post("/api/disconnect")
def disconnect():
    global connection_mode, connected_port
    if connection_mode == "hardware":
        elm.disconnect()
    connection_mode = "disconnected"
    connected_port = ""
    return {"status": "ok", "message": "Desconectado com sucesso."}

@app.post("/api/simulator/scenario")
def set_scenario(req: ScenarioRequest):
    if connection_mode != "simulation":
        raise HTTPException(status_code=400, detail="Disponível apenas no modo simulador.")
    sim.set_scenario(req.scenario)
    diagnostic.reset_crank_stats()
    return {"status": "ok", "scenario": req.scenario}

@app.post("/api/simulator/crank")
def trigger_sim_crank():
    if connection_mode != "simulation":
        raise HTTPException(status_code=400, detail="Disponível apenas no modo simulador.")
    sim.trigger_crank()
    diagnostic.reset_crank_stats()
    return {"status": "ok", "message": "Partida simulada iniciada."}

@app.get("/api/dtc/read")
def read_dtcs():
    if connection_mode == "hardware":
        res = elm.read_dtcs()
    else:
        # DTCs simulados de acordo com o cenário
        if sim.scenario == "bad_ect":
            res = {
                "stored": [{"code": "P0116", "description": "Sensor de Temperatura do Motor (ECT) - Faixa/Desempenho Incorreto"}],
                "pending": [{"code": "P0117", "description": "Sensor de Temperatura do Motor (ECT) - Entrada Baixa"}],
                "total": 2
            }
        elif sim.scenario == "bad_flex_af" or sim.scenario == "vacuum_leak":
            res = {
                "stored": [{"code": "P0171", "description": "Sistema de Combustível Muito Pobre (Bank 1) - Falta de Combustível / Entrada de Ar"}],
                "pending": [{"code": "P0300", "description": "Falha de combustão múltipla/aleatória nos cilindros (Misfire)"}],
                "total": 2
            }
        elif sim.scenario == "ckp_failure":
            res = {
                "stored": [{"code": "P0335", "description": "Circuito do Sensor de Rotação da Árvore de Manivelas (CKP) - Sem Sinal"}],
                "pending": [],
                "total": 1
            }
        else:
            res = {"stored": [], "pending": [], "total": 0}
    return res

@app.post("/api/dtc/clear")
def clear_dtcs():
    if connection_mode == "hardware":
        ok = elm.clear_dtcs()
        return {"status": "ok" if ok else "error", "message": "Códigos apagados da ECU." if ok else "Falha ao apagar códigos."}
    else:
        return {"status": "ok", "message": "Códigos apagados (Simulador)."}

@app.post("/api/ecu/reset")
def reset_ecu():
    diagnostic.reset_crank_stats()
    if connection_mode == "hardware":
        ok = elm.reset_ecu_adaptations()
        return {"status": "ok" if ok else "error", "message": "Parâmetros e memória adaptativa da ECU resetados com sucesso!" if ok else "Falha ao resetar ECU."}
    else:
        return {"status": "ok", "message": "Parâmetros da ECU resetados (Simulador)."}


@app.post("/api/record/start")
def start_recording():
    fn = telemetry_logger.start_recording()
    return {"status": "ok", "filename": os.path.basename(fn)}

@app.post("/api/record/stop")
def stop_recording():
    res = telemetry_logger.stop_recording()
    return {"status": "ok", "result": res}

@app.get("/api/logs")
def list_logs():
    return {"logs": telemetry_logger.list_logs()}

@app.get("/api/logs/download/{filename}")
def download_log(filename: str):
    file_path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo de log não encontrado.")
    return FileResponse(file_path, filename=filename, media_type="text/csv")

# Streaming de Dados via WebSocket em tempo real
@app.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    logger.info("Cliente WebSocket conectado.")
    try:
        while True:
            # 1. Coleta dados (hardware ou simulador)
            if connection_mode == "hardware" and elm.is_connected:
                raw_data = elm.read_all_live_data()
            elif connection_mode == "simulation":
                raw_data = sim.get_live_data()
            else:
                raw_data = {
                    "timestamp": 0,
                    "connected": False,
                    "voltage": 0.0,
                    "rpm": 0
                }

            # 2. Executa análise diagnóstica inteligente
            analysis = diagnostic.analyze_live_frame(raw_data)
            
            # 3. Grava no logger se estiver gravando
            if telemetry_logger.is_recording:
                telemetry_logger.record_frame(raw_data)

            # 4. Empacota e envia via WebSocket
            packet = {
                "telemetry": raw_data,
                "diagnostic": analysis,
                "recording": {
                    "is_recording": telemetry_logger.is_recording,
                    "samples": telemetry_logger.samples_count
                }
            }

            await websocket.send_text(json.dumps(packet))
            
            # Taxa de atualização (aprox. 15-20Hz para suavidade)
            await asyncio.sleep(0.06)

    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado.")
    except Exception as e:
        logger.warning(f"Exceção no WebSocket: {e}")

# Servir Frontend Estático
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"status": "Dashboard frontend pronto para ser criado"})
