// Cloudflare Worker：坚果云 WebDAV CORS 代理
//
// 部署步骤（在 Cloudflare Dashboard 里）：
//   1. 注册/登录 https://dash.cloudflare.com（免费）
//   2. 左侧菜单 → Workers & Pages → Create → Worker → 取名 cige-proxy → Deploy
//   3. 点击 "Edit code"，把本文件全部内容粘贴进去覆盖，点 Save and deploy
//   4. 部署后会得到一个 URL，形如 https://cige-proxy.<你的子域>.workers.dev
//   5. 在手机 PWA 页面的"代理地址"里填这个 URL
//
// 安全说明：
//   - Worker 不存储任何凭证，账号密码仍由前端通过 Authorization 头传递
//   - 硬编码目标主机为 dav.jianguoyun.com，无法被滥用代理其他服务
//   - 无状态、可公开

const TARGET_HOST = 'https://dav.jianguoyun.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, MKCOL, PROPFIND, OPTIONS, MOVE, COPY',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, Overwrite, Destination',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'ETag, Last-Modified, DAV',
};

export default {
  async fetch(request) {
    // 1. 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. 构造目标 URL（只允许代理到坚果云）
    const reqUrl = new URL(request.url);
    // 健康检查根路径
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/__health') {
      return new Response(JSON.stringify({ ok: true, service: 'cige-webdav-proxy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
    const targetUrl = TARGET_HOST + reqUrl.pathname + reqUrl.search;

    // 3. 透传请求（含 Authorization、Depth、Content-Type 等）
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set('Host', 'dav.jianguoyun.com');

    let resp;
    try {
      resp = await fetch(targetUrl, {
        method: request.method,
        headers: reqHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'upstream_error', message: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // 4. 把响应加上 CORS 头返回给浏览器
    const respHeaders = new Headers(resp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};
