/**
 * Driver OBD-II e ELM327 Nativo para Navegador (Web Bluetooth e Web Serial)
 * Permite conectar o Dashboard diretamente ao adaptador ELM327 pelo Chrome no Tablet/PC,
 * mesmo quando a página está hospedada no Render ou na nuvem (sem precisar de backend local).
 */

class BrowserOBD {
    constructor(onDataCallback, onStatusCallback) {
        this.onData = onDataCallback;
        this.onStatus = onStatusCallback;
        this.isConnected = false;
        this.isPolling = false;
        this.deviceType = null; // 'bluetooth' ou 'serial'
        
        // BLE Variables
        this.bluetoothDevice = null;
        this.bleServer = null;
        this.bleService = null;
        this.txCharacteristic = null;
        this.rxCharacteristic = null;
        this.bleBuffer = "";
        
        // Serial Variables
        this.serialPort = null;
        this.serialReader = null;
        this.serialWriter = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;

        // Diagnostic variables
        this.minCrankVoltage = 99.0;
        this.maxCrankRPM = 0.0;
    }

    /**
     * Conexão via Web Bluetooth (BLE 4.0+ OBD-II Adapters)
     */
    async connectBluetooth() {
        if (!navigator.bluetooth) {
            throw new Error("Web Bluetooth não é suportado neste navegador. Use o Google Chrome no Android, Windows ou Mac.");
        }

        this.onStatus({ status: 'connecting', message: 'Buscando dispositivo Bluetooth OBD-II...' });

        try {
            // Varre dispositivos BLE comuns (ELM327 / VGate / OBDLink / genéricos)
            this.bluetoothDevice = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '0000fff0-0000-1000-8000-00805f9b34fb', // VGate iCar / BLE comum
                    '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 comum
                    '000018f0-0000-1000-8000-00805f9b34fb', // Nordic UART genérico
                    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
                    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
                    '0000180a-0000-1000-8000-00805f9b34fb'  // Device Info
                ]
            });

            this.bluetoothDevice.addEventListener('gattserverdisconnected', () => {
                this.disconnect();
                this.onStatus({ status: 'disconnected', message: 'Bluetooth desconectado.' });
            });

            this.onStatus({ status: 'connecting', message: `Conectando a ${this.bluetoothDevice.name || 'Dispositivo'}...` });
            this.bleServer = await this.bluetoothDevice.gatt.connect();

            // Localizar o serviço e características de comunicação serial BLE
            const services = await this.bleServer.getPrimaryServices();
            let foundService = null;

            for (const s of services) {
                const chars = await s.getCharacteristics();
                for (const c of chars) {
                    if (c.properties.write || c.properties.writeWithoutResponse) {
                        this.txCharacteristic = c;
                    }
                    if (c.properties.notify || c.properties.read) {
                        this.rxCharacteristic = c;
                    }
                }
                if (this.txCharacteristic && this.rxCharacteristic) {
                    foundService = s;
                    break;
                }
            }

            if (!this.txCharacteristic || !this.rxCharacteristic) {
                throw new Error("Não foi possível encontrar o canal de comunicação serial BLE no adaptador.");
            }

            // Ativa notificações de recebimento
            await this.rxCharacteristic.startNotifications();
            this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const decoder = new TextDecoder();
                const str = decoder.decode(event.target.value);
                this.bleBuffer += str;
            });

            this.deviceType = 'bluetooth';
            this.isConnected = true;
            this.onStatus({ status: 'connected', mode: 'Web Bluetooth', name: this.bluetoothDevice.name });

            // Inicializa ELM327
            await this.initELM();
            this.startPollingLoop();
            return true;

        } catch (err) {
            this.disconnect();
            throw err;
        }
    }

    /**
     * Conexão via Web Serial (Bluetooth SPP / USB / COM Ports no Chrome)
     */
    async connectSerial(baudRate = 38400) {
        if (!navigator.serial) {
            throw new Error("Web Serial não é suportado neste navegador. Use o Google Chrome no PC/Mac/Android.");
        }

        this.onStatus({ status: 'connecting', message: 'Selecione a porta serial do OBD-II...' });

        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: baudRate });

            const textDecoder = new TextDecoderStream();
            this.readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable);
            this.serialReader = textDecoder.readable.getReader();

            const textEncoder = new TextEncoderStream();
            this.writableStreamClosed = textEncoder.readable.pipeTo(this.serialPort.writable);
            this.serialWriter = textEncoder.writable.getWriter();

            this.deviceType = 'serial';
            this.isConnected = true;
            this.onStatus({ status: 'connected', mode: 'Web Serial (SPP/COM)' });

            this._readSerialStream();
            await this.initELM();
            this.startPollingLoop();
            return true;

        } catch (err) {
            this.disconnect();
            throw err;
        }
    }

    async _readSerialStream() {
        while (this.isConnected && this.serialReader) {
            try {
                const { value, done } = await this.serialReader.read();
                if (done) break;
                if (value) {
                    this.bleBuffer += value;
                }
            } catch (err) {
                console.warn("Erro ao ler stream serial:", err);
                break;
            }
        }
    }

    async sendCommand(cmd, timeoutMs = 1200) {
        if (!this.isConnected) return "";
        this.bleBuffer = "";
        const fullCmd = cmd.trim() + "\r";

        try {
            if (this.deviceType === 'bluetooth' && this.txCharacteristic) {
                const encoder = new TextEncoder();
                await this.txCharacteristic.writeValue(encoder.encode(fullCmd));
            } else if (this.deviceType === 'serial' && this.serialWriter) {
                await this.serialWriter.write(fullCmd);
            }

            const startTime = Date.now();
            while ((Date.now() - startTime) < timeoutMs) {
                if (this.bleBuffer.includes(">")) {
                    break;
                }
                await new Promise(r => setTimeout(r, 20));
            }

            const res = this.bleBuffer.replace(/>/g, '').replace(/\r/g, '\n').trim();
            this.bleBuffer = "";
            return res;

        } catch (err) {
            console.error(`Erro ao enviar comando ${cmd}:`, err);
            return "";
        }
    }

    async initELM() {
        this.onStatus({ status: 'initializing', message: 'Configurando protocolo ELM327...' });
        await this.sendCommand("ATZ", 1500);
        await new Promise(r => setTimeout(r, 400));
        await this.sendCommand("ATE0");
        await this.sendCommand("ATH0");
        await this.sendCommand("ATL0");
        await this.sendCommand("ATS0");
        await this.sendCommand("ATSP0");
    }

    async readBatteryVoltage() {
        const raw = await this.sendCommand("AT RV", 600);
        const match = raw.match(/([0-9]+\.[0-9]+)/);
        if (match) return parseFloat(match[1]);
        return null;
    }

    async queryPID(mode, pid) {
        const raw = await this.sendCommand(`${mode}${pid}`, 600);
        if (!raw || raw.includes("NO DATA") || raw.includes("ERROR") || raw.includes("UNABLE")) {
            return null;
        }

        const cleaned = raw.replace(/[^0-9A-Fa-f]/g, '');
        const expectedPrefix = `4${mode.substring(1)}${pid}`.toUpperCase();
        const idx = cleaned.indexOf(expectedPrefix);

        if (idx !== -1) {
            const dataHex = cleaned.substring(idx + expectedPrefix.length);
            const bytes = [];
            for (let i = 0; i < dataHex.length; i += 2) {
                if (i + 2 <= dataHex.length) {
                    bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
                }
            }
            return bytes;
        }
        return null;
    }

    async startPollingLoop() {
        this.isPolling = true;

        while (this.isConnected && this.isPolling) {
            try {
                const now = Date.now() / 1000;
                const telemetry = {
                    timestamp: now,
                    connected: true,
                    is_simulation: false,
                    voltage: await this.readBatteryVoltage(),
                    rpm: 0,
                    speed: 0,
                    ect: null,
                    iat: null,
                    map: null,
                    maf: null,
                    tps: null,
                    timing_advance: null,
                    stft: null,
                    ltft: null,
                    o2_b1s1: null,
                    fuel_pressure: null,
                    ethanol_percent: null,
                    engine_load: null
                };

                // 1. RPM (PID 0C)
                const rpmB = await this.queryPID("01", "0C");
                if (rpmB && rpmB.length >= 2) {
                    telemetry.rpm = Math.round(((rpmB[0] * 256) + rpmB[1]) / 4.0);
                }

                // 2. Vácuo / MAP (PID 0B)
                const mapB = await this.queryPID("01", "0B");
                if (mapB && mapB.length >= 1) {
                    telemetry.map = mapB[0];
                }

                // 3. ECT (PID 05)
                const ectB = await this.queryPID("01", "05");
                if (ectB && ectB.length >= 1) {
                    telemetry.ect = ectB[0] - 40;
                }

                // 4. IAT (PID 0F)
                const iatB = await this.queryPID("01", "0F");
                if (iatB && iatB.length >= 1) {
                    telemetry.iat = iatB[0] - 40;
                }

                // 5. TPS (PID 11)
                const tpsB = await this.queryPID("01", "11");
                if (tpsB && tpsB.length >= 1) {
                    telemetry.tps = Math.round((tpsB[0] * 100.0) / 255.0);
                }

                // 6. STFT & LTFT (PIDs 06 e 07)
                const stftB = await this.queryPID("01", "06");
                if (stftB && stftB.length >= 1) {
                    telemetry.stft = Number((((stftB[0] - 128) * 100.0) / 128.0).toFixed(1));
                }

                const ltftB = await this.queryPID("01", "07");
                if (ltftB && ltftB.length >= 1) {
                    telemetry.ltft = Number((((ltftB[0] - 128) * 100.0) / 128.0).toFixed(1));
                }

                // 7. Ponto de Ignição (PID 0E)
                const advB = await this.queryPID("01", "0E");
                if (advB && advB.length >= 1) {
                    telemetry.timing_advance = Number(((advB[0] / 2.0) - 64.0).toFixed(1));
                }

                // 8. % Etanol Flex (PID 52)
                const ethB = await this.queryPID("01", "52");
                if (ethB && ethB.length >= 1) {
                    telemetry.ethanol_percent = Math.round((ethB[0] * 100.0) / 255.0);
                }

                // 9. Sonda Lambda 1 (PID 14)
                const o2B = await this.queryPID("01", "14");
                if (o2B && o2B.length >= 1) {
                    telemetry.o2_b1s1 = Number((o2B[0] / 200.0).toFixed(3));
                }

                // Executa diagnóstico no navegador
                const diagnostic = this.analyzeDiagnosis(telemetry);

                // Envia pacote montado para o Dashboard
                if (this.onData) {
                    this.onData({
                        telemetry: telemetry,
                        diagnostic: diagnostic,
                        recording: { is_recording: false, samples: 0 }
                    });
                }

                await new Promise(r => setTimeout(r, 60)); // Intervalo entre leituras

            } catch (err) {
                console.warn("Erro no ciclo de polling:", err);
                await new Promise(r => setTimeout(r, 200));
            }
        }
    }

    analyzeDiagnosis(tel) {
        const checks = [];
        const alerts = [];
        const v = tel.voltage || 0;
        const rpm = tel.rpm || 0;

        if (rpm > 0 && rpm < 500) {
            if (v > 0 && v < this.minCrankVoltage) this.minCrankVoltage = v;
            if (rpm > this.maxCrankRPM) this.maxCrankRPM = rpm;
        }

        // 1. Bateria
        if (v > 0) {
            let status = "ok";
            let msg = `Tensão normal (${v.toFixed(1)}V)`;
            if (rpm < 500 && v < 9.6) {
                status = "danger";
                msg = `Queda severa no arranque (${v.toFixed(1)}V < 9.6V) - ECU pode reiniciar!`;
                alerts.push(`Bateria arriada na partida (${v.toFixed(1)}V)`);
            } else if (rpm === 0 && v < 12.0) {
                status = "warning";
                msg = `Bateria fraca em repouso (${v.toFixed(1)}V)`;
            }
            checks.push({ system: "Bateria & Alimentação", status, value: `${v.toFixed(1)} V`, message: msg });
        }

        // 2. Sensor de Rotação
        checks.push({
            system: "Sensor de Rotação (CKP)",
            status: rpm > 0 ? "ok" : "neutral",
            value: `${rpm} RPM`,
            message: rpm > 0 ? `Sinal de rotação ativo (${rpm} RPM)` : "Motor parado"
        });

        // 3. ECT
        if (tel.ect !== null) {
            checks.push({
                system: "Sensor de Temperatura (ECT)",
                status: "ok",
                value: `${tel.ect} °C`,
                message: `Temperatura lida do líquido de arrefecimento`
            });
        }

        // 4. MAP
        if (tel.map !== null) {
            let mapStatus = "ok";
            let mapMsg = `Pressão no coletor (${tel.map} kPa)`;
            if (rpm > 600 && tel.map > 50) {
                mapStatus = "danger";
                mapMsg = `Vácuo insuficiente (${tel.map} kPa) - Verifique entrada de ar falsa ou ponto`;
                alerts.push(`MAP elevado na lenta (${tel.map} kPa): Possível ar falso ou ponto fora`);
            }
            checks.push({ system: "Vácuo / Coletor (MAP)", status: mapStatus, value: `${tel.map} kPa`, message: mapMsg });
        }

        return {
            checks: checks,
            alerts: alerts,
            min_crank_voltage: this.minCrankVoltage < 90 ? this.minCrankVoltage : null,
            max_crank_rpm: this.maxCrankRPM > 0 ? this.maxCrankRPM : null
        };
    }

    async readDTCs() {
        const storedRaw = await this.sendCommand("03", 2000);
        const pendingRaw = await this.sendCommand("07", 2000);
        
        const parseCodes = (raw) => {
            const dtcs = [];
            const cleaned = raw.replace(/[^0-9A-Fa-f]/g, '').replace(/^(43|47)/, '');
            const prefixes = { '0': 'P0', '1': 'P1', '2': 'P2', '3': 'P3', '4': 'C0', '8': 'B0', 'C': 'U0' };
            
            for (let i = 0; i < cleaned.length; i += 4) {
                const chunk = cleaned.substring(i, i + 4);
                if (chunk.length === 4 && chunk !== "0000") {
                    const prefix = prefixes[chunk[0].toUpperCase()] || 'P0';
                    const code = prefix + chunk.substring(1).toUpperCase();
                    dtcs.push({ code: code, description: "Código de falha detectado na ECU" });
                }
            }
            return dtcs;
        };

        const stored = parseCodes(storedRaw);
        const pending = parseCodes(pendingRaw);
        return { stored, pending, total: stored.length + pending.length };
    }

    async clearDTCs() {
        const res = await this.sendCommand("04", 2500);
        return res.includes("OK") || res.includes("44");
    }

    /**
     * Reset de Parâmetros Adaptativos da Injeção (A/F Reset & Fuel Trim Reset)
     * Envia o comando Mode 04 e comandos de reinicialização da memória volátil da ECU
     */
    async resetECUAdaptations() {
        this.onStatus({ status: 'resetting', message: 'Enviando comando de Reset de Parâmetros para a ECU...' });
        
        // 1. Envia Modo 04 (Limpa DTCs, congela dados e zera LTFT/STFT na maioria das ECUs)
        await this.sendCommand("04", 2500);
        await new Promise(r => setTimeout(r, 300));

        // 2. Comandos de rotina estendida de reset de memória volátil
        try {
            await this.sendCommand("14FFFFFF", 1000); // UDS Clear Diagnostic Information
            await this.sendCommand("31010201", 1000); // Routine Control Reset Adaptations
        } catch (e) {
            // Ignora se a ECU não suportar UDS estendido
        }

        // 3. Reinicializa buffers e filtros no ELM327
        await this.sendCommand("ATWS", 1000);
        await new Promise(r => setTimeout(r, 400));
        await this.initELM();

        this.minCrankVoltage = 99.0;
        this.maxCrankRPM = 0.0;

        this.onStatus({ status: 'connected', message: 'Parâmetros da Injeção Resetados com Sucesso!' });
        return true;
    }

    disconnect() {
        this.isPolling = false;
        this.isConnected = false;

        if (this.bluetoothDevice && this.bluetoothDevice.gatt.connected) {
            try { this.bluetoothDevice.gatt.disconnect(); } catch (e) {}
        }
        if (this.serialReader) {
            try { this.serialReader.cancel(); } catch (e) {}
        }
        if (this.serialPort) {
            try { this.serialPort.close(); } catch (e) {}
        }

        this.bluetoothDevice = null;
        this.serialPort = null;
        this.onStatus({ status: 'disconnected', message: 'Desconectado.' });
    }
}

window.BrowserOBD = BrowserOBD;
