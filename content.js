const userSettings = {
  showDetailedMessage: true,
  cleanUrl: true
};

function initializeSettings() {
  chrome.storage.sync.get(["showDetailedMessage", "cleanUrl"], (result) => {
    userSettings.showDetailedMessage =
      result.showDetailedMessage !== undefined ? result.showDetailedMessage : true;
    userSettings.cleanUrl = result.cleanUrl !== undefined ? result.cleanUrl : true;
  });
}

initializeSettings();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.showDetailedMessage) {
    userSettings.showDetailedMessage = changes.showDetailedMessage.newValue;
  }
  if (changes.cleanUrl) {
    userSettings.cleanUrl = changes.cleanUrl.newValue;
  }
});

let lastMiddleClickTime = 0;
let middleClickCount = 0;
const CLICK_THRESHOLD = 300;
let clickTimer = null;
const DEBUG_BILI_DESC = true;

document.addEventListener(
  "mouseup",
  (event) => {
    if (event.button !== 1) return;

    event.preventDefault();

    try {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastMiddleClickTime;

      if (timeDiff < CLICK_THRESHOLD) {
        middleClickCount++;
      } else {
        middleClickCount = 1;
      }

      if (clickTimer) {
        clearTimeout(clickTimer);
      }

      clickTimer = setTimeout(() => {
        if (middleClickCount === 2) {
          handleDoubleMiddleClick();
        } else if (middleClickCount === 3) {
          handleTripleMiddleClick();
        }

        middleClickCount = 0;
        clickTimer = null;
      }, CLICK_THRESHOLD);

      lastMiddleClickTime = currentTime;
    } catch (error) {
      console.error("点击检测失败:", error);
      middleClickCount = 0;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
    }
  },
  true
);

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "getVideoInfo") {
    const bvid = getBvidFromUrl(window.location.href);
    if (bvid) {
      processVideoInfo(bvid);
    }
  }
});

function getBvidFromUrl(url) {
  const match = url.match(/BV[0-9A-Za-z]{10}/);
  return match ? match[0] : null;
}

function isBilibiliVideoPage() {
  const hostname = window.location.hostname;
  return /(^|\.)bilibili\.com$/i.test(hostname) && Boolean(getBvidFromUrl(window.location.href));
}

function cleanUrl(url) {
  try {
    const urlObj = new URL(url);

    if (!urlObj.search) {
      return url;
    }

    const paramsToRemove = [
      "spm",
      "spmid",
      "spm_id_from",
      "vd_source",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ops_request_misc",
      "request_id",
      "biz_id",
      "buvid",
      "from_spmid",
      "is_story_h5",
      "mid",
      "plat_id",
      "share_from",
      "share_medium",
      "share_plat",
      "share_session_id",
      "share_source",
      "share_tag",
      "timestamp",
      "unique_k",
      "up_id"
    ];

    const searchParams = new URLSearchParams(urlObj.search);
    let hasChanged = false;

    for (const param of paramsToRemove) {
      if (searchParams.has(param)) {
        searchParams.delete(param);
        hasChanged = true;
      }
    }

    if (!hasChanged) {
      return url;
    }

    const remainingParams = searchParams.toString();
    const baseUrl = url.split("?")[0];
    return remainingParams ? `${baseUrl}?${remainingParams}` : baseUrl;
  } catch (error) {
    console.error("URL清洗失败:", error);
    return url;
  }
}

function getCleanedCurrentUrl() {
  const currentUrl = window.location.href;
  return userSettings.cleanUrl ? cleanUrl(currentUrl) : currentUrl;
}

function getDisplayTextAndMarkdown(title, url, author = "") {
  const displayText = author ? `${title} - ${author}` : title;
  const markdownText = `[${displayText}](${url})`;
  return { displayText, markdownText };
}

function getPageAuthor() {
  let author = "";

  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    if (script.textContent.includes("nickName")) {
      const nickNameMatch = script.textContent.match(/nickName\s*=\s*"(.*?)"/);
      if (nickNameMatch && nickNameMatch[1]) {
        author = nickNameMatch[1];
        break;
      }
    }
  }

  if (!author) {
    const metaAuthor =
      document.querySelector('meta[name="author"]') ||
      document.querySelector('meta[itemprop="author"]');
    if (metaAuthor && metaAuthor.content) {
      author = metaAuthor.content;
    }
  }

  return author;
}

function getUploadDate() {
  const uploadDateMeta = document.querySelector('meta[itemprop="uploadDate"]');
  if (!uploadDateMeta || !uploadDateMeta.content) {
    return "";
  }

  const dateMatch = uploadDateMeta.content.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateMatch ? dateMatch[1] : "";
}

async function getPageDescription() {
  if (DEBUG_BILI_DESC) {
    console.log("[BiliExt] window.__INITIAL_STATE__ =", window.__INITIAL_STATE__);
  }

  const initialDesc = window.__INITIAL_STATE__?.videoData?.desc;
  if (typeof initialDesc === "string" && initialDesc.trim()) {
    if (DEBUG_BILI_DESC) {
      console.log("[BiliExt] window.__INITIAL_STATE__.videoData.desc =", initialDesc.trim());
    }
    return initialDesc.trim();
  }

  const extractedDesc = extractDescFromHtml();
  if (extractedDesc) {
    return extractedDesc;
  }

  const fetchedDesc = await extractDescFromFetchedPage();
  if (fetchedDesc) {
    return fetchedDesc;
  }

  return "";
}

function extractDescFromText(text, bvid, sourceLabel) {
  if (!text || !text.includes('"videoData"') || !text.includes('"desc"')) {
    return "";
  }

  const escapedBvid = bvid ? bvid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const bvidPatterns = bvid
    ? [
        new RegExp(`"bvid"\\s*:\\s*"${escapedBvid}"`),
        new RegExp(`"bvid":"${escapedBvid}"`)
      ]
    : [];

  let bvidIndex = -1;
  if (bvidPatterns.length > 0) {
    for (const pattern of bvidPatterns) {
      const match = text.match(pattern);
      if (match && typeof match.index === "number") {
        bvidIndex = match.index;
        break;
      }
    }

    if (bvidIndex < 0) {
      return "";
    }
  }

  const videoDataIndex = text.indexOf('"videoData"');
  if (videoDataIndex < 0) {
    return "";
  }

  const anchorIndex = bvidIndex >= 0 ? bvidIndex : videoDataIndex;
  const start = Math.max(0, Math.min(videoDataIndex, anchorIndex) - 4000);
  const end = Math.min(text.length, Math.max(videoDataIndex, anchorIndex) + 50000);
  const searchArea = text.slice(start, end);

  if (DEBUG_BILI_DESC) {
    console.log(`[BiliExt] candidate ${sourceLabel} =`, searchArea.slice(0, 1600));
  }

  const videoDataMatch = searchArea.match(
    /"videoData"\s*:\s*\{([\s\S]*?)"desc_v2"\s*:|\"videoData\"\s*:\s*\{([\s\S]*?)"state"\s*:/
  );
  const searchChunk = videoDataMatch ? videoDataMatch[1] || videoDataMatch[2] : searchArea;
  const descMatch = searchChunk.match(/"desc"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (!descMatch || !descMatch[1]) {
    return "";
  }

  try {
    const raw = JSON.parse(`"${descMatch[1]}"`);
    if (DEBUG_BILI_DESC) {
      console.log(`[BiliExt] extracted desc from ${sourceLabel} =`, raw);
    }
    return raw.trim();
  } catch (error) {
    console.warn(`解析B站视频描述失败(${sourceLabel}):`, error);
    return "";
  }
}

function extractDescFromHtml() {
  const scripts = document.querySelectorAll("script");
  const bvid = getBvidFromUrl(window.location.href);

  for (const script of scripts) {
    const text = script.textContent || "";
    const desc = extractDescFromText(text, bvid, "script");
    if (desc) {
      return desc;
    }
  }

  const pageHtmlDesc = extractDescFromText(document.documentElement.innerHTML, bvid, "page html");
  if (pageHtmlDesc) {
    return pageHtmlDesc;
  }

  if (DEBUG_BILI_DESC) {
    console.log("[BiliExt] no desc extracted from html");
  }

  return "";
}

async function extractDescFromFetchedPage() {
  try {
    const response = await fetch(window.location.href, {
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) {
      if (DEBUG_BILI_DESC) {
        console.log("[BiliExt] fetch page html failed =", response.status);
      }
      return "";
    }

    const html = await response.text();
    const bvid = getBvidFromUrl(window.location.href);
    if (DEBUG_BILI_DESC) {
      const anchor = bvid ? html.indexOf(bvid) : -1;
      const videoDataIndex = html.indexOf('"videoData"');
      const pivot = anchor >= 0 ? anchor : videoDataIndex;
      if (pivot >= 0) {
        const start = Math.max(0, pivot - 1200);
        const end = Math.min(html.length, pivot + 4000);
        // console.log("[BiliExt] fetched html snippet =", html.slice(start, end));
      } else {
        // console.log("[BiliExt] fetched html snippet =", html.slice(0, 4000));
      }
    }
    return extractDescFromText(html, bvid, "fetched html");
  } catch (error) {
    if (DEBUG_BILI_DESC) {
      console.warn("[BiliExt] fetch page html error =", error);
    }
    return "";
  }
}

async function handleDoubleMiddleClick() {
  try {
    const title = document.title;
    const url = getCleanedCurrentUrl();
    const author = getPageAuthor();
    const uploadDate = getUploadDate();
    const description = isBilibiliVideoPage() ? await getPageDescription() : "";

    const baseTitle = uploadDate ? `${uploadDate} ${title}` : title;
    let { markdownText } = getDisplayTextAndMarkdown(baseTitle, url, author);

    if (description) {
      markdownText += `\n\n视频描述：\n${description}`;
    }

    await copyToClipboard(markdownText);

    const message = userSettings.showDetailedMessage
      ? `复制成功！\n${markdownText}`
      : "复制成功！";
    showMessage(message);
  } catch (error) {
    console.error("双击复制失败:", error);
    showMessage("复制失败！", true);
  }
}

async function handleTripleMiddleClick() {
  try {
    const url = getCleanedCurrentUrl();
    await copyToClipboard(url);

    const message = userSettings.showDetailedMessage ? `URL复制成功！\n${url}` : "URL复制成功！";
    showMessage(message);
  } catch (error) {
    console.error("三击复制失败:", error);
    showMessage("复制失败！", true);
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  const root = document.body || document.documentElement;
  root.appendChild(textarea);
  textarea.select();

  const success = document.execCommand("copy");
  root.removeChild(textarea);

  if (!success) {
    throw new Error("复制到剪贴板失败");
  }
}

function extractEpisodesFromDOM() {
  const episodeElements = document.querySelectorAll(".video-pod__item[data-key]");

  if (episodeElements.length > 0) {
    const episodes = [];
    episodeElements.forEach((element) => {
      const dataKey = element.getAttribute("data-key");
      const titleElement = element.querySelector(".title-txt");
      const title = titleElement ? titleElement.textContent.trim() : "";

      if (dataKey && title) {
        episodes.push({
          bvid: `BV${dataKey}`,
          title: title,
          aid: dataKey
        });
      }
    });
    return episodes;
  }

  return null;
}

async function processVideoInfo(bvid) {
  try {
    const albumTitleElement = document.querySelector('a.title.jumpable[title]');
    const albumTitle = albumTitleElement ? albumTitleElement.title : "";
    const author = getPageAuthor();
    const albumAndAuthor = albumTitle ? `${albumTitle}${author ? ` - ${author}` : ""}\n` : "";

    if (albumTitle && author) {
      showMessage(`专辑名称: ${albumTitle}\n作者: ${author}`, false, 3000);
    } else if (albumTitle) {
      showMessage(`专辑名称: ${albumTitle}`, false, 3000);
    } else if (author) {
      showMessage(`作者: ${author}`, false, 3000);
    } else {
      showMessage("未能获取专辑名称或作者信息", true, 3000);
    }

    showMessage("获取视频信息中...", false, 10000);

    const episodes = extractEpisodesFromDOM();

    if (episodes && episodes.length > 0) {
      console.log("使用DOM提取的分集信息:", episodes.length, "个视频");

      let markdown = albumAndAuthor;
      let displayMessage = userSettings.showDetailedMessage
        ? `视频信息已复制到剪贴板！\n\n${albumAndAuthor}`
        : "视频信息已复制到剪贴板！";

      episodes.forEach((episode) => {
        const videoUrl = `https://www.bilibili.com/video/BV${episode.aid}`;
        const cleanedUrl = cleanUrl(videoUrl);
        markdown += `- [${episode.title}](${cleanedUrl})\n`;
      });

      const previewEpisodes = episodes.slice(0, 2);
      previewEpisodes.forEach((episode) => {
        displayMessage += `- ${episode.title}\n`;
      });
      if (episodes.length > 2) {
        displayMessage += `...\n共 ${episodes.length} 个视频`;
      }

      await copyToClipboard(markdown);
      showMessage(displayMessage);
      return;
    }

    console.log("DOM中未找到分集信息，使用API获取");

    const videoInfo = await chrome.runtime.sendMessage({
      action: "fetchVideoInfo",
      bvid: bvid
    });

    if (!videoInfo) {
      showMessage("获取视频信息失败", true);
      return;
    }

    let markdown = "";
    let displayMessage = "";

    if (videoInfo.episodes) {
      markdown = albumAndAuthor;
      videoInfo.episodes.forEach((episode) => {
        const cleanedUrl = cleanUrl(`https://www.bilibili.com/video/${episode.bvid}`);
        markdown += `- [${episode.title}](${cleanedUrl})\n`;
      });

      const previewEpisodes = videoInfo.episodes.slice(0, 2);
      if (videoInfo.episodes.length === 0) {
        displayMessage = "该合辑没有视频信息";
      } else {
        displayMessage = userSettings.showDetailedMessage
          ? `视频信息已复制到剪贴板！\n\n${albumAndAuthor}`
          : "视频信息已复制到剪贴板！";
      }

      previewEpisodes.forEach((episode) => {
        displayMessage += `- ${episode.title}\n`;
      });
      if (videoInfo.episodes.length > 2) {
        displayMessage += `...\n共 ${videoInfo.episodes.length} 个视频`;
      }
    } else {
      const cleanedUrl = cleanUrl(window.location.href);
      markdown = `[${videoInfo.title}${author ? ` - ${author}` : ""}](${cleanedUrl})`;
      displayMessage = userSettings.showDetailedMessage
        ? `视频信息已复制到剪贴板！\n\n${markdown}`
        : "视频信息已复制到剪贴板！";
    }

    await copyToClipboard(markdown);

    if (displayMessage) {
      showMessage(displayMessage);
    }
  } catch (error) {
    console.error("处理视频信息失败:", error);
    showMessage("处理视频信息失败", true);
  }
}

function showMessage(text, isError = false, duration = 5000) {
  const existingMessage = document.querySelector(".copy-message");
  if (existingMessage && existingMessage.parentNode) {
    existingMessage.parentNode.removeChild(existingMessage);
  }

  const message = document.createElement("div");
  message.className = "copy-message";
  message.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: ${isError ? "#ffebee" : "#e8f5e9"};
    color: ${isError ? "#c62828" : "#2e7d32"};
    padding: 16px 24px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 999999;
    transition: opacity 0.3s ease-in-out;
    white-space: pre-line;
  `;

  message.textContent = text;
  const root = document.body || document.documentElement;
  root.appendChild(message);

  setTimeout(() => {
    message.style.opacity = "0";
    setTimeout(() => {
      if (root.contains(message)) {
        root.removeChild(message);
      }
    }, 300);
  }, duration);
}
