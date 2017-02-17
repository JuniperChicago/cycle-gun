import xs from 'xstream';
import { run } from '@cycle/xstream-run';
import { makeDOMDriver, div } from '@cycle/dom';
import { makeGunDriver } from '../../../lib/index.js';

import * as equal from 'deep-equal';
import dropRepeats from 'xstream/extra/dropRepeats';

function preventDefaultSinkDriver(prevented$) {
  
  prevented$.addListener({
    next: ev => {
    //console.log(ev);
      ev.preventDefault()
    },
    error: () => {},
    complete: () => {},
  })
  return xs.empty()
}


import app from './app';

// main function
function main(sources) {

    const {DOM} = sources;

    const appPage = app(sources);

    
    const sinks = {
        DOM: appPage.DOM,
        gun: xs.merge(appPage.gun),
        // preventDefault: preventDefaultSinkDriver,
    }

    return sinks;

}
const drivers = {
    DOM: makeDOMDriver('#app'),
    gun: makeGunDriver('http://localhost:3500')
}
run(main, drivers);








