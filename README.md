# 🚗 AutoDiag Pro: Scanner OBD-II Bluetooth & Dashboard de Diagnóstico

Sistema completo de diagnóstico automotivo via porta OBD-II com foco na identificação de problemas de partida difícil (*hard start*), falhas de injeção eletrônica, monitoramento de mistura Flex (A/F), vácuo no coletor, saúde de bateria e leitura/limpeza de códigos de falha (DTC).

---

## 📋 Funcionalidades Principais

1. **Dashboard Visual em Tempo Real (Cockpit):**
   - Manômetros circulares em alta taxa de atualização para Rotação (RPM), Tensão da Bateria (V), Pressão no Coletor (MAP/Vácuo) e Velocidade.
   - Mostradores digitais para Temperatura de Arrefecimento (ECT), Temperatura do Ar (IAT), Posição da Borboleta (TPS), Ponto de Ignição e Carga do Motor.

2. **Módulo de Diagnóstico de Partida:**
   - **Gráfico de Alta Resolução da Partida:** Traçado simultâneo da curva de queda de Tensão (V), subida de RPM e oscilação de Vácuo.
   - **Registro de Vmin:** Captura a menor voltagem atingida durante o arranque (alerta se cair abaixo de 9.6V).
   - **Checklist Inteligente:** Avaliação automática em tempo real dos sistemas (Bateria, CKP, ECT vs IAT, Vácuo, Mistura).

3. **Análise de Combustível & A/F Flex:**
   - Detecção da porcentagem de Etanol / Gasolina programada na ECU (PID 52).
   - Ajustes de Combustível de Curto e Longo Prazo (STFT / LTFT) com barras gráficas de desvio.
   - Monitoramento da Sonda Lambda 1 e Pressão da Linha de Combustível.

4. **Scanner de Falhas (DTC):**
   - Leitura de códigos armazenados (Modo 03) e pendentes (Modo 07).
   - Tradução e descrição em português com instruções mecânicas.
   - Função de apagar códigos e resetar a luz da injeção no painel (Modo 04).

5. **Gravador de Telemetria (CSV):**
   - Gravação de partidas e testes de rodagem para exportação em planilha CSV.

6. **Modo Simulador de ECU Integrado:**
   - Permite testar todo o sistema e simular cenários de defeito (Bateria fraca, Sensor ECT travado, A/F incorreto, Vácuo com entrada de ar falsa, Falha de Sensor de Rotação).

---

## 🌐 Como Usar no Tablet / Render via Web Bluetooth (Sem Notebook)

Você pode subir este app no **Render** (ou qualquer hospedagem com HTTPS) e usá-lo diretamente no **Tablet / Celular Android** via navegador:

1. Suba o projeto para o seu GitHub e conecte no [Render](https://render.com) como **Web Service** (o arquivo `render.yaml` já está configurado!).
2. Abra a URL HTTPS do Render no **Google Chrome do Tablet**.
3. Clique no botão azul **"Bluetooth Direto (Tablet/Chrome)"** no topo.
4. O navegador abrirá a janela nativa de Bluetooth para você selecionar o seu leitor OBD-II.
5. Pronto! O navegador do tablet fará todo o processamento dos dados e diagnóstico em tempo real sem depender de servidor local.

---

## 🔌 Como Conectar o Scanner Bluetooth no Carro (Windows com Notebook)

1. Conecte o leitor OBD-II Bluetooth (ELM327) na porta OBD-II do seu carro.
2. Ligue a chave do carro (não precisa ligar o motor ainda).
3. No Windows:
   - Vá em **Configurações > Bluetooth e outros dispositivos > Adicionar dispositivo > Bluetooth**.
   - Selecione o dispositivo (geralmente chamado de `OBDII`, `OBD2-ELM327` ou similar).
   - Se pedir PIN, digite `1234` ou `0000`.
4. Uma porta serial virtual (ex: `COM3`, `COM4`) será criada automaticamente pelo Windows.
5. Inicie o sistema localmente (`python run.py`), selecione a porta serial encontrada e clique em **Conectar**.

---

## 🚀 Como Executar

Abra o terminal na pasta do projeto e execute:

```powershell
python run.py
```

O navegador abrirá automaticamente em `http://localhost:8000`.
