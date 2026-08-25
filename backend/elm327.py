import time
import re
import serial
import serial.tools.list_ports
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("OBD_ELM327")
logging.basicConfig(level=logging.INFO)

# Dicionário de Códigos DTC conhecidos com descrições em Português
DTC_DESCRIPTIONS = {
    # Falhas de Partida / Ignição / Sensores Principais
    "P0300": "Falha de combustão múltipla/aleatória nos cilindros (Misfire)",
    "P0301": "Falha de combustão detectada no Cilindro 1",
    "P0302": "Falha de combustão detectada no Cilindro 2",
    "P0303": "Falha de combustão detectada no Cilindro 3",
    "P0304": "Falha de combustão detectada no Cilindro 4",
    "P0335": "Circuito do Sensor de Rotação da Árvore de Manivelas (CKP) - Sem Sinal",
    "P0336": "Sensor de Rotação (CKP) - Faixa/Desempenho Incorreto",
    "P0340": "Circuito do Sensor de Posição do Comando de Válvulas (CMP) - Falha",
    "P0341": "Sensor de Posição do Comando (CMP) - Faixa/Desempenho",
    # Temperatura e Sensores de Ar
    "P0115": "Circuito do Sensor de Temperatura do Arrefecimento (ECT) - Falha",
    "P0116": "Sensor de Temperatura do Motor (ECT) - Faixa/Desempenho Incorreto",
    "P0117": "Sensor de Temperatura do Motor (ECT) - Entrada Baixa (Curto para Terra)",
    "P0118": "Sensor de Temperatura do Motor (ECT) - Entrada Alta (Circuito Aberto)",
    "P0110": "Circuito do Sensor de Temperatura do Ar de Admissão (IAT)",
    "P0105": "Circuito do Sensor de Pressão Absoluta no Coletor (MAP) - Falha",
    "P0106": "Sensor MAP - Faixa/Desempenho (Possível entrada de ar falsa ou ponto)",
    "P0107": "Sensor MAP - Entrada Baixa",
    "P0108": "Sensor MAP - Entrada Alta",
    "P0101": "Sensor de Fluxo de Ar (MAF) - Faixa/Desempenho",
    # Combustível e Mistura
    "P0171": "Sistema de Combustível Muito Pobre (Bank 1) - Falta de Combustível / Entrada de Ar",
    "P0172": "Sistema de Combustível Muito Rico (Bank 1) - Excesso de Combustível / Bico Travado",
    "P0087": "Pressão da Linha de Combustível Muito Baixa",
    "P0088": "Pressão da Linha de Combustível Muito Alta",
    "P0443": "Válvula de Purga do Canister (EVAP) - Falha no Circuito (Afogamento na partida)",
    "P0444": "Válvula do Canister - Circuito Aberto",
    "P0445": "Válvula do Canister - Circuito em Curto",
    "P0562": "Tensão do Sistema Elétrico Muito Baixa (Bateria/Alternador)",
    "P0563": "Tensão do Sistema Elétrico Muito Alta",
    "P0505": "Sistema de Controle de Marcha Lenta (IAC/TBI) - Mau Funcionamento",
    "P0120": "Circuito do Sensor de Posição da Borboleta (TPS A) - Falha",
    "P0220": "Circuito do Sensor de Posição da Borboleta (TPS B) - Falha",
    "P0130": "Circuito da Sonda Lambda (Bank 1, Sensor 1) - Falha",
    "P0135": "Circuito de Aquecimento da Sonda Lambda (Bank 1, Sensor 1)",
    "P0600": "Falha de Comunicação Serial / Barramento CAN",
    "P0606": "Processador da ECU / Módulo de Controle - Falha Interna"
}

def get_dtc_description(code: str) -> str:
    return DTC_DESCRIPTIONS.get(code.upper(), "Código de diagnóstico genérico ou específico da montadora")

class ELM327:
    def __init__(self, port: Optional[str] = None, baudrate: int = 38400, timeout: float = 1.0):
        self.port_name = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial_conn: Optional[serial.Serial] = None
        self.is_connected = False
        self.protocol_name = "Desconhecido"
        self.elm_version = "Desconhecido"
        self.supported_pids = set()

    @staticmethod
    def list_available_ports() -> List[Dict[str, str]]:
        ports = serial.tools.list_ports.comports()
        result = []
        for p in ports:
            result.append({
                "device": p.device,
                "description": p.description,
                "hwid": p.hwid,
                "is_bluetooth": "bluetooth" in p.description.lower() or "bth" in p.hwid.lower()
            })
        return result

    def connect(self, port: Optional[str] = None, baudrate: Optional[int] = None) -> bool:
        if port:
            self.port_name = port
        if baudrate:
            self.baudrate = baudrate

        if not self.port_name:
            logger.error("Nenhuma porta serial especificada.")
            return False

        logger.info(f"Tentando conectar na porta {self.port_name} a {self.baudrate} bps...")
        try:
            self.serial_conn = serial.Serial(
                port=self.port_name,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=self.timeout,
                write_timeout=self.timeout
            )
            time.sleep(0.5)
            self.serial_conn.reset_input_buffer()
            self.serial_conn.reset_output_buffer()

            # Sequência de Inicialização ELM327
            init_ok = self._initialize_elm()
            if init_ok:
                self.is_connected = True
                logger.info(f"Conectado com sucesso! Versão ELM: {self.elm_version}")
                return True
            else:
                self.disconnect()
                return False

        except Exception as e:
            logger.error(f"Erro ao conectar na porta {self.port_name}: {e}")
            self.disconnect()
            return False

    def disconnect(self):
        self.is_connected = False
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
            except Exception:
                pass
        self.serial_conn = None
        logger.info("Conexão serial fechada.")

    def _send_command(self, cmd: str, timeout: Optional[float] = None) -> str:
        if not self.serial_conn or not self.serial_conn.is_open:
            return ""

        t_out = timeout if timeout else self.timeout
        orig_timeout = self.serial_conn.timeout
        self.serial_conn.timeout = t_out

        try:
            self.serial_conn.reset_input_buffer()
            cmd_bytes = (cmd.strip() + "\r").encode("ascii")
            self.serial_conn.write(cmd_bytes)

            response = ""
            start_time = time.time()
            while (time.time() - start_time) < t_out:
                if self.serial_conn.in_waiting > 0:
                    chunk = self.serial_conn.read(self.serial_conn.in_waiting).decode("ascii", errors="ignore")
                    response += chunk
                    if ">" in response: # Prompt de retorno do ELM327
                        break
                else:
                    time.sleep(0.01)

            # Limpa caracteres de controle, echo e prompt '>'
            cleaned = response.replace(">", "").replace("\r", "\n").strip()
            return cleaned

        except Exception as e:
            logger.warning(f"Erro no envio do comando {cmd}: {e}")
            return ""
        finally:
            if self.serial_conn and self.serial_conn.is_open:
                self.serial_conn.timeout = orig_timeout

    def _initialize_elm(self) -> bool:
        # 1. Reset do ELM327
        res = self._send_command("ATZ", timeout=2.0)
        time.sleep(0.5)
        if not res or "ELM" not in res and "?" not in res and "OK" not in res:
            # Tenta novamente acordar o adaptador
            res = self._send_command("AT WS", timeout=1.0)
            if not res:
                logger.error("Adaptador ELM327 não respondeu ao comando ATZ.")
                return False

        self.elm_version = res.split("\n")[-1].strip() or "ELM327 v1.5/v2.1"

        # 2. Configurações padrão
        self._send_command("ATE0")  # Desliga Echo
        self._send_command("ATH0")  # Desliga Headers (facilita parsing)
        self._send_command("ATL0")  # Desliga Linefeeds extras
        self._send_command("ATS0")  # Remove espaços na resposta
        self._send_command("ATAT1") # Adaptive Timing On
        self._send_command("ATSP0") # Protocolo Automático

        # Testa leitura de voltagem direta do chip ELM327
        voltage_res = self.get_battery_voltage()
        logger.info(f"Tensão inicial lida: {voltage_res}V")

        # Tenta descobrir o protocolo conectando à ECU
        proto_res = self._send_command("ATDP")
        self.protocol_name = proto_res.strip() if proto_res else "Auto"
        return True

    def get_battery_voltage(self) -> float:
        """Lê a tensão da bateria diretamente do conversor analógico/digital do chip ELM327"""
        raw = self._send_command("AT RV")
        match = re.search(r"([0-9]+\.[0-9]+)", raw)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                pass
        return 0.0

    def query_pid(self, mode: str, pid: str) -> Optional[List[int]]:
        """Envia comando de PID OBD-II (ex: '01', '0C') e retorna bytes hexadecimais como lista de inteiros"""
        cmd = f"{mode}{pid}"
        raw = self._send_command(cmd)
        if not raw or "NO DATA" in raw or "UNABLE TO CONNECT" in raw or "BUS INIT" in raw or "ERROR" in raw:
            return None

        # Limpa espaços e quebras
        cleaned = re.sub(r'[^0-9A-Fa-f]', '', raw)
        expected_prefix = f"4{mode[1:]}{pid}".upper()
        
        idx = cleaned.find(expected_prefix)
        if idx != -1:
            data_hex = cleaned[idx + len(expected_prefix):]
            bytes_list = []
            for i in range(0, len(data_hex), 2):
                if i + 2 <= len(data_hex):
                    try:
                        bytes_list.append(int(data_hex[i:i+2], 16))
                    except ValueError:
                        break
            return bytes_list
        return None

    def read_all_live_data(self) -> Dict[str, Any]:
        """Varre os PIDs mais cruciais para partida e funcionamento do motor"""
        data: Dict[str, Any] = {
            "timestamp": time.time(),
            "connected": self.is_connected,
            "voltage": self.get_battery_voltage(),
            "rpm": 0,
            "speed": 0,
            "ect": None,      # Temp Líquido Arrefecimento (°C)
            "iat": None,      # Temp Ar de Admissão (°C)
            "map": None,      # Pressão Absoluta Coletor (kPa)
            "maf": None,      # Fluxo de Ar (g/s)
            "tps": None,      # Posição Borboleta (%)
            "timing_advance": None, # Ponto de Ignição (Graus APMS)
            "stft": None,     # Short Term Fuel Trim (%)
            "ltft": None,     # Long Term Fuel Trim (%)
            "o2_b1s1": None,  # Sonda Lambda 1 Tensão (V)
            "fuel_pressure": None, # Pressão de Combustível (kPa / Bar)
            "oil_pressure": None,  # Pressão de Óleo (se disponível)
            "oil_temp": None,      # Temperatura do Óleo (°C)
            "ethanol_percent": None, # % Etanol / A/F Flex
            "engine_load": None,   # Carga do Motor (%)
            "baro": None,     # Pressão Barométrica (kPa)
            "fuel_level": None # Nível Tanque (%)
        }

        if not self.is_connected:
            return data

        # 1. RPM (PID 0C) - 2 bytes: ((A*256)+B)/4
        rpm_b = self.query_pid("01", "0C")
        if rpm_b and len(rpm_b) >= 2:
            data["rpm"] = round(((rpm_b[0] * 256) + rpm_b[1]) / 4.0, 1)

        # 2. Velocidade (PID 0D) - 1 byte: A
        spd_b = self.query_pid("01", "0D")
        if spd_b and len(spd_b) >= 1:
            data["speed"] = spd_b[0]

        # 3. Temperatura do Arrefecimento ECT (PID 05) - 1 byte: A - 40 (°C)
        ect_b = self.query_pid("01", "05")
        if ect_b and len(ect_b) >= 1:
            data["ect"] = ect_b[0] - 40

        # 4. Pressão do Coletor MAP (PID 0B) - 1 byte: A (kPa)
        map_b = self.query_pid("01", "0B")
        if map_b and len(map_b) >= 1:
            data["map"] = map_b[0]

        # 5. Posição da Borboleta TPS (PID 11) - 1 byte: A * 100 / 255 (%)
        tps_b = self.query_pid("01", "11")
        if tps_b and len(tps_b) >= 1:
            data["tps"] = round((tps_b[0] * 100.0) / 255.0, 1)

        # 6. Ponto de Ignição / Avanço (PID 0E) - 1 byte: (A / 2) - 64 (Graus)
        adv_b = self.query_pid("01", "0E")
        if adv_b and len(adv_b) >= 1:
            data["timing_advance"] = round((adv_b[0] / 2.0) - 64.0, 1)

        # 7. Short Term Fuel Trim STFT (PID 06) - 1 byte: (A - 128) * 100 / 128 (%)
        stft_b = self.query_pid("01", "06")
        if stft_b and len(stft_b) >= 1:
            data["stft"] = round(((stft_b[0] - 128) * 100.0) / 128.0, 1)

        # 8. Long Term Fuel Trim LTFT (PID 07) - 1 byte: (A - 128) * 100 / 128 (%)
        ltft_b = self.query_pid("01", "07")
        if ltft_b and len(ltft_b) >= 1:
            data["ltft"] = round(((ltft_b[0] - 128) * 100.0) / 128.0, 1)

        # 9. Temperatura do Ar IAT (PID 0F) - 1 byte: A - 40 (°C)
        iat_b = self.query_pid("01", "0F")
        if iat_b and len(iat_b) >= 1:
            data["iat"] = iat_b[0] - 40

        # 10. Carga do Motor (PID 04) - 1 byte: A * 100 / 255 (%)
        load_b = self.query_pid("01", "04")
        if load_b and len(load_b) >= 1:
            data["engine_load"] = round((load_b[0] * 100.0) / 255.0, 1)

        # 11. Sonda Lambda 1 (PID 14) - 2 bytes: A / 200 (Volts), B (Fuel trim)
        o2_b = self.query_pid("01", "14")
        if o2_b and len(o2_b) >= 1:
            data["o2_b1s1"] = round(o2_b[0] / 200.0, 3)

        # 12. MAF (PID 10) - 2 bytes: ((A*256)+B)/100 (g/s)
        maf_b = self.query_pid("01", "10")
        if maf_b and len(maf_b) >= 2:
            data["maf"] = round(((maf_b[0] * 256) + maf_b[1]) / 100.0, 2)

        # 13. % Etanol Flex (PID 52) - 1 byte: A * 100 / 255 (%)
        eth_b = self.query_pid("01", "52")
        if eth_b and len(eth_b) >= 1:
            data["ethanol_percent"] = round((eth_b[0] * 100.0) / 255.0, 1)

        # 14. Pressão de Combustível (PID 0A ou 23)
        fp_b = self.query_pid("01", "0A")
        if fp_b and len(fp_b) >= 1:
            data["fuel_pressure"] = fp_b[0] * 3 # kPa (0 a 765 kPa)
        else:
            fp_high_b = self.query_pid("01", "23")
            if fp_high_b and len(fp_high_b) >= 2:
                data["fuel_pressure"] = round(((fp_high_b[0] * 256) + fp_high_b[1]) * 10.0, 1) # kPa alta pressão

        # 15. Temperatura do Óleo (PID 5C) - 1 byte: A - 40 (°C)
        oil_t_b = self.query_pid("01", "5C")
        if oil_t_b and len(oil_t_b) >= 1:
            data["oil_temp"] = oil_t_b[0] - 40

        # 16. Pressão Barométrica (PID 33) - 1 byte: A (kPa)
        baro_b = self.query_pid("01", "33")
        if baro_b and len(baro_b) >= 1:
            data["baro"] = baro_b[0]

        return data

    def read_dtcs(self) -> Dict[str, Any]:
        """Lê Códigos de Falha Armazenados (Modo 03) e Pendentes (Modo 07)"""
        if not self.is_connected:
            return {"stored": [], "pending": [], "total": 0}

        def _parse_dtc_response(raw_resp: str) -> List[Dict[str, str]]:
            dtcs = []
            cleaned = re.sub(r'[^0-9A-Fa-f]', '', raw_resp)
            
            # Remove o prefixo do modo (ex: 43 ou 47)
            if cleaned.startswith("43") or cleaned.startswith("47"):
                cleaned = cleaned[2:]

            # Cada DTC ocupa 2 bytes (4 caracteres hexadecimais)
            dtc_prefixes = {'0': 'P0', '1': 'P1', '2': 'P2', '3': 'P3',
                            '4': 'C0', '5': 'C1', '6': 'C2', '7': 'C3',
                            '8': 'B0', '9': 'B1', 'A': 'B2', 'B': 'B3',
                            'C': 'U0', 'D': 'U1', 'E': 'U2', 'F': 'U3'}

            for i in range(0, len(cleaned), 4):
                chunk = cleaned[i:i+4]
                if len(chunk) == 4 and chunk != "0000":
                    first_char = chunk[0].upper()
                    prefix = dtc_prefixes.get(first_char, "P0")
                    code = prefix + chunk[1:].upper()
                    dtcs.append({
                        "code": code,
                        "description": get_dtc_description(code)
                    })
            return dtcs

        stored_raw = self._send_command("03")
        pending_raw = self._send_command("07")

        stored_codes = _parse_dtc_response(stored_raw)
        pending_codes = _parse_dtc_response(pending_raw)

        return {
            "stored": stored_codes,
            "pending": pending_codes,
            "total": len(stored_codes) + len(pending_codes)
        }

    def clear_dtcs(self) -> bool:
        """Limpa Códigos de Erro da ECU e apaga a luz da injeção (Modo 04)"""
        if not self.is_connected:
            return False
        res = self._send_command("04", timeout=3.0)
        return "OK" in res or "44" in res

    def reset_ecu_adaptations(self) -> bool:
        """Reseta parâmetros adaptativos, A/F e Fuel Trims da ECU"""
        if not self.is_connected:
            return False
        # 1. Modo 04 limpa falhas e zera trims aprendidos
        self._send_command("04", timeout=3.0)
        time.sleep(0.3)
        # 2. Rotinas estendidas opcionais
        try:
            self._send_command("14FFFFFF", timeout=1.0)
            self._send_command("31010201", timeout=1.0)
        except Exception:
            pass
        return True

