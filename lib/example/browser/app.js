"use strict";
var xstream_1 = require('xstream');
var dom_1 = require('@cycle/dom');
function transformTodoStream(inStream) {
    return inStream.map(function (state) {
        var rows = [];
        var count = 1;
        for (var key in state) {
            var row = state[key];
            if (!state[key] || typeof row === 'object')
                continue;
            var c = count++;
            // might want to convert to json here...
            rows.push({ id: c, key: key, val: row });
        }
        var headings = Object.keys(rows[0]);
        return {
            headings: headings,
            rows: rows
        };
    });
}
function tbodyElems(tableData) {
    var headings = tableData.headings, rows = tableData.rows;
    // generator rows based on headers
    return rows.map(function (row) {
        // generate data items within each row
        var tdElems = headings.map(function (heading) {
            //console.log(heading)
            return dom_1.td({ attrs: { class: 'mdl-data-table__cell--non-numeric' } }, row[heading]);
        });
        return dom_1.tr({ attrs: { class: '' } }, tdElems);
    });
}
function tableElem(state) {
    //console.log(state);
    return dom_1.table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state));
}
function app(sources) {
    var DOM = sources.DOM, gun = sources.gun;
    var gunTodos$ = gun.get(function (gunInstance) {
        return gunInstance.get('example/todo/data');
    });
    // We are removing nulls, keys that 
    var gunTable$ = transformTodoStream(gunTodos$);
    function vtree(stateStream) {
        return stateStream.map(function (state) {
            var headings = state.headings, rows = state.rows;
            console.log(state);
            return dom_1.div({ attrs: { class: '' } }, [
                dom_1.header({ attrs: { class: '' } }, [
                    dom_1.div({ attrs: { class: '' } }, [
                        dom_1.div("what the fuck"),
                        dom_1.span({ attrs: { class: '' } }, 'Example Todo')
                    ])
                ]),
                // div(rows.map((row) => {return tr(row.val)}))
                dom_1.table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state))
            ]);
        });
    }
    var gunEvents$ = xstream_1.default.never();
    var vtree$ = vtree(gunTable$);
    console.log(vtree$);
    var sinks = {
        gun: gunEvents$,
        DOM: vtree$
    };
    return sinks;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = app;
//# sourceMappingURL=app.js.map