"use strict";
var xstream_1 = require('xstream');
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
    return rows.map(function (row) {
        var tdElems = headings.map(function (heading) {
            return dom_1.td({ attrs: { class: 'mdl-data-table__cell--non-numeric' } }, row[heading]);
        });
        return dom_1.tr({ attrs: { class: '' } }, tdElems);
    });
}
function app(sources) {
    var DOM = sources.DOM, gun = sources.gun;
    function intent(D) {
        // clear
        var clearButtonClick$ = D.select('#clear').events('click');
        // save
        var saveButtonClick$ = D.select('#save-task').events('click');
        // return - save
        var keydownEvent$ = D.select('#text-newtask').events('keypress')
            .filter(function (event) { return event.keyCode === 13; })
            .map(function (event) {
            event = event || window.event; // get window.event if e argument missing (in IE)
            event.preventDefault();
            return {};
        });
        // text value
        var textEvent$ = D.select('#text-newtask').events('input')
            .map(function (ev) { return ev.target.value; })
            .startWith('')
            .map(function (event) {
            return { typeKey: 'text-content', payload: event };
        });
        var clickOrEnter$ = xstream_1.default.merge(saveButtonClick$, keydownEvent$);
        var outgun$ = clickOrEnter$.compose(sampleCombine_1.default(textEvent$)).map(function (_a) {
            var click = _a[0], event = _a[1];
            return { typeKey: 'out-gun', payload: event.payload };
        });
        var clearEvents$ = xstream_1.default.merge(clearButtonClick$, saveButtonClick$, keydownEvent$)
            .map(function (event) {
            return { typeKey: 'text-clear', payload: null };
        });
        return {
            textEvent$: textEvent$,
            clearEvents$: clearEvents$,
            outgun$: outgun$
        };
        // return xs.merge(outgun$)
    }
    var gunTodos$ = gun.get(function (gunInstance) {
        return gunInstance.get('example/todo/data');
    });
    // We are removing nulls, keys that
    var gunTable$ = transformTodoStream(gunTodos$);
    function vtree(gunStream, textStream) {
        return xstream_1.default.combine(gunStream, textStream).map(function (_a) {
            ////////////////////////////////
            var gun = _a[0], text = _a[1];
            console.log(gun);
            return dom_1.div('pure-g', [
                dom_1.div('', [
                    dom_1.header(''),
                    dom_1.main('.content', [
                        dom_1.div('', [
                            dom_1.section('', [
                                dom_1.div('', [
                                    dom_1.div('', [
                                        dom_1.h4("Add new task"),
                                        dom_1.form('.pure-form', [
                                            dom_1.fieldset('', [
                                                // div(text),
                                                dom_1.input({
                                                    attrs: {
                                                        class: '',
                                                        type: 'text',
                                                        id: 'text-newtask',
                                                        autocomplete: 'off'
                                                    },
                                                    hook: {
                                                        update: function (o, n) { return n.elm.value = text; }
                                                    }
                                                }),
                                            ])
                                        ]),
                                        dom_1.button('#save-task.pure-button.pure-button-primary', 'save'),
                                        dom_1.button('#clear.pure-button.pure-button-primary', 'clear')
                                    ]),
                                ])
                            ]),
                            dom_1.section('', [
                                dom_1.div('', [
                                    dom_1.table('.pure-table.example-table', tbodyElems(gun))
                                ])
                            ])
                        ]),
                    ])
                ])
            ]);
            //////////////////////////////
        });
    }
    var events = intent(DOM);
    var blendedEvents$ = xstream_1.default.merge(events.textEvent$, events.clearEvents$);
    function model(event$) {
        var clearTransformer$ = event$.filter(function (event) { return event.typeKey === 'text-clear'; })
            .map(function (event) {
            return function (acc) {
                acc = '';
                return acc;
            };
        });
        var textTransformer$ = event$.filter(function (event) { return event.typeKey === 'text-content'; })
            .map(function (event) {
            return function (acc) {
                acc = event.payload;
                return acc;
            };
        });
        var transformSelector$ = xstream_1.default.merge(clearTransformer$, textTransformer$);
        var transformer = function (acc, trnsFn) { return trnsFn(acc); };
        return transformSelector$.fold(transformer, '');
    }
    var outgoingGunTodo$ = events.outgun$
        .filter(function (event) { return event.typeKey === 'out-gun'; })
        .map(function (event) {
        return function (gunInstance) {
            return gunInstance.get('example/todo/data').path(uuid()).put(event.payload);
        };
    });
    var text$ = model(blendedEvents$);
    var vtree$ = vtree(gunTable$, text$);
    var sinks = {
        gun: outgoingGunTodo$,
        DOM: vtree$
    };
    return sinks;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = app;
//# sourceMappingURL=app.js.map