import xs from 'xstream';
import { run } from '@cycle/xstream-run';
import { makeDOMDriver, div } from '@cycle/dom';
import { makeGunDriver } from '../../../lib/index.js';

import app from './app';

// main function
function main(sources) {

    const {DOM} = sources;
    const appPage = app(sources);
    const sinks = {
        DOM: appPage.DOM,
        gun: xs.merge(appPage.gun),
    }

    return sinks;

}

const drivers = {
    DOM: makeDOMDriver('#app'),
    gun: makeGunDriver('http://localhost:3800')
}
run(main, drivers);








