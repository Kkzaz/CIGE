// 从 src/main/services/mobilePwaHtml.ts 提取 MOBILE_PWA_HTML 字符串，
// 反转义后写入 docs/mobile.html，供 GitHub Pages 部署。
//
// 用法：node scripts/build-mobile-html.js
// 每次修改 mobilePwaHtml.ts 后重新运行即可同步。

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'main', 'services', 'mobilePwaHtml.ts');
const outPath = path.join(__dirname, '..', 'docs', 'mobile.html');

const src = fs.readFileSync(srcPath, 'utf-8');

// 匹配 export const MOBILE_PWA_HTML = `...`;
const match = src.match(/export const MOBILE_PWA_HTML = `([\s\S]*)`;\s*$/);
if (!match) {
  console.error('[build-mobile-html] 未能在 mobilePwaHtml.ts 中找到 MOBILE_PWA_HTML 模板字符串');
  process.exit(1);
}

let html = match[1];

// 反转义模板字符串中的转义序列
// 顺序很重要：先处理 \\ 以外的不影响，最后处理 \\
// 但更稳妥的是用占位符避免连锁替换
html = html
  .replace(/\\`/g, '\x00QUOTE\x00')      // \` → `
  .replace(/\\\$\{/g, '\x00DOLLAR\x00')  // \${ → ${
  .replace(/\\\\/g, '\\')                 // \\ → \
  .replace(/\x00QUOTE\x00/g, '`')
  .replace(/\x00DOLLAR\x00/g, '${');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf-8');
console.log('[build-mobile-html] 已生成 docs/mobile.html (' + html.length + ' 字符)');
