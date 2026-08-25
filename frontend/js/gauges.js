/**
 * Renderizador de Manômetros Circulares Automotivos em Canvas HTML5
 */
class Gauge {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.min = options.min || 0;
        this.max = options.max || 8000;
        this.value = options.min || 0;
        this.targetValue = this.value;
        this.unit = options.unit || "RPM";
        this.title = options.title || "MOTOR";
        this.color = options.color || "#00f2fe";
        this.warningVal = options.warningVal || null;
        this.dangerVal = options.dangerVal || null;
        this.decimals = options.decimals !== undefined ? options.decimals : 0;
        this.startAngle = Math.PI * 0.75;
        this.endAngle = Math.PI * 2.25;
        
        this.animate = this.animate.bind(this);
        this.animate();
    }

    setValue(val) {
        if (val === null || val === undefined) return;
        this.targetValue = Math.min(Math.max(Number(val), this.min), this.max);
    }

    animate() {
        // Interpolação suave do valor
        this.value += (this.targetValue - this.value) * 0.25;
        this.draw();
        requestAnimationFrame(this.animate);
    }

    draw() {
        if (!this.canvas || !this.ctx) return;
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const cx = width / 2;
        const cy = height / 2 + 10;
        const radius = Math.min(width, height) * 0.40;

        ctx.clearRect(0, 0, width, height);

        // 1. Arco de Fundo (Trilha)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, this.startAngle, this.endAngle);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.stroke();

        // 2. Arco de Valor Ativo
        const pct = (this.value - this.min) / (this.max - this.min);
        const currentAngle = this.startAngle + pct * (this.endAngle - this.startAngle);

        if (pct > 0.005) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, this.startAngle, currentAngle);

            let strokeColor = this.color;
            if (this.dangerVal !== null && this.value >= this.dangerVal) {
                strokeColor = "#f43f5e";
            } else if (this.warningVal !== null && this.value >= this.warningVal) {
                strokeColor = "#f59e0b";
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 14;
            ctx.lineCap = "round";
            ctx.shadowBlur = 15;
            ctx.shadowColor = strokeColor;
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset
        }

        // 3. Marcações / Ticks
        const numTicks = 8;
        for (let i = 0; i <= numTicks; i++) {
            const tPct = i / numTicks;
            const angle = this.startAngle + tPct * (this.endAngle - this.startAngle);
            const innerR = radius - 16;
            const outerR = radius - 8;
            
            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // 4. Texto Digital Central
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 26px Orbitron";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.value.toFixed(this.decimals), cx, cy - 8);

        // 5. Unidade
        ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
        ctx.font = "600 12px Rajdhani";
        ctx.fillText(this.unit, cx, cy + 18);

        // 6. Título do Manômetro
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = "700 11px Rajdhani";
        ctx.fillText(this.title.toUpperCase(), cx, cy + 34);
    }
}
