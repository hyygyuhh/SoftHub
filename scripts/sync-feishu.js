/**
 * sync-feishu.js
 *
 * Fetches all application records from a Feishu Base (多维表格) and writes them
 * to js/apps-data.json, which the front-end loads instead of the hardcoded
 * apps-data.js.
 *
 * Auth: uses a Feishu self-built app's app_id + app_secret to obtain a
 *       tenant_access_token (server-side only; never expose app_secret in the
 *       browser). Designed to run inside GitHub Actions.
 *
 * Required env vars:
 *   FEISHU_APP_ID      - self-built app id
 *   FEISHU_APP_SECRET  - self-built app secret
 *   FEISHU_BASE_TOKEN  - bitable app_token (base_token)
 *   FEISHU_TABLE_ID    - bitable table id
 *
 * Optional env vars:
 *   FEISHU_API_HOST    - default https://open.feishu.cn (use https://open.larksuite.com for Lark)
 *   OUTPUT_PATH        - default js/apps-data.json (relative to repo root)
 *   GITHUB_TOKEN       - GitHub PAT for star fetch (Actions 自动提供；本地可选)
 *
 * Icon handling:
 *   If the table has an "图标" attachment field, each record's first attachment
 *   is downloaded into assets/icons/{appId}.{ext} and the app.icon field is set
 *   to that relative path. Otherwise falls back to the "图标SVG" text field.
 */

const fs = require('fs');
const path = require('path');
const { enrichAppsWithGithubStars } = require('./github-stars');

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BASE_TOKEN = process.env.FEISHU_BASE_TOKEN;
const TABLE_ID = process.env.FEISHU_TABLE_ID;
const API_HOST = process.env.FEISHU_API_HOST || 'https://open.feishu.cn';
const OUTPUT_PATH = process.env.OUTPUT_PATH || 'js/apps-data.json';

const missing = [];
if (!APP_ID) missing.push('FEISHU_APP_ID');
if (!APP_SECRET) missing.push('FEISHU_APP_SECRET');
if (!BASE_TOKEN) missing.push('FEISHU_BASE_TOKEN');
if (!TABLE_ID) missing.push('FEISHU_TABLE_ID');
if (missing.length) {
    console.error('Missing required env vars: ' + missing.join(', '));
    console.error('Hint: all four must be configured as repository Secrets (Settings → Secrets and variables → Actions → Secrets).');
    process.exit(1);
}

/** Get a tenant_access_token using app credentials. */
async function getTenantAccessToken() {
    const res = await fetch(`${API_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    });
    const data = await res.json();
    if (data.code !== 0) {
        throw new Error(`Failed to get tenant_access_token: ${data.code} ${data.msg}`);
    }
    return data.tenant_access_token;
}

/** Format a millisecond timestamp as YYYY-MM-DD (in the Base timezone). */
function formatMsAsDate(ms) {
    if (ms == null) return '';
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Coerce a value that might be a string-encoded number into a real number. */
function toNumber(v) {
    if (v == null || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}

/**
 * Feishu bitable v1 returns select fields as either a plain string (single) or
 * an array of strings/objects. Normalize to a single string.
 */
function selectToString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
        const first = v[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object') return first.text || first.name || '';
    }
    if (typeof v === 'object') return v.text || v.name || '';
    return String(v);
}

/** Normalize a GitHub repo value (short owner/repo or full URL) into a full https URL. */
function normalizeGithubUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const u = url.trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[\w.-]+\/[\w.-]+$/.test(u)) return 'https://github.com/' + u;
    if (/github\.com\//i.test(u)) return 'https://' + u.replace(/^\/+/, '');
    return u;
}

/** Derive a file extension from a mime type (e.g. image/png -> png). */
function extFromMime(mime) {
    if (!mime || typeof mime !== 'string') return 'png';
    const m = mime.toLowerCase();
    if (m.includes('svg')) return 'svg';
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    return 'png';
}

/** List table fields and return a {fieldName: fieldId} map. */
async function getFieldIdMap(token) {
    const url = `${API_HOST}/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/fields`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.code !== 0) {
        throw new Error(`list fields failed: ${data.code} ${data.msg}`);
    }
    const map = {};
    for (const f of (data.data && data.data.items) || []) {
        map[f.field_name] = f.field_id;
    }
    return map;
}

/**
 * Download a bitable attachment by file_token into savePath.
 * Uses the drive media download endpoint with the bitable extra param for auth.
 */
async function downloadAttachment(token, fileToken, recordId, fieldId, savePath) {
    const extra = {
        bitablePerm: {
            tableId: TABLE_ID,
            attachments: { [fieldId]: { [recordId]: [fileToken] } },
        },
    };
    const url = `${API_HOST}/open-apis/drive/v1/medias/${fileToken}/download?extra=${encodeURIComponent(JSON.stringify(extra))}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, buf);
    return buf.length;
}

/** Convert a Feishu record's fields into the front-end app object shape. */
async function recordToApp(fields, recordId, iconFieldId, token) {
    const downloadSourcesRaw = fields['下载源JSON'] || '[]';
    let downloadSources = [];
    try {
        downloadSources = JSON.parse(downloadSourcesRaw);
    } catch {
        downloadSources = [];
    }
    const featuresRaw = fields['特性列表'] || '';
    const appId = fields['应用ID'] || recordId || '';

    // Icon: prefer "图标" attachment; fall back to "图标SVG" text field.
    let icon = fields['图标SVG'] || '';
    const attachments = fields['图标'];
    if (Array.isArray(attachments) && attachments.length > 0 && recordId && iconFieldId && token) {
        const att = attachments[0] || {};
        const ext = extFromMime(att.type);
        const savePath = path.resolve(process.cwd(), 'assets', 'icons', `${appId}.${ext}`);
        try {
            const size = await downloadAttachment(token, att.file_token, recordId, iconFieldId, savePath);
            icon = `assets/icons/${appId}.${ext}`;
            console.log(`  icon: ${appId} -> ${icon} (${size} bytes)`);
        } catch (e) {
            console.warn(`  icon download failed for ${appId}: ${e.message}`);
        }
    }

    return {
        id: appId,
        name: fields['应用名称'] || '',
        platform: selectToString(fields['平台']),
        category: selectToString(fields['分类']),
        categoryName: fields['分类名称'] || '',
        description: fields['描述'] || '',
        icon,
        size: fields['大小'] || '',
        version: fields['版本'] || '',
        updatedDate: formatMsAsDate(fields['更新日期']),
        popularity: toNumber(fields['热度']),
        features: featuresRaw ? featuresRaw.split('\n').map(s => s.trim()).filter(Boolean) : [],
        downloadSources,
        githubUrl: normalizeGithubUrl(fields['GitHub仓库']),
        githubStars: toNumber(fields['GitHub Star数']),
    };
}

/** Paginate through all records of the table. */
async function fetchAllRecords(token) {
    const fieldIdMap = await getFieldIdMap(token);
    const iconFieldId = fieldIdMap['图标'];
    if (!iconFieldId) {
        console.warn('No "图标" attachment field found; icons will fall back to "图标SVG".');
    }

    const apps = [];
    let pageToken = '';
    let page = 0;
    for (;;) {
        page += 1;
        const url = new URL(`${API_HOST}/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records`);
        url.searchParams.set('page_size', '100');
        if (pageToken) url.searchParams.set('page_token', pageToken);
        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.code !== 0) {
            throw new Error(`Failed to list records (page ${page}): ${data.code} ${data.msg}`);
        }
        const items = (data.data && data.data.items) || [];
        for (const item of items) {
            apps.push(await recordToApp(item.fields || {}, item.record_id || item.id, iconFieldId, token));
        }
        console.log(`  page ${page}: fetched ${items.length} records (total so far: ${apps.length})`);
        if (!data.data.has_more) break;
        pageToken = data.data.page_token;
    }
    return apps;
}

async function main() {
    console.log('Feishu Base sync starting...');
    console.log(`  host:       ${API_HOST}`);
    console.log(`  base_token: ${BASE_TOKEN}`);
    console.log(`  table_id:   ${TABLE_ID}`);

    console.log('Requesting tenant_access_token...');
    const token = await getTenantAccessToken();
    console.log('  ok');

    console.log('Fetching records...');
    let apps = await fetchAllRecords(token);
    console.log(`Fetched ${apps.length} apps total.`);

    if (apps.length === 0) {
        console.error('No records found in the Base. Aborting to avoid overwriting data with an empty file.');
        process.exit(2);
    }

    apps = await enrichAppsWithGithubStars(apps);

    // Sort by GitHub stars desc, then name, for stable output.
    apps.sort((a, b) => {
        if (b.githubStars !== a.githubStars) return b.githubStars - a.githubStars;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });

    const payload = {
        apps,
        syncedAt: new Date().toISOString(),
        source: 'feishu-base',
        baseToken: BASE_TOKEN,
        tableId: TABLE_ID,
    };

    const outPath = path.resolve(process.cwd(), OUTPUT_PATH);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    console.log(`Wrote ${apps.length} apps to ${outPath}`);
}

main().catch(err => {
    console.error('Sync failed:', err.message || err);
    process.exit(1);
});
