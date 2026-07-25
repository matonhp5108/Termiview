const root = document.documentElement;
const variables = { background: "--bg-primary", surface: "--bg-secondary", surfaceRaised: "--bg-tertiary", hover: "--bg-hover", selected: "--bg-selected", text: "--text-primary", textMuted: "--text-secondary", border: "--border-primary", success: "--success", warning: "--warning", error: "--error" };
const rgb = (value) => {
  const hex = value?.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
};
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || !event.data?.themePreview) return;
  const theme = event.data.themePreview;
  Object.entries(variables).forEach(([key, variable]) => { if (theme[key]) root.style.setProperty(variable, theme[key]); });
  const accent = rgb(theme.accent);
  if (accent) {
    root.style.setProperty("--accent-color", accent);
    [["--gradient-1", 0.28], ["--gradient-2", 0.2], ["--gradient-3", 0.16], ["--gradient-4", 0.12], ["--gradient-5", 0.08]].forEach(([variable, alpha]) => root.style.setProperty(variable, `rgba(${accent}, ${alpha})`));
  }
  if (theme.textMuted) root.style.setProperty("--text-tertiary", theme.textMuted);
  if (theme.border) { root.style.setProperty("--border-secondary", theme.border); root.style.setProperty("--glass-border", theme.border); }
  if (theme.accent) root.style.setProperty("--glass-border-hover", theme.accent);
  if (theme.surface) root.style.setProperty("--glass-bg", theme.surface);
  if (theme.hover) root.style.setProperty("--glass-bg-hover", theme.hover);
});
