// Простая анимация появления карточек при скролле
document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.lang-card');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = 1;
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  cards.forEach((card, index) => {
    card.style.opacity = 0;
    card.style.transform = 'translateY(50px)';
    card.style.transition = `all 0.6s ease ${index * 0.2}s`;
    observer.observe(card);
  });
});

