const previewStage = document.getElementById("theme-preview-stage");

function scaleDemoPreview() {
  if (!previewStage) return;
  const scale = Math.min(1, previewStage.clientWidth / 1180);
  previewStage.style.setProperty("--preview-scale", scale);
  previewStage.style.height = `${Math.max(280, 760 * scale)}px`;
}

new ResizeObserver(scaleDemoPreview).observe(previewStage);
scaleDemoPreview();
