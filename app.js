const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1Zb8Ljbb9fB7BFQpC85FOPQ0QtJARSNt2y8hpbTlV4yrKJFmbuNEBVeThbS-JMSCkTIID2Qe6Kc6J/pub?gid=973871607&single=true&output=csv';
const POLL_INTERVAL = 5000;

const CORES = {
  azul: '#003366',
  laranja: '#D76F00',
  teal: '#00737a',
  vermelho: '#cc3121'
};

const PALETA_PIE = [
  '#003366', '#D76F00', '#00737a', '#cc3121', '#1a4a6e',
  '#0097a7', '#ff8f00', '#e53935', '#546e7a', '#2e7d32',
  '#6a1b9a', '#00838f', '#f57c00', '#5d4037', '#00acc1'
];

const FILTER_CONFIGS = [
  { key: 'status',   label: 'Status' },
  { key: 'turma',    label: 'Turma' },
  { key: 'municipio',label: 'Município' },
  { key: 'regiao',   label: 'Região de Saúde' },
  { key: 'formacao', label: 'Nível de Formação' },
  { key: 'cargo',    label: 'Cargo/Função' },
  { key: 'vinculo',  label: 'Vínculo Profissional' },
  { key: 'raca',     label: 'Raça/Etnia' },
  { key: 'genero',   label: 'Gênero' },
  { key: 'pcd',      label: 'PCD' }
];

let rawData = [];
let filteredData = [];
let charts = {};
let dataHash = '';
let isRefreshing = false;
let currentPage = 1;
const PAGE_SIZE = 10;

function uniqueSorted(arr) {
  return [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function countBy(arr, key) {
  const map = {};
  arr.forEach(row => {
    const val = (row[key] || 'NÃO INFORMADO').trim();
    map[val] = (map[val] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function renderCards(data) {
  document.getElementById('totalCount').textContent = data.length;
  document.getElementById('inscritosCount').textContent = data.filter(d => d.status === 'INSCRITO').length;
  document.getElementById('desistentesCount').textContent = data.filter(d => d.status === 'DESISTENTE').length;
  document.getElementById('municipiosCount').textContent = new Set(data.map(d => d.municipio)).size;
}

function createChart(id, type, labels, data, label, colors) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }

  const isBar = type === 'bar';
  const datasets = isBar
    ? [{
        label,
        data,
        backgroundColor: colors || CORES.azul,
        borderRadius: 4,
        borderSkipped: false
      }]
    : [{
        data,
        backgroundColor: colors || PALETA_PIE,
        borderWidth: 2,
        borderColor: '#fff'
      }];

  const isMobile = window.innerWidth < 768;

  charts[id] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: isBar ? { display: false } : {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            boxWidth: isMobile ? 10 : 14,
            padding: isMobile ? 8 : 12,
            font: { family: 'Open Sans', size: isMobile ? 9 : 11 },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: '#003366',
          titleFont: { family: 'Open Sans', size: 12 },
          bodyFont: { family: 'Open Sans', size: 11 },
          callbacks: isBar ? undefined : {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      },
      scales: isBar ? {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { family: 'Open Sans', size: isMobile ? 9 : 11 } },
          grid: { color: '#ede8e0' }
        },
        x: {
          ticks: { autoSkip: false, maxRotation: isMobile ? 60 : 45, font: { family: 'Open Sans', size: isMobile ? 8 : 10 } },
          grid: { display: false }
        }
      } : undefined
    }
  });
}

function renderCharts(data) {
  createChart('chartStatus', 'doughnut',
    ['INSCRITO', 'DESISTENTE'],
    [
      data.filter(d => d.status === 'INSCRITO').length,
      data.filter(d => d.status === 'DESISTENTE').length
    ],
    null,
    [CORES.teal, CORES.vermelho]
  );

  const raca = countBy(data, 'raca');
  createChart('chartRaca', 'pie', raca.map(r => r[0]), raca.map(r => r[1]));

  const genero = countBy(data, 'genero');
  createChart('chartGenero', 'doughnut', genero.map(g => g[0]), genero.map(g => g[1]));

  const formacao = countBy(data, 'formacao');
  createChart('chartFormacao', 'bar', formacao.map(f => f[0]), formacao.map(f => f[1]), 'Profissionais', CORES.laranja);

  const municipios = countBy(data, 'municipio');
  createChart('chartMunicipios', 'bar', municipios.slice(0, 15).map(m => m[0]), municipios.slice(0, 15).map(m => m[1]), 'Profissionais');

  const vinculo = countBy(data, 'vinculo');
  createChart('chartVinculo', 'pie', vinculo.map(v => v[0]), vinculo.map(v => v[1]));

  const pcd = countBy(data, 'pcd');
  createChart('chartPcd', 'doughnut', pcd.map(p => p[0]), pcd.map(p => p[1]));

  const regiao = countBy(data, 'regiao');
  createChart('chartRegiao', 'bar', regiao.map(r => r[0]), regiao.map(r => r[1]), 'Profissionais', CORES.teal);
}

function renderTable(data) {
  const tbody = document.getElementById('tableBody');
  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  document.getElementById('rowCount').textContent = `${total} registro${total !== 1 ? 's' : ''}`;

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="10" data-label="Resultado" style="text-align:center;padding:2rem;color:#999;">Nenhum registro encontrado</td></tr>';
    renderPagination(0, 1);
    return;
  }

  tbody.innerHTML = pageData.map(row => `
    <tr>
      <td data-label="N">${row.numero}</td>
      <td data-label="Nome"><strong>${escapeHtml(row.nome)}</strong></td>
      <td data-label="Status"><span class="status-${row.status.toLowerCase()}">${row.status}</span></td>
      <td data-label="Turma">${escapeHtml(row.turma)}</td>
      <td data-label="Município">${escapeHtml(row.municipio)}</td>
      <td data-label="Região">${escapeHtml(row.regiao)}</td>
      <td data-label="Cargo/Função">${escapeHtml(row.cargo)}</td>
      <td data-label="Raça/Etnia">${escapeHtml(row.raca)}</td>
      <td data-label="Gênero">${escapeHtml(row.genero)}</td>
      <td data-label="Formação">${escapeHtml(row.formacao)}</td>
    </tr>
  `).join('');

  renderPagination(total, totalPages);
}

function renderPagination(total, totalPages) {
  const container = document.getElementById('pagination');
  if (!container) return;
  if (total === 0) { container.innerHTML = ''; return; }

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);

  let html = `<span class="pagination-info">${start}–${end} de ${total}</span><div class="pagination-buttons">`;

  html += `<button class="page-btn" onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''}>«</button>`;
  html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  const isSmall = window.innerWidth < 480;
  const range = isSmall ? 1 : 2;
  const maxVisible = isSmall ? 3 : 5;

  let from = Math.max(1, currentPage - range);
  let to = Math.min(totalPages, currentPage + range);

  if (currentPage <= range + 1) to = Math.min(maxVisible, totalPages);
  if (currentPage > totalPages - range - 1) from = Math.max(1, totalPages - maxVisible + 1);

  for (let i = from; i <= to; i++) {
    html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
  html += `<button class="page-btn" onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>»</button>`;

  html += '</div>';
  container.innerHTML = html;
}

function goToPage(page) {
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable(filteredData);
}

function updateTime() {
  document.getElementById('updateTime').textContent = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
}

function setIndicator(state) {
  const el = document.getElementById('updateIndicator');
  el.className = 'update-indicator' + (state ? ' ' + state : '');
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h + ':' + str.length;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function toggleDropdown(el) {
  el.classList.toggle('open');
  el.querySelector('.ms-search-input')?.focus();
}

function closeAllDropdowns() {
  document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
}

function updateMsTrigger(multiSelect) {
  const checked = multiSelect.querySelectorAll('.ms-option input[type="checkbox"]:checked');
  const trigger = multiSelect.querySelector('.ms-trigger');
  const label = trigger.querySelector('.ms-label');
  const count = trigger.querySelector('.ms-count');

  const values = [];
  checked.forEach(cb => {
    if (cb.value !== '__all__') values.push(cb.value);
  });

  if (values.length === 0) {
    label.textContent = 'Todos';
    count.textContent = '';
    count.style.display = 'none';
    trigger.classList.remove('has-value');
  } else {
    label.textContent = values.join(', ');
    count.textContent = values.length;
    count.style.display = '';
    trigger.classList.add('has-value');
  }
}

function buildMultiSelect(key, label, options) {
  const group = document.createElement('div');
  group.className = 'filter-group';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  group.appendChild(lbl);

  const ms = document.createElement('div');
  ms.className = 'multi-select';
  ms.dataset.filterKey = key;

  const trigger = document.createElement('button');
  trigger.className = 'ms-trigger';
  trigger.type = 'button';
  trigger.innerHTML = '<span class="ms-label">Todos</span><span class="ms-count" style="display:none"></span><span class="ms-arrow">▼</span>';
  ms.appendChild(trigger);

  const dropdown = document.createElement('div');
  dropdown.className = 'ms-dropdown';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'ms-search';
  const searchInput = document.createElement('input');
  searchInput.className = 'ms-search-input';
  searchInput.type = 'text';
  searchInput.placeholder = 'Buscar...';
  searchWrap.appendChild(searchInput);
  dropdown.appendChild(searchWrap);

  const allOpt = document.createElement('label');
  allOpt.className = 'ms-option all-option';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox';
  allCb.value = '__all__';
  allOpt.appendChild(allCb);
  allOpt.appendChild(document.createTextNode(' Selecionar todos'));
  dropdown.appendChild(allOpt);

  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'ms-options';

  options.forEach(val => {
    const opt = document.createElement('label');
    opt.className = 'ms-option';
    opt.dataset.value = val;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    opt.appendChild(cb);
    opt.appendChild(document.createTextNode(' ' + val));
    optionsContainer.appendChild(opt);
  });

  dropdown.appendChild(optionsContainer);
  ms.appendChild(dropdown);
  group.appendChild(ms);

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    toggleDropdown(ms);
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    optionsContainer.querySelectorAll('.ms-option:not(.all-option)').forEach(opt => {
      const text = opt.dataset.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      opt.style.display = text.includes(q) ? '' : 'none';
    });
  });

  allCb.addEventListener('change', () => {
    const checkAll = allCb.checked;
    optionsContainer.querySelectorAll('.ms-option').forEach(opt => {
      const cb = opt.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = checkAll;
    });
    updateMsTrigger(ms);
    filterData();
  });

  optionsContainer.addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
      const allChecked = optionsContainer.querySelectorAll('.ms-option input[type="checkbox"]:checked').length === options.length;
      allCb.checked = allChecked;
      updateMsTrigger(ms);
      filterData();
    }
  });

  return group;
}

function getFilterValues() {
  const values = {};
  document.querySelectorAll('.multi-select').forEach(ms => {
    const key = ms.dataset.filterKey;
    const checked = ms.querySelectorAll('.ms-option input[type="checkbox"]:checked');
    values[key] = [];
    checked.forEach(cb => {
      if (cb.value !== '__all__') values[key].push(cb.value);
    });
  });
  const search = document.getElementById('searchInput');
  values.search = search ? search.value : '';
  return values;
}

function anyFilterActive(filters) {
  for (const key in filters) {
    if (key === 'search') continue;
    if (Array.isArray(filters[key]) && filters[key].length > 0) return true;
  }
  return !!(filters.search || '').trim();
}

function filterData() {
  const filters = getFilterValues();
  const section = document.getElementById('filterSection');
  section.classList.toggle('active', anyFilterActive(filters));

  const search = (filters.search || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  filteredData = rawData.filter(row => {
    for (const key of Object.keys(filters)) {
      if (key === 'search') continue;
      const selected = filters[key];
      if (selected && selected.length > 0 && !selected.includes(row[key])) {
        return false;
      }
    }
    if (!search) return true;
    const searchable = `${row.nome} ${row.municipio} ${row.cargo} ${row.regiao} ${row.raca} ${row.servico} ${row.turma}`
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return searchable.includes(search);
  });

  currentPage = 1;
  renderCards(filteredData);
  renderCharts(filteredData);
  renderTable(filteredData);
}

function clearFilters() {
  document.querySelectorAll('.multi-select input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('.multi-select .ms-option.all-option input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('.multi-select').forEach(ms => updateMsTrigger(ms));
  document.getElementById('searchInput').value = '';
  filterData();
}

function normalizeData(rows) {
  return rows.map(row => ({
    numero: row[0],
    nome: (row[1] || '').trim(),
    cpf: row[2] || '',
    inscricao: row[3] || '',
    status: (row[4] || '').trim(),
    servico: (row[5] || '').trim(),
    turma: (row[6] || '').trim(),
    municipio: (row[7] || '').trim().replace(/, Alagoas$/, ''),
    regiao: (row[8] || '').trim(),
    formacao: (row[9] || '').trim(),
    cargo: (row[10] || '').trim(),
    cbo: (row[11] || '').trim(),
    vinculo: (row[12] || '').trim(),
    raca: (row[13] || '').trim() || 'NÃO INFORMADO',
    genero: (row[14] || '').trim() || 'NÃO INFORMADO',
    pcd: (row[15] || '').trim() || 'NÃO INFORMADO',
    telefone: row[16] || '',
    email: row[17] || ''
  }));
}

function buildFilters() {
  const grid = document.getElementById('filterGrid');
  grid.innerHTML = '';

  FILTER_CONFIGS.forEach(cfg => {
    const options = uniqueSorted(rawData.map(d => d[cfg.key]));
    if (options.length === 0) return;
    const ms = buildMultiSelect(cfg.key, cfg.label, options);
    grid.appendChild(ms);
  });

  const searchGroup = document.createElement('div');
  searchGroup.className = 'filter-group full-width';
  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Busca textual';
  searchGroup.appendChild(searchLabel);
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'searchInput';
  searchInput.placeholder = 'Nome, município, cargo, região, turma...';
  searchGroup.appendChild(searchInput);
  grid.appendChild(searchGroup);

  document.getElementById('searchInput').addEventListener('input', filterData);
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.multi-select')) closeAllDropdowns();
});

async function loadData(initial) {
  if (isRefreshing) return;
  isRefreshing = true;

  const btn = document.getElementById('btnRefresh');
  if (!initial) btn.classList.add('spinning');
  setIndicator('loading');

  try {
    const response = await fetch(CSV_URL + '&_=' + Date.now());
    const csvText = await response.text();
    const newHash = simpleHash(csvText);

    if (newHash === dataHash && !initial) {
      setIndicator('');
      btn.classList.remove('spinning');
      isRefreshing = false;
      return;
    }

    dataHash = newHash;

    Papa.parse(csvText, {
      complete: results => {
        const rows = results.data;
        rows.shift();
        const newData = normalizeData(rows.filter(r => r.length >= 18 && r[0]));

        const oldOptions = {};
        FILTER_CONFIGS.forEach(cfg => {
          oldOptions[cfg.key] = uniqueSorted(rawData.map(d => d[cfg.key]));
        });

        rawData = newData;
        filteredData = [...rawData];

        const rebuild = initial || FILTER_CONFIGS.some(cfg => {
          const newOpts = uniqueSorted(newData.map(d => d[cfg.key]));
          return JSON.stringify(oldOptions[cfg.key]) !== JSON.stringify(newOpts);
        });

        if (rebuild) {
          buildFilters();
        }

        filterData();
        if (initial) showContent();
        updateTime();
        setIndicator('');
        btn.classList.remove('spinning');
        isRefreshing = false;
      },
      error: err => {
        setIndicator('error');
        btn.classList.remove('spinning');
        isRefreshing = false;
      }
    });
  } catch (err) {
    setIndicator('error');
    btn.classList.remove('spinning');
    isRefreshing = false;
    if (initial) {
      showContent();
      document.getElementById('summaryCards').innerHTML =
        `<div class="card" style="grid-column:1/-1;text-align:center;color:#cc3121;">
          <h3>Erro ao carregar dados</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>`;
    }
  }
}

function showContent() {
  document.getElementById('loadingScreen').classList.add('hidden');
  const main = document.getElementById('mainContent');
  main.style.display = 'block';
  requestAnimationFrame(() => main.classList.add('visible'));
}

async function init() {
  document.getElementById('btnRefresh').addEventListener('click', () => loadData(false));
  await loadData(true);
  setInterval(() => loadData(false), POLL_INTERVAL);
}

init();
