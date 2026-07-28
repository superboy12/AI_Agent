document.addEventListener('DOMContentLoaded', () => {
    // State
    let workspaces = [];
    let currentWorkspace = null;

    // Elements
    const themeToggle = document.getElementById('theme-toggle');
    const wsSelector = document.getElementById('workspace-selector');
    const wsDropdown = document.getElementById('workspace-dropdown');
    const wsDropdownList = document.getElementById('workspace-dropdown-list');
    const wsSearch = document.getElementById('workspace-search');
    const currentWsName = document.getElementById('current-workspace-name');
    const btnNewWs = document.getElementById('btn-new-workspace');
    const modalNewWs = document.getElementById('new-workspace-modal');
    const btnSaveWs = document.getElementById('btn-save-workspace');
    const closeModals = document.querySelectorAll('.close-modal');
    
    // Page Elements
    const pageTitle = document.getElementById('page-title');
    const statDocs = document.getElementById('stat-docs');
    const statTemplates = document.getElementById('stat-templates');
    const statMemory = document.getElementById('stat-memory');
    const wsDetailsCard = document.getElementById('workspace-details-card');
    const btnExportWs = document.getElementById('btn-export-workspace');
    const btnImportWs = document.getElementById('btn-import-workspace');
    const importFileInput = document.getElementById('import-file');

    // Theme Management
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    };

    const updateThemeIcon = (theme) => {
        themeToggle.innerHTML = theme === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    };

    themeToggle.addEventListener('click', toggleTheme);
    initTheme();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
            
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Modals
    const openModal = (modal) => modal.classList.add('active');
    const closeModal = (modal) => {
        modal.classList.remove('active');
        const form = modal.querySelector('form');
        if (form) form.reset();
    };

    btnNewWs.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(modalNewWs);
        wsSelector.blur(); // Close dropdown
    });

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal-overlay'));
        });
    });

    // API Calls
    const fetchWorkspaces = async () => {
        try {
            const res = await fetch('/api/workspaces');
            workspaces = await res.json();
            renderWorkspaceDropdown();
        } catch (error) {
            console.error('Error fetching workspaces:', error);
        }
    };

    const fetchStats = async () => {
        try {
            if (currentWorkspace) {
                const res = await fetch(`/api/workspaces/${currentWorkspace.id}/stats`);
                const stats = await res.json();
                statDocs.innerText = stats.documentCount || 0;
                statTemplates.innerText = stats.templateCount || 0;
                statMemory.innerText = stats.memoryCount || 0;
                pageTitle.innerText = `${currentWorkspace.name} Dashboard`;
                btnExportWs.style.display = 'inline-flex';
                renderWorkspaceDetails(currentWorkspace);
            } else {
                const res = await fetch('/api/workspaces/global-stats');
                const stats = await res.json();
                statDocs.innerText = stats.documentCount || 0;
                statTemplates.innerText = stats.templateCount || 0;
                statMemory.innerText = stats.memoryCount || 0;
                pageTitle.innerText = `Global Dashboard`;
                btnExportWs.style.display = 'none';
                wsDetailsCard.innerHTML = '<p class="empty-state">Select a workspace to view details or you are in Global space.</p>';
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const renderWorkspaceDetails = (ws) => {
        wsDetailsCard.innerHTML = `
            <div class="workspace-detail-header">
                <h3><i class="fa-solid fa-folder"></i> ${ws.name}</h3>
                <button class="btn-danger" id="btn-delete-ws"><i class="fa-solid fa-trash"></i> Delete Workspace</button>
            </div>
            <p class="workspace-desc">${ws.description || 'No description provided.'}</p>
            <div style="display:flex; gap: 10px; margin-top: 15px;">
                <button class="btn-secondary" id="btn-duplicate-ws"><i class="fa-solid fa-copy"></i> Duplicate</button>
            </div>
        `;

        document.getElementById('btn-delete-ws').addEventListener('click', async () => {
            if(confirm(`Are you sure you want to delete ${ws.name}? This will delete all its data.`)) {
                await fetch(`/api/workspaces/${ws.id}`, { method: 'DELETE' });
                selectWorkspace(null);
                fetchWorkspaces();
            }
        });

        document.getElementById('btn-duplicate-ws').addEventListener('click', async () => {
            const newName = prompt('Enter name for duplicate workspace:', `${ws.name} (Copy)`);
            if (newName) {
                await fetch(`/api/workspaces/${ws.id}/duplicate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newName })
                });
                fetchWorkspaces();
            }
        });
    };

    // Render Dropdown
    const renderWorkspaceDropdown = (filter = '') => {
        let html = `
            <div class="dropdown-item ${!currentWorkspace ? 'active' : ''}" data-id="global">
                <i class="fa-solid fa-globe"></i> Global Workspace
            </div>
        `;
        
        workspaces.filter(ws => ws.name.toLowerCase().includes(filter.toLowerCase())).forEach(ws => {
            const isActive = currentWorkspace && currentWorkspace.id === ws.id;
            html += `
                <div class="dropdown-item ${isActive ? 'active' : ''}" data-id="${ws.id}">
                    <i class="fa-solid fa-folder"></i> ${ws.name}
                </div>
            `;
        });
        
        wsDropdownList.innerHTML = html;

        // Add click events
        wsDropdownList.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                if (id === 'global') {
                    selectWorkspace(null);
                } else {
                    const ws = workspaces.find(w => w.id === id);
                    selectWorkspace(ws);
                }
                wsSelector.blur();
            });
        });
    };

    wsSearch.addEventListener('input', (e) => {
        renderWorkspaceDropdown(e.target.value);
    });

    const selectWorkspace = (ws) => {
        currentWorkspace = ws;
        if (ws) {
            currentWsName.innerText = ws.name;
        } else {
            currentWsName.innerText = 'Global Workspace';
        }
        localStorage.setItem('activeWorkspace', ws ? ws.id : 'global');
        fetchStats();
        renderWorkspaceDropdown();
    };

    // Create Workspace
    btnSaveWs.addEventListener('click', async () => {
        const name = document.getElementById('ws-name').value;
        const desc = document.getElementById('ws-desc').value;
        if (!name) return alert('Name is required');

        try {
            const res = await fetch('/api/workspaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc })
            });
            const newWs = await res.json();
            await fetchWorkspaces();
            selectWorkspace(newWs);
            closeModal(modalNewWs);
        } catch (error) {
            console.error(error);
            alert('Failed to create workspace');
        }
    });

    // Export/Import
    btnExportWs.addEventListener('click', () => {
        if (currentWorkspace) {
            window.location.href = `/api/workspaces/${currentWorkspace.id}/export`;
        }
    });

    btnImportWs.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch('/api/workspaces/import', {
                    method: 'POST',
                    body: formData
                });
                const newWs = await res.json();
                await fetchWorkspaces();
                selectWorkspace(newWs);
                importFileInput.value = ''; // reset
            } catch(err) {
                alert('Import failed');
            }
        }
    });

    // Init
    const init = async () => {
        await fetchWorkspaces();
        const savedId = localStorage.getItem('activeWorkspace');
        if (savedId && savedId !== 'global') {
            const ws = workspaces.find(w => w.id === savedId);
            selectWorkspace(ws || null);
        } else {
            selectWorkspace(null);
        }
    };

    // ─── Image Engine ──────────────────────────────────────────────────────────
    const initImageEngine = async () => {
        // Populate mode / layout / crop dropdowns from API
        try {
            const res  = await fetch('/api/image/modes');
            const data = await res.json();
            const modeSelect   = document.getElementById('ie-mode');
            const cropSelect   = document.getElementById('ie-crop');
            const layoutSelect = document.getElementById('ie-layout');

            modeSelect.innerHTML   = data.modes.map(m => `<option value="${m}">${m}</option>`).join('');
            cropSelect.innerHTML   = data.cropModes.map(m => `<option value="${m}">${m}</option>`).join('');
            layoutSelect.innerHTML = data.layoutTypes.filter(t => t !== 'single').map(m => `<option value="${m}">${m}</option>`).join('');
        } catch (e) { console.warn('IE: could not load modes', e); }

        // Tabs
        document.querySelectorAll('.ie-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.ie-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.ie-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`ie-tab-${tab.dataset.tab}`).classList.add('active');
            });
        });

        // Resize slider label
        const resizePct   = document.getElementById('ie-resize-pct');
        const resizeLabel = document.getElementById('ie-resize-pct-label');
        resizePct.addEventListener('input', () => resizeLabel.textContent = `${resizePct.value}%`);

        // Opacity slider label
        const opacitySlider = document.getElementById('ie-opacity');
        const opacityLabel  = document.getElementById('ie-opacity-label');
        opacitySlider.addEventListener('input', () => opacityLabel.textContent = `${opacitySlider.value}%`);

        // Toggle border / watermark sub-options
        document.getElementById('ie-border').addEventListener('change', (e) => {
            document.getElementById('ie-border-opts').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('ie-watermark').addEventListener('change', (e) => {
            document.getElementById('ie-watermark-opts').classList.toggle('hidden', !e.target.checked);
            if (e.target.checked) document.getElementById('ie-mode').value = 'watermark';
        });

        // ── Single image drag-and-drop ──────────────────────────────────────
        let singleFile = null;
        const dropSingle = document.getElementById('ie-drop-single');
        const fileSingle = document.getElementById('ie-file-single');

        dropSingle.addEventListener('click', () => fileSingle.click());
        fileSingle.addEventListener('change', () => {
            singleFile = fileSingle.files[0];
            if (singleFile) dropSingle.querySelector('p').textContent = `✅ ${singleFile.name}`;
        });
        ['dragover', 'dragleave', 'drop'].forEach(ev => {
            dropSingle.addEventListener(ev, (e) => {
                e.preventDefault();
                if (ev === 'dragover') dropSingle.classList.add('dragover');
                else dropSingle.classList.remove('dragover');
                if (ev === 'drop') {
                    singleFile = e.dataTransfer.files[0];
                    if (singleFile) dropSingle.querySelector('p').textContent = `✅ ${singleFile.name}`;
                }
            });
        });

        // ── Multi image drag-and-drop ───────────────────────────────────────
        let multiFiles = [];
        const dropMulti  = document.getElementById('ie-drop-multi');
        const fileMulti  = document.getElementById('ie-file-multi');
        const multiList  = document.getElementById('ie-multi-list');

        const updateMultiList = () => {
            multiList.innerHTML = multiFiles.map((f, i) =>
                `<div class="ie-multi-chip">${f.name} <span class="remove-chip" data-i="${i}">×</span></div>`
            ).join('');
            multiList.querySelectorAll('.remove-chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    multiFiles.splice(parseInt(btn.dataset.i), 1);
                    updateMultiList();
                });
            });
        };

        dropMulti.addEventListener('click', () => fileMulti.click());
        fileMulti.addEventListener('change', () => {
            multiFiles = [...multiFiles, ...Array.from(fileMulti.files)];
            updateMultiList();
        });
        ['dragover', 'dragleave', 'drop'].forEach(ev => {
            dropMulti.addEventListener(ev, (e) => {
                e.preventDefault();
                if (ev === 'dragover') dropMulti.classList.add('dragover');
                else dropMulti.classList.remove('dragover');
                if (ev === 'drop') {
                    multiFiles = [...multiFiles, ...Array.from(e.dataTransfer.files)];
                    updateMultiList();
                }
            });
        });

        // ── Preview helper ──────────────────────────────────────────────────
        let currentBase64 = null;
        const showPreview = (data) => {
            const canvas = document.getElementById('ie-preview-canvas');
            const meta   = document.getElementById('ie-meta');
            const dlBtn  = document.getElementById('btn-ie-download');

            currentBase64 = data.base64;
            canvas.innerHTML = `<img src="data:image/png;base64,${data.base64}" alt="Processed image">`;
            meta.innerHTML = `<span>📐 ${data.width} × ${data.height}px</span>${data.caption ? `<span>📝 ${data.caption}</span>` : ''}`;
            dlBtn.style.display = 'flex';
        };

        const showSpinner = () => {
            document.getElementById('ie-preview-canvas').innerHTML =
                `<div class="processing-spinner"><div class="spinner"></div><p>Processing…</p></div>`;
        };

        document.getElementById('btn-ie-download').addEventListener('click', () => {
            if (!currentBase64) return;
            const link = document.createElement('a');
            link.href     = `data:image/png;base64,${currentBase64}`;
            link.download = 'image-engine-output.png';
            link.click();
        });

        // ── Build options object ────────────────────────────────────────────
        const buildOptions = () => {
            const mode    = document.getElementById('ie-mode').value;
            const crop    = document.getElementById('ie-crop').value;
            const tw      = parseInt(document.getElementById('ie-tw').value) || undefined;
            const th      = parseInt(document.getElementById('ie-th').value) || undefined;
            const pct     = parseInt(resizePct.value);
            const border  = document.getElementById('ie-border').checked;
            const shadow  = document.getElementById('ie-shadow').checked;
            const caption = document.getElementById('ie-caption').checked;
            const wm      = document.getElementById('ie-watermark').checked;
            const margin  = parseInt(document.getElementById('ie-margin').value) || 0;

            const opts = { mode, cropMode: crop };
            if (tw) opts.targetWidth  = tw;
            if (th) opts.targetHeight = th;
            if (pct !== 100) opts.resize = { mode: 'percentage', percentage: pct };
            if (border) opts.border = { width: parseInt(document.getElementById('ie-border-w').value), color: document.getElementById('ie-border-color').value };
            if (shadow) opts.shadow = { offsetX: 4, offsetY: 4, blur: 4, color: '#000000', opacity: 0.4 };
            if (caption) opts.caption = true;
            if (wm) opts.opacity = parseInt(document.getElementById('ie-opacity').value) / 100;
            if (margin > 0) opts.margin = { top: margin, right: margin, bottom: margin, left: margin };
            return opts;
        };

        // ── Process single ──────────────────────────────────────────────────
        document.getElementById('btn-ie-process').addEventListener('click', async () => {
            if (!singleFile) { alert('Please select an image first.'); return; }
            showSpinner();
            try {
                const fd = new FormData();
                fd.append('image', singleFile);
                fd.append('options', JSON.stringify(buildOptions()));
                const res  = await fetch('/api/image/process', { method: 'POST', body: fd });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                showPreview(data.image);
            } catch (e) {
                document.getElementById('ie-preview-canvas').innerHTML =
                    `<div class="ie-placeholder"><i class="fa-solid fa-circle-exclamation"></i><p>${e.message}</p></div>`;
            }
        });

        // ── Create layout ───────────────────────────────────────────────────
        document.getElementById('btn-ie-layout').addEventListener('click', async () => {
            if (multiFiles.length === 0) { alert('Please select at least one image.'); return; }
            showSpinner();
            try {
                const fd = new FormData();
                multiFiles.forEach(f => fd.append('images', f));
                const config = {
                    type:        document.getElementById('ie-layout').value,
                    gutter:      parseInt(document.getElementById('ie-gutter').value) || 10,
                    targetWidth: parseInt(document.getElementById('ie-layout-w').value) || 600,
                };
                fd.append('config', JSON.stringify(config));
                const res  = await fetch('/api/image/layout', { method: 'POST', body: fd });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                showPreview(data.image);
            } catch (e) {
                document.getElementById('ie-preview-canvas').innerHTML =
                    `<div class="ie-placeholder"><i class="fa-solid fa-circle-exclamation"></i><p>${e.message}</p></div>`;
            }
        });
    };

    // Trigger IE init when nav is clicked for image-view
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-target') === 'image-view') {
            item.addEventListener('click', initImageEngine, { once: true });
        }
    });

    init();
});
