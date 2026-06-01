function milPdfFullscreen(frameId) {
  var el = document.getElementById(frameId);
  if (!el) return;
  if (el.requestFullscreen) el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
}

function MilitaryPdfViewerXBlock(runtime, element) {
  // student view — no extra JS needed, fullscreen is inline
}
