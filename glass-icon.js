// Szklany wariant brył (domyślny; ?hero=keycap wyłącza): squircle ze szkła z ikoną zatopioną
// w środku — w hero i w kafelkach taksonomii. Renderer i SDF pochodzą z
// https://github.com/phileeppov/glass (MIT, patrz vendor/glass/LICENSE) —
// tutaj tylko przygotowanie ikony, parametry wyglądu i podpięcie pod
// stronę (rozmiar, tilt, klik, motyw). Shader jest płaski, więc bez obrotu.
import { GlassRenderer, ICON_SCALE, LOGO_FILL, SDF_SPREAD } from './vendor/glass/renderer.js';
import { buildSdf } from './vendor/glass/sdf.js';

// Rozdzielczość tekstur ikony. Ikony to pixel art 200×200, więc 512 z
// rysowaniem bez wygładzania zachowuje ostre schodki pikseli, a SDF i tak
// liczy krawędź analitycznie, więc pod soczewką nie widać rozmycia.
const LAYER = 512;
// Jeden pełny cykl falowania szkła (sekundy).
const LOOP_S = 7;

// Wygląd dla obu motywów strony. Bazą są presety „Night” (ciemny) i
// „Studio” (jasny) z referencji, ale mocniej: ikony to cienkie kontury, więc
// żeby krawędź miała co wciągać i rozszczepiać, ramka jest szersza, a
// refraction i dispersion powyżej zakresu suwaków referencji (tam max 1.5
// i 1). Kolor tła szkła i ikony przychodzi ze zmiennych CSS (patrz
// readColors), więc zawsze pasuje do motywu i miejsca na stronie.
const LOOKS = {
    dark: {
        n: 5, refraction: 1.7, dispersion: 1.7, edge: 0.26, liquid: 0.85,
        angle: Math.PI / 4, spread: 0.7, volume: 0.45, depth: 1, motion: 0.5,
        size: 0.61, sideMix: 1, sideTwo: 1, facet: 0,
        background: 'dark', tintMix: 1,
    },
    light: {
        n: 5, refraction: 1.7, dispersion: 1.7, edge: 0.26, liquid: 0.85,
        angle: Math.PI / 4, spread: 0.7, volume: 0.35, depth: 1, motion: 0.5,
        size: 0.61, sideMix: 1, sideTwo: 1, facet: 0,
        background: 'light', tintMix: 1,
    },
};

// Wielokątne bryły dla shadera (tryb params.polygon). r to promień okręgu
// wpisanego w jednostkach ramki, shiftY przesuwa środek tak, żeby bryła
// wypełniała ramkę, a n to zaokrąglenie rogów (im więcej boków, tym
// wyższe, bo przy sąsiednich krawędziach pod małym kątem niskie n
// zaokrąglałoby całą bryłę w koło).
const POLYGONS = {
    // Trójkąt równoboczny wierzchołkiem do góry: podstawa na dole ramki,
    // wierzchołek na górze.
    triangle: { sides: 3, start: -Math.PI / 2, r: 2 / 3, shiftY: 1 / 3, n: 5 },
    // Ośmiokąt z płaskimi bokami u góry, na dole i po bokach.
    octagon: { sides: 8, start: 0, r: 0.97, shiftY: 0, n: 14 },
};

function cssColorToRgb(value) {
    const hex = value.trim().replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const v = parseInt(full, 16);
    if (Number.isNaN(v)) return [0, 0, 0];
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Prostokąt obejmujący nieprzezroczyste piksele — ikony mają marginesy w
// PNG, a do szkła ma trafić sam znak, wyśrodkowany.
function alphaBounds(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 8) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) return { x: 0, y: 0, w: width, h: height };
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Część ikon (np. taxonomy-dyscyplina-tile-icon, taxonomy-typ-tile-icon)
// ma między pikselami cienkie, półprzezroczyste szczeliny z eksportu. SDF
// liczy kształt dokładnie z alfy, więc pod szkłem robiła się z nich
// widoczna siatka. Pixel art nie ma półtonów, więc alfę progujemy na
// 0/255 — szczeliny znikają, a krawędzie pikseli zostają ostre.
function binarizedSource(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 64 ? 255 : 0;
    ctx.putImageData(data, 0, 0);
    return c;
}

function buildLogo(img) {
    const crop = alphaBounds(img);
    const source = binarizedSource(img);
    const k = (LAYER * LOGO_FILL) / Math.max(crop.w, crop.h);
    const w = crop.w * k;
    const h = crop.h * k;
    const shapeCanvas = document.createElement('canvas');
    shapeCanvas.width = shapeCanvas.height = LAYER;
    const ctx = shapeCanvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, (LAYER - w) / 2, (LAYER - h) / 2, w, h);
    const shape = ctx.getImageData(0, 0, LAYER, LAYER).data;
    const sdf = buildSdf(shape, LAYER, SDF_SPREAD);
    // Kolor ikony i tak nadpisuje tint (tintMix 1), więc tekstura koloru
    // może być jednolita.
    const color = document.createElement('canvas');
    color.width = color.height = LAYER;
    const cctx = color.getContext('2d');
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, LAYER, LAYER);
    return { sdf, color };
}

// Wspólne źródło ruchu kursora i żyroskopu dla wszystkich szklanych brył.
// clientX/Y zostają też do tiltu lokalnego (względem środka kafelka).
const pointer = { x: 0, y: 0, clientX: -1e6, clientY: -1e6, gyro: false };
let pointerReady = false;
function listenPointer() {
    if (pointerReady) return;
    pointerReady = true;
    window.addEventListener('mousemove', (e) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        pointer.clientX = e.clientX;
        pointer.clientY = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
        pointer.x = 0;
        pointer.y = 0;
        pointer.clientX = -1e6;
        pointer.clientY = -1e6;
    });
    const GYRO_RANGE_DEG = 18;
    let base = null;
    const onOrientation = (e) => {
        if (e.beta === null || e.gamma === null) return;
        if (!base) base = { beta: e.beta, gamma: e.gamma };
        pointer.gyro = true;
        pointer.x = Math.max(-1, Math.min(1, (e.gamma - base.gamma) / GYRO_RANGE_DEG));
        pointer.y = Math.max(-1, Math.min(1, (e.beta - base.beta) / GYRO_RANGE_DEG));
    };
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const ask = () => {
            DeviceOrientationEvent.requestPermission()
                .then((state) => { if (state === 'granted') window.addEventListener('deviceorientation', onOrientation); })
                .catch(() => {});
        };
        document.addEventListener('touchend', ask, { once: true });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', onOrientation);
    }
}

// Tilt lokalny (kafelki taksonomii): jak localTilt w initKeycap3D — pełne
// wychylenie już przy niewielkim przesunięciu kursora od środka bryły,
// wygaszane do zera, gdy kursor jest daleko.
const TILT_SENSITIVITY = 90;
const TILT_FALLOFF_RADIUS = 320;

// options:
//   textureUrl      — biała ikona PNG na przezroczystym tle
//   bgVar           — zmienna CSS z kolorem tła pod bryłą (np. '--bg', '--surface')
//   tintVar         — zmienna CSS z kolorem ikony (domyślnie '--ink': biała/czarna)
//   sizeBoost       — rozmiar szkła względem szerokości kontenera (mobileSizeBoost na ≤760px)
//   localTilt       — tilt względem środka kontenera zamiast całego okna
//   iconScale       — mnożnik rozmiaru ikony w szkle (1 = jak w hero)
//   round           — okrągła bryła (koło) zamiast squircle'a
//   polygon         — 'triangle' („piramida”) albo 'octagon': wielokątna bryła z
//                     ciętymi fasetami na krawędzi zamiast squircle'a
//   rimFlowScale    — mnożnik załamania na ramce, czyli tego, jak mocno ikona
//                     „wpływa” w krawędź szkła (1 = jak w hero)
//   floatPx         — amplituda delikatnego unoszenia
//   onPressTarget   — (canvas, press) => void, do podpięcia kliknięcia
// Zwraca false, gdy WebGL albo ikona nie ruszą — wtedy zostaje zwykła bryła.
export async function initGlassIcon(container, {
    textureUrl,
    bgVar = '--bg',
    tintVar = '--ink',
    sizeBoost = 1.9,
    mobileSizeBoost = sizeBoost,
    localTilt = false,
    iconScale = 1,
    rimFlowScale = 1,
    round = false,
    polygon = null,
    floatPx = 4,
    onPressTarget,
} = {}) {
    if (!container) return false;
    const canvas = document.createElement('canvas');
    let renderer;
    try {
        renderer = new GlassRenderer(canvas);
    } catch (e) {
        console.warn('[glass-icon] WebGL niedostępny, zostaje zwykła bryła.', e);
        return false;
    }

    let img;
    try {
        img = await loadImage(textureUrl);
    } catch (e) {
        console.warn('[glass-icon] Nie udało się wczytać ikony.', e);
        return false;
    }
    const { sdf, color } = buildLogo(img);
    renderer.setLogo(sdf, color, LAYER);

    // Rozmiar canvasa w CSS liczony od szerokości kontenera, tak jak przy
    // keycapach; ten sam breakpoint co CSS.
    const isMobileViewport = window.matchMedia('(max-width: 760px)').matches;
    const boost = isMobileViewport ? mobileSizeBoost : sizeBoost;
    let extraRenderScale = 1;
    function resize() {
        const cssSize = Math.round((container.clientWidth || 87) * boost / ICON_SCALE);
        canvas.style.width = `${cssSize}px`;
        canvas.style.height = `${cssSize}px`;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // Górny limit, bo shader z 32 próbkami na piksel przy dużym
        // canvasie robi się kosztowny.
        renderer.setSize(Math.min(1400, Math.round(cssSize * dpr * extraRenderScale)));
    }
    window.addEventListener('resize', resize);
    resize();

    // Ten sam hook co w initKeycap3D: gdy kontener jest skalowany przez CSS
    // transform, canvas renderuje w większej rozdzielczości.
    let lastAppliedRenderScale = 1;
    container.__setRenderScale = function (factor) {
        const rounded = Math.round(Math.max(1, factor) * 10) / 10;
        if (rounded === lastAppliedRenderScale) return;
        lastAppliedRenderScale = rounded;
        extraRenderScale = rounded;
        resize();
    };

    container.appendChild(canvas);

    // Motyw: bez atrybutu strona jest ciemna, data-theme="light" przełącza
    // na jasną. Kolory czytamy ze zmiennych CSS po każdej zmianie motywu.
    const root = document.documentElement;
    let look;
    function readColors() {
        const themeName = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const styles = getComputedStyle(root);
        look = {
            ...LOOKS[themeName],
            size: LOOKS[themeName].size * iconScale,
            refraction: LOOKS[themeName].refraction * rimFlowScale,
            // Wykładnik superelipsy w shaderze: 2 to koło, 5 to squircle.
            n: polygon ? POLYGONS[polygon].n : round ? 2 : LOOKS[themeName].n,
            polygon: polygon ? POLYGONS[polygon] : null,
            // Wielokąty: dwie płaskie fasety z ostrymi krawędziami zamiast
            // zaokrąglonego brzegu, jak szlifowane szkło.
            facet: polygon ? 1 : LOOKS[themeName].facet,
            bg: cssColorToRgb(styles.getPropertyValue(bgVar)),
            tint: cssColorToRgb(styles.getPropertyValue(tintVar)),
        };
    }
    readColors();
    new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    listenPointer();
    let tiltX = 0, tiltY = 0;
    function tiltGoal() {
        if (!localTilt || pointer.gyro) return [pointer.x, pointer.y];
        const rect = container.getBoundingClientRect();
        const dx = pointer.clientX - (rect.left + rect.width / 2);
        const dy = pointer.clientY - (rect.top + rect.height / 2);
        const falloff = Math.max(0, 1 - Math.hypot(dx, dy) / TILT_FALLOFF_RADIUS);
        return [
            falloff * Math.max(-1, Math.min(1, dx / TILT_SENSITIVITY)),
            falloff * Math.max(-1, Math.min(1, dy / TILT_SENSITIVITY)),
        ];
    }

    // Wciśnięcie: szkło na chwilę „ugina się” jak miękka soczewka w środku
    // (uniform u_press z referencji).
    const DOWN_MS = 70;
    const UP_MS = 260;
    let pressPhase = 'idle';
    let pressStart = 0;
    let pressAmount = 0;
    const press = () => { pressPhase = 'down'; pressStart = performance.now(); };
    if (onPressTarget) onPressTarget(canvas, press);

    // Bryły poza ekranem nie renderują — przy kilku szklanych bryłach naraz
    // to oszczędza GPU.
    let visible = true;
    new IntersectionObserver((entries) => {
        visible = entries[entries.length - 1].isIntersecting;
    }, { rootMargin: '200px' }).observe(container);

    const start = performance.now();
    const floatPhase = Math.random() * Math.PI * 2;
    function frame(now) {
        requestAnimationFrame(frame);
        if (!visible) return;
        const [gx, gy] = tiltGoal();
        tiltX += (gx - tiltX) * 0.08;
        tiltY += (gy - tiltY) * 0.08;

        if (pressPhase === 'down') {
            const t = Math.min(1, (now - pressStart) / DOWN_MS);
            pressAmount = 1 - (1 - t) * (1 - t);
            if (t >= 1) { pressPhase = 'up'; pressStart = now; }
        } else if (pressPhase === 'up') {
            const t = Math.min(1, (now - pressStart) / UP_MS);
            pressAmount = Math.pow(1 - t, 3);
            if (t >= 1) { pressPhase = 'idle'; pressAmount = 0; }
        }

        const seconds = (now - start) / 1000;
        const phase = reducedMotion ? 0 : (seconds / LOOP_S) % 1;
        // Delikatne unoszenie, jak idleFloat keycapów.
        const float = reducedMotion ? 0 : Math.sin(seconds * 1.1 + floatPhase) * floatPx;
        canvas.style.translate = `0 ${float.toFixed(2)}px`;

        renderer.render({
            ...look,
            motion: reducedMotion ? 0 : look.motion,
            tilt: [tiltX, -tiltY],
            press: [0, 0, pressAmount * 0.9, 0.9],
            frame: ICON_SCALE,
            shadow: 1,
            clear: 1,
        }, phase);
    }
    requestAnimationFrame(frame);
    return true;
}

