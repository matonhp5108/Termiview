const defaults = {
  name: "Midnight blue",
  background: "#090b11",
  surface: "#111622",
  surfaceRaised: "#182132",
  hover: "#202d45",
  selected: "#273b5e",
  text: "#e7efff",
  textMuted: "#98a7c0",
  border: "#2b3b57",
  accent: "#8dbfff",
  success: "#7bcf9b",
  warning: "#f4c66e",
  error: "#ff7890",
};
const labels = {
  background: "Background",
  surface: "Surface",
  surfaceRaised: "Raised surface",
  hover: "Hover",
  selected: "Selection",
  text: "Primary text",
  textMuted: "Muted text",
  border: "Borders",
  accent: "Accent",
  success: "Success",
  warning: "Warning",
  error: "Error",
};
let theme = { ...defaults };
const controls = document.getElementById("color-controls");
for (const [key, label] of Object.entries(labels)) {
  const field = document.createElement("label");
  field.className = "color-control";
  field.innerHTML = `<span>${label}</span><input type="color" value="${theme[key]}" data-color="${key}" />`;
  controls.append(field);
}
const preview = document.getElementById("theme-preview");
function render() {
  document.getElementById("theme-name").value = theme.name;
  controls.querySelectorAll("input").forEach((input) => {
    input.value = theme[input.dataset.color];
  });
  preview.contentWindow?.postMessage(
    { themePreview: { version: 1, ...theme } },
    window.location.origin,
  );
}
preview.addEventListener("load", render);
controls.addEventListener("input", (event) => {
  if (event.target.matches("input[type=color]")) {
    theme[event.target.dataset.color] = event.target.value;
    render();
  }
});
document.getElementById("theme-name").addEventListener("input", (event) => {
  theme.name = event.target.value.trim() || "Untitled theme";
});
document.getElementById("reset-theme").addEventListener("click", () => {
  theme = { ...defaults };
  render();
});
document.getElementById("theme-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const content = JSON.stringify({ version: 1, ...theme }, null, 2);
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    theme.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "termiview-theme"
  }.json`;
  link.click();
  URL.revokeObjectURL(url);
});
render();
