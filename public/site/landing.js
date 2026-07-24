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

document.querySelectorAll(".copy-command").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.classList.add("is-copied");
      button.title = "Copied";
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.title = "Copy command";
      }, 1600);
    } catch {
      button.title = "Copy unavailable";
    }
  });
});
