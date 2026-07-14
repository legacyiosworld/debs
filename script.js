
const ARCHIVE_ITEM_ID = 'org.tihmstar.kDFUApp';

const ITEMS_PER_PAGE = 8;

const CACHE_TTL_MS = 5 * 60 * 1000;

const CACHE_KEY = 'lt_files_cache_v1';
const KEYS_STORAGE_KEY = 'lt_ias3_keys_v1';

const Router = {
    parse() {
        
        const raw = location.hash.replace(/^#\/?/, '');
        const [tab, queryString] = raw.split('?');
        const params = new URLSearchParams(queryString || '');
        return {
            tab: tab || 'main',
            q: params.get('q') || '',
            page: parseInt(params.get('page') || '1', 10) || 1,
            sort: params.get('sort') || 'name'
        };
    },

    build(state) {
        const params = new URLSearchParams();
        if (state.q) params.set('q', state.q);
        if (state.page && state.page !== 1) params.set('page', state.page);
        if (state.sort && state.sort !== 'name') params.set('sort', state.sort);
        const qs = params.toString();
        return `#/${state.tab}${qs ? '?' + qs : ''}`;
    },

    go(tab, patch) {
        const current = this.parse();
        const next = Object.assign({}, current, { tab }, tab !== current.tab ? { page: 1 } : {}, patch || {});
        location.hash = this.build(next);
    },

    update(patch) {
        const current = this.parse();
        const next = Object.assign({}, current, patch);
        // replaceState чтобы не засорять историю при каждой букве поиска
        history.replaceState(null, '', this.build(next));
        App.render();
    },

    render() {
        App.render();
    }
};

window.addEventListener('hashchange', () => App.render());

const Data = {
    allFiles: [],
    lastSync: null,
    loading: false,

    readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed.itemId !== ARCHIVE_ITEM_ID) return null;
            return parsed;
        } catch (e) {
            return null;
        }
    },

    writeCache(files) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                itemId: ARCHIVE_ITEM_ID,
                ts: Date.now(),
                files
            }));
        } catch (e) { /* localStorage может быть недоступен — не критично */ }
    },

    isCacheFresh(cache) {
        return cache && (Date.now() - cache.ts) < CACHE_TTL_MS;
    },

    async fetchArchiveData(force = false) {
        if (this.loading) return;

        if (ARCHIVE_ITEM_ID === 'ваша_коллекция_или_айди') {
            UI.showFilesError('Укажите ARCHIVE_ITEM_ID в script.js');
            return;
        }

        const cache = this.readCache();
        if (!force && this.isCacheFresh(cache)) {
            this.allFiles = cache.files;
            this.lastSync = cache.ts;
            UI.renderFilesList();
            return;
        }

        if (cache) {
            this.allFiles = cache.files;
            this.lastSync = cache.ts;
            UI.renderFilesList();
        }

        this.loading = true;
        UI.setSyncing(true);
        if (!cache) UI.showFilesLoader();

        try {
            const response = await fetch(`https://archive.org/metadata/${ARCHIVE_ITEM_ID}`);
            if (!response.ok) throw new Error('Ошибка сети (' + response.status + ')');

            const data = await response.json();
            if (!data.files || data.files.length === 0) {
                throw new Error('В коллекции нет файлов');
            }

            const server = data.server;
            const dir = data.dir;

            const files = data.files.filter(file => {
                const name = file.name.toLowerCase();
                return !name.endsWith('_meta.xml') &&
                       !name.endsWith('_files.xml') &&
                       !name.endsWith('_meta.sqlite') &&
                       !name.endsWith('_archive.torrent') &&
                       !name.endsWith('.torrent');
            }).map(file => ({
                name: file.name,
                sizeBytes: parseInt(file.size || '0', 10),
                mtime: parseInt(file.mtime || '0', 10),
                url: `https://${server}${dir}/${encodeURIComponent(file.name)}`
            }));

            if (files.length === 0) throw new Error('Папка пуста');

            this.allFiles = files;
            this.lastSync = Date.now();
            this.writeCache(files);
            UI.renderFilesList();
            UI.updateMainBadge(files.length);
            UI.clearFilesError();

        } catch (error) {
            if (!cache) {
                UI.showFilesError('Ошибка: ' + error.message);
            } else {
                UI.showToast('Не удалось обновить список: ' + error.message);
            }
        } finally {
            this.loading = false;
            UI.setSyncing(false);
        }
    }
};

const Search = {
    debounceTimer: null,

    onInput(value) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            Router.update({ q: value, page: 1 });
        }, 200);
    },

    clear() {
        const input = document.getElementById('search-input');
        input.value = '';
        Router.update({ q: '', page: 1 });
        input.focus();
    }
};

function getVisibleFiles(state) {
    let files = Data.allFiles.slice();

    if (state.q) {
        const needle = state.q.toLowerCase();
        files = files.filter(f => f.name.toLowerCase().includes(needle));
    }

    files.sort((a, b) => {
        if (state.sort === 'size') return b.sizeBytes - a.sizeBytes;
        if (state.sort === 'date') return b.mtime - a.mtime;
        return a.name.localeCompare(b.name, 'ru');
    });

    return files;
}

const ICON_COLORS = {
    deb:  ['#8fa8ea', '#4a63c9'],
    dylib:['#8fa8ea', '#4a63c9'],
    zip:  ['#f0c674', '#c9922f'],
    rar:  ['#f0c674', '#c9922f'],
    '7z': ['#f0c674', '#c9922f'],
    ipa:  ['#8fd48f', '#3f9c47'],
    dmg:  ['#c2c2c2', '#7a7a7a'],
    plist:['#e79a9a', '#c14b4b'],
    txt:  ['#dedede', '#9a9a9a'],
    xml:  ['#dedede', '#9a9a9a'],
    png:  ['#c7a8ec', '#8a5fc9'],
    jpg:  ['#c7a8ec', '#8a5fc9'],
    default: ['#a9b7c6', '#5f7590']
};

function iconForFile(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const colors = ICON_COLORS[ext] || ICON_COLORS.default;
    const label = ext.length > 4 ? ext.slice(0, 4) : (ext || 'FILE');
    return `<span class="file-type-icon" style="background:linear-gradient(to bottom, ${colors[0]}, ${colors[1]})">${label.toUpperCase()}</span>`;
}

const UI = {
    showFilesLoader() {
        document.getElementById('loader').style.display = 'block';
        document.getElementById('error-msg').style.display = 'none';
        document.getElementById('files-wrapper').style.display = 'none';
    },

    showFilesError(msg) {
        document.getElementById('loader').style.display = 'none';
        document.getElementById('files-wrapper').style.display = 'none';
        const el = document.getElementById('error-msg');
        el.textContent = msg;
        el.style.display = 'block';
    },

    clearFilesError() {
        document.getElementById('error-msg').style.display = 'none';
    },

    setSyncing(isSyncing) {
        const btn = document.getElementById('nav-refresh-btn');
        if (isSyncing) {
            btn.classList.add('spinning');
            btn.textContent = 'Синхр...';
        } else {
            btn.classList.remove('spinning');
            btn.textContent = 'Обновить';
        }
    },

    showToast(msg) {
        const el = document.getElementById('cache-status-text');
        if (el) el.textContent = msg;
    },

    updateMainBadge(count) {
        const badge = document.getElementById('main-files-badge');
        if (badge) badge.textContent = count;
    },

    renderFilesList() {
        const state = Router.parse();
        document.getElementById('loader').style.display = 'none';
        document.getElementById('files-wrapper').style.display = 'block';

        const visible = getVisibleFiles(state);
        const totalPages = Math.max(1, Math.ceil(visible.length / ITEMS_PER_PAGE));
        const page = Math.min(Math.max(1, state.page), totalPages);

        document.getElementById('files-count-title').textContent =
            state.q ? `Найдено: ${visible.length}` : `Доступные загрузки (${visible.length})`;

        const emptyEl = document.getElementById('empty-search');
        const listEl = document.getElementById('files-list');

        if (visible.length === 0) {
            emptyEl.style.display = 'block';
            listEl.innerHTML = '';
            document.getElementById('pagination').innerHTML = '';
        } else {
            emptyEl.style.display = 'none';
            const start = (page - 1) * ITEMS_PER_PAGE;
            const pageFiles = visible.slice(start, start + ITEMS_PER_PAGE);

            listEl.innerHTML = pageFiles.map(file => `
                <li class="ios-table-cell static">
                    ${iconForFile(file.name)}
                    <div class="file-info-block">
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-meta">${formatBytes(file.sizeBytes)}${file.mtime ? ' · ' + formatDate(file.mtime) : ''}</span>
                    </div>
                    <a href="${file.url}" download="${escapeHtml(file.name)}" class="ios-download-btn">Скачать</a>
                </li>
            `).join('');

            this.renderPagination(page, totalPages);
        }

        const searchInput = document.getElementById('search-input');
        if (searchInput.value !== state.q) searchInput.value = state.q;
        document.getElementById('search-clear').style.display = state.q ? 'block' : 'none';

        UI.syncSortButtons(state);

        if (Data.lastSync) {
            document.getElementById('cache-status-text').textContent =
                'Обновлено: ' + formatTime(Data.lastSync);
        }
    },

    syncSortButtons(state) {
        document.querySelectorAll('.ios-seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === state.sort);
        });
    },

    renderPagination(page, totalPages) {
        const container = document.getElementById('pagination');
        container.innerHTML = '';
        if (totalPages <= 1) return;

        const makeBtn = (label, targetPage, disabled, active) => {
            const btn = document.createElement('button');
            btn.className = 'ios-page-btn' + (active ? ' active' : '');
            btn.textContent = label;
            btn.disabled = disabled;
            btn.onclick = () => Router.update({ page: targetPage });
            return btn;
        };

        container.appendChild(makeBtn('«', page - 1, page === 1, false));

        const windowSize = 5;
        let startPage = Math.max(1, page - Math.floor(windowSize / 2));
        let endPage = Math.min(totalPages, startPage + windowSize - 1);
        startPage = Math.max(1, endPage - windowSize + 1);

        for (let i = startPage; i <= endPage; i++) {
            container.appendChild(makeBtn(String(i), i, false, i === page));
        }

        container.appendChild(makeBtn('»', page + 1, page === totalPages, false));
    }
};

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function formatDate(unixSeconds) {
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleDateString('ru-RU');
}

function formatTime(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

const Uploader = {
    queue: [],

    addFiles(fileList) {
        Array.from(fileList).forEach(file => {
            this.queue.push({ file, status: 'pending', progress: 0, error: null, id: cryptoId() });
        });
        this.render();
    },

    remove(id) {
        this.queue = this.queue.filter(item => item.id !== id);
        this.render();
    },

    render() {
        const listEl = document.getElementById('upload-queue');
        const actionsEl = document.getElementById('upload-actions');

        if (this.queue.length === 0) {
            listEl.innerHTML = '';
            actionsEl.style.display = 'none';
            return;
        }

        actionsEl.style.display = 'block';
        listEl.innerHTML = this.queue.map(item => `
            <li class="upload-item ios-table-cell">
                <div class="upload-item-row">
                    ${iconForFile(item.file.name)}
                    <span class="upload-item-name">${escapeHtml(item.file.name)} (${formatBytes(item.file.size)})</span>
                    ${item.status === 'pending' ? `<span class="upload-item-remove" onclick="Uploader.remove('${item.id}')">Удалить</span>` : ''}
                </div>
                ${item.status !== 'pending' ? `
                    <div class="ios-progress-track">
                        <div class="ios-progress-fill" style="width:${item.progress}%"></div>
                    </div>
                    <div class="upload-item-status ${item.status === 'done' ? 'ok' : item.status === 'error' ? 'fail' : ''}">
                        ${item.status === 'uploading' ? 'Загрузка... ' + item.progress + '%' : ''}
                        ${item.status === 'done' ? 'Готово ✓' : ''}
                        ${item.status === 'error' ? 'Ошибка: ' + escapeHtml(item.error || '') : ''}
                    </div>
                ` : ''}
            </li>
        `).join('');

        const btn = document.getElementById('start-upload-btn');
        const anyPending = this.queue.some(i => i.status === 'pending');
        const anyUploading = this.queue.some(i => i.status === 'uploading');
        btn.disabled = !anyPending || anyUploading;
        btn.textContent = anyUploading ? 'Идёт загрузка...' : 'Начать загрузку';
    },

    getKeys() {
        const access = document.getElementById('ias3-access').value.trim();
        const secret = document.getElementById('ias3-secret').value.trim();
        return { access, secret };
    },

    async start() {
        const errorEl = document.getElementById('upload-error');
        errorEl.style.display = 'none';

        if (ARCHIVE_ITEM_ID === 'ваша_коллекция_или_айди') {
            errorEl.textContent = 'Укажите ARCHIVE_ITEM_ID в script.js перед загрузкой';
            errorEl.style.display = 'block';
            return;
        }

        const { access, secret } = this.getKeys();
        if (!access || !secret) {
            errorEl.textContent = 'Введите Access Key и Secret Key (archive.org/account/s3.php)';
            errorEl.style.display = 'block';
            return;
        }

        const pending = this.queue.filter(i => i.status === 'pending');
        for (const item of pending) {
            item.status = 'uploading';
            this.render();
            try {
                await this.uploadOne(item, access, secret);
                item.status = 'done';
                item.progress = 100;
            } catch (err) {
                item.status = 'error';
                item.error = err.message || 'неизвестная ошибка';
            }
            this.render();
        }

        if (this.queue.some(i => i.status === 'done')) {
            Data.fetchArchiveData(true);
        }
    },

    uploadOne(item, access, secret) {
        return new Promise((resolve, reject) => {
            const url = `https://s3.us.archive.org/${encodeURIComponent(ARCHIVE_ITEM_ID)}/${encodeURIComponent(item.file.name)}`;
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url, true);
            xhr.setRequestHeader('Authorization', `LOW ${access}:${secret}`);
            xhr.setRequestHeader('x-archive-keep-old-version', '1');

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    item.progress = Math.round((e.loaded / e.total) * 100);
                    this.render();
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('сетевая ошибка / CORS'));

            xhr.send(item.file);
        });
    }
};

function cryptoId() {
    return 'u' + Math.random().toString(36).slice(2, 10);
}


const KeyStore = {
    load() {
        try {
            const raw = localStorage.getItem(KEYS_STORAGE_KEY);
            if (!raw) return;
            const { access, secret } = JSON.parse(raw);
            document.getElementById('ias3-access').value = access || '';
            document.getElementById('ias3-secret').value = secret || '';
            document.getElementById('remember-keys').checked = true;
        } catch (e) { /* ignore */ }
    },

    save() {
        const access = document.getElementById('ias3-access').value.trim();
        const secret = document.getElementById('ias3-secret').value.trim();
        localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify({ access, secret }));
    },

    clear() {
        localStorage.removeItem(KEYS_STORAGE_KEY);
    }
};


const TAB_TITLES = {
    main: 'Legacy Tweaks',
    files: 'Твики',
    upload: 'Загрузка'
};

const App = {
    render() {
        const state = Router.parse();
        const tab = TAB_TITLES[state.tab] ? state.tab : 'main';

        document.querySelectorAll('.ios-container').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');

        document.getElementById('nav-title').textContent = TAB_TITLES[tab];
        document.getElementById('nav-back-btn').style.display = tab === 'main' ? 'none' : 'block';
        document.getElementById('nav-refresh-btn').style.display = tab === 'files' ? 'block' : 'none';

        if (tab === 'files') {

            UI.syncSortButtons(state);

            if (Data.allFiles.length === 0) {
                Data.fetchArchiveData();
            } else {
                UI.renderFilesList();
            }
        }
    },

    forceRefresh() {
        Data.fetchArchiveData(true);
    },

    init() {

        if (ARCHIVE_ITEM_ID !== 'ваша_коллекция_или_айди') {
            document.querySelector('#archive-item-link a').href = `https://archive.org/details/${ARCHIVE_ITEM_ID}`;
        }

        // поиск
        document.getElementById('search-input').addEventListener('input', (e) => Search.onInput(e.target.value));

        // сортировка
        document.querySelectorAll('.ios-seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ios-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
                Router.update({ sort: btn.dataset.sort, page: 1 });
            });
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            Uploader.addFiles(e.target.files);
            e.target.value = '';
        });

        // запоминание ключей
        document.getElementById('remember-keys').addEventListener('change', (e) => {
            if (e.target.checked) KeyStore.save(); else KeyStore.clear();
        });
        ['ias3-access', 'ias3-secret'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                if (document.getElementById('remember-keys').checked) KeyStore.save();
            });
        });
        KeyStore.load();

        const cache = Data.readCache();
        if (cache) {
            Data.allFiles = cache.files;
            Data.lastSync = cache.ts;
            UI.updateMainBadge(cache.files.length);
        }

        this.render();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
