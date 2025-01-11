const fs = require('fs');
const sharp = require('global-sharp');  // 使用全局安装的sharp

// B站图标SVG
const svgTemplate = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
      <feOffset dx="0" dy="2"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.09375}" fill="#FB7299" filter="url(#shadow)"/>
  <g transform="scale(${size/128})">
    <path d="M85.2 46.5H42.8c-1.5 0-2.7 1.2-2.7 2.7v29.6c0 1.5 1.2 2.7 2.7 2.7h42.4c1.5 0 2.7-1.2 2.7-2.7V49.2c0-1.5-1.2-2.7-2.7-2.7zM51.7 66.5v-8.9l7.5 4.4-7.5 4.5zm22.1-8.9v8.9l-7.5-4.5 7.5-4.4z" fill="white"/>
  </g>
</svg>`;

// 确保输出目录存在
const outputDir = './icons';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// 生成不同尺寸的图标
async function generateIcons() {
  try {
    const sizes = [16, 48, 128];
    for (const size of sizes) {
      const svg = svgTemplate(size);
      
      // 保存SVG文件（用于调试）
      const svgPath = `${outputDir}/icon${size}.svg`;
      fs.writeFileSync(svgPath, svg);
      
      // 转换为PNG
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(`${outputDir}/icon${size}.png`);
      
      console.log(`✓ Generated icon${size}.png`);
    }
    console.log('\n✨ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

// 运行生成器
generateIcons().catch(console.error); 