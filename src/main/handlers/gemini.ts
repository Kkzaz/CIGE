import { ipcMain, net, type IpcMainEvent } from 'electron';
import fs from 'fs';
import path from 'path';

interface GeminiMessage {
  role: 'user' | 'model';
  content: string;
}

const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';

const SYSTEM_PROMPT =
  '你是一位专业的中文歌词创作助手，擅长押韵、意象、修辞和情感表达。请根据用户的问题给出简洁、有灵感、实用的回答。';

function getApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }
  const keyFile = path.join(process.cwd(), 'tools', '.gemini_key');
  try {
    if (fs.existsSync(keyFile)) {
      return fs.readFileSync(keyFile, 'utf-8').trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function sendEvent(event: IpcMainEvent, type: 'chunk' | 'done' | 'error', data?: string): void {
  event.sender.send('gemini:chat-event', { type, data });
}

function extractTextFromStep(step: Record<string, unknown>): string | null {
  const content = step.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      return part.text;
    }
  }
  return null;
}

function extractTextChunk(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;

    // Interactions API streaming delta: { delta: { text: "...", type: "text" } }
    const delta = parsed.delta as Record<string, unknown> | undefined;
    if (delta && typeof delta.text === 'string' && delta.text.length > 0) {
      return delta.text;
    }

    // Non-streaming / final response shortcut
    if (typeof parsed.output_text === 'string' && parsed.output_text.length > 0) {
      return parsed.output_text;
    }

    // Streaming steps schema
    const steps = parsed.steps as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(steps) && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep && typeof lastStep === 'object') {
        const text = extractTextFromStep(lastStep as Record<string, unknown>);
        if (text) return text;
      }
    }

    // Legacy candidates schema (fallback)
    const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const content = candidates[0].content as Record<string, unknown> | undefined;
      const parts = content?.parts as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(parts) && parts.length > 0) {
        const text = parts[0].text as string | undefined;
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const error = parsed.error as Record<string, unknown> | undefined;
    if (error) {
      return String(error.message || JSON.stringify(error));
    }
  } catch {
    // ignore
  }
  return body.slice(0, 500);
}

function parseSseChunk(buffer: string): { lines: string[]; remainder: string } {
  const lines = buffer.split('\n');
  const remainder = lines.pop() || '';
  const events: string[] = [];
  let currentData = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      currentData += trimmed.slice(5).trim();
    } else if (trimmed === '' && currentData) {
      events.push(currentData);
      currentData = '';
    }
  }

  // Handle case where buffer ends mid-event without trailing newline.
  if (remainder.startsWith('data:')) {
    return { lines: events, remainder };
  }

  if (currentData && remainder === '') {
    events.push(currentData);
  }

  return { lines: events, remainder };
}

async function streamGeminiResponse(event: IpcMainEvent, message: string, history: GeminiMessage[]): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    sendEvent(
      event,
      'error',
      '未配置 Gemini API Key，请设置 GEMINI_API_KEY 环境变量或创建 tools/.gemini_key 文件'
    );
    return;
  }

  // Build conversation input as a single prompt string.
  let inputText = '';
  if (history.length > 0) {
    for (const msg of history) {
      const label = msg.role === 'user' ? '用户' : '助手';
      inputText += `${label}：${msg.content}\n`;
    }
  }
  inputText += `用户：${message}`;

  const postData = JSON.stringify({
    model: 'gemini-3.5-flash',
    input: `${SYSTEM_PROMPT}\n\n${inputText}`,
    stream: true,
  });

  await new Promise<void>((resolve) => {
    const req = net.request({
      method: 'POST',
      url: INTERACTIONS_ENDPOINT,
    });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('x-goog-api-key', apiKey);
    req.setHeader('Api-Revision', '2026-05-20');

    console.log('[Gemini] 调用 Interactions API');
    const startTime = Date.now();

    let buffer = '';
    let errorBody = '';
    let statusCode = 0;
    let finished = false;

    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      fn();
      resolve();
    };

    const timeout = setTimeout(() => {
      console.log(`[Gemini] 请求超时，已耗时 ${Date.now() - startTime}ms`);
      req.abort();
      finish(() => sendEvent(event, 'error', '请求超时， Gemini 服务响应过慢'));
    }, 30000);

    req.on('response', (res) => {
      statusCode = res.statusCode;
      console.log(`[Gemini] 响应状态: ${statusCode}`);

      res.on('data', (chunk: Buffer) => {
        const raw = chunk.toString('utf-8');
        console.log(`[Gemini] 收到数据块: ${raw.slice(0, 300)}`);

        if (statusCode >= 400) {
          errorBody += raw;
          return;
        }

        buffer += raw;
        const { lines, remainder } = parseSseChunk(buffer);
        buffer = remainder;

        for (const line of lines) {
          if (line === '[DONE]') continue;
          const text = extractTextChunk(line);
          if (text) {
            sendEvent(event, 'chunk', text);
          }
        }
      });

      res.on('end', () => {
        clearTimeout(timeout);
        finish(() => {
          if (statusCode >= 400) {
            sendEvent(event, 'error', `HTTP ${statusCode}: ${extractErrorMessage(errorBody || buffer)}`);
            return;
          }

          if (buffer.trim()) {
            const { lines } = parseSseChunk(buffer + '\n');
            for (const line of lines) {
              if (line === '[DONE]') continue;
              const text = extractTextChunk(line);
              if (text) {
                sendEvent(event, 'chunk', text);
              }
            }
          }
          sendEvent(event, 'done');
        });
      });

      res.on('error', (err) => {
        clearTimeout(timeout);
        finish(() => sendEvent(event, 'error', `响应错误: ${err.message}`));
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      const message = err.message || String(err);
      if (message.includes('socket hang up') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
        finish(() =>
          sendEvent(
            event,
            'error',
            '无法连接到 Gemini 服务，请检查网络或开启代理（Electron 会自动使用系统代理）'
          )
        );
      } else {
        finish(() => sendEvent(event, 'error', `请求错误: ${message}`));
      }
    });

    req.write(postData);
    req.end();
  });
}

export function registerGeminiHandlers(): void {
  ipcMain.on('gemini:chat-stream', (event, message: string, history: GeminiMessage[] = []) => {
    streamGeminiResponse(event, message, history).catch((err) => {
      sendEvent(event, 'error', `未知错误: ${err instanceof Error ? err.message : String(err)}`);
    });
  });
}
