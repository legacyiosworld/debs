const ARCHIVE_ITEM_IDS = [
    'zephyr_1.6.4-1_iphoneos-arm_202607'
]; 

const ITEMS_PER_PAGE = 8; 

let allFiles = [];
let currentPage = 1;

function switchTab(tabName, pushState = true) {
    document.querySelectorAll('.ios-container').forEach(sec => sec.classList.remove('active'));
    
    const targetSection = document.getElementById(`tab-${tabName}`);
    if (targetSection) targetSection.classList.add('active');

    const backBtn = document.getElementById('nav-back-btn');
    const navTitle = document.getElementById('nav-title');

    if (tabName === 'files') {
        backBtn.style.display = 'block';
        navTitle.textContent = 'Твики';
        if (allFiles.length === 0) {
            fetchArchiveData();
        }
        if (pushState) history.pushState({ tab: 'files' }, '', '#files');
    } else {
        backBtn.style.display = 'none';
        navTitle.textContent = 'Legacy Tweaks';
        if (pushState) history.pushState({ tab: 'main' }, '', '#main');
    }
}

async function fetchArchiveData() {
    const errorMsg = document.getElementById('error-msg');
    const filesWrapper = document.getElementById('files-wrapper');

    if (!ARCHIVE_ITEM_IDS || ARCHIVE_ITEM_IDS.length === 0) {
        errorMsg.textContent = 'Укажите ID коллекций в ARCHIVE_ITEM_IDS';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        allFiles = [];

        for (const itemId of ARCHIVE_ITEM_IDS) {
            const cleanId = itemId.trim();
            if (!cleanId) continue;

            const response = await fetch(`https://archive.org/metadata/${cleanId}`);
            if (!response.ok) continue;
            
            const data = await response.json();
            if (!data.files || data.files.length === 0) continue;

            const server = data.server;
            const dir = data.dir;

            const parsedFiles = data.files.filter(file => {
                const name = file.name.toLowerCase();
                return !name.endsWith('_meta.xml') && 
                       !name.endsWith('_files.xml') && 
                       !name.endsWith('_meta.sqlite') &&
                       !name.endsWith('.torrent');
            }).map(file => {
                const title = file.title ? file.title : file.name;
                const meta = file.description ? `${file.description} • ${formatBytes(file.size)}` : formatBytes(file.size);

                return {
                    name: title,
                    size: meta,
                    url: `https://${server}${dir}/${file.name}`
                };
            });

            allFiles = allFiles.concat(parsedFiles);
        }
        
        if (allFiles.length === 0) {
            errorMsg.textContent = 'Каталог пуст';
            errorMsg.style.display = 'block';
        } else {
            filesWrapper.style.display = 'block';
            renderPage(1);
        }

    } catch (error) {
        errorMsg.textContent = `Ошибка: ${error.message}`;
        errorMsg.style.display = 'block';
    }
}

function renderPage(page) {
    currentPage = page;
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageFiles = allFiles.slice(startIndex, endIndex);

    const listContainer = document.getElementById('files-list');
    listContainer.innerHTML = '';

    pageFiles.forEach(file => {
        const itemHtml = `
            <li class="ios-table-cell">
                <div class="file-info-block">
                    <span class="file-name">${file.name}</span>
                    <span class="file-meta">${file.size}</span>
                </div>
                <a href="${file.url}" target="_blank" class="ios-download-btn">Скачать</a>
            </li>
        `;
        listContainer.insertAdjacentHTML('beforeend', itemHtml);
    });

    renderPagination();
}

function renderPagination() {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    const totalPages = Math.ceil(allFiles.length / ITEMS_PER_PAGE);
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'ios-page-btn';
    prevBtn.textContent = '«';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => renderPage(currentPage - 1);
    paginationContainer.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `ios-page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => renderPage(i);
        paginationContainer.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'ios-page-btn';
    nextBtn.textContent = '»';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => renderPage(currentPage + 1);
    paginationContainer.appendChild(nextBtn);
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes == 0) return '0 Б';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function goBack() {
    history.back();
}

window.addEventListener('popstate', function(event) {
    if (event.state && event.state.tab) {
        switchTab(event.state.tab, false);
    } else {
        switchTab('main', false);
    }
});
