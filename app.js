// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const CATEGORY_COLORS = {
  'Rock':          '#ff4d6d',
  'Electrónica':   '#00d4ff',
  'Jazz':          '#ffd166',
  'Clássica':      '#c8b8ff',
  'Hip Hop':       '#ff9f1c',
  'Pop':           '#ff79c6',
  'Folk':          '#a8d8a8',
  'Blues':         '#4ecdc4',
  'R&B / Soul':    '#f7b2bd',
  'Latina':        '#ff6b35',
  'Reggae':        '#06d6a0',
  'Metal':         '#e63946',
  'Punk':          '#ff595e',
  'Música do Mundo':'#8ecae6',
  'Experimental':  '#bd93f9',
  'Fusão':         '#ffb700',
  'Country':       '#c77dff',
  'Gospel / Espiritual': '#f4a261',
  'Música Antiga': '#d4a373',
  'Outro':         '#888888',
};

const ERA_LABELS = {
  ancient:   'Antiguidade',
  medieval:  'Medieval / Renascença',
  classical: 'Séc. XVIII–XIX',
  early20:   '1900–1940s',
  mid20:     '1950–1970s',
  late20:    '1980–1990s',
  '2000s':   '2000–2010s',
  modern:    '2010–presente',
};

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
function simplifyString(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let graphData = { nodes: [], links: [] };
let simulation, svg, g, linkSel, nodeSel;
let showFusions = true;
let activeCategory = null;
let activeNode = null;
let zoomBehavior;

// ═══════════════════════════════════════════════════════════
// LOADING UI
// ═══════════════════════════════════════════════════════════
function setLoadingMsg(msg, pct) {
  document.getElementById('loading-msg').textContent = msg;
  if (pct !== undefined)
    document.getElementById('loading-bar').style.width = pct + '%';
}

// ═══════════════════════════════════════════════════════════
// DATA — ESTÁTICO (365 géneros, 407 ligações)
// ═══════════════════════════════════════════════════════════
async function fetchMusicData() {
  // Carregar dados do ficheiro externo
  setLoadingMsg('A carregar base de dados...', 10);
  const res = await fetch('./data.json');
  if (!res.ok) throw new Error('Erro ao carregar data.json');
  const data = await res.json();
  setLoadingMsg(`${data.nodes.length} géneros carregados`, 90);
  await new Promise(r => setTimeout(r, 150));
  return data;
}

// ═══════════════════════════════════════════════════════════
// GRAPH RENDER
// ═══════════════════════════════════════════════════════════
function buildGraph(data) {
  graphData = data;

  // Stats
  document.getElementById('stats').textContent =
    `${data.nodes.length} géneros · ${data.links.length} ligações`;

  // Populate category filter
  const cats = [...new Set(data.nodes.map(n => n.category).filter(Boolean))].sort();
  const sel = document.getElementById('filter-cat');
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });

  // Build legend
  const legend = document.getElementById('legend');
  legend.querySelector('h3').remove(); // clean
  const lh = document.createElement('h3');
  lh.textContent = 'Categorias';
  legend.appendChild(lh);

  const catCounts = {};
  data.nodes.forEach(n => { catCounts[n.category] = (catCounts[n.category] || 0) + 1; });

  Object.entries(catCounts).sort((a,b) => b[1]-a[1]).forEach(([cat, cnt]) => {
    const color = CATEGORY_COLORS[cat] || '#888';
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.cat = cat;
    item.innerHTML = `
      <div class="legend-dot" style="background:${color}"></div>
      <span>${cat}</span>
      <span class="legend-count">${cnt}</span>
    `;
    item.addEventListener('click', () => filterByCategory(cat));
    legend.appendChild(item);
  });

  // D3 Setup
  const wrap = document.getElementById('canvas-wrap');
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  svg = d3.select('#graph-svg');
  svg.selectAll('*').remove();

  zoomBehavior = d3.zoom()
    .scaleExtent([0.05, 4])
    .on('zoom', e => g.attr('transform', e.transform));

  svg.call(zoomBehavior);

  // Arrow markers
  const defs = svg.append('defs');
  ['parent','influence','fusion'].forEach(type => {
    defs.append('marker')
      .attr('id', `arrow-${type}`)
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 14)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', type === 'fusion' ? '#ffb700' : type === 'influence' ? '#6b6b8a' : '#444466');
  });

  g = svg.append('g');

  // Links
  linkSel = g.append('g').attr('class','links')
    .selectAll('line')
    .data(data.links)
    .join('line')
    .attr('class', d => `link ${d.type === 'fusion' ? 'fusion' : ''}`)
    .attr('stroke', d =>
      d.type === 'fusion' ? '#ffb700aa' :
      d.type === 'influence' ? '#ffffff33' : '#ffffff22'
    )
    .attr('stroke-width', d => d.type === 'fusion' ? 1.8 : 1.1)
    .attr('marker-end', d => `url(#arrow-${d.type})`);

  // Nodes
  const nodeG = g.append('g').attr('class','nodes')
    .selectAll('g')
    .data(data.nodes)
    .join('g')
    .attr('class','node-group')
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag',  dragged)
      .on('end',   dragEnd))
    .on('mouseover', onHover)
    .on('mouseout', onHoverOut)
    .on('click', onClick)
    .on('touchstart', (event, d) => { event.preventDefault(); onClick(event, d); }, {passive:false});

  const nodeR = window.innerWidth < 600
    ? (d => d.isFusion ? 9 : 7)   // maiores em mobile para toque
    : (d => d.isFusion ? 7 : (d.category === 'Clássica' || d.category === 'Jazz') ? 6 : 5);

  nodeSel = nodeG.append('circle')
    .attr('class','node-circle')
    .attr('r', nodeR)
    .attr('fill', d => (CATEGORY_COLORS[d.category] || '#888') + 'cc')
    .attr('stroke', d => CATEGORY_COLORS[d.category] || '#888')
    .attr('stroke-width', d => d.isFusion ? 2 : 1);

  nodeG.append('text')
    .attr('class','node-label')
    .attr('x', 8)
    .attr('y', 4)
    .style('font-size', '9px')
    .style('fill', '#ffffff66')
    .style('pointer-events','none')
    .style('display', 'none')
    .text(d => d.name);

  // Simulação adaptativa: mobile usa parâmetros mais leves
  const isMobile = window.innerWidth < 600;
  const simStrength = isMobile ? -60 : -120;
  const simDistMax  = isMobile ? 200 : 300;
  const simCollide  = isMobile ? 10  : 12;
  const simAlpha    = isMobile ? 0.6 : 1;

  simulation = d3.forceSimulation(data.nodes)
    .alpha(simAlpha)
    .alphaDecay(isMobile ? 0.04 : 0.02)
    .velocityDecay(isMobile ? 0.5 : 0.4)
    .force('link', d3.forceLink(data.links)
      .id(d => d.id)
      .distance(d => d.type === 'parent' ? 40 : d.type === 'fusion' ? 90 : 60)
      .strength(d => d.type === 'parent' ? 0.8 : d.type === 'fusion' ? 0.3 : 0.4))
    .force('charge', d3.forceManyBody().strength(simStrength).distanceMax(simDistMax))
    .force('center', d3.forceCenter(W/2, H/2))
    .force('collide', d3.forceCollide(simCollide))
    .force('x', d3.forceX(W/2).strength(0.03))
    .force('y', d3.forceY(H/2).strength(0.03))
    .on('tick', ticked)
    .on('end', () => {
      // Mostrar labels após simulação estabilizar
      if (!isMobile) nodeG.selectAll('.node-label').style('display', null);
    });

  // Initial zoom to fit
  setTimeout(() => fitAll(), 600);
}

function ticked() {
  linkSel
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);

  g.selectAll('.node-group')
    .attr('transform', d => `translate(${d.x},${d.y})`);
}

function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

// ═══════════════════════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════════════════════
function onHover(event, d) {
  const tt = document.getElementById('tooltip');
  document.getElementById('tt-name').textContent = d.name;
  document.getElementById('tt-cat').textContent =
    `${d.category || ''}  ·  ${ERA_LABELS[d.era] || d.era || ''}  ·  ${d.region || ''}`;
  document.getElementById('tt-info').textContent = d.description || '';

  const fusions = graphData.links
    .filter(l => (l.source.id === d.id || l.target.id === d.id) && l.type === 'fusion')
    .map(l => l.source.id === d.id ? l.target.name || l.target : l.source.name || l.source)
    .slice(0, 4);

  const fDiv = document.getElementById('tt-fusion');
  if (fusions.length) {
    fDiv.textContent = '⟡ Fusões: ' + fusions.join(', ');
    fDiv.style.display = '';
  } else {
    fDiv.style.display = 'none';
  }

  const rect = document.getElementById('canvas-wrap').getBoundingClientRect();
  let x = event.clientX - rect.left + 12;
  let y = event.clientY - rect.top + 12;
  if (x + 250 > rect.width) x -= 260;
  if (y + 140 > rect.height) y -= 150;
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
  tt.classList.add('visible');
}

function onHoverOut() {
  document.getElementById('tooltip').classList.remove('visible');
}

function onClick(event, d) {
  event.stopPropagation();
  activeNode = d;

  // Info panel
  document.getElementById('info-name').textContent = d.name;
  document.getElementById('info-cat').textContent =
    `${d.category || ''} · ${ERA_LABELS[d.era] || ''} · ${d.region || ''}`;
  document.getElementById('info-desc').textContent = d.description || '';

  // Fusões
  const fusionLinks = graphData.links.filter(l =>
    (l.source.id === d.id || l.target.id === d.id) && l.type === 'fusion'
  );
  const fDiv = document.getElementById('info-fusions');
  if (fusionLinks.length) {
    fDiv.innerHTML = '<h4>Fusões</h4>' + fusionLinks.map(l => {
      const other = l.source.id === d.id ? l.target : l.source;
      const name = other.name || other;
      return `<span class="tag" onclick="focusNodeById('${other.id || other}')">${name}</span>`;
    }).join('');
  } else {
    fDiv.innerHTML = '';
  }

  // Related (parent/influence)
  const relLinks = graphData.links.filter(l =>
    (l.source.id === d.id || l.target.id === d.id) && l.type !== 'fusion'
  ).slice(0, 8);
  const rDiv = document.getElementById('info-related');
  if (relLinks.length) {
    rDiv.innerHTML = '<h4>Relacionados</h4>' + relLinks.map(l => {
      const other = l.source.id === d.id ? l.target : l.source;
      const name = other.name || other;
      return `<span class="tag" onclick="focusNodeById('${other.id || other}')">${name}</span>`;
    }).join('');
  } else {
    rDiv.innerHTML = '';
  }

  document.getElementById('info-panel').classList.add('visible');

  // Highlight connected
  highlightNode(d);
}

function highlightNode(d) {
  const connectedIds = new Set([d.id]);
  const connectedLinks = new Set();
  
  graphData.links.forEach(l => {
    if (l.source.id === d.id) {
      connectedIds.add(l.target.id);
      connectedLinks.add(l);
    }
    if (l.target.id === d.id) {
      connectedIds.add(l.source.id);
      connectedLinks.add(l);
    }
  });

  g.selectAll('.node-group')
    .classed('dimmed', n => !connectedIds.has(n.id))
    .classed('connected', n => connectedIds.has(n.id) && n.id !== d.id);

  g.selectAll('.node-circle')
    .classed('highlighted', n => n.id === d.id)
    .attr('r', n => n.id === d.id ? 10 :
      n.isFusion ? 7 : 5);

  g.selectAll('.link')
    .classed('dimmed', l => !connectedLinks.has(l))
    .classed('highlighted', l => connectedLinks.has(l));
}

function clearHighlight() {
  const isMobile = window.innerWidth < 600;
  g.selectAll('.node-group')
    .classed('dimmed', false)
    .classed('connected', false);

  g.selectAll('.node-circle')
    .classed('highlighted', false)
    .attr('r', d => isMobile
      ? (d.isFusion ? 9 : 7)
      : (d.isFusion ? 7 : (d.category === 'Clássica' || d.category === 'Jazz') ? 6 : 5));

  g.selectAll('.link')
    .classed('dimmed', false)
    .classed('highlighted', false);
}

document.getElementById('graph-svg').addEventListener('click', () => {
  document.getElementById('info-panel').classList.remove('visible');
  clearHighlight();
  activeNode = null;
});

function focusNodeById(id) {
  const node = graphData.nodes.find(n => n.id === id || n.name === id);
  if (!node) return;
  highlightNode(node);

  const wrap = document.getElementById('canvas-wrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const t = d3.zoomTransform(svg.node());
  const scale = 1.5;
  svg.transition().duration(600).call(
    zoomBehavior.transform,
    d3.zoomIdentity.translate(W/2 - scale * node.x, H/2 - scale * node.y).scale(scale)
  );
}

// ═══════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════
function filterByCategory(cat) {
  if (activeCategory === cat) {
    activeCategory = null;
    document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
    document.getElementById('filter-cat').value = '';
    applyFilters();
    return;
  }
  activeCategory = cat;
  document.querySelectorAll('.legend-item').forEach(i => {
    i.classList.toggle('active', i.dataset.cat === cat);
  });
  document.getElementById('filter-cat').value = cat;
  applyFilters();
}

function applyFilters() {
  const searchVal = simplifyString(document.getElementById('search').value);
  const catVal    = document.getElementById('filter-cat').value;
  const eraVal    = document.getElementById('filter-era').value;

  g.selectAll('.node-group').each(function(d) {
    const nameS = simplifyString(d.name);
    const descS = simplifyString(d.description || '');
    
    const visible =
      (!searchVal || nameS.includes(searchVal) || descS.includes(searchVal)) &&
      (!catVal    || d.category === catVal) &&
      (!eraVal    || d.era === eraVal);

    d3.select(this).select('.node-circle')
      .style('opacity', visible ? 1 : 0.04);
    d3.select(this).select('.node-label')
      .style('opacity', visible ? 1 : 0);
  });

  g.selectAll('.link').style('opacity', l => {
    const srcName = simplifyString(l.source.name || '');
    const srcDesc = simplifyString(l.source.description || '');
    const tgtName = simplifyString(l.target.name || '');
    const tgtDesc = simplifyString(l.target.description || '');
    const sv =
      (!searchVal || srcName.includes(searchVal) || srcDesc.includes(searchVal)) &&
      (!catVal    || l.source.category === catVal) &&
      (!eraVal    || l.source.era === eraVal);
    const tv =
      (!searchVal || tgtName.includes(searchVal) || tgtDesc.includes(searchVal)) &&
      (!catVal    || l.target.category === catVal) &&
      (!eraVal    || l.target.era === eraVal);
    return (sv && tv) ? (l.type === 'fusion' ? 0.5 : 0.15) : 0.03;
  });
}

function fitAll() {
  const wrap = document.getElementById('canvas-wrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;

  if (!graphData.nodes.length) return;
  const xs = graphData.nodes.map(n => n.x).filter(x => x != null);
  const ys = graphData.nodes.map(n => n.y).filter(y => y != null);
  if (!xs.length) return;

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const gW = maxX - minX, gH = maxY - minY;
  const scale = Math.min(W / gW, H / gH) * 0.85;
  const tx = W/2 - scale * (minX + gW/2);
  const ty = H/2 - scale * (minY + gH/2);

  svg.transition().duration(800).call(
    zoomBehavior.transform,
    d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}

// ═══════════════════════════════════════════════════════════
// CONTROLS WIRING
// ═══════════════════════════════════════════════════════════
document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('filter-cat').addEventListener('change', function() {
  activeCategory = this.value || null;
  document.querySelectorAll('.legend-item').forEach(i =>
    i.classList.toggle('active', i.dataset.cat === activeCategory));
  applyFilters();
});
document.getElementById('filter-era').addEventListener('change', applyFilters);

document.getElementById('toggle-fusions').addEventListener('click', function() {
  showFusions = !showFusions;
  this.classList.toggle('active', showFusions);
  g.selectAll('.link.fusion').style('display', showFusions ? null : 'none');
});

document.getElementById('btn-reset').addEventListener('click', fitAll);
document.getElementById('info-close').addEventListener('click', () => {
  document.getElementById('info-panel').classList.remove('visible');
  clearHighlight();
});

document.getElementById('zoom-in').addEventListener('click', () =>
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.5));
document.getElementById('zoom-out').addEventListener('click', () =>
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.67));
document.getElementById('zoom-fit').addEventListener('click', fitAll);


// ═══════════════════════════════════════════════════════════
// TREE VIEW
// ═══════════════════════════════════════════════════════════
let currentView = 'graph';

function switchView(view) {
  currentView = view;
  const isGraph = view === 'graph';
  document.getElementById('main').style.display = isGraph ? 'flex' : 'none';
  document.getElementById('tree-view').classList.toggle('active', !isGraph);
  document.getElementById('btn-view-graph').classList.toggle('active', isGraph);
  document.getElementById('btn-view-tree').classList.toggle('active', !isGraph);

  // Gestão de performance da simulação
  if (simulation) {
    if (isGraph) {
      if (simulation.alpha() > 0.001) simulation.restart();
    } else {
      simulation.stop();
    }
  }

  // controles específicos do grafo
  const graphOnlyControls = ['toggle-fusions','btn-reset','filter-era'];
  graphOnlyControls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isGraph ? '' : 'none';
  });
  // Em mobile, mostrar/esconder legenda consoante a vista
  if (window.innerWidth < 600) {
    const leg = document.getElementById('legend');
    if (leg) leg.style.display = isGraph ? '' : 'none';
  }

  if (!isGraph && document.getElementById('tree-view').childElementCount === 0) {
    buildTreeView(graphData);
  }
}

function buildTreeView(data) {
  const container = document.getElementById('tree-view');
  container.innerHTML = '';

  // Agrupar por categoria
  const cats = {};
  data.nodes.forEach(n => {
    const cat = n.category || 'Outro';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(n);
  });

  // Ordenar categorias por nº de nós
  const sorted = Object.entries(cats).sort((a,b) => b[1].length - a[1].length);

  sorted.forEach(([cat, nodes]) => {
    const color = CATEGORY_COLORS[cat] || '#888';

    // Contar fusões
    const fusionCount = nodes.filter(n => n.isFusion).length;

    const card = document.createElement('div');
    card.className = 'tree-category';

    const header = document.createElement('div');
    header.className = 'tree-cat-header';
    header.innerHTML = `
      <div class="tree-cat-dot" style="background:${color}"></div>
      <span class="tree-cat-name">${cat}</span>
      <span class="tree-cat-count">${nodes.length}</span>
      <span class="tree-cat-arrow">▶</span>
    `;

    const body = document.createElement('div');
    body.className = 'tree-nodes';

    // Barra de pesquisa interna
    const searchWrap = document.createElement('div');
    searchWrap.className = 'tree-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.className = 'tree-search';
    searchInput.placeholder = `Pesquisar em ${cat}...`;
    searchWrap.appendChild(searchInput);
    body.appendChild(searchWrap);

    // Stats
    const stats = document.createElement('div');
    stats.className = 'tree-cat-stats';
    stats.textContent = fusionCount > 0 ? `${nodes.length} géneros · ${fusionCount} fusões` : `${nodes.length} géneros`;
    body.appendChild(stats);

    // Ordenar nós: não-fusão primeiro, depois fusões; dentro de cada grupo, por nome
    const sorted_nodes = [...nodes].sort((a,b) => {
      if (a.isFusion !== b.isFusion) return a.isFusion ? 1 : -1;
      return a.name.localeCompare(b.name, 'pt');
    });

    sorted_nodes.forEach(n => {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'tree-node' + (n.isFusion ? ' fusion-node' : '');
      nodeEl.dataset.name = n.name.toLowerCase();
      nodeEl.dataset.desc = (n.description || '').toLowerCase();

      // Progenitores de fusão (links tipo fusion)
      // l.source/l.target são objetos de nó após D3 processar a simulação
      const fusionParents = data.links
        .filter(l => (l.target.id ?? l.target) === n.id && l.type === 'fusion')
        .map(l => data.nodes.find(x => x.id === (l.source.id ?? l.source))?.name)
        .filter(Boolean);

      // Parents normais (para não-fusões)
      const parentLinks = data.links
        .filter(l => (l.target.id ?? l.target) === n.id && l.type !== 'fusion')
        .map(l => data.nodes.find(x => x.id === (l.source.id ?? l.source))?.name)
        .filter(Boolean).slice(0,2);

      const eraLabel = ERA_LABELS[n.era] || n.era || '';
      const metaParts = [eraLabel, n.region].filter(Boolean);

      let fusionBadge = '';
      if (n.isFusion) {
        if (fusionParents.length > 0) {
          const label = fusionParents.slice(0,3).join(' + ');
          fusionBadge = `<span class="tree-fusion-badge" title="fusão de: ${label}">⟡ ${label}</span>`;
        } else if (parentLinks.length > 0) {
          const label = parentLinks.join(' + ');
          fusionBadge = `<span class="tree-fusion-badge">⟡ ${label}</span>`;
        } else {
          fusionBadge = '<span class="tree-fusion-badge">fusão</span>';
        }
      }

      nodeEl.innerHTML = `
        <div class="tree-node-dot" style="background:${n.isFusion ? '#ffb700' : color}"></div>
        <div class="tree-node-body">
          <div style="display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap">
            <span class="tree-node-name">${n.name}</span>
            ${fusionBadge}
          </div>
          <div class="tree-node-meta">${metaParts.join(' · ')}</div>
          <div class="tree-node-desc">${n.description || ''}</div>
        </div>
      `;

      nodeEl.addEventListener('click', () => {
        nodeEl.classList.toggle('expanded');
      });

      body.appendChild(nodeEl);
    });

    // Pesquisa interna
    searchInput.addEventListener('input', () => {
      const val = simplifyString(searchInput.value);
      let visible = 0;
      body.querySelectorAll('.tree-node').forEach(el => {
        const nameS = simplifyString(el.querySelector('.tree-node-name').textContent);
        const descS = simplifyString(el.querySelector('.tree-node-desc').textContent);
        
        const match = !val || nameS.includes(val) || descS.includes(val);
        el.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      stats.textContent = val
        ? `${visible} resultado${visible !== 1 ? 's' : ''} de ${nodes.length}`
        : (fusionCount > 0 ? `${nodes.length} géneros · ${fusionCount} fusões` : `${nodes.length} géneros`);
    });

    header.addEventListener('click', () => {
      const isOpen = body.classList.toggle('open');
      header.classList.toggle('open', isOpen);
      if (isOpen) searchInput.focus();
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════
function exportJSON() {
  const exportData = {
    meta: {
      title: "Atlas dos Géneros Musicais",
      version: "1.0",
      generated: new Date().toISOString(),
      total_nodes: graphData.nodes.length,
      total_links: graphData.links.length,
      source: "atlas-musical"
    },
    nodes: graphData.nodes.map(n => ({
      id: n.id,
      name: n.name,
      category: n.category,
      era: n.era,
      region: n.region,
      description: n.description,
      isFusion: n.isFusion || false,
      instruments: n.instruments || []
    })),
    links: graphData.links.map(l => ({
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      type: l.type,
      label: l.label || undefined
    }))
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'atlas-musical.json';
  a.click();
  URL.revokeObjectURL(url);

  // Feedback visual
  const btn = document.getElementById('btn-export');
  const orig = btn.textContent;
  btn.textContent = '✓ Exportado';
  btn.style.color = 'var(--color-text-success, #06d6a0)';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.color = '';
  }, 2000);
}

// ═══════════════════════════════════════════════════════════
// HELP MODAL
// ═══════════════════════════════════════════════════════════
(function () {
  const modal = document.getElementById('help-modal');

  document.getElementById('btn-help').addEventListener('click', () => {
    modal.classList.add('open');
    updateModalStats();
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('open');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open'))
      modal.classList.remove('open');
  });

  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.modal-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
})();

function updateModalStats() {
  const el = document.getElementById('modal-stats');
  if (!el || !graphData.nodes.length) return;
  const cats = new Set(graphData.nodes.map(n => n.category)).size;
  const fusions = graphData.nodes.filter(n => n.isFusion).length;
  const byType = { parent: 0, influence: 0, fusion: 0 };
  graphData.links.forEach(l => { byType[l.type] = (byType[l.type] || 0) + 1; });
  el.innerHTML = `
    <div class="stat-row"><span>Géneros</span><strong>${graphData.nodes.length}</strong></div>
    <div class="stat-row"><span>Ligações</span><strong>${graphData.links.length}</strong></div>
    <div class="stat-row"><span>Categorias</span><strong>${cats}</strong></div>
    <div class="stat-row"><span>Géneros de fusão</span><strong>${fusions}</strong></div>
    <div class="stat-row"><span>Ligações parentais</span><strong>${byType.parent}</strong></div>
    <div class="stat-row"><span>Influências</span><strong>${byType.influence}</strong></div>
    <div class="stat-row"><span>Ligações de fusão</span><strong>${byType.fusion}</strong></div>
  `;
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function init() {
  try {
    const data = await fetchMusicData();
    setLoadingMsg('A renderizar...', 98);
    await new Promise(r => setTimeout(r, 100));

    // Em mobile, começar na vista de árvore (mais leve e utilizável)
    if (window.innerWidth < 600) {
      buildGraph(data);
      switchView('tree');
    } else {
      buildGraph(data);
    }

    document.getElementById('loading').style.display = 'none';
  } catch (err) {
    console.error(err);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-msg').style.display = 'flex';
  }
}

init();