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




/**
 * Transforms gun store object into object containing headers and rows
 * 
 * @param {any} inStream
 * @returns
 */
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


/**
 * build table body elements
 * 
 * @param {any} tableData
 * @returns
 */
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

    return tr('', tdElems);
  })
}

export default function app(sources) {





  function intent(DOM) {

    // clear
    const clearButtonClick$ = DOM.select('#clear').events('click')
    
    // remove task
    const removeButtonClick$ = DOM.select('.button-remove').events('click')

    // save task
    const saveButtonClick$ = DOM.select('#save-task').events('click')

    // return - save task
    const keydownEvent$ = DOM.select('#text-newtask').events('keypress')
      .filter(event => event.keyCode === 13)
      .map((event) => {
        event = event || window.event; // get window.event if e argument missing (in IE)
        event.preventDefault();
        return {};
      })

    // input text value
    const textEvent$ = DOM.select('#text-newtask').events('input')
      .map(ev => ev.target.value)
      .startWith('')
      .map(event => ({ typeKey: 'text-content', payload: event }))

    // merge task save events
    const saveClickOrEnter$ = xs.merge(saveButtonClick$, keydownEvent$);

    // transform remove task message and payload
    const outgunRemoveTask$ = removeButtonClick$
      .map(event => {
        const key = event.target.getAttribute('data-key');
        return { typeKey: 'out-gun', payload: { key, value: null } }
      })

    // transform add task message and payload
    // TODO: check for duplicates on text event
    const outgunAddTask$ = saveClickOrEnter$
      .compose(sampleCombine(textEvent$))
      .map(([click, event]) => ({ typeKey: 'out-gun', payload: { key: uuid(), value: event.payload } }))

    // transform text clearing events into messages
    const textClearEvents$ = xs.merge(clearButtonClick$, saveButtonClick$, keydownEvent$)
      .map(event => ({ typeKey: 'text-clear', payload: null }));

    return {
      textEvent$,
      textClearEvents$,
      outgun$: xs.merge(outgunAddTask$, outgunRemoveTask$)
    }
  }

 
  // utilizes a reducer type store
  // reducers are selected using streams and filters 
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

    // general transformer function
    const transformer = (acc, trnsFn) => trnsFn(acc);

    return transformSelector$.fold(transformer, '')

  }

  function vtree(gunStream, textStream) {

    return xs.combine(gunStream, textStream).map(([gun, text]) => {

      ////////////////////////////////

      return div('pure-g', [
        div('', [
          main('.content', [
            section('.margin-top', [
              h2("Cycle-Gun Task List Example")
            ]),
            section('', [
              form('.pure-form.pure-form-stacked', [
                fieldset('', [
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
            section('', [
              div('', [
                table('.pure-table.example-table', [
                  thead('', [theadElems(gun)]),
                  tbody(tbodyElems(gun))
                ])
              ])
            ])
          ])
        ])
      ])

      //////////////////////////////
    })
  }


  const {DOM, gun} = sources;



  // Get streams from cycle-gun driver
  ///////////////////////////////////////////////////////////////////////////
  const gunTodos$ = gun.get((gunInstance) => {
    return gunInstance.get('example/todo/data');
  });

  // We are removing nulls, keys that are meta, etc...
  const gunTable$ = transformTodoStream(gunTodos$);

  
  
  // intent() returns and object of streams
  const events = intent(DOM);

  const blendedTextEvents$ = xs.merge(events.textEvent$, events.textClearEvents$)

  const outgoingGunTodo$ = events.outgun$
    .filter((event) => event.typeKey === 'out-gun')
    .map((event) => {
      const {key, value} = event.payload;
      
      // return function that directly interacts with the gun instance
      return (gunInstance) => {
        
        // gun.js api here
        return gunInstance.get('example/todo/data').path(key).put(value);
      }
    })

  const textState$ = model(blendedTextEvents$);
  
  const vtree$ = vtree(gunTable$, textState$);

  const sinks = {
    gun: outgoingGunTodo$,
    DOM: vtree$
  };

  return sinks;
}