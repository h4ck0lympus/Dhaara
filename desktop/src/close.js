// app.js is an ES module: its lexical state is not window-global.
// The module owns checkpointing; the shell only requests a narrow event.
if (window.__noemaCheckpointCloseReady) {
  window.dispatchEvent(new Event('noema:checkpoint-close'));
} else {
  // A page/module that failed to start cannot checkpoint; don't touch its storage.
  window.ipc.postMessage('noema:close-approved');
}
