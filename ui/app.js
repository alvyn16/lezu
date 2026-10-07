import { shell } from './shell.js';
document.querySelector('#app').innerHTML = shell();
document.querySelector('[data-nav="home"]').setAttribute('aria-current', 'page');
const notice = document.querySelector('#notice');
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.nav || button.dataset.action) {
    document.querySelector('#notice-title').textContent = 'UI preview';
    document.querySelector('#notice-copy').textContent = 'The shared shell is ready. Sample screens are being added in the next increment.';
    notice.showModal();
  }
});
