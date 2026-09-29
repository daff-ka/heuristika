// Poświata na górnej krawędzi kart wpisów – ta sama co w nav (patrz nav.js),
// kolor i widoczność w CSS (.featured__card, --glow-x / --glow-a).
// Pozycja wygładzana lerpem w rAF, jak w nav: pętla działa tylko wtedy,
// gdy poświata faktycznie się przesuwa, więc bez hovera nic nie liczy.
// Jeden nasłuch na dokumencie, więc działa też z kartami, które katalog
// renderuje dynamicznie przy filtrowaniu.
(function () {
    if (!window.matchMedia('(hover: hover)').matches) return;

    let card = null;
    let targetX = 0;
    let currentX = 0;
    let rafId = 0;

    function tick() {
        currentX += (targetX - currentX) * 0.25;
        if (Math.abs(targetX - currentX) < 0.5) currentX = targetX;
        card.style.setProperty('--glow-x', `${currentX}px`);
        rafId = currentX === targetX ? 0 : requestAnimationFrame(tick);
    }

    document.addEventListener('pointermove', (e) => {
        const hit = e.target.closest && e.target.closest('.featured__card');
        if (!hit) return;
        const rect = hit.getBoundingClientRect();
        targetX = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        if (hit !== card) {
            // Nowa karta: start od razu pod kursorem, bez dojazdu z poprzedniej.
            card = hit;
            currentX = targetX;
        }
        if (!rafId) rafId = requestAnimationFrame(tick);
    }, { passive: true });
})();
