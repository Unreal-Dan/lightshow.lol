import VortexLib from './VortexLib.js';
import Lightshow from './Lightshow.js';
import AboutPanel from './AboutPanel.js';
import ControlPanel from './ControlPanel.js';

// instantiate VortexLib webassembly module
VortexLib().then(vortexLib => {
  // finish initializing vortex lib
  vortexLib.Init();

  // instantiate the lightshow
  let lightshow = new Lightshow(vortexLib);
  // initialize the lightshow
  lightshow.init();

  // create panels for the lightshow
  let aboutPanel = new AboutPanel(lightshow);
  let controlPanel = new ControlPanel(lightshow);

  // Append panels to the body
  aboutPanel.appendTo(document.body);
  controlPanel.appendTo(document.body);
  controlPanel.initialize();

  // resize the lightshow when window drags
  window.addEventListener('resize', () => {
    lightshow.width = window.innerWidth;
    lightshow.height = window.innerHeight;
  });

  window.randomize = controlPanel.randomize.bind(controlPanel);
});

