// NextHyke Renderer Process
document.addEventListener('DOMContentLoaded', () => {
    // 1. Verify Context Isolation Security Posture
    const isProcessIsolated = typeof window.process === 'undefined';
    const isRequireIsolated = typeof window.require === 'undefined';
    console.log(`[Security Audit] Context Isolation Active: process=${isProcessIsolated}, require=${isRequireIsolated}`);

    const statusDot = document.getElementById('worker-status-dot');
    const statusText = document.getElementById('worker-status-text');
    const pingBtn = document.getElementById('btn-ping-worker');
    const pingResult = document.getElementById('ping-result-text');
    const vramUsage = document.getElementById('vram-usage');

    if (!window.nextHykeAPI) {
        console.error('[Renderer] window.nextHykeAPI is not exposed!');
        if (statusText) statusText.textContent = 'API Bridge Failed';
        return;
    }

    // Ping worker heartbeat
    if (pingBtn) {
        pingBtn.addEventListener('click', async () => {
            pingResult.textContent = 'Sending heartbeat...';
            const t0 = performance.now();
            try {
                const res = await window.nextHykeAPI.pingWorker();
                const latency = (performance.now() - t0).toFixed(2);
                pingResult.textContent = `PONG (${res.status}) - Latency: ${latency} ms`;
                statusDot.classList.add('connected');
                statusText.textContent = 'Native Engine Connected';
            } catch (err) {
                pingResult.textContent = `Error: ${err.message}`;
            }
        });
    }

    // Listen for worker status events
    window.nextHykeAPI.onWorkerStatus((status) => {
        console.log(`[Worker Status] ${status}`);
        if (status === 'crashed') {
            statusDot.classList.remove('connected');
            statusDot.style.background = '#ff3366';
            statusText.textContent = 'Worker Crashed - Restarting';
        }
    });

    // Check status initially after 1.5s
    setTimeout(async () => {
        try {
            const res = await window.nextHykeAPI.pingWorker();
            if (res && res.status === 'pong') {
                statusDot.classList.add('connected');
                statusText.textContent = 'Native Engine Connected';
                pingResult.textContent = `Initial heartbeat verified (${res.status})`;
            }
        } catch (e) {
            console.log('[Renderer] Waiting for worker startup...');
        }
    }, 1500);
});
