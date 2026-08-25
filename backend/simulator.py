import time
import math
import random
from typing import Dict, Any

class ECUSimulator:
    """Simulador de ECU e Sensores OBD-II para desenvolvimento e testes de diagnóstico"""

    def __init__(self):
        self.scenario = "normal"  # "normal", "low_voltage", "bad_ect", "bad_flex_af", "vacuum_leak", "ckp_failure"
        self.start_time = time.time()
        self.engine_state = "off" # "off", "cranking", "running"
        self.state_timer = time.time()
        self.simulated_rpm = 0.0
        self.simulated_voltage = 12.6

    def set_scenario(self, scenario_name: str):
        if scenario_name in ["normal", "low_voltage", "bad_ect", "bad_flex_af", "vacuum_leak", "ckp_failure"]:
            self.scenario = scenario_name
            self.trigger_crank()

    def trigger_crank(self):
        """Simula a virada da chave para dar partida"""
        self.engine_state = "cranking"
        self.state_timer = time.time()

    def get_live_data(self) -> Dict[str, Any]:
        now = time.time()
        dt = now - self.state_timer

        # Gerenciamento de Estado da Partida
        if self.engine_state == "off":
            self.simulated_rpm = 0.0
            self.simulated_voltage = 12.5 + 0.1 * math.sin(now * 0.5)

        elif self.engine_state == "cranking":
            # Duração do arranque depende do cenário
            crank_duration = 1.8 if self.scenario == "normal" else 4.5
            
            if self.scenario == "low_voltage":
                # Bateria arriada cai para 8.8V
                self.simulated_voltage = 8.8 + random.uniform(-0.2, 0.2)
                self.simulated_rpm = 140 + random.uniform(-20, 20)
            elif self.scenario == "ckp_failure":
                # Sensor de rotação não marca nada
                self.simulated_voltage = 10.4 + random.uniform(-0.1, 0.1)
                self.simulated_rpm = 0.0
            else:
                # Arranque normal
                self.simulated_voltage = 10.6 + random.uniform(-0.3, 0.3)
                self.simulated_rpm = 230 + random.uniform(-15, 15)

            if dt > crank_duration:
                if self.scenario == "ckp_failure":
                    self.engine_state = "off" # Não pega
                else:
                    self.engine_state = "running"
                    self.state_timer = time.time()

        elif self.engine_state == "running":
            # Motor pegou e estabiliza em marcha lenta
            idle_target_rpm = 850
            if dt < 2.0:
                # Pico inicial pós-partida (flare)
                target = 1350 - (dt * 250)
            else:
                # Marcha lenta com leve variação orgânica
                target = idle_target_rpm + 25 * math.sin(now * 2) + random.uniform(-10, 10)
            
            self.simulated_rpm = max(0, target)
            self.simulated_voltage = 14.1 + 0.1 * math.sin(now) # Alternador carregando

        # Cálculo dos sensores de acordo com o cenário
        # 1. Temperatura da Água (ECT)
        if self.scenario == "bad_ect":
            ect = 92.0 # Marcando quente falso mesmo em motor frio
        else:
            ect = 24.0 + min(65.0, (now - self.start_time) * 0.5)

        # 2. Vácuo / MAP
        if self.engine_state == "off":
            map_val = 101.0 # Pressão atmosférica
        elif self.engine_state == "cranking":
            map_val = 82.0 + random.uniform(-3, 3)
        else:
            if self.scenario == "vacuum_leak":
                map_val = 58.0 + random.uniform(-2, 2) # Entrada de ar falsa / sem vácuo
            else:
                map_val = 33.0 + random.uniform(-1.5, 1.5) # Vácuo perfeito em marcha lenta

        # 3. Ajustes de Combustível (STFT / LTFT)
        if self.scenario == "vacuum_leak":
            stft = 18.5 + random.uniform(-2, 2)
            ltft = 14.0
        elif self.scenario == "bad_flex_af":
            stft = 24.0 + random.uniform(-1, 2) # Falta severa de combustível por A/F errado
            ltft = 19.0
        else:
            stft = round(math.sin(now * 1.5) * 3.5, 1)
            ltft = 2.0

        # 4. A/F Flex
        if self.scenario == "bad_flex_af":
            ethanol_pct = 95.0 # ECU achando que tem 95% etanol
        else:
            ethanol_pct = 27.0 # Gasolina brasileira comum (~27% etanol)

        # 5. TPS
        tps = 12.5 if self.engine_state == "running" else (16.0 if self.engine_state == "cranking" else 0.0)

        # 6. Ponto de Ignição
        timing = 9.0 + 2.0 * math.sin(now) if self.engine_state == "running" else (5.0 if self.engine_state == "cranking" else 0.0)

        # 7. Sonda Lambda
        o2_volt = 0.45 + 0.4 * math.sin(now * 3) if self.engine_state == "running" else 0.45

        # 8. Pressão de Combustível (Bar/kPa)
        fuel_press = 380 if self.engine_state != "off" else 300 # 3.8 Bar

        return {
            "timestamp": now,
            "connected": True,
            "is_simulation": True,
            "scenario": self.scenario,
            "engine_state": self.engine_state,
            "voltage": round(self.simulated_voltage, 2),
            "rpm": round(self.simulated_rpm, 0),
            "speed": 0,
            "ect": round(ect, 1),
            "iat": 22.0,
            "map": round(map_val, 1),
            "maf": round(2.8 + (self.simulated_rpm / 850.0) * 0.5, 2) if self.simulated_rpm > 0 else 0.0,
            "tps": round(tps, 1),
            "timing_advance": round(timing, 1),
            "stft": round(stft, 1),
            "ltft": round(ltft, 1),
            "o2_b1s1": round(o2_volt, 3),
            "fuel_pressure": fuel_press,
            "oil_pressure": round(2.8 + (self.simulated_rpm / 1000.0) * 0.8, 1) if self.simulated_rpm > 0 else 0.0,
            "oil_temp": round(ect * 0.9, 1),
            "ethanol_percent": round(ethanol_pct, 1),
            "engine_load": 22.5 if self.engine_state == "running" else 0.0,
            "baro": 101,
            "fuel_level": 65
        }
