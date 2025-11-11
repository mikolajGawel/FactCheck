chrome.runtime.onInstalled.addListener(() => {
  console.log("hello world");
  
});
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  }
});
