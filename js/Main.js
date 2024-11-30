/* Main.js */
import VortexLib from './VortexLib.js';
import VortexEditor from './VortexEditor.js';

// Instantiate VortexLib webassembly module
VortexLib().then(vortexLib => {
  // Instantiate the VortexEditor
  const vortexEditor = new VortexEditor(vortexLib);
  // and initialize it
  vortexEditor.initialize();
});

