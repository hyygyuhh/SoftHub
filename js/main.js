(function () {
    'use strict';

    const state = {
        platform: 'all',
        category: 'all',
        search: '',
        sort: 'popular',
        view: 'grid'
    };

    let appsData = [];
    let syncMeta = { syncedAt: null };
    let detailAppId = null;
    let aboutViewActive = false;
    let hasInitialRender = false;

    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

    function scrollMainToTop(options) {
        options = options || {};
        const main = $('#storeMain');
        if (main) {
            if (options.behavior === 'smooth') {
                main.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                main.scrollTop = 0;
            }
            return;
        }
        window.scrollTo({ top: 0, behavior: options.behavior || 'auto' });
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/'/g, '&#39;');
    }

    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const DEFAULT_META = {
        title: '软集 SoftHub - GitHub 开源软件国内镜像下载',
        description: '软集 SoftHub - 收录 GitHub 优质开源软件，提供国内网盘镜像下载，无需加速器即可极速获取'
    };

    const CHIP_LABELS = {
        all: '全部',
        office: '办公效率',
        development: '开发工具',
        design: '设计创意',
        entertainment: '影音娱乐',
        system: '系统工具',
        network: '网络通讯',
        security: '安全防护'
    };

    const SIDEBAR_LABELS = {
        all: '推荐',
        office: '办公',
        development: '开发',
        design: '创作',
        entertainment: '影音',
        system: '系统',
        network: '网络',
        security: '安全'
    };

    function highlightSearch(text, query) {
        const safe = escapeHtml(text);
        if (!query) return safe;
        try {
            const regex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
            return safe.replace(regex, '<mark class="search-highlight">$1</mark>');
        } catch (e) {
            return safe;
        }
    }

    function isHomeView() {
        return state.platform === 'all' && state.category === 'all' && !state.search;
    }

    function isInputFocused() {
        const el = document.activeElement;
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    function updatePageMeta(meta) {
        meta = meta || DEFAULT_META;
        document.title = meta.title;

        const descEl = $('#metaDescription');
        if (descEl) descEl.setAttribute('content', meta.description);

        ['ogTitle', 'twitterTitle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.setAttribute('content', meta.title);
        });

        ['ogDescription', 'twitterDescription'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.setAttribute('content', meta.description);
        });
    }

    function updateJsonLd(app) {
        let script = $('#jsonLd');
        if (!script) {
            script = document.createElement('script');
            script.id = 'jsonLd';
            script.type = 'application/ld+json';
            document.head.appendChild(script);
        }

        if (app) {
            const ld = {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: app.name,
                description: app.description,
                applicationCategory: app.categoryName,
                operatingSystem: app.platform === 'windows' ? 'Windows' : 'Android',
                softwareVersion: app.version,
                url: getAppShareUrl(app.id)
            };
            if (app.githubUrl) ld.codeRepository = app.githubUrl;
            script.textContent = JSON.stringify(ld);
            return;
        }

        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: '软集 SoftHub 开源软件列表',
            numberOfItems: appsData.length,
            itemListElement: appsData.slice(0, 20).map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: item.name,
                url: getAppShareUrl(item.id)
            }))
        });
    }

    function parseUrlState() {
        const params = new URLSearchParams(location.search);
        const platform = params.get('p');
        const category = params.get('c');
        const query = params.get('q');
        const sort = params.get('sort');

        if (platform === 'windows' || platform === 'android') state.platform = platform;
        if (category && CHIP_LABELS[category]) state.category = category;
        if (query) state.search = query;
        if (sort === 'name' || sort === 'updated' || sort === 'popular') state.sort = sort;
    }

    function syncUrlState() {
        if (detailAppId) return;

        const params = new URLSearchParams();
        if (state.platform !== 'all') params.set('p', state.platform);
        if (state.category !== 'all') params.set('c', state.category);
        if (state.search) params.set('q', state.search);
        if (state.sort !== 'popular') params.set('sort', state.sort);

        const qs = params.toString();
        const newUrl = location.pathname + (qs ? '?' + qs : '') + location.hash;
        const currentUrl = location.pathname + location.search + location.hash;
        if (newUrl !== currentUrl) {
            history.replaceState(null, '', newUrl);
        }
    }

    function applyStateToUI() {
        updateNavAria();
        updateSidebarActive();
        const sortSelect = $('#sortSelect');
        if (sortSelect) sortSelect.value = state.sort;

        const input = $('#searchInput');
        const clearBtn = $('#searchClear');
        if (state.search && input) {
            input.value = state.search;
            if (clearBtn) clearBtn.style.display = 'flex';
        }

        updateMobileNavActive();
    }

    function updateSidebarActive() {
        $$('.store-nav-item').forEach(item => {
            if (item.dataset.scrollTo === 'about') {
                item.classList.toggle('active', aboutViewActive);
                return;
            }

            const cat = item.dataset.category;
            const plat = item.dataset.platform;
            let active = false;
            if (!aboutViewActive) {
                if (cat) active = state.category === cat && state.platform === 'all';
                if (plat) active = state.platform === plat && state.category === 'all';
            }
            item.classList.toggle('active', active);
        });
    }

    function updateNavAria() {
        $$('.nav-link[data-platform]').forEach(l => {
            const selected = l.dataset.platform === state.platform;
            l.classList.toggle('active', selected);
            l.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        $$('.chip').forEach(c => {
            const selected = c.dataset.category === state.category;
            c.classList.toggle('active', selected);
            c.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
    }

    async function shareApp(id, app) {
        const url = getAppShareUrl(id);
        if (navigator.share) {
            try {
                await navigator.share({
                    title: app.name + ' - 软集 SoftHub',
                    text: app.description,
                    url: url
                });
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        copyToClipboard(url);
        showToast('链接已复制，可分享给好友', 'success');
    }

    async function loadAppsData() {
        try {
            const res = await fetch('js/apps-data.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data && Array.isArray(data.apps) && data.apps.length > 0) {
                console.info('[SoftHub] Loaded ' + data.apps.length + ' apps from Feishu sync' +
                    (data.syncedAt ? ' (synced at ' + data.syncedAt + ')' : ''));
                return { apps: data.apps, syncedAt: data.syncedAt || null };
            }
            throw new Error('empty apps array');
        } catch (e) {
            console.warn('[SoftHub] Could not load js/apps-data.json (' + e.message + '), falling back to local data.');
            return {
                apps: typeof APPS_DATA !== 'undefined' ? APPS_DATA : [],
                syncedAt: null
            };
        }
    }

    function countDownloadSources() {
        const types = new Set();
        appsData.forEach(app => {
            (app.downloadSources || []).forEach(s => {
                if (s.type) types.add(s.type);
            });
        });
        return types.size || 4;
    }

    function updateDynamicStats() {
        const count = appsData.length;
        const sourceCount = countDownloadSources();
        const winCount = appsData.filter(a => a.platform === 'windows').length;
        const androidCount = appsData.filter(a => a.platform === 'android').length;

        const badgeCount = $('.hero-badge-count');
        if (badgeCount) badgeCount.textContent = count + '+';

        const subtitle = $('#heroSubtitle');
        if (subtitle && winCount && androidCount) {
            subtitle.textContent = `收录 ${count} 款 GitHub 开源软件 · ${winCount} 款 Windows · ${androidCount} 款 Android · 国内网盘镜像下载`;
        }

        $$('[data-stat="apps"]').forEach(el => {
            if (el.dataset.counter != null) el.dataset.counter = String(count);
            el.textContent = el.dataset.counter != null ? '0' : count + '+';
        });

        $$('[data-stat="sources"]').forEach(el => {
            if (el.dataset.counter != null) el.dataset.counter = String(sourceCount);
            else el.textContent = String(sourceCount);
        });

        const syncEl = $('#syncInfo');
        if (syncEl && syncMeta.syncedAt) {
            const date = new Date(syncMeta.syncedAt);
            if (!isNaN(date.getTime())) {
                syncEl.textContent = '数据同步于 ' + date.toLocaleString('zh-CN', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
                syncEl.hidden = false;
            }
        }

        const yearEl = $('#footerYear');
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        updateCategoryFilters();
        updateJsonLd();
    }

    function updateCategoryFilters() {
        const platformApps = state.platform === 'all'
            ? appsData
            : appsData.filter(a => a.platform === state.platform);

        const counts = {};
        platformApps.forEach(app => {
            counts[app.category] = (counts[app.category] || 0) + 1;
        });

        $$('.chip').forEach(chip => {
            const cat = chip.dataset.category;
            if (!cat) return;

            if (cat === 'all') {
                chip.textContent = `${CHIP_LABELS.all} (${platformApps.length})`;
                chip.hidden = false;
                return;
            }

            const count = counts[cat] || 0;
            chip.textContent = `${CHIP_LABELS[cat] || cat} (${count})`;
            chip.hidden = count === 0;

            if (count === 0 && state.category === cat) {
                state.category = 'all';
                chip.classList.remove('active');
                const allChip = $('.chip[data-category="all"]');
                if (allChip) allChip.classList.add('active');
            }
        });
    }

    function getGithubStars(app) {
        const stars = Number(app.githubStars);
        return !isNaN(stars) && stars >= 0 ? stars : 0;
    }

    function sortByGithubStars(apps) {
        return [...apps].sort((a, b) => {
            const diff = getGithubStars(b) - getGithubStars(a);
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name, 'zh');
        });
    }

    function isHotApp(app) {
        return getGithubStars(app) >= 5000;
    }

    function formatGithubStars(stars) {
        if (stars >= 10000) return (stars / 1000).toFixed(stars >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k';
        if (stars >= 1000) return (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(stars);
    }

    function bindStoreCardEvents(container) {
        if (!container) return;

        container.querySelectorAll('[data-id]').forEach(card => {
            if (card.classList.contains('store-app-row') ||
                card.classList.contains('store-featured-card') ||
                card.classList.contains('store-promo-card')) {
                const open = (e) => {
                    if (e.target.closest('.store-install-btn')) return;
                    showAppDetail(card.dataset.id);
                };
                card.addEventListener('click', open);
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        if (e.target.closest('.store-install-btn')) return;
                        e.preventDefault();
                        showAppDetail(card.dataset.id);
                    }
                });
            }
        });

        container.querySelectorAll('.store-install-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDownloadModal(btn.dataset.id);
            });
        });
    }

    let featuredAutoplayTimer = null;

    function getFeaturedScrollStep(track) {
        return Math.min(track.clientWidth * 0.85, 420);
    }

    function advanceFeaturedCarousel(options) {
        options = options || {};
        const track = $('#featuredTrack');
        if (!track || track.children.length <= 1) return;

        const maxScroll = track.scrollWidth - track.clientWidth;
        if (maxScroll <= 4) return;

        const step = getFeaturedScrollStep(track);
        const behavior = options.instant ? 'auto' : 'smooth';

        if (track.scrollLeft >= maxScroll - 4) {
            track.scrollTo({ left: 0, behavior });
        } else {
            track.scrollBy({ left: step, behavior });
        }

        refreshFeaturedNav();
    }

    function stopFeaturedAutoplay() {
        if (featuredAutoplayTimer) {
            clearInterval(featuredAutoplayTimer);
            featuredAutoplayTimer = null;
        }
    }

    function startFeaturedAutoplay() {
        stopFeaturedAutoplay();
        const track = $('#featuredTrack');
        if (!track || !isHomeView() || track.children.length <= 1) return;

        featuredAutoplayTimer = setInterval(() => {
            if (!isHomeView() || detailAppId || aboutViewActive) {
                stopFeaturedAutoplay();
                return;
            }
            advanceFeaturedCarousel();
        }, 5000);
    }

    function setupFeaturedAutoplay() {
        const track = $('#featuredTrack');
        const wrap = $('#featuredWrap');
        if (!track || track.dataset.autoplayBound) return;

        track.dataset.autoplayBound = '1';

        if (wrap) {
            wrap.addEventListener('mouseenter', stopFeaturedAutoplay);
            wrap.addEventListener('mouseleave', startFeaturedAutoplay);
            wrap.addEventListener('focusin', stopFeaturedAutoplay);
            wrap.addEventListener('focusout', (e) => {
                if (!wrap.contains(e.relatedTarget)) startFeaturedAutoplay();
            });
        }

        let touchTimer;
        track.addEventListener('touchstart', () => {
            stopFeaturedAutoplay();
            clearTimeout(touchTimer);
        }, { passive: true });
        track.addEventListener('touchend', () => {
            clearTimeout(touchTimer);
            touchTimer = setTimeout(startFeaturedAutoplay, 3000);
        }, { passive: true });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopFeaturedAutoplay();
            else if (isHomeView()) startFeaturedAutoplay();
        });
    }

    function renderPromoRow(apps) {
        const row = $('#promoRow');
        if (!row) return;

        const top = sortByGithubStars(apps).slice(0, 3);
        row.innerHTML = top.map(app => `
            <article class="store-promo-card" data-id="${escapeAttr(app.id)}" tabindex="0" role="button" aria-label="查看 ${escapeAttr(app.name)}">
                <div class="store-promo-card-inner">
                    <div class="store-promo-text">
                        <h4>${escapeHtml(app.name)}</h4>
                        <p>${escapeHtml(app.categoryName)} · GitHub 开源</p>
                    </div>
                    <div class="store-promo-icon">${app.icon}</div>
                </div>
            </article>
        `).join('');

        bindStoreCardEvents(row);
    }

    function renderFeaturedTrack(apps) {
        const track = $('#featuredTrack');
        if (!track) return;

        const featured = sortByGithubStars(apps).slice(0, 6);
        track.innerHTML = featured.map((app, i) => `
            <article class="store-featured-card" data-id="${escapeAttr(app.id)}" tabindex="0" role="button" aria-label="查看 ${escapeAttr(app.name)}">
                <div class="store-featured-banner store-banner-${i % 4}">
                    <div class="store-featured-banner-art">${app.icon}</div>
                </div>
                <div class="store-featured-body">
                    <div class="store-featured-icon">${app.icon}</div>
                    <div class="store-featured-info">
                        <h3>${highlightSearch(app.name, state.search)}</h3>
                        <span class="store-featured-cat">${escapeHtml(app.categoryName)}${getGithubStars(app) ? ' · ★ ' + formatGithubStars(getGithubStars(app)) : ''}</span>
                        <p>${highlightSearch(app.description, state.search)}</p>
                    </div>
                    <button class="store-install-btn" data-id="${escapeAttr(app.id)}" type="button">安装</button>
                </div>
            </article>
        `).join('');

        bindStoreCardEvents(track);
        refreshFeaturedNav();
        startFeaturedAutoplay();
    }

    function renderStoreList(apps, container) {
        if (!container) return;

        const query = state.search;
        container.innerHTML = apps.map(app => `
            <article class="store-app-row" data-id="${escapeAttr(app.id)}" tabindex="0" role="button" aria-label="查看 ${escapeAttr(app.name)}">
                <div class="store-app-row-icon">${app.icon}</div>
                <div class="store-app-row-info">
                    <h3>${highlightSearch(app.name, query)}</h3>
                    <span class="store-app-row-cat">${highlightSearch(app.categoryName, query)}${getGithubStars(app) ? ' · ★ ' + formatGithubStars(getGithubStars(app)) : ''}</span>
                    <p>${highlightSearch(app.description, query)}</p>
                </div>
                <button class="store-install-btn" data-id="${escapeAttr(app.id)}" type="button">安装</button>
            </article>
        `).join('');

        bindStoreCardEvents(container);
    }

    function updateStoreWidgets(apps) {
        const widgets = $('#storeWidgets');
        const home = isHomeView();

        if (widgets) widgets.hidden = !home;

        const tagline = $('#storeTagline');
        if (tagline) tagline.hidden = !home;

        if (home && apps.length) {
            renderPromoRow(apps);
            renderFeaturedTrack(apps);
        } else {
            stopFeaturedAutoplay();
            const promoRow = $('#promoRow');
            const featuredTrack = $('#featuredTrack');
            if (promoRow) promoRow.innerHTML = '';
            if (featuredTrack) featuredTrack.innerHTML = '';
        }
    }

    function setupFeaturedNav() {
        const track = $('#featuredTrack');
        const next = $('#featuredNext');
        if (!track || !next || next.dataset.bound) return;

        next.dataset.bound = '1';
        next.addEventListener('click', () => {
            stopFeaturedAutoplay();
            advanceFeaturedCarousel();
            startFeaturedAutoplay();
        });

        const updateNext = () => {
            const maxScroll = track.scrollWidth - track.clientWidth;
            next.disabled = track.scrollLeft >= maxScroll - 4;
        };

        track.addEventListener('scroll', updateNext, { passive: true });
        updateNext();

        track._refreshFeaturedNav = updateNext;
    }

    function refreshFeaturedNav() {
        const track = $('#featuredTrack');
        if (track && track._refreshFeaturedNav) track._refreshFeaturedNav();
    }

    function getEssentialApps(apps) {
        if (isHomeView()) {
            return sortByGithubStars(apps).slice(0, 10);
        }
        return apps;
    }

    function renderDownloadSources(sources) {
        return (sources || []).map(s => {
            const hasCode = s.code && s.code.trim();
            return `
            <div class="download-source-item">
                <div class="source-icon tag-${escapeAttr(s.type)}">${escapeHtml(s.name.charAt(0))}</div>
                <div class="download-source-info">
                    <span class="source-name">${escapeHtml(s.name)}</span>
                    ${hasCode ? `<span class="source-code">提取码：<code>${escapeHtml(s.code)}</code></span>` : ''}
                </div>
                <div class="source-actions">
                    ${hasCode ? `
                        <button class="source-code-btn" data-code="${escapeAttr(s.code)}" aria-label="复制 ${escapeAttr(s.name)} 提取码">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            复制
                        </button>
                    ` : ''}
                    <button class="download-source-go" data-url="${escapeAttr(s.url)}" data-name="${escapeAttr(s.name)}" data-code="${escapeAttr(s.code || '')}">
                        前往下载
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    function bindDownloadSourceEvents(container, options) {
        if (!container) return;
        options = options || {};

        container.querySelectorAll('.source-code-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(btn.dataset.code);
                showToast('提取码已复制', 'success');
            });
        });

        container.querySelectorAll('.download-source-go').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const name = btn.dataset.name;
                const code = btn.dataset.code;

                if (code) {
                    copyToClipboard(code);
                    showToast(`提取码已复制，即将跳转${name}...`, 'success');
                } else {
                    showToast(`即将跳转${name}...`, 'info');
                }

                if (options.closeModal) hideModal();
                const delay = options.closeModal ? 400 : 300;
                setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), delay);
            });
        });
    }

    function parseAppHash() {
        const match = location.hash.match(/^#app\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function setAppHash(id) {
        const hash = id ? '#app/' + encodeURIComponent(id) : '';
        if (location.hash !== hash) {
            if (id) location.hash = hash;
            else history.replaceState(null, '', location.pathname + location.search);
        }
    }

    function getAppShareUrl(id) {
        const base = location.origin && location.origin !== 'null'
            ? location.origin + location.pathname
            : location.href.split('#')[0];
        return base + '#app/' + encodeURIComponent(id);
    }

    function setupHashRouting() {
        window.addEventListener('hashchange', () => {
            const appId = parseAppHash();
            if (appId) {
                if (appsData.some(a => a.id === appId)) showAppDetail(appId, { skipHash: true });
                else showToast('未找到该应用', 'error');
            } else if (detailAppId) {
                hideAppDetail({ skipHash: true });
            }
        });
    }

    function initTheme() {
        const saved = localStorage.getItem('softhub-theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        $('#themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('softhub-theme', next);
        });
    }

    function initViewPreference() {
        const gridBtn = $('#gridViewBtn');
        const listBtn = $('#listViewBtn');
        if (!gridBtn || !listBtn) return;

        const saved = localStorage.getItem('softhub-view');
        if (saved === 'grid' || saved === 'list') {
            state.view = saved;
            gridBtn.classList.toggle('active', saved === 'grid');
            listBtn.classList.toggle('active', saved === 'list');
            gridBtn.setAttribute('aria-pressed', saved === 'grid');
            listBtn.setAttribute('aria-pressed', saved === 'list');
        }
    }

    function animateCounters() {
        const counters = $$('[data-counter]');
        if (!counters.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.dataset.counter, 10);
                    const duration = 1200;
                    const start = performance.now();

                    function update(now) {
                        const elapsed = now - start;
                        const progress = Math.min(elapsed / duration, 1);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        el.textContent = Math.round(eased * target);
                        if (progress < 1) requestAnimationFrame(update);
                    }

                    requestAnimationFrame(update);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        counters.forEach(c => observer.observe(c));
    }

    function initScrollReveal() {
        const elements = $$('.reveal-on-scroll, .app-card, .detail-content');
        if (!elements.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        elements.forEach(el => {
            if (el.classList.contains('app-card')) return;
            observer.observe(el);
        });
    }

    function initScrollEffects() {
        const header = $('#header');
        const backToTop = $('#backToTop');

        let ticking = false;

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollY = window.scrollY;
                    if (header) header.classList.toggle('is-scrolled', scrollY > 10);
                    if (backToTop) backToTop.classList.toggle('is-visible', scrollY > 400);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        if (backToTop) {
            backToTop.addEventListener('click', () => {
                scrollMainToTop({ behavior: 'smooth' });
            });
        }

        document.querySelectorAll('[data-scroll-to]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const target = el.getAttribute('data-scroll-to');
                if (target === 'top') {
                    if (detailAppId) hideAppDetail({ skipScroll: true });
                    hideAboutPage();
                    showStoreHome();
                    scrollMainToTop({ behavior: 'smooth' });
                } else if (target === 'about') {
                    showAboutPage();
                } else {
                    if (detailAppId) hideAppDetail();
                    const targetEl = document.querySelector('#' + target) || document.querySelector(target);
                    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                closeMobileDrawer();
            });
        });
    }

    function showStoreHome() {
        const storeHome = $('#storeHome');
        if (storeHome) storeHome.style.display = 'block';
    }

    function hideAboutPage() {
        aboutViewActive = false;
        const about = $('#about');
        if (about) {
            about.style.display = 'none';
            about.classList.remove('is-visible');
        }
        updateSidebarActive();
        updateMobileNavActive();
    }

    function showAboutPage() {
        if (detailAppId) hideAppDetail({ skipScroll: true });
        aboutViewActive = true;

        const storeHome = $('#storeHome');
        const about = $('#about');
        const appDetail = $('#appDetail');
        if (storeHome) storeHome.style.display = 'none';
        if (appDetail) {
            appDetail.style.display = 'none';
            appDetail.classList.remove('is-visible');
        }
        if (about) {
            about.style.display = 'block';
            requestAnimationFrame(() => about.classList.add('is-visible'));
        }

        updateSidebarActive();
        updateMobileNavActive();
        scrollMainToTop();
    }

    function renderGrid(apps) {
        const grid = $('#appsGrid');
        grid.classList.remove('is-animating');
        const query = state.search;

        const html = apps.map((app, i) => `
            <article class="app-card" data-id="${escapeAttr(app.id)}" tabindex="0" style="animation-delay:${Math.min(i, 8) * 40}ms">
                ${isHotApp(app) ? '<span class="app-hot-badge">热门</span>' : ''}
                <div class="app-icon-wrapper">
                    <span class="platform-badge ${escapeAttr(app.platform)}">${app.platform === 'windows' ? 'Win' : '安卓'}</span>
                    ${app.icon}
                </div>
                <div class="app-body">
                    <h3 class="app-name">${highlightSearch(app.name, query)}</h3>
                    <p class="app-desc">${highlightSearch(app.description, query)}</p>
                    <div class="app-meta">
                        <span class="app-category">${highlightSearch(app.categoryName, query)}</span>
                        <span class="app-version">v${escapeHtml(app.version)}</span>
                        <span class="app-size">${escapeHtml(app.size)}</span>
                    </div>
                    <button class="app-download-btn" data-id="${escapeAttr(app.id)}" aria-label="下载 ${escapeAttr(app.name)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        下载
                    </button>
                </div>
            </article>
        `).join('');

        grid.innerHTML = html;
        requestAnimationFrame(() => grid.classList.add('is-animating'));

        grid.querySelectorAll('.app-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.app-download-btn')) return;
                showAppDetail(card.dataset.id);
            });

            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.closest('.app-download-btn')) return;
                    e.preventDefault();
                    showAppDetail(card.dataset.id);
                }
            });

            const downloadBtn = card.querySelector('.app-download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showDownloadModal(downloadBtn.dataset.id);
                });
            }
        });
    }

    function renderList(apps) {
        const list = $('#appsList');
        const query = state.search;
        list.innerHTML = apps.map(app => `
            <div class="app-list-item" data-id="${escapeAttr(app.id)}" tabindex="0">
                <div class="app-list-icon">${app.icon}</div>
                <div class="app-list-info">
                    <div class="app-list-name">${highlightSearch(app.name, query)}</div>
                    <div class="app-list-desc">${highlightSearch(app.description, query)}</div>
                </div>
                <div class="app-list-meta">
                    <span>${escapeHtml(app.categoryName)}</span>
                    <span>v${escapeHtml(app.version)}</span>
                    <span>${escapeHtml(app.size)}</span>
                </div>
                <button class="app-list-download" data-id="${escapeAttr(app.id)}">下载</button>
            </div>
        `).join('');

        list.querySelectorAll('.app-list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.app-list-download')) return;
                showAppDetail(item.dataset.id);
            });

            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.closest('.app-list-download')) return;
                    e.preventDefault();
                    showAppDetail(item.dataset.id);
                }
            });
        });

        list.querySelectorAll('.app-list-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDownloadModal(btn.dataset.id);
            });
        });
    }

    function filterApps() {
        let apps = [...appsData];

        if (state.platform !== 'all') {
            apps = apps.filter(a => a.platform === state.platform);
        }
        if (state.category !== 'all') {
            apps = apps.filter(a => a.category === state.category);
        }
        if (state.search) {
            const q = state.search.toLowerCase();
            apps = apps.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.description.toLowerCase().includes(q) ||
                a.categoryName.toLowerCase().includes(q)
            );
        }

        switch (state.sort) {
            case 'name': apps.sort((a, b) => a.name.localeCompare(b.name, 'zh')); break;
            case 'updated': apps.sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate)); break;
            default: apps = sortByGithubStars(apps);
        }

        return apps;
    }

    function updateSectionTitle() {
        if (state.search) {
            $('#sectionTitle').textContent = '搜索结果';
            return;
        }
        if (state.platform !== 'all' && state.category === 'all') {
            $('#sectionTitle').textContent = PLATFORMS[state.platform];
            return;
        }
        if (state.category !== 'all') {
            $('#sectionTitle').textContent = SIDEBAR_LABELS[state.category] || CHIP_LABELS[state.category];
            return;
        }
        $('#sectionTitle').textContent = '推荐';
    }

    function updateEssentialTitle() {
        const el = $('#essentialTitle');
        if (!el) return;
        if (isHomeView()) {
            el.textContent = '热门开源';
        } else if (state.search) {
            el.textContent = '搜索结果';
        } else {
            el.textContent = '应用列表';
        }
    }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const essentialList = $('#essentialList');
        const widgets = $('#storeWidgets');

        if (essentialList) essentialList.innerHTML = '';
        if (widgets) widgets.hidden = true;
        if (!skeleton) return;

        skeleton.style.display = 'flex';
        skeleton.innerHTML = '';

        for (let i = 0; i < 6; i++) {
            const card = document.createElement('div');
            card.className = 'skeleton-card';
            card.innerHTML = `
                <div class="skeleton-banner"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-btn"></div>
                </div>
            `;
            skeleton.appendChild(card);
        }
    }

    function hideSkeleton() {
        const skeleton = $('#skeletonGrid');
        skeleton.style.display = 'none';
        skeleton.innerHTML = '';
    }

    function renderFiltersResult() {
        const apps = filterApps();
        const empty = $('#emptyState');
        const count = $('#appCount');
        const essentialList = $('#essentialList');
        const essentialSection = $('.store-essential-section');

        hideSkeleton();

        if (!apps.length) {
            if (essentialList) essentialList.innerHTML = '';
            if (essentialSection) essentialSection.style.display = 'none';
            empty.style.display = 'block';
            count.textContent = '';
            updateStoreWidgets([]);
            updateSectionTitle();
            updateEssentialTitle();
            updateSidebarActive();
            updateCategoryFilters();
            syncUrlState();
            return;
        }

        empty.style.display = 'none';
        if (essentialSection) essentialSection.style.display = 'block';
        count.textContent = `共 ${apps.length} 个应用`;

        updateStoreWidgets(apps);
        renderStoreList(getEssentialApps(apps), essentialList);
        updateSectionTitle();
        updateEssentialTitle();
        updateSidebarActive();
        updateCategoryFilters();
        syncUrlState();
    }

    function applyFilters() {
        const viewEl = $('#essentialList');

        if (!hasInitialRender) {
            showSkeleton();
            requestAnimationFrame(() => {
                renderFiltersResult();
                hasInitialRender = true;
            });
            return;
        }

        if (viewEl) viewEl.classList.add('is-updating');
        requestAnimationFrame(() => {
            renderFiltersResult();
            if (viewEl) {
                requestAnimationFrame(() => viewEl.classList.remove('is-updating'));
            }
        });
    }

    function hideAppDetail(options) {
        options = options || {};
        detailAppId = null;
        updatePageMeta();
        updateJsonLd();

        $('#appDetail').style.display = 'none';
        $('#appDetail').classList.remove('is-visible');
        const storeMain = $('#storeMain');
        if (storeMain) storeMain.classList.remove('is-detail-view');
        hideAboutPage();
        showStoreHome();

        if (!options.skipHash && parseAppHash()) {
            setAppHash(null);
        }

        if (!options.skipScroll) {
            scrollMainToTop({ behavior: 'smooth' });
        }

        if (isHomeView()) startFeaturedAutoplay();
    }

    function renderDetailCarousel(app) {
        const themes = [
            { bg: 'store-theme-pink', accent: '#ec4899' },
            { bg: 'store-theme-blue', accent: '#3b82f6' },
            { bg: 'store-theme-green', accent: '#10b981' },
            { bg: 'store-theme-purple', accent: '#8b5cf6' },
            { bg: 'store-theme-orange', accent: '#f97316' }
        ];
        const items = (app.features && app.features.length ? app.features : [app.description]).slice(0, 5);

        return `
            <div class="store-carousel-section">
                <div class="store-carousel" id="detailCarousel">
                    ${items.map((feature, i) => {
                        const theme = themes[i % themes.length];
                        return `
                        <article class="store-carousel-card ${theme.bg}">
                            <div class="store-carousel-card-inner">
                                <h4 class="store-carousel-title">
                                    <span class="store-carousel-bar" style="background:${theme.accent}"></span>
                                    ${escapeHtml(feature)}
                                </h4>
                                <div class="store-carousel-preview">
                                    <div class="store-carousel-mock">${app.icon}</div>
                                </div>
                            </div>
                        </article>`;
                    }).join('')}
                </div>
                <div class="store-carousel-controls">
                    <button class="store-carousel-btn store-carousel-prev" aria-label="上一项" type="button">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <button class="store-carousel-btn store-carousel-next" aria-label="下一项" type="button">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
            </div>`;
    }

    function renderDetailPage(app) {
        const desc = app.description || '';
        const needsExpand = desc.length > 100;
        const githubUrl = app.githubUrl && app.githubUrl.trim();

        return `
            <div class="store-detail">
                <header class="store-hero">
                    <div class="store-hero-icon">${app.icon}</div>
                    <div class="store-hero-info">
                        <div class="store-hero-title-row">
                            <h1 class="store-hero-name">${escapeHtml(app.name)}</h1>
                            <span class="store-hero-version">${escapeHtml(app.version)}</span>
                        </div>
                        <p class="store-hero-tagline">${escapeHtml(desc)}</p>
                        <div class="store-hero-badges">
                            <span class="store-badge">${app.platform === 'windows' ? 'Windows' : 'Android'}</span>
                            <span class="store-badge">${escapeHtml(app.categoryName)}</span>
                            <span class="store-badge store-badge-github">GitHub 开源</span>
                            ${isHotApp(app) ? '<span class="store-badge store-badge-hot">热门</span>' : ''}
                        </div>
                        ${githubUrl ? `
                        <a class="store-github-link" href="${escapeAttr(githubUrl)}" target="_blank" rel="noopener noreferrer">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                            查看 GitHub 仓库
                        </a>` : ''}
                    </div>
                    <div class="store-hero-action">
                        <span class="store-hero-size">${escapeHtml(app.size)}</span>
                        <button class="store-install-btn" id="detailDownloadBtn" type="button">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            下载
                        </button>
                        <button class="store-share-btn" id="detailShareBtn" type="button" aria-label="分享应用链接">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                            </svg>
                        </button>
                    </div>
                </header>

                ${renderDetailCarousel(app)}

                <section class="store-section">
                    <h2 class="store-section-title">应用介绍</h2>
                    <div class="store-intro ${needsExpand ? 'is-collapsed' : ''}" id="detailIntro">
                        <p class="store-intro-text">${escapeHtml(desc)}</p>
                        ${needsExpand ? '<button class="store-intro-toggle" type="button">查看全部</button>' : ''}
                    </div>
                </section>

                <section class="store-section">
                    <h2 class="store-section-title">应用信息</h2>
                    <div class="store-info-grid">
                        <div class="store-info-item">
                            <span class="store-info-label">资费</span>
                            <span class="store-info-value">免费</span>
                        </div>
                        <div class="store-info-item">
                            <span class="store-info-label">大小</span>
                            <span class="store-info-value">${escapeHtml(app.size)}</span>
                        </div>
                        <div class="store-info-item">
                            <span class="store-info-label">版本</span>
                            <span class="store-info-value">${escapeHtml(app.version)}</span>
                        </div>
                        <div class="store-info-item">
                            <span class="store-info-label">更新时间</span>
                            <span class="store-info-value">${escapeHtml(app.updatedDate)}</span>
                        </div>
                        <div class="store-info-item">
                            <span class="store-info-label">平台</span>
                            <span class="store-info-value">${app.platform === 'windows' ? 'Windows' : 'Android'}</span>
                        </div>
                    </div>
                </section>
            </div>`;
    }

    function setupDetailCarousel(container) {
        const carousel = container.querySelector('#detailCarousel');
        const prev = container.querySelector('.store-carousel-prev');
        const next = container.querySelector('.store-carousel-next');
        if (!carousel || !prev || !next) return;

        const scrollAmount = () => Math.min(carousel.clientWidth * 0.85, 360);

        prev.addEventListener('click', () => {
            carousel.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
        });
        next.addEventListener('click', () => {
            carousel.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
        });

        const updateButtons = () => {
            const maxScroll = carousel.scrollWidth - carousel.clientWidth;
            prev.disabled = carousel.scrollLeft <= 4;
            next.disabled = carousel.scrollLeft >= maxScroll - 4;
        };

        carousel.addEventListener('scroll', updateButtons, { passive: true });
        updateButtons();
    }

    function setupDetailIntro(container) {
        const intro = container.querySelector('#detailIntro');
        const toggle = container.querySelector('.store-intro-toggle');
        if (!intro || !toggle) return;

        toggle.addEventListener('click', () => {
            const collapsed = intro.classList.toggle('is-collapsed');
            toggle.textContent = collapsed ? '查看全部' : '收起';
        });
    }

    function showAppDetail(id, options) {
        options = options || {};
        const app = appsData.find(a => a.id === id);
        if (!app) return;

        detailAppId = id;
        aboutViewActive = false;
        updatePageMeta({
            title: app.name + ' - 软集 SoftHub',
            description: app.description + ' | ' + app.categoryName + ' · v' + app.version
        });
        updateJsonLd(app);

        const content = $('#detailContent');
        content.innerHTML = renderDetailPage(app);

        const storeHome = $('#storeHome');
        if (storeHome) storeHome.style.display = 'none';
        const about = $('#about');
        if (about) {
            about.style.display = 'none';
            about.classList.remove('is-visible');
        }
        const detailSection = $('#appDetail');
        const storeMain = $('#storeMain');
        scrollMainToTop();
        if (storeMain) storeMain.classList.add('is-detail-view');
        stopFeaturedAutoplay();
        detailSection.style.display = 'block';
        detailSection.classList.remove('is-visible');
        requestAnimationFrame(() => detailSection.classList.add('is-visible'));

        if (!options.skipHash) setAppHash(id);

        $('#backBtn').onclick = () => hideAppDetail();

        $('#detailDownloadBtn').addEventListener('click', () => showDownloadModal(id));
        $('#detailShareBtn').addEventListener('click', () => shareApp(id, app));

        setupDetailCarousel(content);
        setupDetailIntro(content);
        updateSidebarActive();
        updateMobileNavActive();
    }

    function showDownloadModal(appId) {
        const app = appsData.find(a => a.id === appId);
        if (!app) return;

        $('#modalAppName').textContent = app.name;

        const modalIcon = $('#modalAppIcon');
        if (modalIcon) modalIcon.innerHTML = app.icon;

        const list = $('#downloadSourcesList');
        list.innerHTML = renderDownloadSources(app.downloadSources);
        bindDownloadSourceEvents(list, { closeModal: true });

        const modal = $('#downloadModal');
        modal.style.display = 'flex';
        modal.classList.remove('is-visible');
        requestAnimationFrame(() => modal.classList.add('is-visible'));
        document.body.style.overflow = 'hidden';
    }

    function hideModal() {
        const modal = $('#downloadModal');
        modal.classList.remove('is-visible');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    function copyToClipboard(text) {
        if (!text) return;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            ta.remove();
        }
    }

    function showToast(message, type) {
        const container = $('#toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast' + (type ? ' ' + type : '');

        const icon = type === 'success'
            ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
            : type === 'error'
                ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6366f1" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

        toast.innerHTML = icon + '<span>' + escapeHtml(message) + '</span>';
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            toast.style.transition = 'opacity 0.3s, transform 0.3s';
            setTimeout(() => toast.remove(), 350);
        }, 2500);
    }

    function selectStoreNav(options) {
        options = options || {};
        hideAboutPage();
        showStoreHome();
        if (options.category != null) {
            state.category = options.category;
            state.platform = 'all';
        } else if (options.platform != null) {
            state.platform = options.platform;
            state.category = 'all';
        }
        updateSidebarActive();
        updateNavAria();
        updateMobileNavActive();
        applyFilters();
    }

    function setupFilters() {
        $$('.store-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.scrollTo) return;
                if (detailAppId) hideAppDetail({ skipScroll: true });

                const category = item.dataset.category;
                const platform = item.dataset.platform;

                if (category) selectStoreNav({ category });
                else if (platform) selectStoreNav({ platform });

                closeMobileDrawer();
                scrollMainToTop({ behavior: 'smooth' });
            });
        });

        $$('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                const platform = link.dataset.platform;
                if (!platform) return;
                if (detailAppId) hideAppDetail({ skipScroll: true });
                $$('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                selectStoreNav({ platform });
            });
        });

        $$('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                if (detailAppId) hideAppDetail({ skipScroll: true });
                hideAboutPage();
                showStoreHome();
                $$('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.category = chip.dataset.category;
                state.platform = 'all';
                updateNavAria();
                updateSidebarActive();
                applyFilters();
            });
        });

        const sortSelect = $('#sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                state.sort = e.target.value;
                applyFilters();
            });
        }

        const resetBtn = $('#resetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetFilters);
    }

    function resetFilters() {
        if (detailAppId) hideAppDetail({ skipScroll: true });
        hideAboutPage();
        showStoreHome();
        state.search = '';
        state.category = 'all';
        state.platform = 'all';
        state.sort = 'popular';
        const searchInput = $('#searchInput');
        if (searchInput) searchInput.value = '';
        const searchClear = $('#searchClear');
        if (searchClear) searchClear.style.display = 'none';
        $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.category === 'all'));
        updateNavAria();
        updateSidebarActive();
        const sortSelect = $('#sortSelect');
        if (sortSelect) sortSelect.value = 'popular';
        applyFilters();
        updateMobileNavActive();
    }

    function setupSearch() {
        const input = $('#searchInput');
        const clearBtn = $('#searchClear');
        const btn = $('#searchBtn');
        let debounce;

        input.addEventListener('input', () => {
            clearBtn.style.display = input.value ? 'flex' : 'none';
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                if (detailAppId) hideAppDetail({ skipScroll: true });
                hideAboutPage();
                showStoreHome();
                state.search = input.value.trim();
                applyFilters();
            }, 300);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (detailAppId) hideAppDetail({ skipScroll: true });
                hideAboutPage();
                showStoreHome();
                state.search = input.value.trim();
                applyFilters();
            }
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            state.search = '';
            applyFilters();
            input.focus();
        });

        btn && btn.addEventListener('click', () => {
            if (detailAppId) hideAppDetail({ skipScroll: true });
            hideAboutPage();
            showStoreHome();
            state.search = input.value.trim();
            applyFilters();
        });
    }

    function setupViewToggle() {
        const gridBtn = $('#gridViewBtn');
        const listBtn = $('#listViewBtn');
        if (!gridBtn || !listBtn) return;

        gridBtn.addEventListener('click', () => {
            state.view = 'grid';
            localStorage.setItem('softhub-view', 'grid');
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
            gridBtn.setAttribute('aria-pressed', 'true');
            listBtn.setAttribute('aria-pressed', 'false');
            applyFilters();
        });

        listBtn.addEventListener('click', () => {
            state.view = 'list';
            localStorage.setItem('softhub-view', 'list');
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
            listBtn.setAttribute('aria-pressed', 'true');
            gridBtn.setAttribute('aria-pressed', 'false');
            applyFilters();
        });
    }

    function setupModal() {
        $('#modalClose').addEventListener('click', hideModal);
        $('#modalOverlay').addEventListener('click', hideModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('#downloadModal').style.display === 'flex') {
                hideModal();
            }
        });
    }

    function openMobileDrawer() {
        const drawer = $('#mobileDrawer');
        const overlay = $('#drawerOverlay');
        const toggle = $('#drawerToggle');

        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        overlay.classList.add('is-visible');
        toggle.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileDrawer() {
        const drawer = $('#mobileDrawer');
        const overlay = $('#drawerOverlay');
        const toggle = $('#drawerToggle');

        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('is-visible');
        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    function updateMobileNavActive() {
        $$('.mobile-nav-item').forEach(item => {
            if (item.dataset.scrollTo === 'about') {
                item.classList.toggle('active', aboutViewActive);
                return;
            }

            const platform = item.dataset.platform;
            const category = item.dataset.category;
            if (aboutViewActive) {
                item.classList.remove('active');
                return;
            }
            if (platform) {
                item.classList.toggle('active', state.platform === platform && state.category === 'all');
            } else if (category) {
                item.classList.toggle('active', state.category === category && state.platform === 'all');
            }
        });
    }

    function setupMobileDrawer() {
        const toggle = $('#drawerToggle');
        const closeBtn = $('#drawerClose');
        const overlay = $('#drawerOverlay');

        toggle.addEventListener('click', () => {
            if (toggle.classList.contains('is-open')) {
                closeMobileDrawer();
            } else {
                openMobileDrawer();
            }
        });

        closeBtn.addEventListener('click', closeMobileDrawer);
        overlay.addEventListener('click', closeMobileDrawer);

        $$('.mobile-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const platform = item.dataset.platform;
                const category = item.dataset.category;
                if (platform || category) {
                    if (detailAppId) hideAppDetail({ skipScroll: true });
                    if (category) selectStoreNav({ category });
                    else if (platform) selectStoreNav({ platform });
                    scrollMainToTop({ behavior: 'smooth' });
                }
                closeMobileDrawer();
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('#mobileDrawer').classList.contains('is-open')) {
                closeMobileDrawer();
            }
        });
    }

    function setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !isInputFocused()) {
                e.preventDefault();
                if (detailAppId) hideAppDetail({ skipScroll: true });
                const input = $('#searchInput');
                input.focus();
                input.select();
                scrollMainToTop({ behavior: 'smooth' });
                return;
            }

            if (e.key === 'Escape') {
                if ($('#downloadModal').style.display === 'flex') {
                    hideModal();
                    return;
                }
                if ($('#mobileDrawer').classList.contains('is-open')) {
                    closeMobileDrawer();
                    return;
                }
                if (detailAppId) {
                    hideAppDetail();
                }
            }
        });
    }

    function init() {
        parseUrlState();
        updateDynamicStats();
        applyStateToUI();
        initTheme();
        initViewPreference();
        initScrollEffects();
        animateCounters();
        initScrollReveal();
        setupFilters();
        setupSearch();
        setupViewToggle();
        setupModal();
        setupMobileDrawer();
        setupHashRouting();
        setupKeyboard();
        setupFeaturedNav();
        setupFeaturedAutoplay();
        applyFilters();
    }

    async function start() {
        const result = await loadAppsData();
        appsData = result.apps;
        syncMeta.syncedAt = result.syncedAt;
        init();

        const appId = parseAppHash();
        if (appId && appsData.some(a => a.id === appId)) {
            showAppDetail(appId, { skipHash: true });
        } else if (appId) {
            showToast('未找到该应用', 'error');
            setAppHash(null);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
