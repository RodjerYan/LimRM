
import L from 'leaflet';

export const createActiveCanvasLayer = (
    map: L.Map, 
    paneName: string, 
    scheduleRedraw: () => void
) => {
    const ActiveCanvasLayer = (L.Layer as any).extend({
        onAdd: function(map: L.Map) {
            this._map = map;
            this._canvas = L.DomUtil.create('canvas', 'leaflet-active-canvas-layer') as HTMLCanvasElement;
            
            // IMPORTANT: canvas in separate pane (below interactive markers)
            const pane = map.getPane(paneName)!;
            pane.appendChild(this._canvas);
        
            // Ensure canvas moves with the pane but doesn't block interactions
            this._canvas.style.position = 'absolute';
            this._canvas.style.top = '0';
            this._canvas.style.left = '0';
            this._canvas.style.pointerEvents = 'none';
            this._canvas.style.transformOrigin = '0 0';

            this._reset();
            
            // Bind events
            map.on('move', this._reset, this);
            map.on('zoom', this._reset, this);
            map.on('resize', this._reset, this);
            
            // CRITICAL: Handle zoom animation to prevent "flying" markers
            map.on('zoomanim', this._onZoomAnim, this);
        },
        onRemove: function(map: L.Map) {
            const pane = map.getPane(paneName)!;
            if (this._canvas && pane.contains(this._canvas)) pane.removeChild(this._canvas);
            
            map.off('move', this._reset, this);
            map.off('zoom', this._reset, this);
            map.off('resize', this._reset, this);
            map.off('zoomanim', this._onZoomAnim, this);
        },
        getCanvas: function() { return this._canvas; },
        _reset: function() {
            const map = this._map as L.Map;
            const size = map.getSize();
            const dpr = window.devicePixelRatio || 1;

            // Set actual buffer size (for sharpness)
            this._canvas.width = Math.floor(size.x * dpr);
            this._canvas.height = Math.floor(size.y * dpr);

            // Set CSS size (for layout)
            this._canvas.style.width = `${size.x}px`;
            this._canvas.style.height = `${size.y}px`;

            // Reset transforms after animation
            this._canvas.style.transform = '';

            // Position canvas correctly relative to the map pane
            const pos = (map as any)._getMapPanePos();
            L.DomUtil.setPosition(this._canvas, L.point(-pos.x, -pos.y));
        
            // Trigger Redraw
            scheduleRedraw();
        },
        _onZoomAnim: function(e: any) {
            const map = this._map as any;
            const scale = map.getZoomScale(e.zoom);
            // Calculate offset to keeping layer aligned during zoom
            const offset = map._latLngToNewLayerPoint(map.getBounds().getNorthWest(), e.zoom, e.center);

            // Apply transform to match Leaflet's zoom animation
            L.DomUtil.setTransform(this._canvas, offset, scale);
        }
    });

    return new ActiveCanvasLayer();
};