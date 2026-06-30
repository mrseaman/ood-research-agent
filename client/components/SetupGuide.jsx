import React from 'react';
import { getLocale } from '../lib/i18n';

const guide = {
  en: `## Setting Up Your Own LLM Backend

You can connect any **OpenAI-compatible** API endpoint as a model backend. This includes:

- **vLLM** — serve any Hugging Face model with \`--api-key\` and \`--served-model-name\`
- **Ollama** — local models via its OpenAI-compatible endpoint
- **LM Studio** — local GUI with built-in API server
- **OpenAI / Azure OpenAI** — commercial cloud APIs
- **DashScope (Alibaba)** — Qwen models via OpenAI-compatible mode
- **DeepSeek API** — DeepSeek cloud service
- **Any proxy or gateway** that exposes \`/v1/chat/completions\`

### What You Need

| Field | Description | Example |
|---|---|---|
| **Display name** | Label shown in the model selector | \`My Qwen3 32B\` |
| **Endpoint URL** | Full URL to the chat completions endpoint | \`http://localhost:8000/v1/chat/completions\` |
| **Model name** | The model identifier the API expects | \`Qwen/Qwen3-32B\` |
| **API token** | Bearer token for authentication (leave blank if none) | \`sk-...\` |
| **Route through proxy** | Enable if the endpoint requires the cluster's HTTP proxy | Off for local, On for external |

### Example: vLLM

Start a vLLM server:
\`\`\`bash
python -m vllm.entrypoints.openai.api_server \\
  --model Qwen/Qwen3-32B \\
  --served-model-name qwen3-32b \\
  --api-key my-secret-key \\
  --port 8000
\`\`\`

Then add in Settings → Models:
- **Endpoint URL**: \`http://<your-server>:8000/v1/chat/completions\`
- **Model name**: \`qwen3-32b\`
- **API token**: \`my-secret-key\`

### Example: Ollama

Start Ollama and pull a model:
\`\`\`bash
ollama pull qwen3:32b
OLLAMA_HOST=0.0.0.0 ollama serve
\`\`\`

Then add:
- **Endpoint URL**: \`http://<your-server>:11434/v1/chat/completions\`
- **Model name**: \`qwen3:32b\`
- **API token**: (leave blank)

### Example: OpenAI

- **Endpoint URL**: \`https://api.openai.com/v1/chat/completions\`
- **Model name**: \`gpt-4o\`
- **API token**: \`sk-proj-...\`
- **Route through proxy**: On (if cluster needs proxy for external access)

### Example: DeepSeek API

- **Endpoint URL**: \`https://api.deepseek.com/v1/chat/completions\`
- **Model name**: \`deepseek-chat\`
- **API token**: \`sk-...\`
- **Route through proxy**: On

### Thinking / Reasoning Models

If your model supports reasoning (e.g. Qwen3, DeepSeek-R1), toggle the **Thinking** pill in the chat input area. The agent sends \`enable_thinking\` to the backend automatically. vLLM backends need \`--enable-reasoning\` or equivalent flags when launching the server.

### Troubleshooting

- **Connection refused** — check the server is running and the port/hostname is reachable from the cluster login node. Try \`curl <endpoint>\` from a terminal.
- **401 Unauthorized** — API token is wrong or missing.
- **Proxy errors** — if the endpoint is on the public internet, enable "Route through proxy". If it's on the local network or cluster, disable it.
- **Timeout / slow** — large models need GPU memory. Check server logs for OOM or loading status.
- **Garbled output** — some models need specific \`--served-model-name\` or \`--chat-template\` flags in vLLM.
`,

  'zh-CN': `## 配置您自己的 LLM 后端

您可以连接任何 **兼容 OpenAI 接口**的 API 端点作为模型后端，包括：

- **vLLM** — 使用 \`--api-key\` 和 \`--served-model-name\` 部署 Hugging Face 模型
- **Ollama** — 通过其 OpenAI 兼容端点运行本地模型
- **LM Studio** — 带图形界面的本地 API 服务器
- **OpenAI / Azure OpenAI** — 商业云 API
- **DashScope（阿里云）** — 通过 OpenAI 兼容模式使用通义千问模型
- **DeepSeek API** — DeepSeek 云服务
- **任何代理或网关** — 只要提供 \`/v1/chat/completions\` 接口

### 所需信息

| 字段 | 说明 | 示例 |
|---|---|---|
| **显示名称** | 模型选择器中显示的标签 | \`我的 Qwen3 32B\` |
| **端点 URL** | chat completions 端点的完整 URL | \`http://localhost:8000/v1/chat/completions\` |
| **模型名称** | API 所需的模型标识符 | \`Qwen/Qwen3-32B\` |
| **API 令牌** | 用于身份验证的 Bearer token（无需认证则留空） | \`sk-...\` |
| **通过代理路由** | 如端点需要集群 HTTP 代理则开启 | 本地关闭，外部开启 |

### 示例：vLLM

启动 vLLM 服务器：
\`\`\`bash
python -m vllm.entrypoints.openai.api_server \\
  --model Qwen/Qwen3-32B \\
  --served-model-name qwen3-32b \\
  --api-key my-secret-key \\
  --port 8000
\`\`\`

然后在 设置 → 模型 中添加：
- **端点 URL**: \`http://<服务器地址>:8000/v1/chat/completions\`
- **模型名称**: \`qwen3-32b\`
- **API 令牌**: \`my-secret-key\`

### 示例：Ollama

启动 Ollama 并拉取模型：
\`\`\`bash
ollama pull qwen3:32b
OLLAMA_HOST=0.0.0.0 ollama serve
\`\`\`

然后添加：
- **端点 URL**: \`http://<服务器地址>:11434/v1/chat/completions\`
- **模型名称**: \`qwen3:32b\`
- **API 令牌**: （留空）

### 示例：OpenAI

- **端点 URL**: \`https://api.openai.com/v1/chat/completions\`
- **模型名称**: \`gpt-4o\`
- **API 令牌**: \`sk-proj-...\`
- **通过代理路由**: 开启（如集群访问外网需要代理）

### 示例：DeepSeek API

- **端点 URL**: \`https://api.deepseek.com/v1/chat/completions\`
- **模型名称**: \`deepseek-chat\`
- **API 令牌**: \`sk-...\`
- **通过代理路由**: 开启

### 思维链 / 推理模型

如果您的模型支持推理（如 Qwen3、DeepSeek-R1），请在聊天输入区域启用 **思考** 按钮。助手会自动向后端发送 \`enable_thinking\` 参数。vLLM 后端启动时需要添加 \`--enable-reasoning\` 或同等参数。

### 常见问题

- **连接被拒** — 检查服务器是否运行以及端口/主机名是否可从集群登录节点访问。在终端中尝试 \`curl <端点>\`。
- **401 未授权** — API 令牌错误或缺失。
- **代理错误** — 如果端点在公网，请启用"通过代理路由"。如在本地网络或集群内部，请关闭。
- **超时 / 缓慢** — 大型模型需要 GPU 内存。检查服务器日志中是否有 OOM 或加载状态信息。
- **输出乱码** — 某些模型在 vLLM 中需要特定的 \`--served-model-name\` 或 \`--chat-template\` 参数。
`,
};

export default function SetupGuide() {
  const locale = getLocale();
  const md = guide[locale] || guide.en;

  const html = renderMarkdown(md);
  return (
    <div className="setup-guide" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function renderMarkdown(md) {
  let html = md;

  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  });

  html = html.replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (match) => {
    const rows = match.trim().split('\n');
    const headerCells = rows[0].split('|').filter(c => c.trim());
    const dataRows = rows.slice(2);
    let table = '<table><thead><tr>';
    headerCells.forEach(c => { table += `<th>${c.trim()}</th>`; });
    table += '</tr></thead><tbody>';
    dataRows.forEach(row => {
      const cells = row.split('|').filter(c => c.trim());
      table += '<tr>';
      cells.forEach(c => { table += `<td>${c.trim()}</td>`; });
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/(^|\n)- (.+)/g, (_, pre, item) => `${pre}<li>${item}</li>`);
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  html = html.replace(/\n{2,}/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*(<h[34]>)/g, '$1');
  html = html.replace(/(<\/h[34]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<table>)/g, '$1');
  html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}
