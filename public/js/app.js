// Logout
function logout() {
  localStorage.removeItem('token');
  window.location.href = '/';
}

// Auto-inject token into fetch
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url, options = {}] = args;
  const token = localStorage.getItem('token');
  if (token && url.startsWith('/api/')) {
    options.headers = {
      ...(options.headers || {}),
      ...(token && !options.headers?.Authorization ? { Authorization: 'Bearer ' + token } : {}),
    };
  }
  return originalFetch(url, options).then(res => {
    if (res.status === 401) localStorage.removeItem('token');
    return res;
  });
};

// ── Scroll-reveal animations ─────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => entry.target.classList.add('visible'), delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => observer.observe(el));
}

// ── Counter animation ───────────────────────────────────
function animateCounter(el) {
  const target = parseInt(el.dataset.target || el.textContent.replace(/[^\d]/g, ''));
  if (!target) return;
  const duration = 1800;
  const start = performance.now();
  const suffix = el.textContent.replace(/[\d,]/g, '');

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(target * eased).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('[data-target]').forEach(animateCounter);
        observer.disconnect();
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.hero-stats').forEach(el => observer.observe(el));
}

// ── Stagger reveal for grids ─────────────────────────────
function staggerChildren(parentSelector, childSelector, baseDelay = 0, step = 100) {
  const parents = document.querySelectorAll(parentSelector);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const children = entry.target.querySelectorAll(childSelector);
        children.forEach((child, i) => {
          setTimeout(() => child.classList.add('visible'), baseDelay + i * step);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  parents.forEach(p => observer.observe(p));
}

// ── Smooth parallax for hero ─────────────────────────────
function initParallax() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    if (scrolled < 800) {
      const glow = hero.querySelector('::before');
      hero.style.setProperty('--scroll', scrolled + 'px');
    }
  }, { passive: true });
}

// ── Init all ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initCounters();
  staggerChildren('.how-grid', '.how-card', 0, 120);
  staggerChildren('.why-grid', '.why-item', 0, 100);
  staggerChildren('.tasks-list', '.task-card', 0, 80);
  staggerChildren('.stats-grid', '.stat-card', 0, 80);
  initParallax();

  // Preloader hide
  const hidePreloader = () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
      setTimeout(() => {
        preloader.classList.add('hidden');
        setTimeout(() => preloader.remove(), 500);
      }, 300);
    }
  };
  window.addEventListener('load', hidePreloader);
  // Фолбэк: если 'load' не сработал (например, медленная сеть), скрыть через 3 сек
  setTimeout(hidePreloader, 3000);
});
