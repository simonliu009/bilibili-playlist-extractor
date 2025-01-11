// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "exportBiliVideo",
    title: "导出视频信息为Markdown",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.bilibili.com/video/*"]
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "exportBiliVideo") {
    chrome.tabs.sendMessage(tab.id, { action: "getVideoInfo" });
  }
});

// 处理来自content script的API请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchVideoInfo") {
    fetchVideoInfo(request.bvid).then(sendResponse);
    return true;
  }
});

// 获取视频信息的函数
async function fetchVideoInfo(bvid) {
  try {
    // 获取视频基本信息
    const videoResponse = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
    );
    const videoData = await videoResponse.json();
    
    if (videoData.code !== 0) {
      throw new Error(videoData.message);
    }

    // 获取合辑信息
    const seasonResponse = await fetch(
      `https://api.bilibili.com/x/web-interface/view/detail?bvid=${bvid}&aid=${videoData.data.aid}`
    );
    const seasonData = await seasonResponse.json();

    if (seasonData.code !== 0) {
      throw new Error(seasonData.message);
    }

    return {
      title: videoData.data.title,
      episodes: seasonData.data.View.ugc_season?.sections[0]?.episodes || null
    };
  } catch (error) {
    console.error('获取视频信息失败:', error);
    return null;
  }
} 