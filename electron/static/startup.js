// Local startup/crash page (spec §6.4.6). Talks only to its own preload; text is never parsed as HTML.
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const cancel = document.getElementById('cancel');
retry.addEventListener('click', () => window.noemaStartup.retry());
cancel.addEventListener('click', () => window.noemaStartup.cancel());
window.noemaStartup.onStatus((next) => {
  status.textContent = next.text;
  retry.disabled = next.busy;
  cancel.textContent = next.mode === 'overlay' ? 'Quit' : 'Cancel / Quit';
});
