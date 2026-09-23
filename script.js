```javascript
const header = document.getElementById("header");
const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");
const cursorGlow = document.getElementById("cursorGlow");


// HEADER ON SCROLL

window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
        header.classList.add("scrolled");
    } else {
        header.classList.remove("scrolled");
    }
});


// MOBILE MENU

menuButton.addEventListener("click", () => {
    navLinks.classList.toggle("mobile-open");
});

document.querySelectorAll(".nav-links a").forEach(link => {
    link.addEventListener("click", () => {
        navLinks.classList.remove("mobile-open");
    });
});


// REVEAL ANIMATION

const revealElements = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                revealObserver.unobserve(entry.target);
            }
        });
    },
    {
        threshold: 0.12
    }
);

revealElements.forEach(element => {
    revealObserver.observe(element);
});


// COUNTERS

const counters = document.querySelectorAll("[data-count]");

const counterObserver = new IntersectionObserver(
    (entries) => {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            const counter = entry.target;
            const target = Number(counter.dataset.count);

            let current = 0;
            const duration = 1200;
            const start = performance.now();

            function update(time) {

                const progress = Math.min(
                    (time - start) / duration,
                    1
                );

                const eased =
                    1 - Math.pow(1 - progress, 3);

                current = Math.floor(target * eased);

                counter.textContent = current;

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    counter.textContent = target;
                }
            }

            requestAnimationFrame(update);

            counterObserver.unobserve(counter);
        });

    },
    {
        threshold: 0.7
    }
);

counters.forEach(counter => {
    counterObserver.observe(counter);
});


// CURSOR GLOW

document.addEventListener("mousemove", (event) => {

    if (!cursorGlow) return;

    cursorGlow.style.left = `${event.clientX}px`;
    cursorGlow.style.top = `${event.clientY}px`;

});


// BUTTON RIPPLE

document.querySelectorAll(".button").forEach(button => {

    button.addEventListener("mouseenter", () => {
        button.style.transform = "translateY(-3px)";
    });

    button.addEventListener("mouseleave", () => {
        button.style.transform = "";
    });

});


// ACTIVE NAV LINK

const sections = document.querySelectorAll("section[id]");
const links = document.querySelectorAll(".nav-links a");

window.addEventListener("scroll", () => {

    let current = "";

    sections.forEach(section => {

        const sectionTop = section.offsetTop - 150;

        if (window.scrollY >= sectionTop) {
            current = section.getAttribute("id");
        }

    });

    links.forEach(link => {

        link.style.color = "";

        if (link.getAttribute("href") === `#${current}`) {
            link.style.color = "#ff3b30";
        }

    });

});
```
