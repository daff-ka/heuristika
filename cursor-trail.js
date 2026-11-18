// Pikselowy ślad kursora (zastępuje dawną siatkę symboli z dots-pattern.js).
// Ruch myszy zostawia kwadraty przyciągnięte do siatki CELL px, które
// w ciągu LIFE ms maleją i gasną; kliknięcie rozrzuca kilka pikseli
// promieniście. Inspiracja: kursor na vs-goods.store.
//
// Kanwa leży nad całą stroną z mix-blend-mode: difference (patrz
// .cursor-trail w styles.css) i rysuje na biało, więc ślad jest zawsze
// odwrotnością tła: biały na ciemnym motywie, czarny na jasnym, a na
// kolorowych elementach przyjmuje ich dopełnienie.
(function () {
    // Tylko prawdziwa mysz — na dotyku nie ma kursora, za którym iść.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const CELL = 8;             // siatka, do której przyciągany jest ślad
    const LIFE = 450;           // czas życia piksela (ms)
    const MAX_TRAIL = 40;       // ile pikseli śladu naraz
    const MAX_DOTS = 400;       // limit wszystkich pikseli (ślad + wybuchy)
    const BURST_COUNT = 14;     // pikseli na kliknięcie
    const BURST_RADIUS = 5 * CELL;
    const BURST_SIZES = [4, 8, 8, 12, 16, 24];

    const canvas = document.createElement('canvas');
    canvas.className = 'cursor-trail';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let dpr = 1;
    let dots = [];
    let last = null;
    let raf = null;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
    }

    // Pusta kanwa z mix-blend-mode na cały ekran i tak zmusza przeglądarkę do
    // mieszania jej z całą stroną przy każdym przewinięciu — więc gdy nie ma
    // śladu, jest ukryta.
    canvas.style.display = 'none';
    function wake() {
        if (raf === null) {
            canvas.style.display = '';
            raf = requestAnimationFrame(tick);
        }
    }

    function onMove(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const cx = Math.floor(e.clientX / CELL);
        const cy = Math.floor(e.clientY / CELL);
        const now = performance.now();
        const from = last || { cx, cy };
        // Przy szybkim ruchu wypełniamy komórki pomiędzy, żeby ślad był
        // ciągłą linią, a nie pojedynczymi kropkami.
        const steps = Math.max(Math.abs(cx - from.cx), Math.abs(cy - from.cy), 1);
        for (let i = 1; i <= steps; i++) {
            const x = Math.round(from.cx + (cx - from.cx) * i / steps);
            const y = Math.round(from.cy + (cy - from.cy) * i / steps);
            const prev = dots[dots.length - 1];
            if (prev && !prev.burst && prev.x === x && prev.y === y) prev.t = now;
            else dots.push({ x, y, t: now, cell: CELL });
        }
        const trail = dots.filter((d) => !d.burst);
        if (trail.length > MAX_TRAIL) {
            const drop = new Set(trail.slice(0, trail.length - MAX_TRAIL));
            dots = dots.filter((d) => !drop.has(d));
        }
        if (dots.length > MAX_DOTS) dots.splice(0, dots.length - MAX_DOTS);
        last = { cx, cy };
        wake();
    }

    function onDown(e) {
        if (e.button !== 0 || (e.pointerType && e.pointerType !== 'mouse')) return;
        const now = performance.now();
        for (let i = 0; i < BURST_COUNT; i++) {
            const dist = (0.1 + Math.random() * 0.9) * BURST_RADIUS;
            dots.push({
                burst: true,
                ox: e.clientX,
                oy: e.clientY,
                a: Math.random() * Math.PI * 2,
                r: dist,
                // Rozrzucony start, żeby piksele nie gasły wszystkie naraz.
                t: now - Math.random() * LIFE * 0.6,
                cell: BURST_SIZES[Math.floor(Math.random() * BURST_SIZES.length)],
            });
        }
        wake();
    }

    function tick(now) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = '#ffffff';
        dots = dots.filter((d) => now - d.t < LIFE);
        for (const d of dots) {
            const age = now - d.t;
            if (age < 0) continue;
            const life = 1 - age / LIFE;
            // Piksel kurczy się do środka swojej komórki i jednocześnie gaśnie.
            const size = Math.max(2, Math.round(d.cell * life));
            const inset = Math.floor((d.cell - size) / 2);
            let x = d.x;
            let y = d.y;
            if (d.burst) {
                x = Math.floor((d.ox + Math.cos(d.a) * d.r) / d.cell);
                y = Math.floor((d.oy + Math.sin(d.a) * d.r) / d.cell);
            }
            ctx.globalAlpha = life;
            ctx.fillRect(x * d.cell + inset, y * d.cell + inset, size, size);
        }
        ctx.globalAlpha = 1;
        if (dots.length) {
            raf = requestAnimationFrame(tick);
        } else {
            raf = null;
            last = null;
            canvas.style.display = 'none';
        }
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
})();
