/* Main.js */
import VortexLib from './VortexLib.js';
import VortexEditor from './VortexEditor.js';

// Dynamically load the ESPTool package
window.esptoolPackage = await import(
  window.location.hostname === "localhost"
  ? "/dist/web/index.js"
  : "https://cdn.jsdelivr.net/gh/adafruit/Adafruit_WebSerial_ESPTool@latest/dist/web/index.js"
);

// Instantiate VortexLib webassembly module
VortexLib().then(vortexLib => {
  // Instantiate the VortexEditor
  const vortexEditor = new VortexEditor(vortexLib);
  // and initialize it
  vortexEditor.initialize();
});
