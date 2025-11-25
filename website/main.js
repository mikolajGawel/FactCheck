/**
 * FactCheck Website - Main JavaScript
 * Handles theme toggling, mobile menu, smooth scrolling, and animations
 */

(function () {
	"use strict";

	// ===== Theme Management =====
	const ThemeManager = {
		STORAGE_KEY: "factcheck-theme",
		DARK_THEME: "dark",
		LIGHT_THEME: "light",

		init() {
			this.themeToggle = document.getElementById("themeToggle");
			this.applyInitialTheme();
			this.bindEvents();
		},

		getPreferredTheme() {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			if (stored) {
				return stored;
			}
			return window.matchMedia("(prefers-color-scheme: dark)").matches ? this.DARK_THEME : this.LIGHT_THEME;
		},

		applyInitialTheme() {
			const theme = this.getPreferredTheme();
			this.setTheme(theme);
		},

		setTheme(theme) {
			document.documentElement.setAttribute("data-theme", theme);
			localStorage.setItem(this.STORAGE_KEY, theme);
		},

		toggleTheme() {
			const current = document.documentElement.getAttribute("data-theme");
			const newTheme = current === this.DARK_THEME ? this.LIGHT_THEME : this.DARK_THEME;
			this.setTheme(newTheme);
		},

		bindEvents() {
			if (this.themeToggle) {
				this.themeToggle.addEventListener("click", () => this.toggleTheme());
			}

			// Listen for system theme changes
			window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
				if (!localStorage.getItem(this.STORAGE_KEY)) {
					this.setTheme(e.matches ? this.DARK_THEME : this.LIGHT_THEME);
				}
			});
		}
	};

	// ===== Mobile Menu =====
	const MobileMenu = {
		init() {
			this.toggle = document.getElementById("mobileMenuToggle");
			this.menu = document.querySelector(".nav-menu");
			this.links = document.querySelectorAll(".nav-link");
			this.bindEvents();
		},

		bindEvents() {
			if (this.toggle && this.menu) {
				this.toggle.addEventListener("click", () => this.toggleMenu());

				// Close menu when clicking a link
				this.links.forEach(link => {
					link.addEventListener("click", () => this.closeMenu());
				});

				// Close menu when clicking outside
				document.addEventListener("click", e => {
					if (!this.toggle.contains(e.target) && !this.menu.contains(e.target)) {
						this.closeMenu();
					}
				});

				// Close menu on escape key
				document.addEventListener("keydown", e => {
					if (e.key === "Escape") {
						this.closeMenu();
					}
				});
			}
		},

		toggleMenu() {
			this.toggle.classList.toggle("active");
			this.menu.classList.toggle("active");
			document.body.style.overflow = this.menu.classList.contains("active") ? "hidden" : "";
		},

		closeMenu() {
			this.toggle.classList.remove("active");
			this.menu.classList.remove("active");
			document.body.style.overflow = "";
		}
	};

	// ===== Header Scroll Effect =====
	const HeaderScroll = {
		init() {
			this.header = document.querySelector(".header");
			this.lastScroll = 0;
			this.bindEvents();
		},

		bindEvents() {
			if (this.header) {
				window.addEventListener("scroll", () => this.handleScroll(), { passive: true });
			}
		},

		handleScroll() {
			const currentScroll = window.pageYOffset;

			if (currentScroll > 50) {
				this.header.classList.add("scrolled");
			} else {
				this.header.classList.remove("scrolled");
			}

			this.lastScroll = currentScroll;
		}
	};

	// ===== Smooth Scroll =====
	const SmoothScroll = {
		init() {
			this.bindEvents();
		},

		bindEvents() {
			document.querySelectorAll('a[href^="#"]').forEach(anchor => {
				anchor.addEventListener("click", e => this.handleClick(e, anchor));
			});
		},

		handleClick(e, anchor) {
			const href = anchor.getAttribute("href");
			if (href === "#") return;

			const target = document.querySelector(href);
			if (target) {
				e.preventDefault();
				target.scrollIntoView({
					behavior: "smooth",
					block: "start"
				});
			}
		}
	};

	// ===== Intersection Observer Animations =====
	const ScrollAnimations = {
		init() {
			if ("IntersectionObserver" in window) {
				this.createObserver();
				this.observeElements();
			}
		},

		createObserver() {
			this.observer = new IntersectionObserver(entries => this.handleIntersection(entries), {
				root: null,
				rootMargin: "0px 0px -10% 0px",
				threshold: 0.1
			});
		},

		observeElements() {
			const selectors = [
				".feature-card",
				".step",
				".install-step",
				".team-member",
				".tech-item",
				".section-header",
				".demo-frame"
			];

			selectors.forEach(selector => {
				document.querySelectorAll(selector).forEach(el => {
					el.classList.add("animate-on-scroll");
					this.observer.observe(el);
				});
			});
		},

		handleIntersection(entries) {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					entry.target.classList.add("is-visible");
					this.observer.unobserve(entry.target);
				}
			});
		}
	};

	// ===== Parallax Effect for Hero =====
	const HeroParallax = {
		init() {
			this.hero = document.querySelector(".hero");
			this.logo = document.querySelector(".hero-logo");
			this.cards = document.querySelectorAll(".floating-card");

			if (this.hero && window.innerWidth > 768) {
				this.bindEvents();
			}
		},

		bindEvents() {
			window.addEventListener("scroll", () => this.handleScroll(), { passive: true });
		},

		handleScroll() {
			const scrolled = window.pageYOffset;
			const heroHeight = this.hero.offsetHeight;

			if (scrolled < heroHeight) {
				const factor = scrolled / heroHeight;

				if (this.logo) {
					this.logo.style.transform = `translateY(${scrolled * 0.2}px)`;
				}

				this.cards.forEach((card, index) => {
					const direction = index % 2 === 0 ? 1 : -1;
					card.style.transform = `translateY(${scrolled * 0.1 * direction}px)`;
				});
			}
		}
	};

	// ===== Counter Animation =====
	const CounterAnimation = {
		init() {
			this.counters = document.querySelectorAll(".stat-value");
			if (this.counters.length > 0 && "IntersectionObserver" in window) {
				this.createObserver();
			}
		},

		createObserver() {
			const observer = new IntersectionObserver(
				entries => {
					entries.forEach(entry => {
						if (entry.isIntersecting) {
							this.animateCounter(entry.target);
							observer.unobserve(entry.target);
						}
					});
				},
				{ threshold: 0.5 }
			);

			this.counters.forEach(counter => observer.observe(counter));
		},

		animateCounter(element) {
			const text = element.textContent;
			const match = text.match(/(\d+)/);

			if (match) {
				const target = parseInt(match[0]);
				const prefix = text.substring(0, text.indexOf(match[0]));
				const suffix = text.substring(text.indexOf(match[0]) + match[0].length);

				let current = 0;
				const increment = target / 50;
				const duration = 1000;
				const stepTime = duration / 50;

				const timer = setInterval(() => {
					current += increment;
					if (current >= target) {
						element.textContent = prefix + target + suffix;
						clearInterval(timer);
					} else {
						element.textContent = prefix + Math.floor(current) + suffix;
					}
				}, stepTime);
			}
		}
	};

	// ===== Lazy Loading Images =====
	const LazyLoad = {
		init() {
			if ("loading" in HTMLImageElement.prototype) {
				// Native lazy loading supported
				document.querySelectorAll('img[loading="lazy"]').forEach(img => {
					img.src = img.dataset.src || img.src;
				});
			} else if ("IntersectionObserver" in window) {
				// Fallback to IntersectionObserver
				this.createObserver();
			}
		},

		createObserver() {
			const observer = new IntersectionObserver(entries => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						const img = entry.target;
						img.src = img.dataset.src || img.src;
						img.classList.add("loaded");
						observer.unobserve(img);
					}
				});
			});

			document.querySelectorAll('img[loading="lazy"]').forEach(img => {
				observer.observe(img);
			});
		}
	};

	// ===== Active Navigation Highlighting =====
	const ActiveNav = {
		init() {
			this.sections = document.querySelectorAll("section[id]");
			this.navLinks = document.querySelectorAll(".nav-link");

			if (this.sections.length > 0 && "IntersectionObserver" in window) {
				this.createObserver();
			}
		},

		createObserver() {
			const observer = new IntersectionObserver(
				entries => {
					entries.forEach(entry => {
						if (entry.isIntersecting) {
							this.setActiveLink(entry.target.id);
						}
					});
				},
				{
					rootMargin: "-30% 0px -70% 0px"
				}
			);

			this.sections.forEach(section => observer.observe(section));
		},

		setActiveLink(sectionId) {
			this.navLinks.forEach(link => {
				link.classList.remove("active");
				if (link.getAttribute("href") === `#${sectionId}`) {
					link.classList.add("active");
				}
			});
		}
	};

	// ===== Initialize All Modules =====
	function init() {
		ThemeManager.init();
		MobileMenu.init();
		HeaderScroll.init();
		SmoothScroll.init();
		ScrollAnimations.init();
		HeroParallax.init();
		CounterAnimation.init();
		LazyLoad.init();
		ActiveNav.init();
	}

	// Run on DOM ready
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();

// ===== Add CSS for scroll animations =====
const style = document.createElement("style");
style.textContent = `
    .animate-on-scroll {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    
    .animate-on-scroll.is-visible {
        opacity: 1;
        transform: translateY(0);
    }
    
    .nav-link.active {
        color: var(--primary-500);
        background: var(--bg-tertiary);
    }
    
    img.loaded {
        animation: fadeIn 0.3s ease;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(style);
