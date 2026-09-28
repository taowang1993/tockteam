import { notesBaseValueText } from "./NotesBaseFormulaValue.js";
import { MAX_EXECUTABLE_BASE_SEARCH_LENGTH } from "./base-parser.js";
import { queryExecutableBaseView, } from "./base-query.js";
export function selectExecutableBaseView(document, name) {
    const wanted = name?.trim().toLocaleLowerCase();
    return document.views.find(view => view.name.trim().toLocaleLowerCase() === wanted) ?? document.views[0];
}
function viewKind(view) {
    return view.type === 'map' ? 'map-label' : view.type;
}
function inputType(value) {
    if (typeof value === 'boolean')
        return 'checkbox';
    if (typeof value === 'number' && Number.isFinite(value))
        return 'number';
    if (typeof value !== 'string')
        return null;
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? 'date' : 'text';
}
function editableProperty(column, value) {
    return /^note\.[A-Za-z_][\w-]*$/u.test(column) && inputType(value) !== null;
}
export function parseExecutableBaseCoordinates(value) {
    let latitude;
    let longitude;
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        latitude = value[0];
        longitude = value[1];
    }
    else if (typeof value === 'string') {
        const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/u.exec(value);
        if (match === null)
            return null;
        latitude = Number(match[1]);
        longitude = Number(match[2]);
    }
    else
        return null;
    return Number.isFinite(latitude) && Number.isFinite(longitude)
        && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
        ? { latitude, longitude }
        : null;
}
function modelRows(document, view, query) {
    const columns = view.order.length > 0 ? view.order : ['file.name'];
    return query.rows.map(row => ({
        cells: Object.freeze(columns.map(column => {
            const value = row.values[column];
            return Object.freeze({
                column,
                editable: editableProperty(column, value),
                inputType: editableProperty(column, value) ? inputType(value) : null,
                label: document.properties[column] ?? (column === 'file.name' ? 'File Name' : column),
                text: notesBaseValueText(value),
                value,
            });
        })),
        coordinates: view.coordinates === null ? null : parseExecutableBaseCoordinates(row.values[view.coordinates]),
        path: row.file.path,
        revision: row.file.revision,
        source: row.file.source,
    }));
}
/** Build one layout-neutral model. Search is applied after filter/sort/limit and drives rows and summaries together. */
export function createBaseViewModel(document, files, selectedView, search = '', baseFile) {
    if (search.length > MAX_EXECUTABLE_BASE_SEARCH_LENGTH)
        return { reason: 'Base view search exceeds its limit.', status: 'unsupported' };
    const view = selectExecutableBaseView(document, selectedView);
    const query = queryExecutableBaseView(document, view, files, baseFile, search.trim().toLocaleLowerCase());
    const columns = view.order.length > 0 ? view.order : ['file.name'];
    return {
        columns: Object.freeze(columns.map(key => Object.freeze({ key, label: document.properties[key] ?? (key === 'file.name' ? 'File Name' : key) }))),
        kind: viewKind(view),
        rows: Object.freeze(modelRows(document, view, query).map(row => Object.freeze(row))),
        search,
        status: 'ready',
        summaries: query.summaries,
        unsupported: query.unsupported,
        view,
        views: Object.freeze(document.views.map(candidate => Object.freeze({ kind: viewKind(candidate), name: candidate.name }))),
    };
}
//# sourceMappingURL=base-view-model.js.map