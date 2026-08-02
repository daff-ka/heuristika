(function () {

    const canvas = document.getElementById('footerDots');
    if (!canvas) return;
    const footerEl = canvas.closest('.footer');
    if (!footerEl) return;
    const ctx = canvas.getContext('2d');

    let width, height, dpr;

    const PATTERN_SCALE = window.matchMedia('(max-width: 760px)').matches ? 0.75 : 1;
    const CELL_X = 42 * PATTERN_SCALE;
    const CELL_Y = 42 * PATTERN_SCALE;
    const FONT_SIZE = 24 * PATTERN_SCALE;
    const PATTERN_CHARS = "△@=-+";

    const HOVER_RADIUS = 200 * PATTERN_SCALE;
    const TRAIL_DECAY = 0.93;
    const AMBIENT_ALPHA = 0;
    const CASCADE_FREQ = 0.5;
    const CASCADE_SPEED = 0.45;

    const COLOR_RGB_DARK = [255, 255, 255];
    const COLOR_RGB_LIGHT = [10, 10, 10];
    const MAX_ALPHA = 0.1;

    let cols, rows;
    let cells = [];

    let mouse = { x: -9999, y: -9999 };
    let targetMouse = { x: -9999, y: -9999 };

    function resize() {
        dpr = window.devicePixelRatio || 1;
        width = footerEl.clientWidth;
        height = footerEl.clientHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildGrid();
    }

    function buildGrid() {
        cols = Math.ceil(width / CELL_X) + 1;
        rows = Math.ceil(height / CELL_Y) + 1;
        cells = [];
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const ox = i * CELL_X;
                const oy = j * CELL_Y;
                cells.push({
                    ox, oy,
                    x: ox, y: oy,
                    targetX: ox, targetY: oy,
                    scale: 1,
                    targetScale: 1,
                    alpha: 0,
                    targetAlpha: 0,
                    heat: 0
                });
            }
        }
    }

    function onMove(e) {
        const rect = canvas.getBoundingClientRect();
        targetMouse.x = e.clientX - rect.left;
        targetMouse.y = e.clientY - rect.top;
    }

    function onLeave() {
        targetMouse.x = -9999;
        targetMouse.y = -9999;
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (t) onMove(t);
    }, { passive: true });
    window.addEventListener('touchend', onLeave);

    let t = 0;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function animate() {
        t += 0.016;
        mouse.x += (targetMouse.x - mouse.x) * 0.2;
        mouse.y += (targetMouse.y - mouse.y) * 0.2;

        const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
        const colorRGB = (isLightTheme ? COLOR_RGB_LIGHT : COLOR_RGB_DARK).join(',');

        ctx.clearRect(0, 0, width, height);
        ctx.font = `${FONT_SIZE}px 'SF Mono', 'Menlo', 'Consolas', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const c of cells) {
            const dx = c.ox - mouse.x;
            const dy = c.oy - mouse.y;
            const dist = Math.hypot(dx, dy);
            const instantStrength = dist < HOVER_RADIUS ? 1 - dist / HOVER_RADIUS : 0;
            const instantEased = instantStrength * instantStrength * (3 - 2 * instantStrength);

            c.heat = Math.max(c.heat * TRAIL_DECAY, instantEased);
            const eased = c.heat;
            const inHover = eased > 0.01;

            c.targetAlpha = inHover ? AMBIENT_ALPHA + (MAX_ALPHA - AMBIENT_ALPHA) * eased : AMBIENT_ALPHA;
            c.targetX = c.ox;
            c.targetY = c.oy;
            c.targetScale = 1.2;

            c.x += (c.targetX - c.x) * 0.15;
            c.y += (c.targetY - c.y) * 0.15;
            c.scale += (c.targetScale - c.scale) * 0.15;
            c.alpha += (c.targetAlpha - c.alpha) * 0.12;

            if (c.alpha <= 0.03) continue;

            const phase = (Math.sin(c.ox * CASCADE_FREQ + c.oy * CASCADE_FREQ - t * CASCADE_SPEED) + 1) / 2;
            const charIndex = Math.min(PATTERN_CHARS.length - 1, Math.floor(phase * PATTERN_CHARS.length));
            const ch = PATTERN_CHARS[charIndex];
            if (ch === ' ') continue;

            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.scale(c.scale, c.scale);
            ctx.fillStyle = `rgba(${colorRGB},${c.alpha})`;
            ctx.fillText(ch, 0, 0);
            ctx.restore();
        }

        requestAnimationFrame(animate);
    }

    resize();
    animate();
})();
