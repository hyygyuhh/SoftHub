/**
 * Fetch GitHub stargazers_count for apps with a githubUrl.
 * Used by sync-feishu.js during CI/local sync.
 *
 * Optional env: GITHUB_TOKEN or GH_TOKEN (5000 req/h; Actions provides GITHUB_TOKEN)
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function parseGithubRepo(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
    const match = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!match) return null;
    return { owner: decodeURIComponent(match[1]), repo: decodeURIComponent(match[2]) };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRepoStars(owner, repo) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SoftHub-Sync',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

    if (res.status === 404) return null;

    if (res.status === 403) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        const reset = res.headers.get('x-ratelimit-reset');
        throw new Error(`rate limited (remaining=${remaining}, reset=${reset})`);
    }

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : 0;
}

/**
 * @param {Array<{id:string, githubUrl?:string, githubStars?:number}>} apps
 * @returns {Promise<Array>}
 */
async function enrichAppsWithGithubStars(apps) {
    const cache = new Map();
    const unique = new Map();

    for (const app of apps) {
        const parsed = parseGithubRepo(app.githubUrl);
        if (!parsed) continue;
        const key = `${parsed.owner}/${parsed.repo}`;
        if (!unique.has(key)) unique.set(key, parsed);
    }

    if (!unique.size) {
        console.log('GitHub stars: no repo URLs found, skipping API fetch.');
        return apps;
    }

    console.log(`Fetching GitHub stars for ${unique.size} repo(s)...`);
    if (!GITHUB_TOKEN) {
        console.log('  tip: set GITHUB_TOKEN for higher rate limits (60/h without token)');
    }

    let ok = 0;
    let fail = 0;

    for (const [key, { owner, repo }] of unique) {
        try {
            const stars = await fetchRepoStars(owner, repo);
            cache.set(key, stars);
            if (stars != null) {
                console.log(`  ${key}: ${stars.toLocaleString()} stars`);
                ok++;
            } else {
                console.warn(`  ${key}: repo not found`);
                fail++;
            }
        } catch (err) {
            console.warn(`  ${key}: ${err.message}`);
            cache.set(key, undefined);
            fail++;
        }

        if (!GITHUB_TOKEN) await sleep(400);
    }

    for (const app of apps) {
        const manual = Number(app.githubStars) || 0;
        const parsed = parseGithubRepo(app.githubUrl);
        if (!parsed) {
            app.githubStars = manual;
            continue;
        }
        const key = `${parsed.owner}/${parsed.repo}`;
        const fetched = cache.get(key);
        if (typeof fetched === 'number') {
            app.githubStars = fetched;
        } else {
            app.githubStars = manual;
        }
    }

    console.log(`GitHub stars done: ${ok} ok, ${fail} failed/missing`);
    return apps;
}

module.exports = { parseGithubRepo, enrichAppsWithGithubStars };
