"use strict";
var sampleCombine_1 = require('xstream/extra/sampleCombine');
var uuid = require('../../../node_modules/uuid-random/uuid-random.min.js');
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
// function tableElem(state) {
//     //console.log(state);
//     return table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state));
// }
function app(sources) {
    var DOM = sources.DOM, gun = sources.gun;
    function intent(D) {
        var click$ = D.select('#save-task').events('click');
        var text$ = D.select('#text-newtask').events('input')
            .map(function (ev) { return ev.target.value; })
            .startWith('');
        return click$.compose(sampleCombine_1.default(text$)).map(function (_a) {
            var click = _a[0], text = _a[1];
            return { typeKey: 'out-gun', payload: text };
        }).debug('click');
    }
    var gunTodos$ = gun.get(function (gunInstance) {
        return gunInstance.get('example/todo/data');
    });
    // We are removing nulls, keys that 
    var gunTable$ = transformTodoStream(gunTodos$);
    function vtree(stateStream) {
        return stateStream.map(function (state) {
            var headings = state.headings, rows = state.rows;
            console.log(state);
            return dom_1.main('.mdl-layout__container', [
                dom_1.div('.mdl-layout--fixed-header', [
                    dom_1.section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                        dom_1.header('.mdl-layout__header', [
                            dom_1.div('.mdl-layout__header-row', [
                                dom_1.span('.mdl-layout__title', 'Example Todo')
                            ])
                        ])
                    ]),
                ]),
                dom_1.section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                    dom_1.div('.mdl-card.mdl-cell.mdl-cell--6-col', [
                        // div('.example__horizontal-form', [
                        // div('', [
                        // form('', [
                        dom_1.div('.mdl-card__supporting-text', [
                            dom_1.h4("Add new task"),
                            dom_1.form('', [
                                dom_1.div('.mdl-textfield', [
                                    dom_1.input({ attrs: { class: 'mdl-textfield__input', type: 'text', id: 'text-newtask', placeholder: 'Enter task' } }),
                                ])
                            ]),
                            dom_1.button('#save-task.mdl-button.mdl-button--raised mdl-button--colored', 'save')
                        ]),
                    ])
                ]),
                dom_1.section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                    dom_1.div('.mdl-card.mdl-cell.mdl-cell--6-col', [
                        dom_1.table('.mdl-data-table', tbodyElems(state))
                    ])
                ])
            ]);
        });
    }
    var intent$ = intent(DOM);
    var outgoingGunTodo$ = intent$
        .filter(function (event) { return event.typeKey === 'out-gun'; })
        .map(function (event) {
        return function (gunInstance) {
            return gunInstance.get('example/todo/data').path(uuid()).put(event.payload);
        };
    });
    var vtree$ = vtree(gunTable$);
    //console.log(vtree$)
    var sinks = {
        gun: outgoingGunTodo$,
        DOM: vtree$
    };
    return sinks;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = app;
//# sourceMappingURL=app.js.map