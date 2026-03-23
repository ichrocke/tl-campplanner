/* ========================================
   MapTiles – Dynamische Kartenkacheln
   ======================================== */

const MapTiles = (() => {
    const TILE_SIZE = 256;
    const MAX_CACHE = 200;
    const _cache = new Map(); // "source/z/x/y" -> HTMLImageElement
    let _renderPending = false;

    // --- Tile math ---

    function lngToTileX(lng, z) {
        return Math.floor((lng + 180) / 360 * Math.pow(2, z));
    }

    function latToTileY(lat, z) {
        const rad = lat * Math.PI / 180;
        return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z));
    }

    function tileXToLng(x, z) {
        return x / Math.pow(2, z) * 360 - 180;
    }

    function tileYToLat(y, z) {
        const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
        return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    function metersPerPixel(lat, z) {
        return 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
    }

    // --- Coordinate conversions (lat/lng <-> world meters relative to anchor) ---

    function lngToWorldX(lng, anchor) {
        return anchor.worldX + (lng - anchor.lng) * 111320 * Math.cos(anchor.lat * Math.PI / 180);
    }

    function latToWorldY(lat, anchor) {
        return anchor.worldY - (lat - anchor.lat) * 110540;
    }

    function worldXToLng(wx, anchor) {
        return anchor.lng + (wx - anchor.worldX) / (111320 * Math.cos(anchor.lat * Math.PI / 180));
    }

    function worldYToLat(wy, anchor) {
        return anchor.lat - (wy - anchor.worldY) / 110540;
    }

    // --- Tile URL ---

    function tileUrl(source, z, x, y) {
        if (source === 'satellite') {
            return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
        }
        // Use cartodb/carto positron basemap (OSM data, no restrictive tile policy)
        if (source === 'osmLight') {
            return 'https://a.basemaps.cartocdn.com/light_all/' + z + '/' + x + '/' + y + '.png';
        }
        // Default: OpenStreetMap via cartodb/carto voyager (full color, OSM-based)
        return 'https://a.basemaps.cartocdn.com/rastertiles/voyager/' + z + '/' + x + '/' + y + '.png';
    }

    // --- Cache ---

    function getTile(source, z, x, y) {
        const key = source + '/' + z + '/' + x + '/' + y;
        if (_cache.has(key)) return _cache.get(key);

        // Evict oldest if at limit
        if (_cache.size >= MAX_CACHE) {
            const first = _cache.keys().next().value;
            _cache.delete(first);
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img._loaded = false;
        img._error = false;
        img.onload = () => {
            img._loaded = true;
            scheduleRender();
        };
        img.onerror = () => { img._error = true; };
        img.src = tileUrl(source, z, x, y);
        _cache.set(key, img);
        return img;
    }

    function scheduleRender() {
        if (_renderPending) return;
        _renderPending = true;
        requestAnimationFrame(() => {
            _renderPending = false;
            if (typeof Canvas !== 'undefined') Canvas.render();
        });
    }

    // --- Choose best zoom level ---

    function bestZoom(lat, worldPixelSize) {
        // worldPixelSize = meters per screen pixel = 1 / (PPM * siteZoom)
        // Find highest z where tile resolution covers at least 1 screen pixel
        // (metersPerPixel >= worldPixelSize means tile isn't wasting bandwidth)
        // When zoomed in beyond max tile detail, use z=19 (best available)
        for (let z = 19; z >= 1; z--) {
            if (metersPerPixel(lat, z) >= worldPixelSize) return z;
        }
        return 1;
    }

    // --- Draw map tiles onto canvas ---

    function drawMapTiles(ctx, canvasEl, site, w2s, s2w, zoomFn) {
        const ml = site.mapLayer;
        if (!ml || !ml.enabled || ml.lat == null || ml.lng == null) return;

        const anchor = {
            lat: ml.lat,
            lng: ml.lng,
            worldX: ml.anchorWorldX || 0,
            worldY: ml.anchorWorldY || 0,
        };

        const source = ml.source || 'osm';
        const opacity = ml.opacity != null ? ml.opacity : 0.5;
        const rotDeg = ml.rotation || 0;
        const rotRad = rotDeg * Math.PI / 180;

        // Current scale: meters per screen pixel
        const PPM = 30;
        const siteZoom = site.view.zoom || 1;
        const mPerScreenPx = 1 / (PPM * siteZoom);

        // Anchor point in screen coords (rotation pivot)
        const anchorScreen = w2s(anchor.worldX, anchor.worldY);

        // When map is rotated, we need to cover a larger area.
        // Calculate the visible world bounds with extra margin for rotation.
        const cw = canvasEl.width;
        const ch = canvasEl.height;
        // Diagonal of canvas = max extent needed
        const diag = Math.sqrt(cw * cw + ch * ch);
        const cx = cw / 2;
        const cy = ch / 2;
        const topLeft = s2w(cx - diag / 2, cy - diag / 2);
        const bottomRight = s2w(cx + diag / 2, cy + diag / 2);

        // Unrotate the visible bounds to get lat/lng in map-north space
        function unrotateWorld(wx, wy) {
            const dx = wx - anchor.worldX;
            const dy = wy - anchor.worldY;
            const cos = Math.cos(-rotRad);
            const sin = Math.sin(-rotRad);
            return {
                x: anchor.worldX + dx * cos - dy * sin,
                y: anchor.worldY + dx * sin + dy * cos,
            };
        }

        // Get corners of the visible area in unrotated (north-up) world space
        const corners = [
            unrotateWorld(topLeft.x, topLeft.y),
            unrotateWorld(bottomRight.x, topLeft.y),
            unrotateWorld(topLeft.x, bottomRight.y),
            unrotateWorld(bottomRight.x, bottomRight.y),
        ];
        let minWx = Infinity, maxWx = -Infinity, minWy = Infinity, maxWy = -Infinity;
        corners.forEach(c => {
            minWx = Math.min(minWx, c.x); maxWx = Math.max(maxWx, c.x);
            minWy = Math.min(minWy, c.y); maxWy = Math.max(maxWy, c.y);
        });

        // Convert to lat/lng
        const nwLat = worldYToLat(minWy, anchor);
        const nwLng = worldXToLng(minWx, anchor);
        const seLat = worldYToLat(maxWy, anchor);
        const seLng = worldXToLng(maxWx, anchor);

        // Best tile zoom, reduce if too many tiles would be needed
        let z = Math.min(19, Math.max(1, bestZoom(anchor.lat, mPerScreenPx)));
        let txMin, txMax, tyMin, tyMax;
        for (; z >= 1; z--) {
            txMin = lngToTileX(Math.min(nwLng, seLng), z);
            txMax = lngToTileX(Math.max(nwLng, seLng), z);
            tyMin = latToTileY(Math.max(nwLat, seLat), z);
            tyMax = latToTileY(Math.min(nwLat, seLat), z);
            if ((txMax - txMin + 1) * (tyMax - tyMin + 1) <= 150) break;
        }
        if (z < 1) return;

        ctx.save();
        ctx.globalAlpha = opacity;

        // Rotate the entire tile layer around the anchor screen point
        if (rotDeg !== 0) {
            ctx.translate(anchorScreen.x, anchorScreen.y);
            ctx.rotate(rotRad);
            ctx.translate(-anchorScreen.x, -anchorScreen.y);
        }

        for (let tx = txMin; tx <= txMax; tx++) {
            for (let ty = tyMin; ty <= tyMax; ty++) {
                const tile = getTile(source, z, tx, ty);
                if (!tile._loaded) continue;

                // Tile's NW corner in lat/lng
                const tileLng = tileXToLng(tx, z);
                const tileLat = tileYToLat(ty, z);
                // Tile's SE corner
                const tileLng2 = tileXToLng(tx + 1, z);
                const tileLat2 = tileYToLat(ty + 1, z);

                // Convert to world coords
                const wx1 = lngToWorldX(tileLng, anchor);
                const wy1 = latToWorldY(tileLat, anchor);
                const wx2 = lngToWorldX(tileLng2, anchor);
                const wy2 = latToWorldY(tileLat2, anchor);

                // Convert to screen coords
                const s1 = w2s(wx1, wy1);
                const s2 = w2s(wx2, wy2);

                const sw = s2.x - s1.x;
                const sh = s2.y - s1.y;

                try {
                    ctx.drawImage(tile, s1.x, s1.y, sw, sh);
                } catch (e) { /* ignore draw errors */ }
            }
        }

        ctx.restore();
    }

    function clearCache() {
        _cache.clear();
    }

    return {
        drawMapTiles,
        clearCache,
    };
})();
