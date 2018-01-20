"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var xstream_1 = require("xstream");
var run_1 = require("@cycle/run");
var dom_1 = require("@cycle/dom");
var index_js_1 = require("../../index.js");
var app_1 = require("./app");
// Watch here
/**
 * main function
 *
 * @param {any} sources
 * @returns
 */
function main(sources) {
    var DOM = sources.DOM;
    var appPage = app_1.default(sources);
    var sinks = {
        DOM: appPage.DOM,
        gun: xstream_1.default.merge(appPage.gun),
    };
    return sinks;
}
var drivers = {
    DOM: dom_1.makeDOMDriver('#app'),
    gun: index_js_1.makeGunDriver('http://localhost:3800')
};
run_1.run(main, drivers);
//# sourceMappingURL=index.js.map