```javascript
// ==============================
// MOBILE MENU
// ==============================

const menuBtn = document.getElementById("menuBtn");
const navLinks = document.querySelector(".nav-links");

menuBtn.addEventListener("click", () => {
    navLinks.classList.toggle("active");
});


// ==============================
// CLOSE MENU AFTER CLICK
// ==============================

document.querySelectorAll(".nav-links a").forEach(link => {

    link.addEventListener("click", () => {
        navLinks.classList.remove("active");
    });

});


// ==============================
// SCROLL REVEAL
// ==============================

const revealElements = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
    entries => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("visible");

                observer.unobserve(entry.target);

            }

        });

    },
    {
        threshold: 0.15
    }
);

revealElements.forEach(element => {
    observer.observe(element);
});


// ==============================
// COUNTERS
// ==============================

const counters = document.querySelectorAll("[data-count]");

const counterObserver = new IntersectionObserver(
    entries => {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            const element = entry.target;
            const target = Number(element.dataset.count);

            let current = 0;

            const duration = 1200;
            const start = performance.now();

            function update(time) {

                const progress = Math.min(
                    (time - start) / duration,
                    1
                );

                current = Math.floor(
                    progress * target
                );

                element.textContent = current;

                if (progress < 1) {
                    requestAnimationFrame(update);
                }

            }

            requestAnimationFrame(update);

            counterObserver.unobserve(element);

        });

    },
    {
        threshold: 0.7
    }
);

counters.forEach(counter => {
    counterObserver.observe(counter);
});


// ==============================
// CURSOR GLOW
// ==============================

const glow = document.querySelector(".cursor-glow");

document.addEventListener("mousemove", event => {

    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;

});


// ==============================
// HEADER BACKGROUND
// ==============================

const header = document.querySelector(".header");

window.addEventListener("scroll", () => {

    if (window.scrollY > 50) {

        header.style.background =
            "rgba(8,8,8,.92)";

    } else {

        header.style.background =
            "rgba(8,8,8,.65)";

    }

});
```
