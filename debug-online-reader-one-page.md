# Debug: 在线阅读器一章只显示一页

## Status
[OPEN]

## Symptom
在线书源点击书籍进入预览后，整章内容只显示在左页，右页显示"本章完"，无法翻到下一页继续阅读同一章。

## Environment
- OS: macOS
- App: Electron + React + Vite
- File: `src/renderer/components/OnlineReader.tsx`

## Hypotheses
1. `pageGroups` 计算为空，fallback 按 6 段分页只显示最多 6 段，其余内容未渲染。
2. `leftPageRef.current.clientWidth/clientHeight` 在测量时为 0，导致测量容器宽度/页面高度错误。
3. `useLayoutEffect` 内的 `requestAnimationFrame` 在页面尺寸未稳定时执行，测量结果不准确。
4. `.lib-book-page` 的 `overflow: hidden` 截断了超出页面的内容，即使分页正确也表现为"只有一页"。
5. 章节内容分割后段落数过少，确实只有一页内容。

## Evidence
日志显示：
```
paragraphsLength: 1
totalMeasuredHeight: 3958.39111328125
groupCount: 1
groups: [1]
```
章节正文只被分割成 **1 个段落**（高度约 3958px），远超单页高度 532px。分页逻辑中虽然段落高度超过页高，但因为当前组为空，仍把所有内容塞进同一组，导致只显示一页。

## Root Cause
`content.split(/\n{2,}/)` 要求两段之间至少两个换行符。该书源返回的章节正文段落之间只有单个 `\n`，导致整章被识别为一个段落。单一段落超高后分页逻辑没有拆分，最终只渲染一页。

## Fix
- 将段落分割改为 `content.split(/\n+/)`，单个换行即可分段。
- 同时修复了 `setPageGroups` 在 ResizeObserver 中可能引发的无限重渲染。
- 移除了自动反转章节逻辑，改为目录中手动切换正序/倒序，避免顺序错乱。
- 加入章节内容缓存，减少重复网络请求。

## Verification
等待用户验证：
1. 在线书籍一章是否能分成多页显示。
2. 目录顺序是否正常，并可手动切换正序/倒序。
3. 翻页/切换章节是否仍卡顿。
