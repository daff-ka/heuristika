// Wspólna nawigacja dla wszystkich stron: menu mobilne, poświata na
// górnej krawędzi i zwężanie po przewinięciu. Wcześniej żyło inline tylko
// w index.html, przez co podstrony miały starszą wersję nav.

(function () {
    const nav = document.querySelector('.nav');
    const toggle = document.querySelector('.nav-toggle');
    if (!nav || !toggle) return;

    function closeMenu() {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('.nav-links a, .nav-right button').forEach((el) => {
        el.addEventListener('click', closeMenu);
    });

    // Klik poza obszarem rozwiniętego menu (na mobile) — zamyka je.
    // Nasłuch na 'pointerdown', nie 'click', żeby zamknąć menu ZANIM
    // ewentualny inny element pod spodem obsłuży swój własny klik
    // (click odpala się dopiero po pointerup, więc np. link pod menu
    // zdążyłby "przebić się" jeszcze z menu otwartym).
    document.addEventListener('pointerdown', (e) => {
        if (nav.classList.contains('is-open') && !nav.contains(e.target)) {
            closeMenu();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 760) closeMenu();
    });
})();

// Poświata na ramce nav — SVG <rect> z zaokrągleniem (rx), obrysowany
// radialGradient zamiast prostego prostokątnego paska nałożonego na
// górną krawędź. Stroke leży NA tej samej zaokrąglonej ścieżce co
// kontener, więc naturalnie podąża za łukiem w rogach (żadnego
// marginesu/maski potrzebnego — to była łatka na zły fundament).
// Gradient śledzi kursor w czasie rzeczywistym (lerp przez rAF) od
// momentu wjechania nim w .nav, widoczny nad wszystkim pod myszą.
(function () {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    const RADIUS = 12; // musi zgadzać się z border-radius .nav w CSS
    const STROKE_WIDTH = 1;
    const GLOW_RADIUS = 160; // promień radialGradientu = "połowa namiotu"

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'nav-glow-svg');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(svgNS, 'defs');
    const gradId = 'nav-glow-gradient';
    const gradient = document.createElementNS(svgNS, 'radialGradient');
    gradient.setAttribute('id', gradId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('cy', '0');
    gradient.setAttribute('r', String(GLOW_RADIUS));

    const stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.style.stopColor = 'var(--nav-glow)';
    const stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.style.stopColor = 'var(--nav-glow)';
    stop2.style.stopOpacity = '0';
    gradient.append(stop1, stop2);
    defs.appendChild(gradient);

    // Maska: biała (widoczna) tuż przy górnej krawędzi, gaśnie do
    // czarnej (niewidoczna) w połowie wysokości .nav (patrz resize()
    // — y2 liczone jako h/2, nie sztywna stała) — tak jak w
    // referencji efekt nie "spływa" po bokach pigułki, tylko zostaje
    // przy górnej krawędzi i płynnie znika wchodząc w boczne krawędzie,
    // zamiast twardo się urywać.
    const maskId = 'nav-glow-mask';
    const maskFadeId = 'nav-glow-mask-fade';
    const mask = document.createElementNS(svgNS, 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    const maskGradient = document.createElementNS(svgNS, 'linearGradient');
    maskGradient.setAttribute('id', maskFadeId);
    maskGradient.setAttribute('x1', '0');
    maskGradient.setAttribute('y1', '0');
    maskGradient.setAttribute('x2', '0');
    maskGradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    const maskStop1 = document.createElementNS(svgNS, 'stop');
    maskStop1.setAttribute('offset', '0%');
    maskStop1.style.stopColor = '#fff';
    const maskStop2 = document.createElementNS(svgNS, 'stop');
    maskStop2.setAttribute('offset', '100%');
    maskStop2.style.stopColor = '#000';
    maskGradient.append(maskStop1, maskStop2);
    const maskRect = document.createElementNS(svgNS, 'rect');
    maskRect.setAttribute('x', '0');
    maskRect.setAttribute('y', '0');
    maskRect.setAttribute('fill', `url(#${maskFadeId})`);
    mask.append(maskGradient, maskRect);
    defs.appendChild(mask);

    // Ścieżka (nie <rect>) celowo OTWARTA na dole — lewy bok w górę,
    // przez oba górne rogi, przez górną krawędź, w dół prawym bokiem.
    // Bez dolnej krawędzi i bez dolnych rogów, więc animowana
    // poświata nigdy tam nie dotrze (naturalny stroke <rect>
    // obejmowałby cały obwód, w tym dół). Maska dodatkowo gasi ją na
    // bokach, więc realnie widoczna jest tylko na górnej krawędzi.
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', `url(#${gradId})`);
    path.setAttribute('stroke-width', String(STROKE_WIDTH));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('mask', `url(#${maskId})`);

    svg.append(defs, path);
    nav.appendChild(svg);

    function resize() {
        const w = nav.clientWidth;
        const h = nav.clientHeight;
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        maskGradient.setAttribute('y2', String(h / 2));
        maskRect.setAttribute('width', String(w));
        maskRect.setAttribute('height', String(h));
        const inset = STROKE_WIDTH / 2;
        const r = Math.max(0, RADIUS - inset);
        const d = `M ${inset} ${h - inset}` +
            ` L ${inset} ${inset + r}` +
            ` A ${r} ${r} 0 0 1 ${inset + r} ${inset}` +
            ` L ${w - inset - r} ${inset}` +
            ` A ${r} ${r} 0 0 1 ${w - inset} ${inset + r}` +
            ` L ${w - inset} ${h - inset}`;
        path.setAttribute('d', d);
    }
    resize();
    window.addEventListener('resize', resize);
    // .nav zmienia szerokość płynną transition (is-scrolled) — ResizeObserver
    // łapie te zmiany klatka po klatce, nie tylko na resize okna.
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(resize).observe(nav);
    }

    let targetX = 0;
    let currentX = 0;
    let active = false;

    nav.addEventListener('mousemove', (e) => {
        const boundRect = nav.getBoundingClientRect();
        targetX = Math.min(Math.max(e.clientX - boundRect.left, 0), boundRect.width);
        if (!active) {
            active = true;
            currentX = targetX;
            nav.classList.add('is-glowing');
        }
    });

    nav.addEventListener('mouseleave', () => {
        active = false;
        nav.classList.remove('is-glowing');
    });

    function raf() {
        currentX += (targetX - currentX) * 0.25;
        gradient.setAttribute('cx', String(currentX));
        requestAnimationFrame(raf);
    }
    raf();
})();

// Nav startuje SZERSZY (1600px), a po przewinięciu strony w dół
// zwęża się do 1320px (klasa .is-scrolled, patrz CSS) — bez
// żadnego związku z hoverem, tylko pozycja scrolla. Powrót do
// szerokiego następuje przy samej górnej krawędzi strony.
// Lenis wygładza scroll przez lerp (nie natywny window.scrollY) —
// liczony jest z opóźnieniem względem faktycznego celu scrolla, więc
// pod samą górną krawędzią window.scrollY "dojeżdża" do 0 zauważalnie
// wolniej niż realny zamiar użytkownika. lenis.targetScroll to cel
// scrolla ZANIM się do niego wygładzi, więc reaguje bez tej zwłoki.
(function () {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const THRESHOLD = 2;
    function sync() {
        const y = window.lenis ? window.lenis.targetScroll : window.scrollY;
        nav.classList.toggle('is-scrolled', y > THRESHOLD);
    }
    sync();
    window.addEventListener('scroll', sync, { passive: true });
})();
