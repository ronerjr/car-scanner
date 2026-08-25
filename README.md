# 🚗 AutoDiag Pro: Scanner Automotivo OBD-II & Telemetria em Tempo Real

[![Render](https://img.shields.io/badge/Deploy%20on-Render-46E3B7?style=flat-square&logo=render&logoColor=white)](https://render.com)
[![Web Bluetooth](https://img.shields.io/badge/API-Web%20Bluetooth-0082FC?style=flat-square&logo=bluetooth&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

Sistema completo e moderno de diagnóstico automotivo via porta **OBD-II (SAE J1979 / ELM327)** com suporte nativo a **Web Bluetooth API** (conectando direto pelo navegador Chrome em tablets ou celulares Android), backend Python em **FastAPI** e **Dashboard Reativo em Tempo Real**.

Projetado especialmente para **diagnosticar falhas complexas de injeção eletrônica, problemas de partida a frio (hard start), descalibração de A/F Flex, monitoramento de vácuo do coletor (MAP), análise de queda de tensão da bateria e leitura/limpeza profunda de códigos de falha (DTCs)**.

---

## 📸 Recursos do Sistema

```
+-----------------------------------------------------------------------------------+
|                            AUTODIAG PRO OBD-II                                    |
| [Status: CONECTADO] [Porta: WEB BLUETOOTH] [Protocolo: ISO 15765-4 CAN]           |
+-----------------------------------------------------------------------------------+
|  [🚗 PAINEL GERAL]   [⚡ DIAG. PARTIDA]   [⛽ COMBUSTÍVEL]   [🔍 SCANNER]   [📁 LOGS]  |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|    ( 850 RPM )        ( 14.1 V )          ( 38 kPa )          ( 0 km/h )          |
|     [ ROTAÇÃO ]       [ BATERIA ]        [ MAP/VÁCUO ]       [ VELOCIDADE ]       |
|                                                                                   |
|  ECT: 89°C  |  IAT: 24°C  |  TPS: 12%  |  PONTO: +9.0°  |  STFT: +1.2%  |  A/F: 27%  |
+-----------------------------------------------------------------------------------+
```

### 1. 🎛️ Painel Geral (Cockpit)
* **Manômetros em HTML5 Canvas (60 FPS):** Rotação (RPM), Tensão da Bateria (V), Pressão Absoluta no Coletor (MAP em kPa) e Velocidade (km/h).
* **Mostradores Digitais:** Temperatura de Arrefecimento (ECT), Temperatura do Ar de Admissão (IAT), Posição da Borboleta (TPS), Avanço do Ponto de Ignição e Carga do Motor calculada.

### 2. ⚡ Módulo de Diagnóstico de Partida (Hard Start Analyzer)
* **Gráfico de Alta Resolução:** Traçado síncrono da queda de tensão da bateria vs. subida de RPM do motor de arranque.
* **Detecção de $V_{\text{min}}$:** Captura o menor pico de voltagem durante a ignição (alerta se $V < 9.6\text{V}$).
* **Checklist Automatizado:** Validação automática de integridade do sensor de rotação (CKP), coerência térmica (ECT vs IAT), vedação mecânica por vácuo e limites de injeção.

### 3. ⛽ Análise de Mistura & Combustível Flex
* **Reconhecimento A/F (% Etanol - PID 52):** Mostra a porcentagem exata de álcool calculada pela central.
* **Ajustes de Combustível (STFT e LTFT):** Barras dinâmicas de desvio percentual de mistura rica/pobre (-25% a +25%).
* **Sonda Lambda 1 (O2) & Pressão da Linha de Combustível.**

### 4. 🔍 Scanner de Falhas Profundo (DTCs, Freeze Frame & Misfires)
* **Leitura de DTCs:** Varre memórias de falhas confirmadas (Modo 03) e pendentes (Modo 07) com descrições mecânicas em português.
* **📸 Caixa Preta (Freeze Frame - Modo 02):** Exibe a "fotografia" exata de todos os sensores no instante em que a falha aconteceu.
* **🔥 Contador de Misfires por Cilindro (Modo 06):** Monitora falhas de queima individuais nos cilindros 1, 2, 3 e 4.
* **🔄 Reset de Parâmetros da Injeção (Modo 04 & UDS):** Zera os mapas autoadaptativos (STFT/LTFT) e força a ECU a recalcular a mistura limpa de fábrica.

### 5. 📁 Gravador de Telemetria (CSV Real)
* Grava sessões de condução e viradas de chave em tempo real com exportação instantânea para arquivos `.csv`.

---

## 🛠️ Requisitos de Hardware

1. Qualquer **Adaptador OBD-II Bluetooth ELM327** (versão 1.5 ou 2.1), como:
   * ELM327 Bluetooth Mini (azul clássico)
   * VGate iCar Pro Bluetooth / BLE
   * OBDLink LX / MX
   * Adaptadores USB/Serial FTDI (se usar no PC)
2. Qualquer veículo com porta OBD-II (fabricados a partir de 2000 na Europa/EUA e 2010 no Brasil).

---

## 🚀 Como Usar na sua Casa

Você pode rodar este projeto de **3 maneiras diferentes**:

---

### Método 1: Direto no Tablet / Celular Android via Web Bluetooth (Sem precisar de PC no carro)

Graças à **Web Bluetooth API**, você não precisa instalar nada no tablet.

1. Suba o projeto para a nuvem no [Render](https://render.com) (ou acesse uma instância hospedada com HTTPS).
2. Abra a página no **Google Chrome do Tablet / Smartphone Android**.
3. Conecte o leitor ELM327 na porta OBD-II do carro e ligue a chave.
4. Clique no botão azul **"Bluetooth Direto (Tablet/Chrome)"** no topo do Dashboard.
5. Selecione o seu leitor OBD-II na janela do navegador e confirme.
6. **Pronto!** O navegador fará toda a leitura e diagnóstico com latência zero.

---

### Método 2: Rodando Localmente com Python (Windows / Linux / Mac)

Ideal para quem quer rodar direto no notebook ou conectar via cabo USB / porta serial virtual.

#### 1. Clone o repositório:
```bash
git clone https://github.com/ronerjr/car-scanner.git
cd car-scanner
```

#### 2. Crie e ative um ambiente virtual (opcional, mas recomendado):
```bash
python -m venv .venv
# No Windows:
.venv\Scripts\activate
# No Linux/Mac:
source .venv/bin/activate
```

#### 3. Instale as dependências:
```bash
pip install -r requirements.txt
```

#### 4. Inicie o aplicativo:
```bash
python run.py
```
O navegador abrirá automaticamente em `http://localhost:8000`.

---

### Método 3: Deploy com 1 Clique no Render (Grátis)

O repositório já inclui o arquivo [`render.yaml`](file:///c:/Users/roner/Documents/repo/car-scanner/render.yaml) pré-configurado:

1. Crie uma conta gratuita no [Render](https://render.com).
2. Clique em **New +** > **Blueprint** e conecte este repositório.
3. O Render detectará automaticamente o `render.yaml` e fará o deploy do Web Service com certificado **HTTPS** gratuito.
4. Acesse a URL gerada pelo navegador do seu celular/tablet.

---

## 📂 Estrutura do Projeto

```
car-scanner/
├── backend/
│   ├── app.py                # Servidor FastAPI com WebSockets e rotas REST
│   ├── elm327.py             # Driver de baixo nível ELM327 e parser SAE J1979
│   ├── diagnostic.py         # Motor de inteligência diagnóstica e regras automotivas
│   ├── simulator.py          # Simulador de ECU com cenários de falha para testes
│   └── logger.py             # Gerenciador de logs e exportador CSV
├── frontend/
│   ├── index.html            # Dashboard visual responsivo (Dark Tech UI)
│   ├── css/
│   │   └── styles.css        # Estilos customizados e animações
│   └── js/
│       ├── app.js            # Controlador da interface e integração de dados
│       ├── browser_obd.js    # Driver Web Bluetooth & Web Serial nativo do navegador
│       ├── gauges.js         # Manômetros circulares em Canvas HTML5
│       └── charts.js         # Gráficos em tempo real com Chart.js
├── render.yaml               # Configuração de deploy contínuo no Render
├── requirements.txt          # Dependências Python
└── run.py                    # Script inicializador com abertura de navegador
```

---

## 📖 Guia Prático de Interpretação dos Dados

| Parâmetro | Faixa Saudável | O que indica se estiver fora? |
| :--- | :--- | :--- |
| **STFT (Short Term Fuel Trim)** | -5.0% a +5.0% | **Acima de +15% a +25%:** Falta de combustível (bomba fraca, bico entupido) ou entrada de ar falsa.<br>**Abaixo de -15%:** Excesso de combustível (bico travado aberto, válvula canister travada). |
| **MAP (Vácuo no Coletor)** | 28 a 38 kPa (na lenta) | **Acima de 45 kPa:** Entrada de ar falsa, correia fora de ponto ou válvulas sem vedação. |
| **Queda de Tensão na Partida** | Acima de 9.8 V | **Abaixo de 9.6 V:** Bateria descarregada, motor de arranque pesado ou risco de reset na ECU. |
| **Rotação no Arranque (CKP)** | 180 a 280 RPM | **0 RPM durante o giro:** Sensor de rotação com defeito ou sem sinal (a ECU não injeta combustível). |
| **A/F Flex (% Etanol)** | Conforme o tanque | **Descalibrado:** A ECU injeta mapa errado, causando afogamento ou partida ríspida. |

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações.
