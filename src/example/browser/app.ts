import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine'
import * as uuid from '../../../node_modules/uuid-random/uuid-random.min.js';
import {
    div,
    table,
    td,
    tr,
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
    h4

} from '@cycle/dom';

function transformTodoStream(inStream) {
    return inStream.map((state) => {
        let rows = [];
        let count = 1;
        for (let key in state) {
            let row = state[key];
            if (!state[key] || typeof row === 'object') continue;
            let c = count++
            // might want to convert to json here...
            rows.push({ id: c, key, val: row })
        }
        let headings = Object.keys(rows[0]);
        return {
            headings,
            rows
        };
    });
}


function tbodyElems(tableData) {
    const {headings, rows} = tableData;
    return rows.map((row) => {
        const tdElems = headings.map((heading) => {
            return td({ attrs: { class: 'mdl-data-table__cell--non-numeric' } }, row[heading])
        })
        return tr({ attrs: { class: '' } }, tdElems);
    })
}



export default function app(sources) {

    const {DOM, gun} = sources;

    function intent(D) {

        // clear
        const clearButtonClick$ = D.select('#clear').events('click')


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

        const outgun$ = clickOrEnter$.compose(sampleCombine(textEvent$)).map(([click, event]) => {
            return { typeKey: 'out-gun', payload: event.payload };
        })

        const clearEvents$ = xs.merge(clearButtonClick$, saveButtonClick$, keydownEvent$)
            .map(event => {
                return { typeKey: 'text-clear', payload: null }
            });



        return {
            textEvent$,
            clearEvents$,
            outgun$
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



            

            console.log(gun);
            return main('.mdl-layout__container', [
                div('.mdl-layout--fixed-header', [
                    section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                        header('.mdl-layout__header', [
                            div('.mdl-layout__header-row', [
                                span('.mdl-layout__title', 'Example Todo')
                            ])
                        ])
                    ]),
                ]),
                section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                    div('.mdl-card.mdl-cell.mdl-cell--6-col', [
                        div('.mdl-card__supporting-text', [
                            h4("Add new task"),
                            form('', [
                                div('.mdl-textfield', [
                                    // div(text),
                                    input({
                                        attrs: {
                                            class: 'mdl-textfield__input',
                                            type: 'text',
                                            id: 'text-newtask',
                                        },
                                        hook: {
                                            update: (o, n) => n.elm.value = text
                                        }
                                    }),
                                ])
                            ]),
                            button('#save-task.mdl-button.mdl-button--raised mdl-button--colored', 'save'),
                            button('#clear.mdl-button.mdl-button--raised mdl-button--colored', 'clear')
                        ]),
                    ])
                ]),
                section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                    div('.mdl-card.mdl-cell.mdl-cell--6-col', [
                        table('.mdl-data-table', tbodyElems(gun))
                    ])
                ])
            ])
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
            return (gunInstance) => {
                return gunInstance.get('example/todo/data').path(uuid()).put(event.payload);
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