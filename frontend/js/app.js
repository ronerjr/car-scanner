/**
 * Controlador Principal do Dashboard OBD-II
 */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // 1. Instanciação dos Manômetros
    const gaugeRPM = new Gauge('gauge-rpm', {
        min: 0, max: 7000, unit: 'RPM', title: 'Rotação', color: '#10b981', warningVal: 5500, dangerVal: 6500
    });
    const gaugeVoltage = new Gauge('gauge-voltage', {
        min: 8, max: 16, unit: 'Volts', title: 'Bateria', color: '#00f2fe', decimals: 1, dangerVal: 15.5
    });
    const gaugeMAP = new Gauge('gauge-map', {
        min: 10, max: 110, unit: 'kPa', title: 'Vácuo / MAP', color: '#f59e0b', warningVal: 55, dangerVal: 75
    });
    const gaugeSpeed = new Gauge('gauge-speed', {
        min: 0, max: 220, unit: 'km/h', title: 'Velocidade', color: '#3b82f6'
    });

    // 2. Instanciação do Gráfico de Partida
    const crankingChart = new CrankingChart('chart-cranking');

    // 3. Gerenciamento de Abas
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            tabButtons.forEach(b => {
                b.classList.remove('active', 'bg-cyan-500', 'text-slate-950', 'font-bold');
                b.classList.add('bg-slate-900/80', 'text-slate-300');
            });
            btn.classList.add('active', 'bg-cyan-500', 'text-slate-950', 'font-bold');
            btn.classList.remove('bg-slate-900/80', 'text-slate-300');

            tabContents.forEach(c => c.classList.add('hidden'));
            const target = document.getElementById(targetId);
            if (target) target.classList.remove('hidden');
        });
    });

    // 4. WebSocket e Conexão em Tempo Real
    let ws = null;
    let isRecording = false;
    let isBrowserBTActive = false;

    // Instância do Driver OBD-II do Navegador (Web Bluetooth)
    const browserOBD = new BrowserOBD(
        (packet) => {
            handleTelemetryPacket(packet);
        },
        (status) => {
            console.log("Status Browser OBD:", status);
            if (status.status === 'connected') {
                isBrowserBTActive = true;
                updateConnBadge(true, `Web Bluetooth (${status.name || 'Conectado'})`);
                document.getElementById('txt-port').textContent = 'BLUETOOTH DIRETO';
                document.getElementById('sim-bar').style.display = 'none';
                document.getElementById('btn-web-bt').innerHTML = '<i data-lucide="bluetooth-off" class="w-4 h-4 text-rose-300"></i><span>Desconectar BT</span>';
                document.getElementById('btn-web-bt').classList.replace('bg-blue-600', 'bg-rose-600');
                lucide.createIcons();
            } else if (status.status === 'disconnected') {
                isBrowserBTActive = false;
                updateConnBadge(false, "Desconectado");
                document.getElementById('btn-web-bt').innerHTML = '<i data-lucide="bluetooth" class="w-4 h-4 text-cyan-300"></i><span>Bluetooth Direto (Tablet/Chrome)</span>';
                document.getElementById('btn-web-bt').classList.replace('bg-rose-600', 'bg-blue-600');
                lucide.createIcons();
            }
        }
    );

    // Botão Web Bluetooth (Chrome / Tablet / Render)
    document.getElementById('btn-web-bt').addEventListener('click', async () => {
        if (isBrowserBTActive) {
            browserOBD.disconnect();
            return;
        }

        try {
            await browserOBD.connectBluetooth();
        } catch (err) {
            console.error("Falha no Web Bluetooth:", err);
            alert(err.message || "Erro ao conectar via Bluetooth.");
        }
    });

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket conectado.');
            if (!isBrowserBTActive) {
                updateConnBadge(true, "Conectado (Servidor)");
            }
        };

        ws.onmessage = (event) => {
            // Se o Web Bluetooth direto estiver ativo no navegador, ignora dados do backend para não sobrescrever
            if (isBrowserBTActive) return;
            try {
                const packet = JSON.parse(event.data);
                handleTelemetryPacket(packet);
            } catch (err) {
                console.error("Erro ao decodificar telemetria:", err);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket desconectado. Reconectando em 2s...');
            if (!isBrowserBTActive) {
                updateConnBadge(false, "Desconectado");
            }
            setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
            console.error('Erro no WebSocket:', err);
            ws.close();
        };
    }

    function updateConnBadge(connected, text) {
        const badge = document.getElementById('badge-conn');
        const txt = document.getElementById('txt-conn-status');
        if (connected) {
            badge.className = "px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-medium";
            txt.textContent = text;
        } else {
            badge.className = "px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 font-medium";
            txt.textContent = text;
        }
    }

    // 5. Processamento dos Dados em Tempo Real
    function handleTelemetryPacket(packet) {
        const tel = packet.telemetry;
        const diag = packet.diagnostic;
        const rec = packet.recording;

        if (!tel) return;

        // Atualização dos Manômetros
        gaugeRPM.setValue(tel.rpm || 0);
        gaugeVoltage.setValue(tel.voltage || 0);
        gaugeMAP.setValue(tel.map || 0);
        gaugeSpeed.setValue(tel.speed || 0);

        // Atualização dos Cards
        document.getElementById('card-ect').textContent = tel.ect !== null ? `${tel.ect} °C` : '-- °C';
        document.getElementById('card-iat').textContent = tel.iat !== null ? `${tel.iat} °C` : '-- °C';
        document.getElementById('card-tps').textContent = tel.tps !== null ? `${tel.tps}%` : '-- %';
        document.getElementById('card-timing').textContent = tel.timing_advance !== null ? `${tel.timing_advance}°` : '-- °';
        document.getElementById('card-load').textContent = tel.engine_load !== null ? `${tel.engine_load}%` : '-- %';
        document.getElementById('card-maf').textContent = tel.maf !== null ? `${tel.maf} g/s` : '-- g/s';

        // Atualização do Gráfico de Partida
        const timeStr = new Date().toLocaleTimeString().split(' ')[0];
        crankingChart.addDataPoint(timeStr, tel.voltage || 0, tel.rpm || 0, tel.map || 0);

        // Aba Combustível e Flex
        if (tel.ethanol_percent !== null) {
            document.getElementById('val-ethanol').textContent = `${Math.round(tel.ethanol_percent)}%`;
            const lblFuel = document.getElementById('lbl-fuel-type');
            if (tel.ethanol_percent > 70) {
                lblFuel.textContent = "Etanol";
                lblFuel.className = "text-emerald-400 font-bold";
            } else if (tel.ethanol_percent < 35) {
                lblFuel.textContent = "Gasolina";
                lblFuel.className = "text-amber-400 font-bold";
            } else {
                lblFuel.textContent = "Mistura Flex";
                lblFuel.className = "text-cyan-400 font-bold";
            }
        }

        // STFT e LTFT Trims
        if (tel.stft !== null) {
            document.getElementById('txt-stft').textContent = `${tel.stft > 0 ? '+' : ''}${tel.stft.toFixed(1)}%`;
            updateTrimBar('bar-stft', tel.stft);
        }
        if (tel.ltft !== null) {
            document.getElementById('txt-ltft').textContent = `${tel.ltft > 0 ? '+' : ''}${tel.ltft.toFixed(1)}%`;
            updateTrimBar('bar-ltft', tel.ltft);
        }
        if (tel.o2_b1s1 !== null) {
            document.getElementById('val-o2').textContent = `${tel.o2_b1s1.toFixed(3)} V`;
        }
        if (tel.fuel_pressure !== null) {
            document.getElementById('val-fuel-press').textContent = `${tel.fuel_pressure} kPa`;
        }

        // Diagnóstico e Estatísticas de Partida
        if (diag.min_crank_voltage !== null) {
            const vMinEl = document.getElementById('diag-vmin');
            vMinEl.textContent = `${diag.min_crank_voltage.toFixed(1)} V`;
            if (diag.min_crank_voltage < 9.6) {
                vMinEl.className = "text-3xl font-digital font-bold text-rose-400 mt-2";
                document.getElementById('diag-vmin-msg').textContent = "Crítico: Tensão abaixo de 9.6V na partida!";
            } else {
                vMinEl.className = "text-3xl font-digital font-bold text-cyan-400 mt-2";
                document.getElementById('diag-vmin-msg').textContent = "Saudável: Sem queda excessiva";
            }
        }
        if (diag.max_crank_rpm !== null) {
            document.getElementById('diag-maxrpm').textContent = `${Math.round(diag.max_crank_rpm)} RPM`;
        }

        // Checklist de Saúde
        renderChecklist(diag.checks);

        // Alertas
        renderAlerts(diag.alerts);

        // Atualização do Botão de Gravação
        if (rec) {
            isRecording = rec.is_recording;
            const btnRec = document.getElementById('btn-record');
            const btnTxt = document.getElementById('btn-record-txt');
            if (isRecording) {
                btnRec.classList.add('pulse-recording', 'bg-rose-600', 'text-white');
                btnTxt.textContent = `Gravando (${rec.samples})`;
            } else {
                btnRec.classList.remove('pulse-recording', 'bg-rose-600', 'text-white');
                btnTxt.textContent = "Gravar Partida";
            }
        }
    }

    function updateTrimBar(barId, trimVal) {
        const bar = document.getElementById(barId);
        if (!bar) return;
        const clamped = Math.max(-25, Math.min(25, trimVal));
        const pct = (clamped / 25) * 50; // 0% a 50% de largura a partir do centro
        if (clamped >= 0) {
            bar.style.left = '50%';
            bar.style.width = `${pct}%`;
            bar.className = `trim-bar-fill ${clamped > 15 ? 'bg-rose-500' : (clamped > 10 ? 'bg-amber-400' : 'bg-cyan-400')}`;
        } else {
            bar.style.left = `${50 + pct}%`;
            bar.style.width = `${Math.abs(pct)}%`;
            bar.className = `trim-bar-fill ${clamped < -15 ? 'bg-rose-500' : (clamped < -10 ? 'bg-amber-400' : 'bg-cyan-400')}`;
        }
    }

    function renderChecklist(checks) {
        const container = document.getElementById('checklist-container');
        if (!container || !checks) return;
        
        let html = '';
        checks.forEach(c => {
            let iconName = 'check-circle-2';
            let badgeClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            let borderClass = 'border-l-4 border-emerald-400';

            if (c.status === 'danger') {
                iconName = 'x-circle';
                badgeClass = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
                borderClass = 'border-l-4 border-rose-400';
            } else if (c.status === 'warning') {
                iconName = 'alert-triangle';
                badgeClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                borderClass = 'border-l-4 border-amber-400';
            } else if (c.status === 'neutral') {
                iconName = 'clock';
                badgeClass = 'text-slate-400 bg-slate-800 border-slate-700';
                borderClass = 'border-l-4 border-slate-500';
            }

            html += `
                <div class="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 ${borderClass} flex items-center justify-between gap-3">
                    <div>
                        <div class="text-xs font-bold text-white">${c.system}</div>
                        <div class="text-[11px] text-slate-400 mt-0.5">${c.message}</div>
                    </div>
                    <div class="px-2.5 py-1 rounded-lg border text-xs font-mono font-bold shrink-0 ${badgeClass}">
                        ${c.value}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        lucide.createIcons();
    }

    function renderAlerts(alerts) {
        const box = document.getElementById('box-alerts');
        const list = document.getElementById('alerts-list');
        const verdictTitle = document.getElementById('diag-verdict-title');
        const verdictSub = document.getElementById('diag-verdict-sub');

        if (!alerts || alerts.length === 0) {
            box.classList.add('hidden');
            verdictTitle.textContent = "Sistemas Normais";
            verdictTitle.className = "text-xl font-tech font-bold text-emerald-400 mt-2";
            verdictSub.textContent = "Nenhuma falha crítica detectada no momento";
            return;
        }

        box.classList.remove('hidden');
        verdictTitle.textContent = "Falhas Detectadas";
        verdictTitle.className = "text-xl font-tech font-bold text-rose-400 mt-2";
        verdictSub.textContent = `${alerts.length} item(ns) exigem atenção imediata`;

        let html = '';
        alerts.forEach(a => {
            html += `<li class="flex items-center gap-2 text-rose-300"><i data-lucide="chevron-right" class="w-3.5 h-3.5 text-rose-400 shrink-0"></i><span>${a}</span></li>`;
        });
        list.innerHTML = html;
        lucide.createIcons();
    }

    // 6. Controles REST: Portas, Conectar, Simulador
    async function loadPorts() {
        try {
            const res = await fetch('/api/ports');
            const data = await res.json();
            const sel = document.getElementById('sel-ports');
            sel.innerHTML = '<option value="SIM">Simulador Virtual</option>';
            data.ports.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.device;
                opt.textContent = `${p.device} (${p.description})${p.is_bluetooth ? ' [Bluetooth]' : ''}`;
                sel.appendChild(opt);
            });
        } catch (e) {
            console.error("Erro ao listar portas:", e);
        }
    }

    document.getElementById('btn-refresh-ports').addEventListener('click', loadPorts);

    document.getElementById('btn-connect').addEventListener('click', async () => {
        const sel = document.getElementById('sel-ports').value;
        const isSim = sel === "SIM";
        try {
            const res = await fetch('/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: isSim ? 'simulation' : 'hardware',
                    port: isSim ? null : sel,
                    baudrate: 38400
                })
            });
            const data = await res.json();
            if (res.ok) {
                document.getElementById('txt-port').textContent = isSim ? 'SIMULADOR' : sel;
                document.getElementById('sim-bar').style.display = isSim ? 'flex' : 'none';
                alert(data.message || "Conectado!");
            } else {
                alert(`Erro: ${data.detail || "Falha na conexão"}`);
            }
        } catch (e) {
            alert(`Erro na requisição: ${e}`);
        }
    });

    // Cenários de Simulação
    document.getElementById('sel-scenario').addEventListener('change', async (e) => {
        try {
            await fetch('/api/simulator/scenario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenario: e.target.value })
            });
            crankingChart.clear();
        } catch (err) {
            console.error(err);
        }
    });

    document.getElementById('btn-sim-crank').addEventListener('click', async () => {
        try {
            await fetch('/api/simulator/crank', { method: 'POST' });
        } catch (err) {
            console.error(err);
        }
    });

    document.getElementById('btn-clear-chart').addEventListener('click', () => {
        crankingChart.clear();
    });

    // 7. Scanner DTC
    document.getElementById('btn-scan-dtc').addEventListener('click', async () => {
        const resDiv = document.getElementById('dtc-results');
        resDiv.innerHTML = '<div class="p-6 text-center text-cyan-400 text-xs">Varrendo a ECU por códigos de erro...</div>';
        try {
            const res = await fetch('/api/dtc/read');
            const data = await res.json();

            let html = '';
            if (data.total === 0) {
                html = `
                    <div class="p-6 text-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                        <i data-lucide="check-circle" class="w-6 h-6 mx-auto mb-2"></i>
                        <b>Nenhum código de falha (DTC) armazenado na ECU!</b>
                    </div>
                `;
            } else {
                html += '<div class="space-y-2">';
                if (data.stored && data.stored.length > 0) {
                    html += '<div class="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">Falhas Confirmadas (Armazenadas)</div>';
                    data.stored.forEach(d => {
                        html += `
                            <div class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
                                <span class="px-2.5 py-1 rounded bg-rose-500/20 text-rose-400 font-mono font-bold text-xs shrink-0">${d.code}</span>
                                <div>
                                    <div class="text-xs font-bold text-white">${d.description}</div>
                                </div>
                            </div>
                        `;
                    });
                }
                if (data.pending && data.pending.length > 0) {
                    html += '<div class="text-xs font-bold text-amber-400 uppercase tracking-wider mt-4 mb-1">Falhas Pendentes</div>';
                    data.pending.forEach(d => {
                        html += `
                            <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                                <span class="px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 font-mono font-bold text-xs shrink-0">${d.code}</span>
                                <div>
                                    <div class="text-xs font-bold text-white">${d.description}</div>
                                </div>
                            </div>
                        `;
                    });
                }
                html += '</div>';
            }
            resDiv.innerHTML = html;
            lucide.createIcons();
        } catch (e) {
            resDiv.innerHTML = `<div class="p-4 text-rose-400 text-xs">Erro ao consultar DTCs: ${e}</div>`;
        }
    });

    document.getElementById('btn-clear-dtc').addEventListener('click', async () => {
        if (!confirm("Tem certeza que deseja apagar os códigos de erro da ECU e resetar a luz da injeção?")) return;
        try {
            if (isBrowserBTActive) {
                const ok = await browserOBD.clearDTCs();
                alert(ok ? "Códigos apagados da ECU com sucesso!" : "Comando enviado para a ECU.");
            } else {
                const res = await fetch('/api/dtc/clear', { method: 'POST' });
                const data = await res.json();
                alert(data.message || "Comando enviado.");
            }
            document.getElementById('btn-scan-dtc').click();
        } catch (e) {
            alert(`Erro ao apagar códigos: ${e}`);
        }
    });

    // Reset de Parâmetros Adaptativos da Injeção (A/F & Trims)
    document.getElementById('btn-reset-ecu').addEventListener('click', async () => {
        if (!confirm("Deseja executar o RESET DOS PARÂMETROS DA INJEÇÃO?\n\nIsso zerará os mapas adaptativos de combustível (STFT/LTFT) e forçará a ECU a recalcular a mistura e o A/F de fábrica.")) return;
        
        try {
            if (isBrowserBTActive) {
                await browserOBD.resetECUAdaptations();
                alert("Reset da Injeção concluído com sucesso via Web Bluetooth!");
            } else {
                const res = await fetch('/api/ecu/reset', { method: 'POST' });
                const data = await res.json();
                alert(data.message || "Reset concluído com sucesso!");
            }
            // Limpa mostradores visuais de STFT/LTFT
            updateTrimBar('bar-stft', 0);
            updateTrimBar('bar-ltft', 0);
            document.getElementById('txt-stft').textContent = "0.0%";
            document.getElementById('txt-ltft').textContent = "0.0%";
        } catch (e) {
            alert(`Erro ao executar reset da injeção: ${e}`);
        }
    });

    // 8. Gravação CSV & Logs
    document.getElementById('btn-record').addEventListener('click', async () => {
        try {
            if (!isRecording) {
                await fetch('/api/record/start', { method: 'POST' });
            } else {
                const res = await fetch('/api/record/stop', { method: 'POST' });
                const data = await res.json();
                alert(`Gravação finalizada! Salvo em ${data.result.filename} (${data.result.samples} amostras).`);
                loadLogs();
            }
        } catch (e) {
            alert(`Erro na gravação: ${e}`);
        }
    });

    async function loadLogs() {
        try {
            const res = await fetch('/api/logs');
            const data = await res.json();
            const listDiv = document.getElementById('logs-list');
            if (!data.logs || data.logs.length === 0) {
                listDiv.innerHTML = '<div class="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">Nenhum log gravado ainda. Clique em "Gravar Partida" no topo para gravar.</div>';
                return;
            }
            let html = '';
            data.logs.forEach(l => {
                html += `
                    <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <i data-lucide="file-text" class="w-4 h-4 text-blue-400"></i>
                            <div>
                                <div class="text-xs font-mono font-bold text-white">${l.filename}</div>
                                <div class="text-[10px] text-slate-400">${l.created_at} • ${l.size_kb} KB</div>
                            </div>
                        </div>
                        <a href="/api/logs/download/${l.filename}" download class="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs flex items-center gap-1">
                            <i data-lucide="download" class="w-3.5 h-3.5"></i> Baixar CSV
                        </a>
                    </div>
                `;
            });
            listDiv.innerHTML = html;
            lucide.createIcons();
        } catch (e) {
            console.error("Erro ao carregar logs:", e);
        }
    }

    document.getElementById('btn-refresh-logs').addEventListener('click', loadLogs);

    // Inicialização
    loadPorts();
    loadLogs();
    connectWebSocket();
});
