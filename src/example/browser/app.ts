import xs from 'xstream';
import { div, table, td, tr, thead, tbody, header, span } from '@cycle/dom';

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


function tableElem(state) {
    //console.log(state);

    return table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state));
}


export default function app(sources) {

    const {DOM, gun} = sources;

    const gunTodos$ = gun.get((gunInstance) => {
        return gunInstance.get('example/todo/data');
    })

    // We are removing nulls, keys that 
    const gunTable$ = transformTodoStream(gunTodos$);

    function vtree(stateStream) {

        return stateStream.map((state) => {

            const {headings, rows} = state;
            
            console.log(state);
            return div({ attrs: { class: '' } }, [
                header({ attrs: { class: '' } }, [
                    div({ attrs: { class: '' } }, [
                        div("what the fuck"),
                        span({ attrs: { class: '' } }, 'Example Todo')
                    ])
                ]),
                // div(rows.map((row) => {return tr(row.val)}))
                table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state))





            ])
        })
    }

    const gunEvents$ = xs.never();
    const vtree$ = vtree(gunTable$);

    console.log(vtree$)
    const sinks = {
        gun: gunEvents$,
        DOM: vtree$
    };

    return sinks;
}