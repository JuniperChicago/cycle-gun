import xs from 'xstream';
import { run } from '@cycle/run';
import { makeDOMDriver, div } from '@cycle/dom';
import { makeGunDriver } from '../../index.js';

import app from './app';

// Watch here

/**
 * main function
 * 
 * @param {any} sources 
 * @returns 
 */
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








