/**
 * Bill-Hive Image Editor  v1.0.0
 * ─────────────────────────────────
 * A self-contained, canvas-based image editor modal.
 * Supports: crop, scale, grayscale, brightness, invert, colour extraction.
 * Usage:
 *   BHImageEditor.open(dataUrl, { title: 'Edit Logo' })
 *     .then(editedDataUrl => { ... })   // user clicked Apply
 *     .catch(() => { ... });            // user cancelled
 *
 * No external dependencies — pure Canvas API.
 */
(function (global) {
    'use strict';

    /* ─── State ─── */
    let _resolve, _reject;
    let _originalImg = null;   // HTMLImageElement of the original
    let _originalUrl = '';

    // Adjustments
    let _adj = {};
    const ADJ_DEFAULTS = {
        brightness: 0,       // –100 … +100
        grayscale: 0,        // 0 … 1 (0 = colour, 1 = B&W)
        invert: 0,           // 0 or 1
        scaleX: 100,         // percentage of original width
        scaleY: 100,         // percentage of original height
        lockAspect: true,
        // Crop (in original-image pixels)
        cropX: 0,
        cropY: 0,
        cropW: 0,
        cropH: 0,
        cropEnabled: false,
    };

    // Crop drag state
    let _drag = { active: false, startX: 0, startY: 0, handle: null };
    // Extracted colours
    let _palette = [];

    /* ─── DOM refs (populated once on first open) ─── */
    let _modal, _canvas, _ctx, _overlay;

    /* ────────────────────────────────────────────────
       Public API
    ──────────────────────────────────────────────── */
    const BHImageEditor = {
        open(dataUrl, opts = {}) {
            return new Promise((resolve, reject) => {
                _resolve = resolve;
                _reject = reject;
                _originalUrl = dataUrl;
                _adj = { ...ADJ_DEFAULTS };
                _palette = [];

                _ensureModal();
                _loadImage(dataUrl, () => {
                    _adj.cropW = _originalImg.naturalWidth;
                    _adj.cropH = _originalImg.naturalHeight;
                    _resetUI();
                    _render();
                    _extractPalette();
                });

                // Title
                const titleEl = document.getElementById('bhe-title');
                if (titleEl) titleEl.textContent = opts.title || 'Edit Image';

                _modal.classList.add('bhe-active');
                document.body.style.overflow = 'hidden';
            });
        }
    };

    /* ────────────────────────────────────────────────
       Modal HTML injection
    ──────────────────────────────────────────────── */
    function _ensureModal() {
        if (document.getElementById('bhe-modal')) return;

        const el = document.createElement('div');
        el.id = 'bhe-modal';
        el.innerHTML = `
<div class="bhe-overlay" id="bhe-overlay"></div>
<div class="bhe-dialog">
  <div class="bhe-header">
    <span class="bhe-title" id="bhe-title">Edit Image</span>
    <button class="bhe-close" id="bhe-close" title="Cancel">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>

  <div class="bhe-body">
    <!-- Canvas area -->
    <div class="bhe-canvas-wrap" id="bhe-canvas-wrap">
      <canvas id="bhe-canvas"></canvas>
      <canvas id="bhe-crop-overlay" style="position:absolute;inset:0;pointer-events:none;"></canvas>
    </div>

    <!-- Tabs -->
    <div class="bhe-tabs">
      <button class="bhe-tab bhe-tab-active" data-tab="adjust">Adjust</button>
      <button class="bhe-tab" data-tab="crop">Crop</button>
      <button class="bhe-tab" data-tab="colours">Colours</button>
    </div>

    <!-- Adjust panel -->
    <div class="bhe-panel" id="bhe-panel-adjust">
      <div class="bhe-row">
        <label class="bhe-label">Brightness</label>
        <div class="bhe-slider-wrap">
          <input type="range" id="bhe-brightness" min="-100" max="100" step="1" value="0">
          <span class="bhe-val" id="bhe-brightness-val">0</span>
        </div>
      </div>
      <div class="bhe-row">
        <label class="bhe-label">Grayscale</label>
        <div class="bhe-slider-wrap">
          <input type="range" id="bhe-grayscale" min="0" max="100" step="1" value="0">
          <span class="bhe-val" id="bhe-grayscale-val">0%</span>
        </div>
      </div>
      <div class="bhe-row bhe-row-toggle">
        <label class="bhe-label">Invert Colours</label>
        <label class="bhe-toggle">
          <input type="checkbox" id="bhe-invert">
          <span class="bhe-toggle-thumb"></span>
        </label>
      </div>

      <div class="bhe-divider"></div>

      <div class="bhe-row">
        <label class="bhe-label">Width <small>px</small></label>
        <div class="bhe-wh-wrap">
          <input type="number" id="bhe-width" class="bhe-num" min="1" max="4000">
          <button class="bhe-lock-btn" id="bhe-lock-btn" title="Lock aspect ratio">
            <svg id="bhe-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          <input type="number" id="bhe-height" class="bhe-num" min="1" max="4000">
        </div>
      </div>
    </div>

    <!-- Crop panel -->
    <div class="bhe-panel bhe-panel-hidden" id="bhe-panel-crop">
      <p class="bhe-hint">Drag on the image to set the crop region. Handles let you resize it.</p>
      <div class="bhe-crop-grid">
        <div class="bhe-row">
          <label class="bhe-label">X</label>
          <input type="number" id="bhe-crop-x" class="bhe-num" min="0" value="0">
        </div>
        <div class="bhe-row">
          <label class="bhe-label">Y</label>
          <input type="number" id="bhe-crop-y" class="bhe-num" min="0" value="0">
        </div>
        <div class="bhe-row">
          <label class="bhe-label">W</label>
          <input type="number" id="bhe-crop-w" class="bhe-num" min="1" value="0">
        </div>
        <div class="bhe-row">
          <label class="bhe-label">H</label>
          <input type="number" id="bhe-crop-h" class="bhe-num" min="1" value="0">
        </div>
      </div>
      <div class="bhe-crop-actions">
        <button class="bhe-btn bhe-btn-sm" onclick="BHImageEditor._cropPresets('square')">Square</button>
        <button class="bhe-btn bhe-btn-sm" onclick="BHImageEditor._cropPresets('4:1')">4:1 Banner</button>
        <button class="bhe-btn bhe-btn-sm" onclick="BHImageEditor._cropPresets('16:9')">16:9</button>
        <button class="bhe-btn bhe-btn-sm" onclick="BHImageEditor._cropPresets('reset')">Reset</button>
      </div>
      <div class="bhe-row bhe-row-toggle" style="margin-top:10px;">
        <label class="bhe-label">Enable Crop</label>
        <label class="bhe-toggle">
          <input type="checkbox" id="bhe-crop-enabled">
          <span class="bhe-toggle-thumb"></span>
        </label>
      </div>
    </div>

    <!-- Colours panel -->
    <div class="bhe-panel bhe-panel-hidden" id="bhe-panel-colours">
      <p class="bhe-hint">Dominant colours extracted from the image. Click to copy hex.</p>
      <div class="bhe-palette" id="bhe-palette"></div>
      <button class="bhe-btn bhe-btn-sm" style="margin-top:10px;" onclick="BHImageEditor._extractPalette()">Re-extract</button>
    </div>
  </div>

  <div class="bhe-footer">
    <button class="bhe-btn bhe-btn-ghost" id="bhe-reset-btn">Reset</button>
    <div style="display:flex;gap:8px;">
      <button class="bhe-btn bhe-btn-ghost" id="bhe-cancel-btn">Cancel</button>
      <button class="bhe-btn bhe-btn-primary" id="bhe-apply-btn">Apply</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(el);

        _modal = el;
        _canvas = document.getElementById('bhe-canvas');
        _ctx = _canvas.getContext('2d');
        _overlay = document.getElementById('bhe-crop-overlay');

        _bindEvents();
        _injectStyles();
    }

    /* ────────────────────────────────────────────────
       Event wiring
    ──────────────────────────────────────────────── */
    function _bindEvents() {
        // Close / cancel
        document.getElementById('bhe-close').addEventListener('click', _cancel);
        document.getElementById('bhe-cancel-btn').addEventListener('click', _cancel);
        document.getElementById('bhe-overlay').addEventListener('click', _cancel);

        // Apply
        document.getElementById('bhe-apply-btn').addEventListener('click', _apply);

        // Reset
        document.getElementById('bhe-reset-btn').addEventListener('click', () => {
            _adj = { ...ADJ_DEFAULTS };
            if (_originalImg) {
                _adj.cropW = _originalImg.naturalWidth;
                _adj.cropH = _originalImg.naturalHeight;
            }
            _resetUI();
            _render();
        });

        // Tabs
        _modal.querySelectorAll('.bhe-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                _modal.querySelectorAll('.bhe-tab').forEach(t => t.classList.remove('bhe-tab-active'));
                tab.classList.add('bhe-tab-active');
                const name = tab.dataset.tab;
                _modal.querySelectorAll('.bhe-panel').forEach(p => p.classList.add('bhe-panel-hidden'));
                document.getElementById(`bhe-panel-${name}`).classList.remove('bhe-panel-hidden');
                _adj.cropEnabled = (name === 'crop') ? document.getElementById('bhe-crop-enabled').checked : _adj.cropEnabled;
                _render();
            });
        });

        // Adjust sliders
        _slider('bhe-brightness', 'bhe-brightness-val', v => _adj.brightness = v, v => v, '');
        _slider('bhe-grayscale',  'bhe-grayscale-val',  v => _adj.grayscale = v / 100, v => v + '%', '');
        document.getElementById('bhe-invert').addEventListener('change', e => {
            _adj.invert = e.target.checked ? 1 : 0;
            _render();
        });

        // Scale
        const wEl = document.getElementById('bhe-width');
        const hEl = document.getElementById('bhe-height');
        wEl.addEventListener('change', () => {
            const w = parseInt(wEl.value) || 1;
            if (_adj.lockAspect && _originalImg) {
                const ratio = _originalImg.naturalHeight / _originalImg.naturalWidth;
                hEl.value = Math.round(w * ratio);
                _adj.scaleY = (parseInt(hEl.value) / _originalImg.naturalHeight) * 100;
            }
            _adj.scaleX = (w / (_originalImg?.naturalWidth || w)) * 100;
            _render();
        });
        hEl.addEventListener('change', () => {
            const h = parseInt(hEl.value) || 1;
            if (_adj.lockAspect && _originalImg) {
                const ratio = _originalImg.naturalWidth / _originalImg.naturalHeight;
                wEl.value = Math.round(h * ratio);
                _adj.scaleX = (parseInt(wEl.value) / _originalImg.naturalWidth) * 100;
            }
            _adj.scaleY = (h / (_originalImg?.naturalHeight || h)) * 100;
            _render();
        });

        // Lock aspect
        document.getElementById('bhe-lock-btn').addEventListener('click', () => {
            _adj.lockAspect = !_adj.lockAspect;
            _updateLockIcon();
        });

        // Crop numerics
        ['bhe-crop-x','bhe-crop-y','bhe-crop-w','bhe-crop-h'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => _syncCropFromInputs());
        });
        document.getElementById('bhe-crop-enabled').addEventListener('change', e => {
            _adj.cropEnabled = e.target.checked;
            _render();
        });

        // Crop drag on canvas
        const wrap = document.getElementById('bhe-canvas-wrap');
        wrap.addEventListener('mousedown', _onCropMouseDown);
        wrap.addEventListener('mousemove', _onCropMouseMove);
        window.addEventListener('mouseup',  _onCropMouseUp);
        // Touch
        wrap.addEventListener('touchstart', e => _onCropMouseDown(_touchToMouse(e)), { passive: false });
        wrap.addEventListener('touchmove',  e => { e.preventDefault(); _onCropMouseMove(_touchToMouse(e)); }, { passive: false });
        window.addEventListener('touchend', e => _onCropMouseUp(_touchToMouse(e)));
    }

    function _slider(sliderId, valId, setAdj, fmt) {
        const el = document.getElementById(sliderId);
        const vl = document.getElementById(valId);
        el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            setAdj(v);
            vl.textContent = fmt(v);
            _render();
        });
    }

    /* ────────────────────────────────────────────────
       Image loading
    ──────────────────────────────────────────────── */
    function _loadImage(url, cb) {
        const img = new Image();
        img.onload = () => { _originalImg = img; cb(); };
        img.src = url;
    }

    /* ────────────────────────────────────────────────
       Render pipeline
    ──────────────────────────────────────────────── */
    function _render() {
        if (!_originalImg) return;

        const srcW = _originalImg.naturalWidth;
        const srcH = _originalImg.naturalHeight;

        // Output dimensions (scaled)
        const outW = Math.round(srcW * _adj.scaleX / 100);
        const outH = Math.round(srcH * _adj.scaleY / 100);

        _canvas.width  = outW;
        _canvas.height = outH;

        // Draw original scaled
        _ctx.drawImage(_originalImg, 0, 0, outW, outH);

        // Pixel manipulation (brightness, grayscale, invert)
        if (_adj.brightness !== 0 || _adj.grayscale > 0 || _adj.invert) {
            const id = _ctx.getImageData(0, 0, outW, outH);
            const d  = id.data;
            const br = _adj.brightness * 2.55;  // map –100…100 → –255…255

            for (let i = 0; i < d.length; i += 4) {
                let r = d[i], g = d[i+1], b = d[i+2];

                // Brightness
                r = Math.min(255, Math.max(0, r + br));
                g = Math.min(255, Math.max(0, g + br));
                b = Math.min(255, Math.max(0, b + br));

                // Grayscale
                if (_adj.grayscale > 0) {
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = r + (lum - r) * _adj.grayscale;
                    g = g + (lum - g) * _adj.grayscale;
                    b = b + (lum - b) * _adj.grayscale;
                }

                // Invert
                if (_adj.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }

                d[i] = r; d[i+1] = g; d[i+2] = b;
            }
            _ctx.putImageData(id, 0, 0);
        }

        // Draw crop overlay on the overlay canvas (shown in crop tab)
        _renderCropOverlay(outW, outH);
    }

    function _renderCropOverlay(displayW, displayH) {
        const ov = _overlay;
        ov.width  = displayW;
        ov.height = displayH;
        const oc = ov.getContext('2d');
        oc.clearRect(0, 0, displayW, displayH);

        if (!_adj.cropEnabled) return;

        const srcW = _originalImg.naturalWidth;
        const srcH = _originalImg.naturalHeight;
        const sx = displayW / srcW;
        const sy = displayH / srcH;

        const rx = _adj.cropX * sx;
        const ry = _adj.cropY * sy;
        const rw = _adj.cropW * sx;
        const rh = _adj.cropH * sy;

        // Dim outside crop
        oc.fillStyle = 'rgba(0,0,0,0.45)';
        oc.fillRect(0, 0, displayW, displayH);
        oc.clearRect(rx, ry, rw, rh);

        // Border
        oc.strokeStyle = '#fff';
        oc.lineWidth = 1.5;
        oc.setLineDash([5, 3]);
        oc.strokeRect(rx, ry, rw, rh);
        oc.setLineDash([]);

        // Rule of thirds grid
        oc.strokeStyle = 'rgba(255,255,255,0.35)';
        oc.lineWidth = 0.75;
        for (let t = 1; t <= 2; t++) {
            oc.beginPath();
            oc.moveTo(rx + (rw * t / 3), ry);
            oc.lineTo(rx + (rw * t / 3), ry + rh);
            oc.stroke();
            oc.beginPath();
            oc.moveTo(rx, ry + (rh * t / 3));
            oc.lineTo(rx + rw, ry + (rh * t / 3));
            oc.stroke();
        }

        // Corner handles
        const hs = 8;
        oc.fillStyle = '#fff';
        [[rx,ry],[rx+rw-hs,ry],[rx,ry+rh-hs],[rx+rw-hs,ry+rh-hs]].forEach(([x,y]) => {
            oc.fillRect(x, y, hs, hs);
        });
    }

    /* ────────────────────────────────────────────────
       Crop drag (on display canvas — maps back to source pixels)
    ──────────────────────────────────────────────── */
    function _canvasCoords(e) {
        const rect = _canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width  * _canvas.width,
            y: (e.clientY - rect.top)  / rect.height * _canvas.height
        };
    }

    function _displayToSrc(dx, dy) {
        const scaleX = _originalImg.naturalWidth  / _canvas.width;
        const scaleY = _originalImg.naturalHeight / _canvas.height;
        return { x: dx * scaleX, y: dy * scaleY };
    }

    function _hitHandle(cx, cy) {
        if (!_adj.cropEnabled || !_originalImg) return null;
        const sw = _originalImg.naturalWidth, sh = _originalImg.naturalHeight;
        const dw = _canvas.getBoundingClientRect().width;
        const dh = _canvas.getBoundingClientRect().height;
        const sx = dw / sw, sy = dh / sh;

        const rx = _adj.cropX * sx, ry = _adj.cropY * sy;
        const rw = _adj.cropW * sx, rh = _adj.cropH * sy;
        const hs = 12;

        const corners = [
            { name: 'nw', x: rx,      y: ry },
            { name: 'ne', x: rx+rw,   y: ry },
            { name: 'sw', x: rx,      y: ry+rh },
            { name: 'se', x: rx+rw,   y: ry+rh },
        ];
        for (const c of corners) {
            if (Math.abs(cx - c.x) < hs && Math.abs(cy - c.y) < hs) return c.name;
        }
        // Inside = move
        if (cx > rx && cx < rx+rw && cy > ry && cy < ry+rh) return 'move';
        return null;
    }

    function _onCropMouseDown(e) {
        if (!_adj.cropEnabled) {
            // Start a new crop rect on fresh drag
            if (!document.getElementById('bhe-panel-crop').classList.contains('bhe-panel-hidden')) {
                const { x, y } = _canvasCoords(e);
                const src = _displayToSrc(x, y);
                _adj.cropX = Math.max(0, Math.round(src.x));
                _adj.cropY = Math.max(0, Math.round(src.y));
                _adj.cropW = 1; _adj.cropH = 1;
                _adj.cropEnabled = true;
                document.getElementById('bhe-crop-enabled').checked = true;
                _drag = { active: true, startX: x, startY: y, handle: 'se' };
                _render();
            }
            return;
        }
        const rect = _canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const handle = _hitHandle(cx, cy);
        if (handle) {
            _drag = { active: true, startX: cx, startY: cy, handle, lastX: cx, lastY: cy,
                      origCropX: _adj.cropX, origCropY: _adj.cropY,
                      origCropW: _adj.cropW, origCropH: _adj.cropH };
            e.preventDefault();
        }
    }

    function _onCropMouseMove(e) {
        if (!_drag.active) return;
        const rect = _canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const srcDx = (cx - _drag.startX) * (_originalImg.naturalWidth  / rect.width);
        const srcDy = (cy - _drag.startY) * (_originalImg.naturalHeight / rect.height);
        const iw = _originalImg.naturalWidth, ih = _originalImg.naturalHeight;

        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

        if (_drag.handle === 'move') {
            _adj.cropX = clamp(Math.round(_drag.origCropX + srcDx), 0, iw - _adj.cropW);
            _adj.cropY = clamp(Math.round(_drag.origCropY + srcDy), 0, ih - _adj.cropH);
        } else {
            let { origCropX: ox, origCropY: oy, origCropW: ow, origCropH: oh } = _drag;
            if (_drag.handle === 'se') {
                _adj.cropW = clamp(Math.round(ow + srcDx), 1, iw - _adj.cropX);
                _adj.cropH = clamp(Math.round(oh + srcDy), 1, ih - _adj.cropY);
            } else if (_drag.handle === 'nw') {
                const newX = clamp(Math.round(ox + srcDx), 0, ox + ow - 1);
                const newY = clamp(Math.round(oy + srcDy), 0, oy + oh - 1);
                _adj.cropW = ox + ow - newX;
                _adj.cropH = oy + oh - newY;
                _adj.cropX = newX; _adj.cropY = newY;
            } else if (_drag.handle === 'ne') {
                const newY = clamp(Math.round(oy + srcDy), 0, oy + oh - 1);
                _adj.cropW = clamp(Math.round(ow + srcDx), 1, iw - _adj.cropX);
                _adj.cropH = oy + oh - newY;
                _adj.cropY = newY;
            } else if (_drag.handle === 'sw') {
                const newX = clamp(Math.round(ox + srcDx), 0, ox + ow - 1);
                _adj.cropW = ox + ow - newX;
                _adj.cropH = clamp(Math.round(oh + srcDy), 1, ih - _adj.cropY);
                _adj.cropX = newX;
            }
        }
        _syncCropToInputs();
        _render();
    }

    function _onCropMouseUp() { _drag.active = false; }

    function _touchToMouse(e) {
        const t = e.touches[0] || e.changedTouches[0];
        return { clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() };
    }

    /* ────────────────────────────────────────────────
       Crop presets
    ──────────────────────────────────────────────── */
    BHImageEditor._cropPresets = function(preset) {
        if (!_originalImg) return;
        const iw = _originalImg.naturalWidth, ih = _originalImg.naturalHeight;
        if (preset === 'reset') {
            _adj.cropX = 0; _adj.cropY = 0; _adj.cropW = iw; _adj.cropH = ih;
        } else {
            let tw = iw, th;
            if (preset === 'square') { th = Math.min(iw, ih); tw = th; }
            else if (preset === '4:1') { th = Math.round(iw / 4); }
            else if (preset === '16:9') { th = Math.round(iw * 9 / 16); }
            else { th = ih; }
            _adj.cropX = Math.round((iw - tw) / 2);
            _adj.cropY = Math.round((ih - th) / 2);
            _adj.cropW = tw; _adj.cropH = Math.min(th, ih);
        }
        _adj.cropEnabled = true;
        document.getElementById('bhe-crop-enabled').checked = true;
        _syncCropToInputs();
        _render();
    };

    function _syncCropToInputs() {
        document.getElementById('bhe-crop-x').value = Math.round(_adj.cropX);
        document.getElementById('bhe-crop-y').value = Math.round(_adj.cropY);
        document.getElementById('bhe-crop-w').value = Math.round(_adj.cropW);
        document.getElementById('bhe-crop-h').value = Math.round(_adj.cropH);
    }

    function _syncCropFromInputs() {
        _adj.cropX = parseInt(document.getElementById('bhe-crop-x').value) || 0;
        _adj.cropY = parseInt(document.getElementById('bhe-crop-y').value) || 0;
        _adj.cropW = parseInt(document.getElementById('bhe-crop-w').value) || 1;
        _adj.cropH = parseInt(document.getElementById('bhe-crop-h').value) || 1;
        _render();
    }

    /* ────────────────────────────────────────────────
       Colour extraction
    ──────────────────────────────────────────────── */
    BHImageEditor._extractPalette = function() {
        if (!_originalImg) return;
        const tmp = document.createElement('canvas');
        const size = 80; // sample at low res for speed
        tmp.width = size; tmp.height = size;
        const tc = tmp.getContext('2d');
        tc.drawImage(_originalImg, 0, 0, size, size);
        const data = tc.getImageData(0, 0, size, size).data;

        // k-means colour quantisation (k=8, 10 iterations)
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] < 128) continue; // skip transparent
            pixels.push([data[i], data[i+1], data[i+2]]);
        }
        if (!pixels.length) return;

        const k = 8;
        let centers = pixels.filter((_, i) => i % Math.floor(pixels.length / k) === 0).slice(0, k);

        for (let iter = 0; iter < 12; iter++) {
            const sums = Array.from({length: k}, () => [0,0,0,0]);
            for (const [r,g,b] of pixels) {
                let best = 0, bestD = Infinity;
                for (let j = 0; j < centers.length; j++) {
                    const d = (r-centers[j][0])**2 + (g-centers[j][1])**2 + (b-centers[j][2])**2;
                    if (d < bestD) { bestD = d; best = j; }
                }
                sums[best][0] += r; sums[best][1] += g; sums[best][2] += b; sums[best][3]++;
            }
            centers = sums.map((s, i) => s[3] ? [s[0]/s[3], s[1]/s[3], s[2]/s[3]] : centers[i]);
        }

        // Sort by luminance then deduplicate close colours
        const toHex = ([r,g,b]) => '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
        _palette = centers
            .sort((a,b) => (0.299*b[0]+0.587*b[1]+0.114*b[2]) - (0.299*a[0]+0.587*a[1]+0.114*a[2]))
            .map(c => toHex(c));

        _renderPalette();
    };

    function _extractPalette() { BHImageEditor._extractPalette(); }

    function _renderPalette() {
        const el = document.getElementById('bhe-palette');
        if (!el) return;
        el.innerHTML = _palette.map(hex => `
            <div class="bhe-swatch" style="background:${hex};" title="${hex}" onclick="BHImageEditor._copyColor('${hex}')">
                <span class="bhe-swatch-label">${hex}</span>
            </div>
        `).join('');
    }

    BHImageEditor._copyColor = function(hex) {
        navigator.clipboard?.writeText(hex).then(() => {
            _showToast('Copied ' + hex);
        }).catch(() => {
            _showToast(hex);
        });
    };

    /* ────────────────────────────────────────────────
       Apply (export to dataUrl)
    ──────────────────────────────────────────────── */
    function _apply() {
        if (!_originalImg) return _cancel();

        // Build final canvas: render at full scale then crop
        const srcW = _originalImg.naturalWidth;
        const srcH = _originalImg.naturalHeight;
        const outW = Math.round(srcW * _adj.scaleX / 100);
        const outH = Math.round(srcH * _adj.scaleY / 100);

        const tmp = document.createElement('canvas');
        tmp.width = outW; tmp.height = outH;
        const tc = tmp.getContext('2d');
        tc.drawImage(_originalImg, 0, 0, outW, outH);

        // Pixel adjustments
        if (_adj.brightness !== 0 || _adj.grayscale > 0 || _adj.invert) {
            const id = tc.getImageData(0, 0, outW, outH);
            const d = id.data;
            const br = _adj.brightness * 2.55;
            for (let i = 0; i < d.length; i += 4) {
                let r = d[i], g = d[i+1], b = d[i+2];
                r = Math.min(255, Math.max(0, r + br));
                g = Math.min(255, Math.max(0, g + br));
                b = Math.min(255, Math.max(0, b + br));
                if (_adj.grayscale > 0) {
                    const lum = 0.299*r + 0.587*g + 0.114*b;
                    r = r + (lum-r)*_adj.grayscale;
                    g = g + (lum-g)*_adj.grayscale;
                    b = b + (lum-b)*_adj.grayscale;
                }
                if (_adj.invert) { r = 255-r; g = 255-g; b = 255-b; }
                d[i]=r; d[i+1]=g; d[i+2]=b;
            }
            tc.putImageData(id, 0, 0);
        }

        // Crop
        let finalDataUrl;
        if (_adj.cropEnabled && _adj.cropW > 0 && _adj.cropH > 0) {
            const scaleX = outW / srcW, scaleY = outH / srcH;
            const cx = Math.round(_adj.cropX * scaleX);
            const cy = Math.round(_adj.cropY * scaleY);
            const cw = Math.round(_adj.cropW * scaleX);
            const ch = Math.round(_adj.cropH * scaleY);

            const crop = document.createElement('canvas');
            crop.width = cw; crop.height = ch;
            crop.getContext('2d').drawImage(tmp, cx, cy, cw, ch, 0, 0, cw, ch);
            finalDataUrl = crop.toDataURL('image/png');
        } else {
            finalDataUrl = tmp.toDataURL('image/png');
        }

        _close();
        _resolve(finalDataUrl);
    }

    /* ────────────────────────────────────────────────
       Helpers
    ──────────────────────────────────────────────── */
    function _cancel() { _close(); _reject?.(); }

    function _close() {
        _modal.classList.remove('bhe-active');
        document.body.style.overflow = '';
    }

    function _resetUI() {
        if (!_originalImg) return;
        const w = _originalImg.naturalWidth, h = _originalImg.naturalHeight;
        document.getElementById('bhe-brightness').value = 0;
        document.getElementById('bhe-brightness-val').textContent = '0';
        document.getElementById('bhe-grayscale').value = 0;
        document.getElementById('bhe-grayscale-val').textContent = '0%';
        document.getElementById('bhe-invert').checked = false;
        document.getElementById('bhe-width').value = w;
        document.getElementById('bhe-height').value = h;
        document.getElementById('bhe-crop-x').value = 0;
        document.getElementById('bhe-crop-y').value = 0;
        document.getElementById('bhe-crop-w').value = w;
        document.getElementById('bhe-crop-h').value = h;
        document.getElementById('bhe-crop-enabled').checked = false;
        _adj.lockAspect = true;
        _updateLockIcon();
    }

    function _updateLockIcon() {
        const btn = document.getElementById('bhe-lock-btn');
        if (!btn) return;
        btn.style.opacity = _adj.lockAspect ? '1' : '0.4';
        btn.title = _adj.lockAspect ? 'Aspect locked' : 'Aspect unlocked';
    }

    function _showToast(msg) {
        const t = document.createElement('div');
        t.className = 'bhe-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('bhe-toast-show'), 10);
        setTimeout(() => { t.classList.remove('bhe-toast-show'); setTimeout(() => t.remove(), 300); }, 2000);
    }

    /* ────────────────────────────────────────────────
       Styles (injected once)
    ──────────────────────────────────────────────── */
    function _injectStyles() {
        if (document.getElementById('bhe-styles')) return;
        const s = document.createElement('style');
        s.id = 'bhe-styles';
        s.textContent = `
/* ── Image Editor Modal ── */
#bhe-modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9999;
    align-items: center;
    justify-content: center;
}
#bhe-modal.bhe-active { display: flex; }

.bhe-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(3px);
}

.bhe-dialog {
    position: relative;
    z-index: 1;
    background: var(--bg-card, #fff);
    border-radius: var(--radius-lg, 14px);
    box-shadow: 0 24px 64px rgba(0,0,0,0.25);
    width: min(760px, 96vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.bhe-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-light, #e9ecef);
    flex-shrink: 0;
}

.bhe-title {
    font-weight: 700;
    font-size: 1rem;
    color: var(--text-primary, #1a1a2e);
    letter-spacing: -0.01em;
}

.bhe-close {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: transparent;
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    color: var(--text-muted, #868e96);
    transition: background 0.15s, color 0.15s;
}
.bhe-close:hover { background: var(--bg-hover, #f1f3f5); color: var(--text-primary, #1a1a2e); }
.bhe-close svg { width: 16px; height: 16px; }

.bhe-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
}

/* Canvas */
.bhe-canvas-wrap {
    position: relative;
    background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 16px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    max-height: 340px;
    overflow: hidden;
    flex-shrink: 0;
}
#bhe-canvas {
    max-width: 100%;
    max-height: 340px;
    object-fit: contain;
    display: block;
}
#bhe-crop-overlay {
    max-width: 100%;
    max-height: 340px;
    object-fit: contain;
}

/* Tabs */
.bhe-tabs {
    display: flex;
    gap: 2px;
    padding: 12px 16px 0;
    border-bottom: 1px solid var(--border-light, #e9ecef);
    flex-shrink: 0;
}
.bhe-tab {
    padding: 7px 16px;
    border: none; background: transparent;
    font-size: 0.85rem; font-weight: 500;
    color: var(--text-muted, #868e96);
    cursor: pointer;
    border-radius: var(--radius-sm, 6px) var(--radius-sm, 6px) 0 0;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
}
.bhe-tab:hover { color: var(--text-primary, #1a1a2e); }
.bhe-tab-active {
    color: var(--accent-primary, #228be6) !important;
    border-bottom-color: var(--accent-primary, #228be6);
}

/* Panels */
.bhe-panel { padding: 16px 20px; }
.bhe-panel-hidden { display: none !important; }

.bhe-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}
.bhe-row:last-child { margin-bottom: 0; }
.bhe-row-toggle { justify-content: space-between; }

.bhe-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary, #495057);
    min-width: 80px;
    flex-shrink: 0;
}
.bhe-label small { font-weight: 400; color: var(--text-muted, #868e96); margin-left: 2px; }

.bhe-slider-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
}
.bhe-slider-wrap input[type="range"] {
    flex: 1;
    accent-color: var(--accent-primary, #228be6);
    height: 4px;
    cursor: pointer;
}
.bhe-val {
    min-width: 36px;
    text-align: right;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--accent-primary, #228be6);
    font-variant-numeric: tabular-nums;
}

.bhe-wh-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
}
.bhe-num {
    width: 80px;
    padding: 6px 10px;
    border: 1.5px solid var(--border-color, #dee2e6);
    border-radius: var(--radius-sm, 6px);
    background: var(--bg-input, #fff);
    color: var(--text-primary, #1a1a2e);
    font-size: 0.875rem;
    text-align: center;
}
.bhe-num:focus { outline: none; border-color: var(--accent-primary, #228be6); }

.bhe-lock-btn {
    width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--border-color, #dee2e6);
    border-radius: var(--radius-sm, 6px);
    background: var(--bg-card, #fff);
    cursor: pointer;
    color: var(--text-secondary, #495057);
    flex-shrink: 0;
}
.bhe-lock-btn svg { width: 14px; height: 14px; }

.bhe-divider {
    height: 1px;
    background: var(--border-light, #e9ecef);
    margin: 12px 0;
}

/* Toggle switch */
.bhe-toggle { display: flex; align-items: center; cursor: pointer; }
.bhe-toggle input { display: none; }
.bhe-toggle-thumb {
    width: 38px; height: 22px;
    background: var(--border-color, #dee2e6);
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
}
.bhe-toggle-thumb::after {
    content: '';
    position: absolute;
    width: 16px; height: 16px;
    background: #fff;
    border-radius: 50%;
    top: 3px; left: 3px;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.bhe-toggle input:checked + .bhe-toggle-thumb { background: var(--accent-primary, #228be6); }
.bhe-toggle input:checked + .bhe-toggle-thumb::after { transform: translateX(16px); }

/* Crop panel */
.bhe-hint {
    font-size: 0.8rem;
    color: var(--text-muted, #868e96);
    margin-bottom: 12px;
    line-height: 1.5;
}
.bhe-crop-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
}
.bhe-crop-grid .bhe-row { margin-bottom: 0; }
.bhe-crop-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Buttons */
.bhe-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-md, 10px);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.15s, opacity 0.15s;
}
.bhe-btn-primary {
    background: var(--accent-primary, #228be6);
    color: #fff;
}
.bhe-btn-primary:hover { background: var(--accent-primary-hover, #1c7ed6); }
.bhe-btn-ghost {
    background: var(--bg-tertiary, #f1f3f5);
    color: var(--text-secondary, #495057);
}
.bhe-btn-ghost:hover { background: var(--bg-hover, #e9ecef); }
.bhe-btn-sm {
    padding: 5px 12px;
    font-size: 0.8rem;
    background: var(--bg-tertiary, #f1f3f5);
    color: var(--text-secondary, #495057);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: var(--radius-sm, 6px);
}
.bhe-btn-sm:hover { background: var(--bg-hover, #e9ecef); }

/* Colour palette */
.bhe-palette {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 4px;
}
.bhe-swatch {
    aspect-ratio: 1;
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    position: relative;
    border: 1.5px solid rgba(0,0,0,0.08);
    overflow: hidden;
    transition: transform 0.15s;
}
.bhe-swatch:hover { transform: scale(1.06); }
.bhe-swatch-label {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,0.55);
    color: #fff;
    font-size: 0.65rem;
    text-align: center;
    padding: 2px 4px;
    font-family: monospace;
    opacity: 0;
    transition: opacity 0.15s;
}
.bhe-swatch:hover .bhe-swatch-label { opacity: 1; }

/* Footer */
.bhe-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-top: 1px solid var(--border-light, #e9ecef);
    flex-shrink: 0;
    gap: 10px;
}

/* Toast */
.bhe-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: #1a1a2e;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 20px;
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    z-index: 10001;
    pointer-events: none;
    white-space: nowrap;
}
.bhe-toast-show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* Responsive */
@media (max-width: 600px) {
    .bhe-dialog { width: 100vw; max-height: 100dvh; border-radius: 0; }
    .bhe-canvas-wrap { max-height: 200px; }
    #bhe-canvas { max-height: 200px; }
    .bhe-palette { grid-template-columns: repeat(4, 1fr); }
    .bhe-wh-wrap { flex-wrap: wrap; }
    .bhe-num { width: 70px; }
}
        `;
        document.head.appendChild(s);
    }

    // Expose globally
    global.BHImageEditor = BHImageEditor;

})(window);
