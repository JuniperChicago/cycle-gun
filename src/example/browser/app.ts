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
    // generator rows based on headers
    return rows.map((row) => {
        // generate data items within each row
        const tdElems = headings.map((heading) => {
            //console.log(heading)
            return td({ attrs: { class: 'mdl-data-table__cell--non-numeric' } }, row[heading])
        })
        return tr({ attrs: { class: '' } }, tdElems);
    })
}

// function tableElem(state) {
//     //console.log(state);

//     return table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state));
// }


export default function app(sources) {

    const {DOM, gun} = sources;

    function intent(D) {
        
        const click$ = D.select('#save-task').events('click');
        const text$ = D.select('#text-newtask').events('input')
            .map(ev => ev.target.value)
            .startWith('')
        return click$.compose(sampleCombine(text$)).map(([click, text]) => {

            return {typeKey: 'out-gun', payload: text};
        }).debug('click')

    }










    const gunTodos$ = gun.get((gunInstance) => {
        return gunInstance.get('example/todo/data');
    })

    // We are removing nulls, keys that 
    const gunTable$ = transformTodoStream(gunTodos$);

    function vtree(stateStream) {

        return stateStream.map((state) => {

            const {headings, rows} = state;

            console.log(state);
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
                        // div('.example__horizontal-form', [
                        // div('', [
                        // form('', [
                        div('.mdl-card__supporting-text', [
                            h4("Add new task"),
                            form('', [
                                div('.mdl-textfield', [
                                    input({ attrs: { class: 'mdl-textfield__input', type: 'text', id: 'text-newtask', placeholder: 'Enter task' } }),
                                    // label({ attrs: { class: 'mdl-textfield__label', for: 'sample1' } }, 'New Task Here')
                                ])
                            ]),
                            button('#save-task.mdl-button.mdl-button--raised mdl-button--colored', 'save')
                        ]),


                        // button('.mdl-button.mdl-button--raised mdl-button--colored', 'save')
                        // ])

                    ])
                ]),
                section('.section--center.mdl-grid.mdl-grid--no-spacing', [
                    div('.mdl-card.mdl-cell.mdl-cell--6-col', [
                        table('.mdl-data-table', tbodyElems(state))
                    ])
                ])
            ])
        })
    }


    const intent$ = intent(DOM);

    const outgoingGunTodo$ = intent$
    .filter((event) => event.typeKey === 'out-gun')
    .map((event) => {
      return (gunInstance) => {
        return gunInstance.get('example/todo/data').path(uuid()).put(event.payload);
      }
    })

    const vtree$ = vtree(gunTable$);

    //console.log(vtree$)
    const sinks = {
        gun: outgoingGunTodo$,
        DOM: vtree$
    };

    return sinks;
}