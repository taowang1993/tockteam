import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createRoot } from 'react-dom/client';
import { Button } from '@tockteam/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@tockteam/ui/dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
const MAX_IMAGE_DATA_URL_LENGTH = 90_000_000;
const SAFE_RASTER_DATA_URL = /^data:image\/(avif|bmp|gif|jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/iu;
const EMPTY_PROXY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;
const PAN_STEP = 80;
export function safeRasterImageDataUrl(value) {
    if (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_URL_LENGTH || value === EMPTY_PROXY_IMAGE)
        return null;
    const match = SAFE_RASTER_DATA_URL.exec(value);
    if (match === null)
        return null;
    const base64 = match[2];
    const padding = base64.match(/=+$/u)?.[0].length ?? 0;
    const remainder = (base64.length - padding) % 4;
    if (padding === 0 ? remainder === 1 : padding === 1 ? remainder !== 3 : remainder !== 2)
        return null;
    return value;
}
function clampedZoom(value) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)); }
export function ImageViewerAction(props) {
    const src = safeRasterImageDataUrl(props.image.src);
    if (src === null)
        return null;
    return (_jsx(Button, { className: "mx-2 my-1 align-middle", onClick: event => {
            event.stopPropagation();
            props.onView({ src, alt: props.image.alt }, event.currentTarget);
        }, onMouseDown: event => { event.stopPropagation(); }, onKeyDown: event => { event.stopPropagation(); }, size: "sm", type: "button", variant: "outline", children: "View Image" }));
}
export function ImageViewerDialog(props) {
    const src = safeRasterImageDataUrl(props.image?.src);
    const image = props.image !== null && src !== null ? { ...props.image, src } : null;
    const label = image?.alt.trim() || 'Image';
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [broken, setBroken] = useState(false);
    const panned = useRef(false);
    const drag = useRef(null);
    useEffect(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setBroken(false);
        drag.current = null;
    }, [image?.src]);
    const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
    const zoomBy = (factor) => { setZoom(current => clampedZoom(current * factor)); };
    const startPan = (event) => {
        if (event.button !== 0)
            return;
        panned.current = false;
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: offset.x, y: offset.y };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const movePan = (event) => {
        const active = drag.current;
        if (active === null || active.pointerId !== event.pointerId)
            return;
        if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 3)
            panned.current = true;
        setOffset({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY });
    };
    const stopPan = (event) => {
        if (drag.current?.pointerId !== event.pointerId)
            return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture?.(event.pointerId);
    };
    // Keep media and controls in separate rows over a uniformly dimmed app.
    return (_jsx(Dialog, { open: image !== null, onOpenChange: open => { if (!open)
            props.onClose(); }, children: _jsxs(DialogContent, { className: "fixed inset-0 z-[2147483647] box-border flex flex-col gap-3 overflow-hidden p-4 pt-[calc(var(--tockteam-titlebar-height,0px)+12px)] text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [-webkit-app-region:no-drag]", "data-tocktutor-image-viewer": "", overlayClassName: "z-[2147483646] !bg-[color-mix(in_srgb,var(--dsw-alias-bg-base)_80%,transparent)]", showCloseButton: false, unstyled: true, onClick: event => { if (event.target === event.currentTarget && !panned.current)
                props.onClose(); }, onPointerDownCapture: event => { if (event.button === 0)
                panned.current = false; }, onOpenAutoFocus: event => {
                if (event.target instanceof HTMLElement) {
                    event.preventDefault();
                    event.target.focus({ preventScroll: true });
                }
            }, onCloseAutoFocus: event => {
                const trigger = props.returnFocusRef?.current;
                if (trigger?.isConnected) {
                    event.preventDefault();
                    trigger.focus();
                }
            }, onKeyDown: event => {
                if (event.altKey || event.ctrlKey || event.metaKey)
                    return;
                if (event.key === '+' || event.key === '=') {
                    event.preventDefault();
                    zoomBy(1 + ZOOM_STEP);
                }
                else if (event.key === '-' || event.key === '_') {
                    event.preventDefault();
                    zoomBy(1 / (1 + ZOOM_STEP));
                }
                else if (event.key === '0') {
                    event.preventDefault();
                    reset();
                }
                else if (event.key.startsWith('Arrow')) {
                    const directions = { ArrowLeft: [-PAN_STEP, 0], ArrowRight: [PAN_STEP, 0], ArrowUp: [0, -PAN_STEP], ArrowDown: [0, PAN_STEP] };
                    const delta = directions[event.key];
                    if (delta) {
                        event.preventDefault();
                        setOffset(current => ({ x: current.x + delta[0], y: current.y + delta[1] }));
                    }
                }
            }, onWheelCapture: event => {
                if (event.ctrlKey || event.metaKey)
                    return;
                // Radix owns modal scroll locking; React wheel listeners are passive.
                event.stopPropagation();
                zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
            }, children: [_jsx(DialogDescription, { className: "sr-only", children: "Use plus and minus keys or the mouse wheel to zoom. Drag or use arrow keys to pan. Press zero to fit the image and Escape to close." }), _jsxs("div", { className: "flex h-10 shrink-0 items-center gap-4", "data-slot": "image-viewer-header", children: [_jsx(DialogTitle, { className: "m-0 min-w-0 flex-1 truncate text-sm", children: label }), _jsxs(Button, { "aria-label": "Close", className: "transition-none", onClick: props.onClose, size: "lg", type: "button", variant: "outline", children: [_jsx(X, { "aria-hidden": "true", "data-icon": "inline-start" }), "Close"] })] }), _jsx("div", { "aria-label": "Image Viewport", className: "flex min-h-0 min-w-0 flex-1 cursor-grab items-center justify-center overflow-hidden touch-none active:cursor-grabbing", onClick: event => { if (event.target === event.currentTarget && !panned.current)
                        props.onClose(); }, onPointerCancel: stopPan, onPointerDown: startPan, onPointerMove: movePan, onPointerUp: stopPan, children: image !== null && (broken
                        ? _jsx("div", { "aria-label": label, className: "p-8 text-center", role: "img", children: "Image Preview Is Unavailable" })
                        : _jsx("img", { alt: image.alt || label, className: "box-border m-0 block h-auto w-auto max-h-full max-w-full select-none object-contain p-2", "data-offset-x": offset.x, "data-offset-y": offset.y, "data-zoom": zoom, draggable: false, onError: () => { setBroken(true); }, onLoad: () => { setBroken(false); }, src: image.src, style: { transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transformOrigin: 'center center' } })) }), _jsxs("span", { "aria-live": "polite", className: "sr-only", children: [String(Math.round(zoom * 100)), "%"] })] }) }));
}
export function ImageViewerButton(props) {
    const [image, setImage] = useState(null);
    const triggerRef = useRef(null);
    return _jsxs(_Fragment, { children: [_jsx(ImageViewerAction, { image: props.image, onView: (value, trigger) => { triggerRef.current = trigger; setImage(value); } }), _jsx(ImageViewerDialog, { image: image, onClose: () => { setImage(null); }, returnFocusRef: triggerRef })] });
}
export function mountImageViewerButton(container, image) {
    const root = createRoot(container);
    root.render(_jsx(ImageViewerButton, { image: image }));
    return () => { root.unmount(); };
}
export function mountImageViewerAction(container, image, onView) {
    const root = createRoot(container);
    root.render(_jsx(ImageViewerAction, { image: image, onView: onView }));
    return () => { root.unmount(); };
}
//# sourceMappingURL=image-viewer.js.map