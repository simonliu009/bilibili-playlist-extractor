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

// 从页面DOM中提取分集信息
function extractEpisodesFromDOM() {
  // 尝试从页面DOM中提取分集信息
  const episodeElements = document.querySelectorAll('.video-pod__item[data-key]');
  
  if (episodeElements.length > 0) {
    const episodes = [];
    episodeElements.forEach(element => {
      const dataKey = element.getAttribute('data-key');
      const titleElement = element.querySelector('.title-txt');
      const title = titleElement ? titleElement.textContent.trim() : '';
      
      if (dataKey && title) {
        episodes.push({
          bvid: `BV${dataKey}`, // 使用data-key作为BV号的一部分
          title: title,
          aid: dataKey // 保存原始的aid
        });
      }
    });
    return episodes;
  }
  
  return null;
}

// 处理视频信息
async function processVideoInfo(bvid) {
  try {
    // 获取专辑名称
    const albumTitleElement = document.querySelector('a.title.jumpable[title]');
    const albumTitle = albumTitleElement ? albumTitleElement.title : '';

    // 获取作者信息
    const authorMeta = document.querySelector('meta[name="author"]');
    const author = authorMeta ? authorMeta.content : '';

    // 构建专辑和作者信息字符串
    const albumAndAuthor = albumTitle ? `${albumTitle} - ${author}\n` : '';

    if (albumTitle && author) {
      showMessage(`专辑名称: ${albumTitle}\n作者: ${author}`, false, 3000);
    } else if (albumTitle) {
      showMessage(`专辑名称: ${albumTitle}`, false, 3000);
    } else if (author) {
      showMessage(`作者: ${author}`, false, 3000);
    } else {
      showMessage("未能获取专辑名称或作者信息", true, 3000);
    }

    // 显示加载提示
    showMessage("获取视频信息中...", false, 10000);

    // 首先尝试从DOM中提取分集信息
    let episodes = extractEpisodesFromDOM();
    let videoTitle = '';
    
    if (episodes && episodes.length > 0) {
      // 如果从DOM中成功提取到分集信息，使用DOM数据
      console.log('使用DOM提取的分集信息:', episodes.length, '个视频');
      
      // 获取当前视频标题
      const titleMeta = document.querySelector('meta[name="title"]');
      videoTitle = titleMeta ? titleMeta.content : albumTitle || '未知标题';
      
      let markdown = albumAndAuthor;
      let displayMessage = `视频信息已复制到剪贴板！\n\n${albumAndAuthor}`;
      
      episodes.forEach(episode => {
        // 构建视频URL，使用aid作为参数
        const videoUrl = `https://www.bilibili.com/video/BV${episode.aid}`;
        const cleanedUrl = cleanUrl(videoUrl);
        markdown += `- [${episode.title}](${cleanedUrl})\n`;
      });
      
      // 生成显示消息
      const previewEpisodes = episodes.slice(0, 2);
      previewEpisodes.forEach(episode => {
        displayMessage += `- ${episode.title}\n`;
      });
      if (episodes.length > 2) {
        displayMessage += `...\n共 ${episodes.length} 个视频`;
      }
      
      // 复制到剪贴板
      await navigator.clipboard.writeText(markdown);
      showMessage(displayMessage);
      return;
    }
    
    // 如果DOM中没有找到分集信息，回退到API方式
    console.log('DOM中未找到分集信息，使用API获取');
    
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
      markdown = albumAndAuthor;
      videoInfo.episodes.forEach(episode => {
        const cleanedUrl = cleanUrl(`https://www.bilibili.com/video/${episode.bvid}`);
        markdown += `- [${episode.title}](${cleanedUrl})\n`;
      });

      // 生成显示消息 - 移除标题
      const previewEpisodes = videoInfo.episodes.slice(0, 2);
      if (videoInfo.episodes.length === 0) {
        displayMessage = "该合辑没有视频信息";
      } else {
        displayMessage = `视频信息已复制到剪贴板！\n\n${albumAndAuthor}`;
      }
      previewEpisodes.forEach(episode => {
        displayMessage += `- ${episode.title}\n`;
      });
      if (videoInfo.episodes.length > 2) {
        displayMessage += `...\n共 ${videoInfo.episodes.length} 个视频`;
      }
    } else {
      // 单个视频部分保持不变
      const cleanedUrl = cleanUrl(window.location.href);
      markdown = `[${videoInfo.title} - ${author}](${cleanedUrl})`;
      displayMessage = `视频信息已复制到剪贴板！\n\n${markdown}`;

    }
    if (displayMessage) {
      showMessage(displayMessage);
    }
    // else {
    //   showMessage("未能获取视频信息", true);
    // }
    // 复制到剪贴板
    await navigator.clipboard.writeText(markdown);
    // showMessage(displayMessage);
  } catch (error) {
    console.error('处理视频信息失败:', error);
    showMessage("处理视频信息失败", true);
  }
}

// 显示消息的函数，添加持续时间参数
function showMessage(text, isError = false, duration = 5000) {
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