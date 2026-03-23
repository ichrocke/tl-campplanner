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
        return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
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
        // We want metersPerPixel(lat, z) close to worldPixelSize
        for (let z = 20; z >= 1; z--) {
            if (metersPerPixel(lat, z) <= worldPixelSize) return z;
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

        // Current scale: meters per screen pixel
        const PPM = 30;
        const siteZoom = site.view.zoom || 1;
        const mPerScreenPx = 1 / (PPM * siteZoom);

        // Best tile zoom
        const z = Math.min(19, Math.max(1, bestZoom(anchor.lat, mPerScreenPx)));

        // Visible world bounds
        const topLeft = s2w(0, 0);
        const bottomRight = s2w(canvasEl.width, canvasEl.height);

        // Convert to lat/lng
        const nwLat = worldYToLat(topLeft.y, anchor);
        const nwLng = worldXToLng(topLeft.x, anchor);
        const seLat = worldYToLat(bottomRight.y, anchor);
        const seLng = worldXToLng(bottomRight.x, anchor);

        // Tile range
        const txMin = lngToTileX(Math.min(nwLng, seLng), z);
        const txMax = lngToTileX(Math.max(nwLng, seLng), z);
        const tyMin = latToTileY(Math.max(nwLat, seLat), z); // higher lat = lower tile Y
        const tyMax = latToTileY(Math.min(nwLat, seLat), z);

        // Limit number of tiles to prevent overload
        if ((txMax - txMin + 1) * (tyMax - tyMin + 1) > 200) return;

        ctx.save();
        ctx.globalAlpha = opacity;

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

    // --- Geocoding via Nominatim ---

    async function searchLocation(query) {
        const url = 'https://nominatim.openstreetmap.org/search?q=' +
            encodeURIComponent(query) + '&format=json&limit=5&accept-language=de';
        const resp = await fetch(url);
        if (!resp.ok) return [];
        return await resp.json();
    }

    function clearCache() {
        _cache.clear();
    }

    return {
        drawMapTiles,
        searchLocation,
        clearCache,
    };
})();
