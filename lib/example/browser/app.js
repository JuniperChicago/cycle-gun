"use strict";
var xstream_1 = require('xstream');
var sampleCombine_1 = require('xstream/extra/sampleCombine');
var uuid = require('../../../node_modules/uuid-random/uuid-random.min.js');
var dom_1 = require('@cycle/dom');
/**
 * Transforms gun store object into object containing headers and rows
 *
 * @param {any} inStream
 * @returns
 */
function transformTodoStream(inStream) {
    return inStream.map(function (state) {
        var rows = [];
        var headings = [];
        var count = 1;
        for (var key in state) {
            var row = state[key];
            if (!state[key] || typeof row === 'object')
                continue;
            var c = count++;
            // might want to convert to json here...
            rows.push({ key: key, val: row });
        }
        if (rows.length > 0) {
            headings = Object.keys(rows[0]);
            headings.push('X');
        }
        return {
            headings: headings,
            rows: rows
        };
    });
}
function theadElems(tableData) {
    var headings = tableData.headings;
    var thElems = headings
        .filter(function (heading) { return heading !== 'key'; }) // skippings the key
        .map(function (heading) {
        if (heading === 'X') {
            return dom_1.th('.th-delete', 'X');
        }
        else {
            return dom_1.th('', heading);
        }
    });
    return dom_1.tr('', thElems);
}
/**
 * build table body elements
 *
 * @param {any} tableData
 * @returns
 */
function tbodyElems(tableData) {
    var headings = tableData.headings, rows = tableData.rows;
    return rows.map(function (row) {
        var tdElems = headings
            .filter(function (heading) { return heading !== 'key'; }) // skipping the key
            .map(function (heading) {
            if (heading === 'X') {
                //console.log(row.key)
                return dom_1.td('.delete', [dom_1.button({ attrs: { class: 'button-remove', 'data-key': row.key } }, 'X')]);
            }
            else {
                return dom_1.td('', row[heading]);
            }
        });
        return dom_1.tr('', tdElems);
    });
}
function app(sources) {
    function intent(DOM) {
        // clear
        var clearButtonClick$ = DOM.select('#clear').events('click');
        // remove task
        var removeButtonClick$ = DOM.select('.button-remove').events('click');
        // save task
        var saveButtonClick$ = DOM.select('#save-task').events('click');
        // return - save task
        var keydownEvent$ = DOM.select('#text-newtask').events('keypress')
            .filter(function (event) { return event.keyCode === 13; })
            .map(function (event) {
            event = event || window.event; // get window.event if e argument missing (in IE)
            event.preventDefault();
            return {};
        });
        // input text value
        var textEvent$ = DOM.select('#text-newtask').events('input')
            .map(function (ev) { return ev.target.value; })
            .startWith('')
            .map(function (event) { return ({ typeKey: 'text-content', payload: event }); });
        // merge task save events
        var saveClickOrEnter$ = xstream_1.default.merge(saveButtonClick$, keydownEvent$);
        // transform remove task message and payload
        var outgunRemoveTask$ = removeButtonClick$
            .map(function (event) {
            var key = event.target.getAttribute('data-key');
            return { typeKey: 'out-gun', payload: { key: key, value: null } };
        });
        // transform add task message and payload  
        var outgunAddTask$ = saveClickOrEnter$
            .compose(sampleCombine_1.default(textEvent$))
            .map(function (_a) {
            var click = _a[0], event = _a[1];
            return ({ typeKey: 'out-gun', payload: { key: uuid(), value: event.payload } });
        });
        // transform text clearing events into messages
        var textClearEvents$ = xstream_1.default.merge(clearButtonClick$, saveButtonClick$, keydownEvent$)
            .map(function (event) { return ({ typeKey: 'text-clear', payload: null }); });
        return {
            textEvent$: textEvent$,
            textClearEvents$: textClearEvents$,
            outgun$: xstream_1.default.merge(outgunAddTask$, outgunRemoveTask$)
        };
    }
    // utilizes a reducer type store
    // reducers are selected using streams and filters 
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
        // general transformer function
        var transformer = function (acc, trnsFn) { return trnsFn(acc); };
        return transformSelector$.fold(transformer, '');
    }
    function vtree(gunStream, textStream) {
        return xstream_1.default.combine(gunStream, textStream).map(function (_a) {
            ////////////////////////////////
            var gun = _a[0], text = _a[1];
            return dom_1.div('pure-g', [
                dom_1.div('', [
                    dom_1.main('.content', [
                        dom_1.section('.margin-top', [
                            dom_1.h2("Cycle-Gun Task List Example")
                        ]),
                        dom_1.section('', [
                            dom_1.form('.pure-form.pure-form-stacked', [
                                dom_1.fieldset('', [
                                    dom_1.label({ attrs: { for: 'text-newtask' } }, 'Add Task'),
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
                            dom_1.button('#save-task.pure-button.pure-button-primary.button-margin-right', 'save'),
                            dom_1.button('#clear.pure-button.pure-button-primary', 'clear')
                        ]),
                        dom_1.section('', [
                            dom_1.div('', [
                                dom_1.table('.pure-table.example-table', [
                                    dom_1.thead('', [theadElems(gun)]),
                                    dom_1.tbody(tbodyElems(gun))
                                ])
                            ])
                        ])
                    ])
                ])
            ]);
            //////////////////////////////
        });
    }
    var DOM = sources.DOM, gun = sources.gun;
    // Get streams from cycle-gun driver
    ///////////////////////////////////////////////////////////////////////////
    var gunTodos$ = gun.get(function (gunInstance) {
        return gunInstance.get('example/todo/data');
    });
    // We are removing nulls, keys that are meta, etc...
    var gunTable$ = transformTodoStream(gunTodos$);
    // intent() returns and object of streams
    var events = intent(DOM);
    var blendedTextEvents$ = xstream_1.default.merge(events.textEvent$, events.textClearEvents$);
    var outgoingGunTodo$ = events.outgun$
        .filter(function (event) { return event.typeKey === 'out-gun'; })
        .map(function (event) {
        var _a = event.payload, key = _a.key, value = _a.value;
        // return function that directly interacts with the gun instance
        return function (gunInstance) {
            // gun.js api here
            return gunInstance.get('example/todo/data').path(key).put(value);
        };
    });
    var textState$ = model(blendedTextEvents$);
    var vtree$ = vtree(gunTable$, textState$);
    var sinks = {
        gun: outgoingGunTodo$,
        DOM: vtree$
    };
    return sinks;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = app;
//# sourceMappingURL=app.js.map