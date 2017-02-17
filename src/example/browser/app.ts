import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine'
import * as uuid from '../../../node_modules/uuid-random/uuid-random.min.js';
import {
    legend,
    div,
    table,
    td,
    tr,
    th,
    thead,
    tbody,
    header,
    span,
    form,
    input,
    label,
    button,
    section,
    main,
    h2,
    h3,
    h4,
    fieldset

} from '@cycle/dom';

function transformTodoStream(inStream) {
    return inStream.map((state) => {
        let rows = [];
        let headings = [];
        let count = 1;
        for (let key in state) {
            let row = state[key];
            if (!state[key] || typeof row === 'object') continue;
            let c = count++
            // might want to convert to json here...
            rows.push({ key, val: row })
        }


        if (rows.length > 0) {
            headings = Object.keys(rows[0])
            headings.push('X')
        }


        return {
            headings,
            rows
        };
    });
}


function theadElems(tableData) {

    const {headings} = tableData;
    const thElems = headings
        .filter(heading => heading !== 'key') // skippings the key
        .map(heading => {

            if (heading === 'X') {
                return th('.th-delete', 'X')
            } else {
                return th('', heading)
            }
        })

    return tr('', thElems);

}


function tbodyElems(tableData) {
    const {headings, rows} = tableData;
    return rows.map((row) => {

        const tdElems = headings
            .filter(heading => heading !== 'key') // skipping the key
            .map((heading) => {

                if (heading === 'X') {
                    //console.log(row.key)
                    return td('.delete', [button({ attrs: { class: 'button-remove', 'data-key': row.key } }, 'X')])
                } else {
                    return td('', row[heading])
                }
            })

        return tr({
            attrs: {
                class: ''
            },
            props: {
                key: row.key
            }
        },
            tdElems
        );
    })
}

export default function app(sources) {

    const {DOM, gun} = sources;

    function intent(D) {

        // clear
        const clearButtonClick$ = D.select('#clear').events('click')

        const removeButtonClick$ = D.select('.button-remove').events('click')


        // save
        const saveButtonClick$ = D.select('#save-task').events('click')


        // return - save
        const keydownEvent$ = D.select('#text-newtask').events('keypress')
            .filter(event => event.keyCode === 13)
            .map((event) => {
                event = event || window.event; // get window.event if e argument missing (in IE)
                event.preventDefault();
                return {};
            })

        // text value
        const textEvent$ = D.select('#text-newtask').events('input')
            .map(ev => ev.target.value)
            .startWith('')
            .map(event => {
                return { typeKey: 'text-content', payload: event }
            })

        const clickOrEnter$ = xs.merge(saveButtonClick$, keydownEvent$);

        const outgunRemoveTask$ = removeButtonClick$.map(event => {

            const key = event.target.getAttribute('data-key');
            return { typeKey: 'out-gun', payload: { key, value: null } }
        })


        const outgunAddTask$ = clickOrEnter$.compose(sampleCombine(textEvent$)).map(([click, event]) => {

            return { typeKey: 'out-gun', payload: { key: uuid(), value: event.payload } };
        })

        const clearEvents$ = xs.merge(clearButtonClick$, saveButtonClick$, keydownEvent$)
            .map(event => {
                return { typeKey: 'text-clear', payload: null }
            });

        return {
            textEvent$,
            clearEvents$,
            outgun$: xs.merge(outgunAddTask$, outgunRemoveTask$)
        }

        // return xs.merge(outgun$)
    }

    const gunTodos$ = gun.get((gunInstance) => {
        return gunInstance.get('example/todo/data');
    })

    // We are removing nulls, keys that
    const gunTable$ = transformTodoStream(gunTodos$);

    function vtree(gunStream, textStream) {

        return xs.combine(gunStream, textStream).map(([gun, text]) => {




            ////////////////////////////////

            //console.log(gun);
            return div('pure-g', [
                div('', [
                    main('.content', [
                        div('', [
                            section('.margin-top', [
                                h2("Task List Example")
                            ]),
                            section('', [
                                div('', [
                                    div('', [

                                        form('.pure-form.pure-form-stacked', [
                                            fieldset('', [
                                                // legend('', 'Task list Example'),

                                                label({ attrs: { for: 'text-newtask' } }, 'Add Task'),
                                                input({
                                                    attrs: {
                                                        class: '',
                                                        type: 'text',
                                                        id: 'text-newtask',
                                                        autocomplete: 'off'
                                                    },
                                                    hook: {
                                                        update: (o, n) => n.elm.value = text
                                                    }
                                                }),
                                            ])
                                        ]),
                                        button('#save-task.pure-button.pure-button-primary.button-margin-right', 'save'),
                                        button('#clear.pure-button.pure-button-primary', 'clear')
                                    ]),
                                ])
                            ]),
                            section('', [
                                div('', [
                                    table('.pure-table.example-table', [
                                        thead('', [theadElems(gun)]),
                                        tbody(tbodyElems(gun))

                                    ])
                                ])
                            ])
                        ]),

                    ])
                ])
            ])

            //////////////////////////////
        })
    }

    const events = intent(DOM);

    const blendedEvents$ = xs.merge(events.textEvent$, events.clearEvents$)



    function model(event$) {

        const clearTransformer$ = event$.filter(event => event.typeKey === 'text-clear')
            .map((event) => {
                return function (acc) {
                    acc = ''
                    return acc;
                }
            })

        const textTransformer$ = event$.filter(event => event.typeKey === 'text-content')
            .map((event) => {
                return function (acc) {
                    acc = event.payload;
                    return acc;
                }
            })

        const transformSelector$ = xs.merge(clearTransformer$, textTransformer$)

        const transformer = (acc, trnsFn) => trnsFn(acc);

        return transformSelector$.fold(transformer, '')

    }



    const outgoingGunTodo$ = events.outgun$
        .filter((event) => event.typeKey === 'out-gun')
        .map((event) => {

            const {key, value} = event.payload;
            return (gunInstance) => {
                return gunInstance.get('example/todo/data').path(key).put(value);
            }
        })

    const text$ = model(blendedEvents$);

    const vtree$ = vtree(gunTable$, text$);

    const sinks = {
        gun: outgoingGunTodo$,
        DOM: vtree$
    };

    return sinks;
}