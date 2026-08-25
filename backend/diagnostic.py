from typing import Dict, Any, List

class DiagnosticAnalyzer:
    """Motor de inteligência para diagnóstico de partida e saúde da injeção"""

    def __init__(self):
        self.min_crank_voltage = 99.0
        self.max_crank_rpm = 0.0
        self.cranking_samples = []

    def reset_crank_stats(self):
        self.min_crank_voltage = 99.0
        self.max_crank_rpm = 0.0
        self.cranking_samples = []

    def analyze_live_frame(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Avalia parâmetros em tempo real e retorna status dos sistemas"""
        checks: List[Dict[str, Any]] = []
        alerts: List[str] = []

        voltage = data.get("voltage", 0.0) or 0.0
        rpm = data.get("rpm", 0.0) or 0.0
        map_val = data.get("map")
        ect = data.get("ect")
        iat = data.get("iat")
        stft = data.get("stft")
        ltft = data.get("ltft")
        ethanol = data.get("ethanol_percent")

        # Rastreia estatísticas de partida
        if 0 < rpm < 500: # Faixa de arranque
            if voltage > 0 and voltage < self.min_crank_voltage:
                self.min_crank_voltage = voltage
            if rpm > self.max_crank_rpm:
                self.max_crank_rpm = rpm

        # 1. Análise da Bateria / Sistema Elétrico
        if voltage > 0:
            if rpm == 0: # Motor parado
                if voltage >= 12.4:
                    bat_status = "ok"
                    bat_msg = f"Tensão em repouso excelente ({voltage:.1f}V)"
                elif voltage >= 11.9:
                    bat_status = "warning"
                    bat_msg = f"Bateria com carga moderada ({voltage:.1f}V) - Verifique antes da partida"
                    alerts.append(f"Atenção: Bateria em repouso está com {voltage:.1f}V (ideal > 12.4V)")
                else:
                    bat_status = "danger"
                    bat_msg = f"Bateria descarregada ({voltage:.1f}V) - Risco de não dar partida"
                    alerts.append(f"Crítico: Bateria muito descarregada ({voltage:.1f}V)")
            elif rpm < 500: # No arranque
                if voltage >= 10.0:
                    bat_status = "ok"
                    bat_msg = f"Queda de tensão na partida saudável ({voltage:.1f}V)"
                elif voltage >= 9.6:
                    bat_status = "warning"
                    bat_msg = f"Queda no limite da tolerância ({voltage:.1f}V)"
                else:
                    bat_status = "danger"
                    bat_msg = f"Queda severa de tensão no arranque ({voltage:.1f}V < 9.6V) - ECU pode reiniciar!"
                    alerts.append(f"Queda crítica de tensão ({voltage:.1f}V): Motor de arranque pesado ou bateria fraca")
            else: # Motor funcionando
                if 13.5 <= voltage <= 14.8:
                    bat_status = "ok"
                    bat_msg = f"Alternador carregando perfeitamente ({voltage:.1f}V)"
                else:
                    bat_status = "warning"
                    bat_msg = f"Carga do alternador fora do padrão ({voltage:.1f}V)"

            checks.append({
                "system": "Bateria & Alimentação",
                "status": bat_status,
                "value": f"{voltage:.1f} V",
                "message": bat_msg
            })

        # 2. Sensor de Rotação (CKP)
        if rpm > 0:
            if rpm < 500:
                ckp_status = "ok"
                ckp_msg = f"Sinal de rotação no arranque detectado ({int(rpm)} RPM)"
            else:
                ckp_status = "ok"
                ckp_msg = f"Rotação estável ({int(rpm)} RPM)"
        else:
            ckp_status = "neutral"
            ckp_msg = "Motor parado (Aguardando partida)"

        checks.append({
            "system": "Sensor de Rotação (CKP)",
            "status": ckp_status,
            "value": f"{int(rpm)} RPM",
            "message": ckp_msg
        })

        # 3. Temperatura do Arrefecimento (ECT vs IAT)
        if ect is not None:
            if iat is not None and abs(ect - iat) > 35 and rpm == 0:
                ect_status = "warning"
                ect_msg = f"Divergência suspeita: Água {ect}°C vs Ar {iat}°C (Sensor ECT pode estar travado!)"
                alerts.append(f"Possível sensor ECT descalibrado ({ect}°C vs {iat}°C). Isso altera a mistura na partida!")
            elif -20 <= ect <= 110:
                ect_status = "ok"
                ect_msg = f"Temperatura de arrefecimento plausível ({ect}°C)"
            else:
                ect_status = "danger"
                ect_msg = f"Leitura de temperatura anômala ({ect}°C)"
                alerts.append(f"Sensor ECT com leitura extrema ({ect}°C)")

            checks.append({
                "system": "Sensor de Temperatura (ECT)",
                "status": ect_status,
                "value": f"{ect} °C",
                "message": ect_msg
            })

        # 4. Pressão Absoluta no Coletor (MAP / Vácuo)
        if map_val is not None:
            if rpm == 0:
                if 90 <= map_val <= 105:
                    map_status = "ok"
                    map_msg = f"Pressão atmosférica de repouso correta ({map_val} kPa)"
                else:
                    map_status = "warning"
                    map_msg = f"Sensor MAP descalibrado em repouso ({map_val} kPa)"
            elif rpm > 600: # Em marcha lenta
                if 26 <= map_val <= 42:
                    map_status = "ok"
                    map_msg = f"Vácuo no coletor excelente ({map_val} kPa) - Boa vedação mecânica"
                elif 43 <= map_val <= 55:
                    map_status = "warning"
                    map_msg = f"Vácuo moderado ({map_val} kPa) - Possível carga alta ou leve fuga"
                else:
                    map_status = "danger"
                    map_msg = f"Vácuo muito baixo ({map_val} kPa)! Entrada de ar falsa, correia fora de ponto ou válvulas presas"
                    alerts.append(f"MAP elevado na lenta ({map_val} kPa): Verifique entradas de ar falsas ou ponto mecânico")
            else:
                map_status = "ok"
                map_msg = f"Transição de partida ({map_val} kPa)"

            checks.append({
                "system": "Vácuo / Coletor (MAP)",
                "status": map_status,
                "value": f"{map_val} kPa",
                "message": map_msg
            })

        # 5. Ajustes de Mistura e Combustível (STFT / LTFT)
        if stft is not None:
            total_trim = stft + (ltft if ltft is not None else 0.0)
            if abs(total_trim) <= 10:
                trim_status = "ok"
                trim_msg = f"Mistura ar/combustível bem equilibrada (STFT: {stft:+.1f}%)"
            elif 10 < total_trim <= 20:
                trim_status = "warning"
                trim_msg = f"ECU enriquecendo mistura (+{total_trim:.1f}%) - Leve falta de combustível"
            elif total_trim > 20:
                trim_status = "danger"
                trim_msg = f"Falta severa de combustível (+{total_trim:.1f}%)! Bicos entupidos, bomba fraca ou ar falso"
                alerts.append(f"Injeção no limite positivo (+{total_trim:.1f}%): Falta grave de combustível")
            elif -20 <= total_trim < -10:
                trim_status = "warning"
                trim_msg = f"ECU empobrecendo mistura ({total_trim:.1f}%) - Leve excesso"
            else:
                trim_status = "danger"
                trim_msg = f"Excesso severo de combustível ({total_trim:.1f}%)! Bico travado aberto ou canister vazando"
                alerts.append(f"Injeção no limite negativo ({total_trim:.1f}%): Excesso de combustível / afogamento")

            checks.append({
                "system": "Ajuste de Mistura (STFT/LTFT)",
                "status": trim_status,
                "value": f"{total_trim:+.1f}%",
                "message": trim_msg
            })

        # 6. Reconhecimento A/F Flex
        if ethanol is not None:
            checks.append({
                "system": "Reconhecimento A/F Flex",
                "status": "ok",
                "value": f"{ethanol:.0f}% Etanol",
                "message": f"ECU configurada para {ethanol:.0f}% de Etanol na mistura"
            })

        return {
            "checks": checks,
            "alerts": alerts,
            "min_crank_voltage": self.min_crank_voltage if self.min_crank_voltage < 90 else None,
            "max_crank_rpm": self.max_crank_rpm if self.max_crank_rpm > 0 else None
        }
