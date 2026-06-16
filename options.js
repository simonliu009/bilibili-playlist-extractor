document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.getElementById("showDetailedMessage");
  const cleanUrlCheckbox = document.getElementById("cleanUrl");

  chrome.storage.sync.get(["showDetailedMessage", "cleanUrl"], (result) => {
    if (result.showDetailedMessage === undefined) {
      chrome.storage.sync.set({ showDetailedMessage: true });
    }
    if (result.cleanUrl === undefined) {
      chrome.storage.sync.set({ cleanUrl: true });
    }

    checkbox.checked =
      result.showDetailedMessage !== undefined ? result.showDetailedMessage : true;
    cleanUrlCheckbox.checked = result.cleanUrl !== undefined ? result.cleanUrl : true;
  });

  checkbox.addEventListener("change", (e) => {
    chrome.storage.sync.set({
      showDetailedMessage: e.target.checked
    });
  });

  cleanUrlCheckbox.addEventListener("change", (e) => {
    chrome.storage.sync.set({
      cleanUrl: e.target.checked
    });
  });
});
