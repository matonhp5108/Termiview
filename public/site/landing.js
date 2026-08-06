if (window.hljs) {
  window.hljs.highlightAll();
}

const installTabs = document.querySelectorAll("[data-install-tab]");
const installPanels = document.querySelectorAll("[data-install-panel]");

installTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const selected = tab.dataset.installTab;
    installTabs.forEach((item) =>
      item.setAttribute("aria-selected", String(item === tab)),
    );
    installPanels.forEach((panel) => {
      panel.hidden = panel.dataset.installPanel !== selected;
    });
  });
});

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through for browsers that block the Clipboard API.
    }
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.cssText = "position: fixed; opacity: 0; pointer-events: none;";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  return copied;
}

document.querySelectorAll(".copy-command").forEach((button) => {
  const defaultLabel = button.getAttribute("aria-label");
  const defaultTitle = button.title;

  button.addEventListener("click", async () => {
    const copied = await copyText(button.dataset.copy || "");
    button.classList.toggle("is-copied", copied);
    button.title = copied ? "Copied" : "Copy unavailable";
    button.setAttribute(
      "aria-label",
      copied ? "Copied to clipboard" : "Copy unavailable",
    );

    window.setTimeout(() => {
      button.classList.remove("is-copied");
      button.title = defaultTitle;
      button.setAttribute("aria-label", defaultLabel);
    }, 1600);
  });
});
