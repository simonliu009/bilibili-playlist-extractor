// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getVideoInfo") {
    const bvid = getBvidFromUrl(window.location.href);
    if (bvid) {
      processVideoInfo(bvid);
    }
  }
});

// 从URL中提取BV号
function getBvidFromUrl(url) {
  const match = url.match(/BV[0-9A-Za-z]{10}/);
  return match ? match[0] : null;
}

// URL清洗函数
function cleanUrl(url) {
  try {
    const urlObj = new URL(url);
    // 需要移除的参数列表
    const paramsToRemove = [
      'spm',
      'spm_id_from',  // B站特有
      'vd_source',    // B站特有
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content'
    ];
    
    // 获取所有查询参数
    const searchParams = new URLSearchParams(urlObj.search);
    let hasPromoParam = false;
    
    // 找到推广参数在查询字符串中的位置
    let promoParamIndex = -1;
    for (const param of paramsToRemove) {
      const fullParam = `${param}=`;
      const index = url.indexOf(fullParam);
      if (index !== -1 && (url[index - 1] === '?' || url[index - 1] === '&')) {
        promoParamIndex = index;
        hasPromoParam = true;
        break;
      }
    }
    
    // 如果找到推广参数，截取到该参数之前的部分
    if (hasPromoParam) {
      const paramStart = url.lastIndexOf('?', promoParamIndex);
      if (paramStart === promoParamIndex - 1) {
        // 如果推广参数是第一个参数，直接返回不带参数的URL
        return url.substring(0, paramStart);
      } else {
        // 如果推广参数不是第一个参数，保留之前的参数
        return url.substring(0, url.lastIndexOf('&', promoParamIndex));
      }
    }
    
    // 如果不存在需要移除的参数，保持原URL不变
    return url;
  } catch (e) {
    console.error('URL清洗失败:', e);
    return url;
  }
}

// 处理视频信息
async function processVideoInfo(bvid) {
  try {
    // 显示加载提示
    showMessage("获取视频信息中...", false, 10000);

    // 获取视频信息
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
      // 合辑视频 - 去掉标题行
      markdown = ""; 
      videoInfo.episodes.forEach(episode => {
        const cleanedUrl = cleanUrl(`https://www.bilibili.com/video/${episode.bvid}`);
        markdown += `- [${episode.title}](${cleanedUrl})\n`;
      });

      // 生成显示消息 - 移除标题
      const previewEpisodes = videoInfo.episodes.slice(0, 2);
      displayMessage = `复制成功！\n\n`;
      previewEpisodes.forEach(episode => {
        displayMessage += `- ${episode.title}\n`;
      });
      if (videoInfo.episodes.length > 2) {
        displayMessage += `...\n共 ${videoInfo.episodes.length} 个视频`;
      }
    } else {
      // 单个视频部分保持不变
      const cleanedUrl = cleanUrl(window.location.href);
      markdown = `[${videoInfo.title}](${cleanedUrl})`;
      displayMessage = `复制成功！\n\n${markdown}`;
    }

    // 复制到剪贴板
    await navigator.clipboard.writeText(markdown);
    showMessage(displayMessage);
  } catch (error) {
    console.error('处理视频信息失败:', error);
    showMessage("处理视频信息失败", true);
  }
}

// 显示消息的函数，添加持续时间参数
function showMessage(text, isError = false, duration = 2000) {
  // 移除已存在的消息
  const existingMessage = document.querySelector('.copy-message');
  if (existingMessage) {
    document.body.removeChild(existingMessage);
  }

  const message = document.createElement('div');
  message.className = 'copy-message';  // 添加类名以便查找
  message.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: ${isError ? '#ffebee' : '#e8f5e9'};
    color: ${isError ? '#c62828' : '#2e7d32'};
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
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(message)) {  // 检查元素是否还存在
        document.body.removeChild(message);
      }
    }, 300);
  }, duration);
} 