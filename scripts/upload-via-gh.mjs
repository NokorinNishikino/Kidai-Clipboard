// 经 gh CLI 推送文件到 GitHub 仓库（Contents API 通道，绕过 git 直连失败）
// 用法: node upload-via-gh.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'NokorinNishikino/Kidai-Clipboard';
const ROOT = 'D:/Deepseek Harness Desktop Workshop/kidai-clipboard';
const BRANCH = 'master';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

// 需要上传的文件（排除备份/本地缓存）
const EXCLUDE = [
  '.git', '.gitignore', '.profile-backup', '.kidc-bak', 'node_modules',
  'probe-info.json'
];
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (EXCLUDE.some(x => r.includes(x))) continue;
    if (e.isDirectory()) out.push(...walk(p, r));
    else out.push(r);
  }
  return out;
}

const files = walk(ROOT);
console.log(`上传 ${files.length} 个文件到 ${REPO}@${BRANCH}`);

// 获取最新 commit sha（用于 Contents API）；空仓库时跳过（首次上传无需 sha）
let baseSha = null;
try {
  const refInfo = JSON.parse(gh(['api', `repos/${REPO}/git/ref/heads/${BRANCH}`]));
  baseSha = refInfo.object.sha;
} catch {
  console.log('空仓库或无 master ref，按首次上传处理');
}
console.log('base sha:', baseSha ?? '(none)');

// 逐个上传（Contents API PUT，先查现有 sha 以更新）
let ok = 0, fail = 0;
for (const f of files) {
  const abs = path.join(ROOT, f);
  const content = fs.readFileSync(abs).toString('base64');
  const apiPath = `repos/${REPO}/contents/${f.split('/').map(encodeURIComponent).join('/')}`;
  try {
    let existingSha = null;
    try {
      const meta = JSON.parse(gh(['api', `${apiPath}?ref=${BRANCH}`]));
      existingSha = meta.sha;
    } catch { /* new file */ }
    const payload = JSON.stringify({ message: `upload ${f}`, content, branch: BRANCH, ...(existingSha ? { sha: existingSha } : {}) });
    const tmp = path.join(ROOT, `.upload-${Date.now()}.json`);
    fs.writeFileSync(tmp, payload, 'utf8');
    gh(['api', '--method', 'PUT', apiPath, '--input', tmp]);
    fs.unlinkSync(tmp);
    ok++;
    if (ok % 10 === 0) console.log(`  ...${ok} 已上传`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${f}: ${String(e.message || e).slice(0, 120)}`);
  }
}
console.log(`完成: ${ok} 成功, ${fail} 失败`);
