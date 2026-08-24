/**
 * test-sync.js
 *
 * Local test: fetch all records via lark-cli (which has user auth) and run them
 * through the same transformation as sync-feishu.js, writing js/apps-data.json.
 * This verifies the parsing logic against real data without needing a Feishu app.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { enrichAppsWithGithubStars } = require('./github-stars');

const BASE_TOKEN = 'GJvibLPwIakU71s2cyIcjX3Jnxf';
const TABLE_ID = 'tbldnqzm1EfXA4zI';

// --- same transformation logic as sync-feishu.js ---
function formatMsAsDate(ms) {
    if (ms == null) return '';
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function toNumber(v) {
    if (v == null || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}
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
function recordToApp(fields) {
    let downloadSources = [];
    try { downloadSources = JSON.parse(fields['下载源JSON'] || '[]'); } catch { downloadSources = []; }
    const featuresRaw = fields['特性列表'] || '';
    return {
        id: fields['应用ID'] || '',
        name: fields['应用名称'] || '',
        platform: selectToString(fields['平台']),
        category: selectToString(fields['分类']),
        categoryName: fields['分类名称'] || '',
        description: fields['描述'] || '',
        icon: fields['图标SVG'] || '',
        size: fields['大小'] || '',
        version: fields['版本'] || '',
        updatedDate: formatMsAsDate(fields['更新日期']),
        popularity: toNumber(fields['热度']),
        features: featuresRaw ? featuresRaw.split('\n').map(s => s.trim()).filter(Boolean) : [],
        downloadSources,
        githubUrl: fields['GitHub仓库'] || '',
        githubStars: toNumber(fields['GitHub Star数']),
    };
}
// --- end transformation logic ---

async function main() {
    console.log('Fetching all records via lark-cli (raw bitable v1 API)...');
    const raw = execFileSync('lark-cli', [
        'api', 'GET',
        `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records`,
        '--params', '{"page_size":100}',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    const res = JSON.parse(raw);
    // lark-cli api wraps the raw Feishu response as {ok, identity, data}.
    if (!res.ok) {
        console.error('API error:', JSON.stringify(res));
        process.exit(1);
    }
    const items = (res.data && res.data.items) || [];
    console.log(`Fetched ${items.length} records (has_more=${res.data.has_more})`);

    let apps = items.map(item => recordToApp(item.fields || {}));
    apps = await enrichAppsWithGithubStars(apps);
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

    const outPath = path.resolve(__dirname, '..', 'js', 'apps-data.json');
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    console.log(`Wrote ${apps.length} apps to ${outPath}`);

    // Print a sample for verification
    console.log('\nSample (first app):');
    console.log(JSON.stringify(apps[0], null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
