/**
 * Gráficos em tempo real para Análise de Partida e Sonda Lambda
 */
class CrankingChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.maxPoints = 120; // aprox 6-8 segundos de histórico
        this.chart = new Chart(this.canvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Tensão Bateria (V)',
                        data: [],
                        borderColor: '#00f2fe',
                        backgroundColor: 'rgba(0, 242, 254, 0.1)',
                        borderWidth: 2.5,
                        yAxisID: 'yVoltage',
                        tension: 0.3,
                        pointRadius: 0
                    },
                    {
                        label: 'Rotação (RPM)',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 2,
                        yAxisID: 'yRPM',
                        tension: 0.3,
                        pointRadius: 0
                    },
                    {
                        label: 'Pressão MAP (kPa)',
                        data: [],
                        borderColor: '#f59e0b',
                        borderDash: [4, 4],
                        borderWidth: 1.8,
                        yAxisID: 'yMAP',
                        tension: 0.2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        display: false
                    },
                    yVoltage: {
                        type: 'linear',
                        position: 'left',
                        min: 6,
                        max: 16,
                        title: {
                            display: true,
                            text: 'Tensão (V)',
                            color: '#00f2fe',
                            font: { family: 'Rajdhani', size: 12, weight: 'bold' }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.06)' },
                        ticks: { color: '#00f2fe' }
                    },
                    yRPM: {
                        type: 'linear',
                        position: 'right',
                        min: 0,
                        max: 3000,
                        title: {
                            display: true,
                            text: 'RPM',
                            color: '#10b981',
                            font: { family: 'Rajdhani', size: 12, weight: 'bold' }
                        },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#10b981' }
                    },
                    yMAP: {
                        type: 'linear',
                        display: false,
                        min: 0,
                        max: 120
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#cbd5e1',
                            font: { family: 'Rajdhani', size: 12 }
                        }
                    }
                }
            }
        });
    }

    addDataPoint(timeLabel, voltage, rpm, mapVal) {
        if (!this.chart) return;
        const labels = this.chart.data.labels;
        const vData = this.chart.data.datasets[0].data;
        const rData = this.chart.data.datasets[1].data;
        const mData = this.chart.data.datasets[2].data;

        labels.push(timeLabel);
        vData.push(voltage);
        rData.push(rpm);
        mData.push(mapVal);

        if (labels.length > this.maxPoints) {
            labels.shift();
            vData.shift();
            rData.shift();
            mData.shift();
        }

        this.chart.update('none'); // Update sem recalcular animação pesada
    }

    clear() {
        if (!this.chart) return;
        this.chart.data.labels = [];
        this.chart.data.datasets.forEach(ds => ds.data = []);
        this.chart.update();
    }
}
