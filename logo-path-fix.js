(() => {
  const LVFC_LOGO = './lvfc-logo.png?v=uploaded-logos1';
  const KIXEL_LOGO = './kixel-logo.png?v=uploaded-logos1';

  function setLogo(image, source) {
    if (!image || image.getAttribute('src') === source) return;
    image.setAttribute('src', source);
    image.setAttribute('loading', 'eager');
    image.setAttribute('decoding', 'async');
  }

  function applyOfficialLogos() {
    document
      .querySelectorAll('.lvfcPrimary img, img[alt="Lahore Virgil Football Club"]')
      .forEach(image => setLogo(image, LVFC_LOGO));

    document
      .querySelectorAll('.poweredBy img, img[alt="KIXEL"]')
      .forEach(image => setLogo(image, KIXEL_LOGO));
  }

  const observer = new MutationObserver(applyOfficialLogos);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyOfficialLogos, { once: true });
  } else {
    applyOfficialLogos();
  }
})();
