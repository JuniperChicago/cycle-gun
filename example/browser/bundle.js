(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var Gun = require('../node_modules/gun/gun.js');
var dropRepeats_1 = require('xstream/extra/dropRepeats');
var equal = require('deep-equal');
function makeGunDriver(url) {
    // TODO: multiple peer handling?
    var gun = Gun(url);
    function get(gunFn) {
        if (typeof gunFn !== 'function')
            throw 'Function Required to get gun stream';
        var loc = gunFn(gun);
        var eventListener = null;
        return xstream_1.default.create({
            start: function (listener) {
                eventListener = function (event) {
                    return listener.next(event);
                };
                loc.on(eventListener);
            },
            stop: function () {
                // socket.removeEventListener(typeKey, this.eventListener);
            }
        })
            .compose(dropRepeats_1.default(equal));
    }
    ;
    function processTransform(inputFunction) {
        return inputFunction(gun);
    }
    return function (event$) {
        event$.addListener({
            next: function (transform) {
                // TODO: Error handling
                return processTransform(transform);
            }
        });
        return {
            get: get
        };
    };
}
exports.makeGunDriver = makeGunDriver;

},{"../node_modules/gun/gun.js":85,"deep-equal":31,"xstream":131,"xstream/extra/dropRepeats":130}],2:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var dom_1 = require('@cycle/dom');
function transformTodoStream(inStream) {
    return inStream.map(function (state) {
        var rows = [];
        var count = 1;
        for (var key in state) {
            var row = state[key];
            if (!state[key] || typeof row === 'object')
                continue;
            var c = count++;
            // might want to convert to json here...
            rows.push({ id: c, key: key, val: row });
        }
        var headings = Object.keys(rows[0]);
        return {
            headings: headings,
            rows: rows
        };
    });
}
function tbodyElems(tableData) {
    var headings = tableData.headings, rows = tableData.rows;
    // generator rows based on headers
    return rows.map(function (row) {
        // generate data items within each row
        var tdElems = headings.map(function (heading) {
            //console.log(heading)
            return dom_1.td({ attrs: { class: 'mdl-data-table__cell--non-numeric' } }, row[heading]);
        });
        return dom_1.tr({ attrs: { class: '' } }, tdElems);
    });
}
function tableElem(state) {
    //console.log(state);
    return dom_1.table({ attrs: { class: 'mdl-data-table' } }, tbodyElems(state));
}
function app(sources) {
    var DOM = sources.DOM, gun = sources.gun;
    var gunTodos$ = gun.get(function (gunInstance) {
        return gunInstance.get('example/todo/data');
    });
    // We are removing nulls, keys that 
    var gunTable$ = transformTodoStream(gunTodos$);
    function vtree(stateStream) {
        return stateStream.map(function (state) {
            var headings = state.headings, rows = state.rows;
            console.log(state);
            return dom_1.div('.example__layout.mdl-layout', [
                dom_1.header('.example__header.mdl-layout__header', [
                    dom_1.div('.mdl-layout__header-row', [
                        dom_1.span('.mdl-layout__title', 'Example Todo')
                    ])
                ]),
                // div(rows.map((row) => {return tr(row.val)}))
                dom_1.div('.example__content.mdl-layout__content', [
                    dom_1.div('.example__horizontal-form', [
                        dom_1.form('.example__horizontal-form__element', [
                            dom_1.div('.mdl-textfield mdl-js-textfield', [
                                dom_1.input({ attrs: { class: 'mdl-textfield__input', type: 'text', id: 'sample1' } }),
                                dom_1.label({ attrs: { class: 'mdl-textfield__label', for: 'sample1' } }, 'Text')
                            ])
                        ]),
                        dom_1.button('.example__horizontal__button.mdl-button.mdl-button--raised mdl-button--colored', 'save')
                    ]),
                    dom_1.div('.example__content', [
                        dom_1.table('.mdl-data-table', tbodyElems(state))
                    ])
                ])
            ]);
        });
    }
    var gunEvents$ = xstream_1.default.never();
    var vtree$ = vtree(gunTable$);
    console.log(vtree$);
    var sinks = {
        gun: gunEvents$,
        DOM: vtree$
    };
    return sinks;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = app;

},{"@cycle/dom":17,"xstream":131}],3:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var xstream_run_1 = require('@cycle/xstream-run');
var dom_1 = require('@cycle/dom');
var index_js_1 = require('../../../lib/index.js');
var app_1 = require('./app');
function main(sources) {
    var DOM = sources.DOM;
    var appPage = app_1.default(sources);
    var sinks = {
        DOM: appPage.DOM,
        gun: xstream_1.default.merge(appPage.gun)
    };
    return sinks;
}
var drivers = {
    DOM: dom_1.makeDOMDriver('#app'),
    gun: index_js_1.makeGunDriver('http://localhost:3500')
};
xstream_run_1.run(main, drivers);

},{"../../../lib/index.js":4,"./app":2,"@cycle/dom":17,"@cycle/xstream-run":27,"xstream":131}],4:[function(require,module,exports){
"use strict";
var cycle_gun_1 = require('./cycle-gun');
exports.makeGunDriver = cycle_gun_1.makeGunDriver;

},{"./cycle-gun":1}],5:[function(require,module,exports){
"use strict";
function logToConsoleError(err) {
    var target = err.stack || err;
    if (console && console.error) {
        console.error(target);
    }
    else if (console && console.log) {
        console.log(target);
    }
}
function makeSinkProxies(drivers, streamAdapter) {
    var sinkProxies = {};
    for (var name_1 in drivers) {
        if (drivers.hasOwnProperty(name_1)) {
            var subject = streamAdapter.makeSubject();
            var driverStreamAdapter = drivers[name_1].streamAdapter || streamAdapter;
            var stream = driverStreamAdapter.adapt(subject.stream, streamAdapter.streamSubscribe);
            sinkProxies[name_1] = {
                stream: stream,
                observer: subject.observer,
            };
        }
    }
    return sinkProxies;
}
function callDrivers(drivers, sinkProxies, streamAdapter) {
    var sources = {};
    for (var name_2 in drivers) {
        if (drivers.hasOwnProperty(name_2)) {
            var driverOutput = drivers[name_2](sinkProxies[name_2].stream, streamAdapter, name_2);
            var driverStreamAdapter = drivers[name_2].streamAdapter;
            if (driverStreamAdapter && driverStreamAdapter.isValidStream(driverOutput)) {
                sources[name_2] = streamAdapter.adapt(driverOutput, driverStreamAdapter.streamSubscribe);
            }
            else {
                sources[name_2] = driverOutput;
            }
            if (sources[name_2] && typeof sources[name_2] === 'object') {
                sources[name_2]._isCycleSource = name_2;
            }
        }
    }
    return sources;
}
function replicateMany(sinks, sinkProxies, streamAdapter) {
    var sinkNames = Object.keys(sinks).filter(function (name) { return !!sinkProxies[name]; });
    var buffers = {};
    var replicators = {};
    sinkNames.forEach(function (name) {
        buffers[name] = { next: [], error: [], complete: [] };
        replicators[name] = {
            next: function (x) { return buffers[name].next.push(x); },
            error: function (x) { return buffers[name].error.push(x); },
            complete: function (x) { return buffers[name].complete.push(x); },
        };
    });
    var subscriptions = sinkNames.map(function (name) {
        return streamAdapter.streamSubscribe(sinks[name], {
            next: function (x) {
                replicators[name].next(x);
            },
            error: function (err) {
                logToConsoleError(err);
                replicators[name].error(err);
            },
            complete: function (x) {
                replicators[name].complete(x);
            },
        });
    });
    var disposeFunctions = subscriptions
        .filter(function (fn) { return typeof fn === 'function'; });
    sinkNames.forEach(function (name) {
        var observer = sinkProxies[name].observer;
        var next = observer.next;
        var error = observer.error;
        var complete = observer.complete;
        buffers[name].next.forEach(next);
        buffers[name].error.forEach(error);
        buffers[name].complete.forEach(complete);
        replicators[name].next = next;
        replicators[name].error = error;
        replicators[name].complete = complete;
    });
    return function () {
        disposeFunctions.forEach(function (dispose) { return dispose(); });
    };
}
function disposeSources(sources) {
    for (var k in sources) {
        if (sources.hasOwnProperty(k) && sources[k]
            && typeof sources[k].dispose === 'function') {
            sources[k].dispose();
        }
    }
}
var isObjectEmpty = function (obj) { return Object.keys(obj).length === 0; };
function Cycle(main, drivers, options) {
    if (typeof main !== "function") {
        throw new Error("First argument given to Cycle must be the 'main' " +
            "function.");
    }
    if (typeof drivers !== "object" || drivers === null) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with driver functions as properties.");
    }
    if (isObjectEmpty(drivers)) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with at least one driver function declared as a property.");
    }
    var streamAdapter = options.streamAdapter;
    if (!streamAdapter || isObjectEmpty(streamAdapter)) {
        throw new Error("Third argument given to Cycle must be an options object " +
            "with the streamAdapter key supplied with a valid stream adapter.");
    }
    var sinkProxies = makeSinkProxies(drivers, streamAdapter);
    var sources = callDrivers(drivers, sinkProxies, streamAdapter);
    var sinks = main(sources);
    if (typeof window !== 'undefined') {
        window.Cyclejs = { sinks: sinks };
    }
    var run = function () {
        var disposeReplication = replicateMany(sinks, sinkProxies, streamAdapter);
        return function () {
            disposeSources(sources);
            disposeReplication();
        };
    };
    return { sinks: sinks, sources: sources, run: run };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{}],6:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var fromEvent_1 = require('./fromEvent');
var BodyDOMSource = (function () {
    function BodyDOMSource(_runStreamAdapter, _name) {
        this._runStreamAdapter = _runStreamAdapter;
        this._name = _name;
    }
    BodyDOMSource.prototype.select = function (selector) {
        // This functionality is still undefined/undecided.
        return this;
    };
    BodyDOMSource.prototype.elements = function () {
        var runSA = this._runStreamAdapter;
        var out = runSA.remember(runSA.adapt(xstream_1.default.of(document.body), xstream_adapter_1.default.streamSubscribe));
        out._isCycleSource = this._name;
        return out;
    };
    BodyDOMSource.prototype.events = function (eventType, options) {
        if (options === void 0) { options = {}; }
        var stream;
        if (options && typeof options.useCapture === 'boolean') {
            stream = fromEvent_1.fromEvent(document.body, eventType, options.useCapture);
        }
        else {
            stream = fromEvent_1.fromEvent(document.body, eventType);
        }
        var out = this._runStreamAdapter.adapt(stream, xstream_adapter_1.default.streamSubscribe);
        out._isCycleSource = this._name;
        return out;
    };
    return BodyDOMSource;
}());
exports.BodyDOMSource = BodyDOMSource;

},{"./fromEvent":14,"@cycle/xstream-adapter":26,"xstream":131}],7:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var fromEvent_1 = require('./fromEvent');
var DocumentDOMSource = (function () {
    function DocumentDOMSource(_runStreamAdapter, _name) {
        this._runStreamAdapter = _runStreamAdapter;
        this._name = _name;
    }
    DocumentDOMSource.prototype.select = function (selector) {
        // This functionality is still undefined/undecided.
        return this;
    };
    DocumentDOMSource.prototype.elements = function () {
        var runSA = this._runStreamAdapter;
        var out = runSA.remember(runSA.adapt(xstream_1.default.of(document), xstream_adapter_1.default.streamSubscribe));
        out._isCycleSource = this._name;
        return out;
    };
    DocumentDOMSource.prototype.events = function (eventType, options) {
        if (options === void 0) { options = {}; }
        var stream;
        if (options && typeof options.useCapture === 'boolean') {
            stream = fromEvent_1.fromEvent(document, eventType, options.useCapture);
        }
        else {
            stream = fromEvent_1.fromEvent(document, eventType);
        }
        var out = this._runStreamAdapter.adapt(stream, xstream_adapter_1.default.streamSubscribe);
        out._isCycleSource = this._name;
        return out;
    };
    return DocumentDOMSource;
}());
exports.DocumentDOMSource = DocumentDOMSource;

},{"./fromEvent":14,"@cycle/xstream-adapter":26,"xstream":131}],8:[function(require,module,exports){
"use strict";
var ScopeChecker_1 = require('./ScopeChecker');
var utils_1 = require('./utils');
var matchesSelector;
try {
    matchesSelector = require("matches-selector");
}
catch (e) {
    matchesSelector = Function.prototype;
}
function toElArray(input) {
    return Array.prototype.slice.call(input);
}
var ElementFinder = (function () {
    function ElementFinder(namespace, isolateModule) {
        this.namespace = namespace;
        this.isolateModule = isolateModule;
    }
    ElementFinder.prototype.call = function (rootElement) {
        var namespace = this.namespace;
        if (namespace.join("") === "") {
            return rootElement;
        }
        var scope = utils_1.getScope(namespace);
        var scopeChecker = new ScopeChecker_1.ScopeChecker(scope, this.isolateModule);
        var selector = utils_1.getSelectors(namespace);
        var topNode = rootElement;
        var topNodeMatches = [];
        if (scope.length > 0) {
            topNode = this.isolateModule.getIsolatedElement(scope) || rootElement;
            if (selector && matchesSelector(topNode, selector)) {
                topNodeMatches.push(topNode);
            }
        }
        return toElArray(topNode.querySelectorAll(selector))
            .filter(scopeChecker.isStrictlyInRootScope, scopeChecker)
            .concat(topNodeMatches);
    };
    return ElementFinder;
}());
exports.ElementFinder = ElementFinder;

},{"./ScopeChecker":12,"./utils":25,"matches-selector":105}],9:[function(require,module,exports){
"use strict";
var ScopeChecker_1 = require('./ScopeChecker');
var utils_1 = require('./utils');
var matchesSelector;
try {
    matchesSelector = require("matches-selector");
}
catch (e) {
    matchesSelector = Function.prototype;
}
var gDestinationId = 0;
function findDestinationId(arr, searchId) {
    var minIndex = 0;
    var maxIndex = arr.length - 1;
    var currentIndex;
    var currentElement;
    while (minIndex <= maxIndex) {
        currentIndex = (minIndex + maxIndex) / 2 | 0; // tslint:disable-line:no-bitwise
        currentElement = arr[currentIndex];
        var currentId = currentElement.destinationId;
        if (currentId < searchId) {
            minIndex = currentIndex + 1;
        }
        else if (currentId > searchId) {
            maxIndex = currentIndex - 1;
        }
        else {
            return currentIndex;
        }
    }
    return -1;
}
/**
 * Attaches an actual event listener to the DOM root element,
 * handles "destinations" (interested DOMSource output subjects), and bubbling.
 */
var EventDelegator = (function () {
    function EventDelegator(topElement, eventType, useCapture, isolateModule) {
        var _this = this;
        this.topElement = topElement;
        this.eventType = eventType;
        this.useCapture = useCapture;
        this.isolateModule = isolateModule;
        this.destinations = [];
        this.roof = topElement.parentElement;
        if (useCapture) {
            this.domListener = function (ev) { return _this.capture(ev); };
        }
        else {
            this.domListener = function (ev) { return _this.bubble(ev); };
        }
        topElement.addEventListener(eventType, this.domListener, useCapture);
    }
    EventDelegator.prototype.bubble = function (rawEvent) {
        if (!this.topElement.contains(rawEvent.currentTarget)) {
            return;
        }
        var ev = this.patchEvent(rawEvent);
        for (var el = ev.target; el && el !== this.roof; el = el.parentElement) {
            if (!this.topElement.contains(el)) {
                ev.stopPropagation();
            }
            if (ev.propagationHasBeenStopped) {
                return;
            }
            this.matchEventAgainstDestinations(el, ev);
        }
    };
    EventDelegator.prototype.matchEventAgainstDestinations = function (el, ev) {
        for (var i = 0, n = this.destinations.length; i < n; i++) {
            var dest = this.destinations[i];
            if (!dest.scopeChecker.isStrictlyInRootScope(el)) {
                continue;
            }
            if (matchesSelector(el, dest.selector)) {
                this.mutateEventCurrentTarget(ev, el);
                dest.subject._n(ev);
            }
        }
    };
    EventDelegator.prototype.capture = function (ev) {
        for (var i = 0, n = this.destinations.length; i < n; i++) {
            var dest = this.destinations[i];
            if (matchesSelector(ev.target, dest.selector)) {
                dest.subject._n(ev);
            }
        }
    };
    EventDelegator.prototype.addDestination = function (subject, namespace, destinationId) {
        var scope = utils_1.getScope(namespace);
        var selector = utils_1.getSelectors(namespace);
        var scopeChecker = new ScopeChecker_1.ScopeChecker(scope, this.isolateModule);
        this.destinations.push({ subject: subject, scopeChecker: scopeChecker, selector: selector, destinationId: destinationId });
    };
    EventDelegator.prototype.createDestinationId = function () {
        return gDestinationId++;
    };
    EventDelegator.prototype.removeDestinationId = function (destinationId) {
        var i = findDestinationId(this.destinations, destinationId);
        if (i >= 0) {
            this.destinations.splice(i, 1);
        }
    };
    EventDelegator.prototype.patchEvent = function (event) {
        var pEvent = event;
        pEvent.propagationHasBeenStopped = false;
        var oldStopPropagation = pEvent.stopPropagation;
        pEvent.stopPropagation = function stopPropagation() {
            oldStopPropagation.call(this);
            this.propagationHasBeenStopped = true;
        };
        return pEvent;
    };
    EventDelegator.prototype.mutateEventCurrentTarget = function (event, currentTargetElement) {
        try {
            Object.defineProperty(event, "currentTarget", {
                value: currentTargetElement,
                configurable: true,
            });
        }
        catch (err) {
            console.log("please use event.ownerTarget");
        }
        event.ownerTarget = currentTargetElement;
    };
    EventDelegator.prototype.updateTopElement = function (newTopElement) {
        this.topElement.removeEventListener(this.eventType, this.domListener, this.useCapture);
        newTopElement.addEventListener(this.eventType, this.domListener, this.useCapture);
        this.topElement = newTopElement;
    };
    return EventDelegator;
}());
exports.EventDelegator = EventDelegator;

},{"./ScopeChecker":12,"./utils":25,"matches-selector":105}],10:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var HTMLSource = (function () {
    function HTMLSource(html$, runSA, _name) {
        this.runSA = runSA;
        this._name = _name;
        this._html$ = html$;
        this._empty$ = runSA.adapt(xstream_1.default.empty(), xstream_adapter_1.default.streamSubscribe);
    }
    HTMLSource.prototype.elements = function () {
        var out = this.runSA.adapt(this._html$, xstream_adapter_1.default.streamSubscribe);
        out._isCycleSource = this._name;
        return out;
    };
    HTMLSource.prototype.select = function (selector) {
        return new HTMLSource(xstream_1.default.empty(), this.runSA, this._name);
    };
    HTMLSource.prototype.events = function (eventType, options) {
        var out = this._empty$;
        out._isCycleSource = this._name;
        return out;
    };
    return HTMLSource;
}());
exports.HTMLSource = HTMLSource;

},{"@cycle/xstream-adapter":26,"xstream":131}],11:[function(require,module,exports){
"use strict";
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var DocumentDOMSource_1 = require('./DocumentDOMSource');
var BodyDOMSource_1 = require('./BodyDOMSource');
var xstream_1 = require('xstream');
var ElementFinder_1 = require('./ElementFinder');
var fromEvent_1 = require('./fromEvent');
var isolate_1 = require('./isolate');
var EventDelegator_1 = require('./EventDelegator');
var utils_1 = require('./utils');
var matchesSelector;
try {
    matchesSelector = require("matches-selector");
}
catch (e) {
    matchesSelector = Function.prototype;
}
var eventTypesThatDontBubble = [
    "blur",
    "canplay",
    "canplaythrough",
    "change",
    "durationchange",
    "emptied",
    "ended",
    "focus",
    "load",
    "loadeddata",
    "loadedmetadata",
    "mouseenter",
    "mouseleave",
    "pause",
    "play",
    "playing",
    "ratechange",
    "reset",
    "scroll",
    "seeked",
    "seeking",
    "stalled",
    "submit",
    "suspend",
    "timeupdate",
    "unload",
    "volumechange",
    "waiting",
];
function determineUseCapture(eventType, options) {
    var result = false;
    if (typeof options.useCapture === 'boolean') {
        result = options.useCapture;
    }
    if (eventTypesThatDontBubble.indexOf(eventType) !== -1) {
        result = true;
    }
    return result;
}
function filterBasedOnIsolation(domSource, scope) {
    return function filterBasedOnIsolationOperator(rootElement$) {
        return rootElement$
            .fold(function shouldPass(state, element) {
            var hasIsolated = !!domSource._isolateModule.getIsolatedElement(scope);
            var shouldPass = hasIsolated && !state.hadIsolatedMutable;
            return { hadIsolatedMutable: hasIsolated, shouldPass: shouldPass, element: element };
        }, { hadIsolatedMutable: false, shouldPass: false, element: null })
            .drop(1)
            .filter(function (s) { return s.shouldPass; })
            .map(function (s) { return s.element; });
    };
}
var MainDOMSource = (function () {
    function MainDOMSource(_rootElement$, _sanitation$, _runStreamAdapter, _namespace, _isolateModule, _delegators, _name) {
        var _this = this;
        if (_namespace === void 0) { _namespace = []; }
        this._rootElement$ = _rootElement$;
        this._sanitation$ = _sanitation$;
        this._runStreamAdapter = _runStreamAdapter;
        this._namespace = _namespace;
        this._isolateModule = _isolateModule;
        this._delegators = _delegators;
        this._name = _name;
        this.__JANI_EVAKALLIO_WE_WILL_MISS_YOU_PLEASE_COME_BACK_EVENTUALLY = false;
        this.__JANI_EVAKALLIO_WE_WILL_MISS_YOU_PLEASE_COME_BACK_EVENTUALLY = true;
        this.isolateSource = isolate_1.isolateSource;
        this.isolateSink = function (sink, scope) {
            var existingScope = utils_1.getScope(_this._namespace);
            var deeperScope = [existingScope, scope].filter(function (x) { return !!x; }).join('-');
            return isolate_1.isolateSink(sink, deeperScope);
        };
    }
    MainDOMSource.prototype.elements = function () {
        var output$;
        if (this._namespace.length === 0) {
            output$ = this._rootElement$;
        }
        else {
            var elementFinder_1 = new ElementFinder_1.ElementFinder(this._namespace, this._isolateModule);
            output$ = this._rootElement$.map(function (el) { return elementFinder_1.call(el); });
        }
        var runSA = this._runStreamAdapter;
        var out = runSA.remember(runSA.adapt(output$, xstream_adapter_1.default.streamSubscribe));
        out._isCycleSource = this._name;
        return out;
    };
    Object.defineProperty(MainDOMSource.prototype, "namespace", {
        get: function () {
            return this._namespace;
        },
        enumerable: true,
        configurable: true
    });
    MainDOMSource.prototype.select = function (selector) {
        if (typeof selector !== 'string') {
            throw new Error("DOM driver's select() expects the argument to be a " +
                "string as a CSS selector");
        }
        if (selector === 'document') {
            return new DocumentDOMSource_1.DocumentDOMSource(this._runStreamAdapter, this._name);
        }
        if (selector === 'body') {
            return new BodyDOMSource_1.BodyDOMSource(this._runStreamAdapter, this._name);
        }
        var trimmedSelector = selector.trim();
        var childNamespace = trimmedSelector === ":root" ?
            this._namespace :
            this._namespace.concat(trimmedSelector);
        return new MainDOMSource(this._rootElement$, this._sanitation$, this._runStreamAdapter, childNamespace, this._isolateModule, this._delegators, this._name);
    };
    MainDOMSource.prototype.events = function (eventType, options) {
        if (options === void 0) { options = {}; }
        if (typeof eventType !== "string") {
            throw new Error("DOM driver's events() expects argument to be a " +
                "string representing the event type to listen for.");
        }
        var useCapture = determineUseCapture(eventType, options);
        var namespace = this._namespace;
        var scope = utils_1.getScope(namespace);
        var keyParts = [eventType, useCapture];
        if (scope) {
            keyParts.push(scope);
        }
        var key = keyParts.join('~');
        var domSource = this;
        var rootElement$;
        if (scope) {
            rootElement$ = this._rootElement$
                .compose(filterBasedOnIsolation(domSource, scope));
        }
        else {
            rootElement$ = this._rootElement$.take(2);
        }
        var event$ = rootElement$
            .map(function setupEventDelegatorOnTopElement(rootElement) {
            // Event listener just for the root element
            if (!namespace || namespace.length === 0) {
                return fromEvent_1.fromEvent(rootElement, eventType, useCapture);
            }
            // Event listener on the top element as an EventDelegator
            var delegators = domSource._delegators;
            var top = domSource._isolateModule.getIsolatedElement(scope) || rootElement;
            var delegator;
            if (delegators.has(key)) {
                delegator = delegators.get(key);
                delegator.updateTopElement(top);
            }
            else {
                delegator = new EventDelegator_1.EventDelegator(top, eventType, useCapture, domSource._isolateModule);
                delegators.set(key, delegator);
            }
            if (scope) {
                domSource._isolateModule.addEventDelegator(scope, delegator);
            }
            var destinationId = delegator.createDestinationId();
            var subject = xstream_1.default.create({
                start: function () { },
                stop: function () {
                    if ('requestIdleCallback' in window) {
                        requestIdleCallback(function () {
                            delegator.removeDestinationId(destinationId);
                        });
                    }
                    else {
                        delegator.removeDestinationId(destinationId);
                    }
                },
            });
            delegator.addDestination(subject, namespace, destinationId);
            return subject;
        })
            .flatten();
        var out = this._runStreamAdapter.adapt(event$, xstream_adapter_1.default.streamSubscribe);
        out._isCycleSource = domSource._name;
        return out;
    };
    MainDOMSource.prototype.dispose = function () {
        this._sanitation$.shamefullySendNext('');
        this._isolateModule.reset();
    };
    return MainDOMSource;
}());
exports.MainDOMSource = MainDOMSource;

},{"./BodyDOMSource":6,"./DocumentDOMSource":7,"./ElementFinder":8,"./EventDelegator":9,"./fromEvent":14,"./isolate":18,"./utils":25,"@cycle/xstream-adapter":26,"matches-selector":105,"xstream":131}],12:[function(require,module,exports){
"use strict";
var ScopeChecker = (function () {
    function ScopeChecker(scope, isolateModule) {
        this.scope = scope;
        this.isolateModule = isolateModule;
    }
    ScopeChecker.prototype.isStrictlyInRootScope = function (leaf) {
        for (var el = leaf; el; el = el.parentElement) {
            var scope = this.isolateModule.isIsolatedElement(el);
            if (scope && scope !== this.scope) {
                return false;
            }
            if (scope) {
                return true;
            }
        }
        return true;
    };
    return ScopeChecker;
}());
exports.ScopeChecker = ScopeChecker;

},{}],13:[function(require,module,exports){
"use strict";
var hyperscript_1 = require('./hyperscript');
var classNameFromVNode_1 = require('snabbdom-selector/lib/classNameFromVNode');
var selectorParser_1 = require('snabbdom-selector/lib/selectorParser');
var VNodeWrapper = (function () {
    function VNodeWrapper(rootElement) {
        this.rootElement = rootElement;
    }
    VNodeWrapper.prototype.call = function (vnode) {
        var _a = selectorParser_1.default(vnode.sel), selectorTagName = _a.tagName, selectorId = _a.id;
        var vNodeClassName = classNameFromVNode_1.default(vnode);
        var vNodeData = vnode.data || {};
        var vNodeDataProps = vNodeData.props || {};
        var _b = vNodeDataProps.id, vNodeId = _b === void 0 ? selectorId : _b;
        var isVNodeAndRootElementIdentical = vNodeId.toUpperCase() === this.rootElement.id.toUpperCase() &&
            selectorTagName.toUpperCase() === this.rootElement.tagName.toUpperCase() &&
            vNodeClassName.toUpperCase() === this.rootElement.className.toUpperCase();
        if (isVNodeAndRootElementIdentical) {
            return vnode;
        }
        var _c = this.rootElement, tagName = _c.tagName, id = _c.id, className = _c.className;
        var elementId = id ? "#" + id : "";
        var elementClassName = className ?
            "." + className.split(" ").join(".") : "";
        return hyperscript_1.h("" + tagName.toLowerCase() + elementId + elementClassName, {}, [
            vnode,
        ]);
    };
    return VNodeWrapper;
}());
exports.VNodeWrapper = VNodeWrapper;

},{"./hyperscript":16,"snabbdom-selector/lib/classNameFromVNode":106,"snabbdom-selector/lib/selectorParser":107}],14:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
function fromEvent(element, eventName, useCapture) {
    if (useCapture === void 0) { useCapture = false; }
    return xstream_1.Stream.create({
        element: element,
        next: null,
        start: function start(listener) {
            this.next = function next(event) { listener.next(event); };
            this.element.addEventListener(eventName, this.next, useCapture);
        },
        stop: function stop() {
            this.element.removeEventListener(eventName, this.next, useCapture);
        },
    });
}
exports.fromEvent = fromEvent;

},{"xstream":131}],15:[function(require,module,exports){
"use strict";
var hyperscript_1 = require('./hyperscript');
function isValidString(param) {
    return typeof param === 'string' && param.length > 0;
}
function isSelector(param) {
    return isValidString(param) && (param[0] === '.' || param[0] === '#');
}
function createTagFunction(tagName) {
    return function hyperscript(first, b, c) {
        if (isSelector(first)) {
            if (typeof b !== 'undefined' && typeof c !== 'undefined') {
                return hyperscript_1.h(tagName + first, b, c);
            }
            else if (typeof b !== 'undefined') {
                return hyperscript_1.h(tagName + first, b);
            }
            else {
                return hyperscript_1.h(tagName + first, {});
            }
        }
        else if (!!b) {
            return hyperscript_1.h(tagName, first, b);
        }
        else if (!!first) {
            return hyperscript_1.h(tagName, first);
        }
        else {
            return hyperscript_1.h(tagName, {});
        }
    };
}
var SVG_TAG_NAMES = [
    'a', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
    'animateMotion', 'animateTransform', 'circle', 'clipPath', 'colorProfile',
    'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
    'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
    'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
    'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
    'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
    'feSpotlight', 'feTile', 'feTurbulence', 'filter', 'font', 'fontFace',
    'fontFaceFormat', 'fontFaceName', 'fontFaceSrc', 'fontFaceUri',
    'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image', 'line',
    'linearGradient', 'marker', 'mask', 'metadata', 'missingGlyph', 'mpath',
    'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script',
    'set', 'stop', 'style', 'switch', 'symbol', 'text', 'textPath', 'title',
    'tref', 'tspan', 'use', 'view', 'vkern',
];
var svg = createTagFunction('svg');
SVG_TAG_NAMES.forEach(function (tag) {
    svg[tag] = createTagFunction(tag);
});
var TAG_NAMES = [
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base',
    'bdi', 'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption',
    'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'dfn', 'dir', 'div', 'dl',
    'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
    'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'keygen', 'label', 'legend',
    'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'nav', 'noscript',
    'object', 'ol', 'optgroup', 'option', 'p', 'param', 'pre', 'progress', 'q',
    'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small',
    'source', 'span', 'strong', 'style', 'sub', 'sup', 'table', 'tbody', 'td',
    'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'u', 'ul', 'video',
];
var exported = { SVG_TAG_NAMES: SVG_TAG_NAMES, TAG_NAMES: TAG_NAMES, svg: svg, isSelector: isSelector, createTagFunction: createTagFunction };
TAG_NAMES.forEach(function (n) {
    exported[n] = createTagFunction(n);
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exported;

},{"./hyperscript":16}],16:[function(require,module,exports){
"use strict";
var is = require('snabbdom/is');
var vnode = require('snabbdom/vnode');
function isGenericStream(x) {
    return !Array.isArray(x) && typeof x.map === "function";
}
function mutateStreamWithNS(vNode) {
    addNS(vNode.data, vNode.children, vNode.sel);
    return vNode;
}
function addNS(data, children, selector) {
    data.ns = "http://www.w3.org/2000/svg";
    if (selector !== "text" && selector !== "foreignObject" &&
        typeof children !== 'undefined' && is.array(children)) {
        for (var i = 0; i < children.length; ++i) {
            if (isGenericStream(children[i])) {
                children[i] = children[i].map(mutateStreamWithNS);
            }
            else {
                addNS(children[i].data, children[i].children, children[i].sel);
            }
        }
    }
}
function h(sel, b, c) {
    var data = {};
    var children;
    var text;
    if (arguments.length === 3) {
        data = b;
        if (is.array(c)) {
            children = c;
        }
        else if (is.primitive(c)) {
            text = c;
        }
    }
    else if (arguments.length === 2) {
        if (is.array(b)) {
            children = b;
        }
        else if (is.primitive(b)) {
            text = b;
        }
        else {
            data = b;
        }
    }
    if (is.array(children)) {
        children = children.filter(function (x) { return x; });
        for (var i = 0; i < children.length; ++i) {
            if (is.primitive(children[i])) {
                children[i] = vnode(undefined, undefined, undefined, children[i]);
            }
        }
    }
    if (sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g') {
        addNS(data, children, sel);
    }
    return vnode(sel, data, children, text, undefined);
}
exports.h = h;
;

},{"snabbdom/is":117,"snabbdom/vnode":126}],17:[function(require,module,exports){
"use strict";
var thunk = require('snabbdom/thunk');
exports.thunk = thunk;
/**
 * A factory for the DOM driver function.
 *
 * Takes a `container` to define the target on the existing DOM which this
 * driver will operate on, and an `options` object as the second argument. The
 * input to this driver is a stream of virtual DOM objects, or in other words,
 * Snabbdom "VNode" objects. The output of this driver is a "DOMSource": a
 * collection of Observables queried with the methods `select()` and `events()`.
 *
 * `DOMSource.select(selector)` returns a new DOMSource with scope restricted to
 * the element(s) that matches the CSS `selector` given.
 *
 * `DOMSource.events(eventType, options)` returns a stream of events of
 * `eventType` happening on the elements that match the current DOMSource. The
 * event object contains the `ownerTarget` property that behaves exactly like
 * `currentTarget`. The reason for this is that some browsers doesn't allow
 * `currentTarget` property to be mutated, hence a new property is created. The
 * returned stream is an *xstream* Stream if you use `@cycle/xstream-run` to run
 * your app with this driver, or it is an RxJS Observable if you use
 * `@cycle/rxjs-run`, and so forth. The `options` parameter can have the
 * property `useCapture`, which is by default `false`, except it is `true` for
 * event types that do not bubble. Read more here
 * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
 * about the `useCapture` and its purpose.
 *
 * `DOMSource.elements()` returns a stream of the DOM element(s) matched by the
 * selectors in the DOMSource. Also, `DOMSource.select(':root').elements()`
 * returns a stream of DOM element corresponding to the root (or container) of
 * the app on the DOM.
 *
 * @param {(String|HTMLElement)} container the DOM selector for the element
 * (or the element itself) to contain the rendering of the VTrees.
 * @param {DOMDriverOptions} options an object with two optional properties:
 *
 *   - `modules: array` overrides `@cycle/dom`'s default Snabbdom modules as
 *     as defined in [`src/modules.ts`](./src/modules.ts).
 *   - `transposition: boolean` enables/disables transposition of inner streams
 *     in the virtual DOM tree.
 * @return {Function} the DOM driver function. The function expects a stream of
 * VNode as input, and outputs the DOMSource object.
 * @function makeDOMDriver
 */
var makeDOMDriver_1 = require('./makeDOMDriver');
exports.makeDOMDriver = makeDOMDriver_1.makeDOMDriver;
/**
 * A factory for the HTML driver function.
 *
 * Takes an `effect` callback function and an `options` object as arguments. The
 * input to this driver is a stream of virtual DOM objects, or in other words,
 * Snabbdom "VNode" objects. The output of this driver is a "DOMSource": a
 * collection of Observables queried with the methods `select()` and `events()`.
 *
 * The HTML Driver is supplementary to the DOM Driver. Instead of producing
 * elements on the DOM, it generates HTML as strings and does a side effect on
 * those HTML strings. That side effect is described by the `effect` callback
 * function. So, if you want to use the HTML Driver on the server-side to render
 * your application as HTML and send as a response (which is the typical use
 * case for the HTML Driver), you need to pass something like the
 * `html => response.send(html)` function as the `effect` argument. This way,
 * the driver knows what side effect to cause based on the HTML string it just
 * rendered.
 *
 * The HTML driver is useful only for that side effect in the `effect` callback.
 * It can be considered a sink-only driver. However, in order to serve as a
 * transparent replacement to the DOM Driver when rendering from the server, the
 * HTML driver returns a source object that behaves just like the DOMSource.
 * This helps reuse the same application that is written for the DOM Driver.
 * This fake DOMSource returns empty streams when you query it, because there
 * are no user events on the server.
 *
 * `DOMSource.select(selector)` returns a new DOMSource with scope restricted to
 * the element(s) that matches the CSS `selector` given.
 *
 * `DOMSource.events(eventType, options)` returns an empty stream. The returned
 * stream is an *xstream* Stream if you use `@cycle/xstream-run` to run your app
 * with this driver, or it is an RxJS Observable if you use `@cycle/rxjs-run`,
 * and so forth.
 *
 * `DOMSource.elements()` returns the stream of HTML string rendered from your
 * sink virtual DOM stream.
 *
 * @param {Function} effect a callback function that takes a string of rendered
 * HTML as input and should run a side effect, returning nothing.
 * @param {HTMLDriverOptions} options an object with one optional property:
 * `transposition: boolean` enables/disables transposition of inner streams in
 * the virtual DOM tree.
 * @return {Function} the HTML driver function. The function expects a stream of
 * VNode as input, and outputs the DOMSource object.
 * @function makeHTMLDriver
 */
var makeHTMLDriver_1 = require('./makeHTMLDriver');
exports.makeHTMLDriver = makeHTMLDriver_1.makeHTMLDriver;
/**
 * A factory function to create mocked DOMSource objects, for testing purposes.
 *
 * Takes a `streamAdapter` and a `mockConfig` object as arguments, and returns
 * a DOMSource that can be given to any Cycle.js app that expects a DOMSource in
 * the sources, for testing.
 *
 * The `streamAdapter` parameter is a package such as `@cycle/xstream-adapter`,
 * `@cycle/rxjs-adapter`, etc. Import it as `import a from '@cycle/rx-adapter`,
 * then provide it to `mockDOMSource. This is important so the DOMSource created
 * knows which stream library should it use to export its streams when you call
 * `DOMSource.events()` for instance.
 *
 * The `mockConfig` parameter is an object specifying selectors, eventTypes and
 * their streams. Example:
 *
 * ```js
 * const domSource = mockDOMSource(RxAdapter, {
 *   '.foo': {
 *     'click': Rx.Observable.of({target: {}}),
 *     'mouseover': Rx.Observable.of({target: {}}),
 *   },
 *   '.bar': {
 *     'scroll': Rx.Observable.of({target: {}}),
 *     elements: Rx.Observable.of({tagName: 'div'}),
 *   }
 * });
 *
 * // Usage
 * const click$ = domSource.select('.foo').events('click');
 * const element$ = domSource.select('.bar').elements();
 * ```
 *
 * The mocked DOM Source supports isolation. It has the functions `isolateSink`
 * and `isolateSource` attached to it, and performs simple isolation using
 * classNames. *isolateSink* with scope `foo` will append the class `___foo` to
 * the stream of virtual DOM nodes, and *isolateSource* with scope `foo` will
 * perform a conventional `mockedDOMSource.select('.__foo')` call.
 *
 * @param {Object} mockConfig an object where keys are selector strings
 * and values are objects. Those nested objects have `eventType` strings as keys
 * and values are streams you created.
 * @return {Object} fake DOM source object, with an API containing `select()`
 * and `events()` and `elements()` which can be used just like the DOM Driver's
 * DOMSource.
 *
 * @function mockDOMSource
 */
var mockDOMSource_1 = require('./mockDOMSource');
exports.mockDOMSource = mockDOMSource_1.mockDOMSource;
/**
 * The hyperscript function `h()` is a function to create virtual DOM objects,
 * also known as VNodes. Call
 *
 * ```js
 * h('div.myClass', {style: {color: 'red'}}, [])
 * ```
 *
 * to create a VNode that represents a `DIV` element with className `myClass`,
 * styled with red color, and no children because the `[]` array was passed. The
 * API is `h(tagOrSelector, optionalData, optionalChildrenOrText)`.
 *
 * However, usually you should use "hyperscript helpers", which are shortcut
 * functions based on hyperscript. There is one hyperscript helper function for
 * each DOM tagName, such as `h1()`, `h2()`, `div()`, `span()`, `label()`,
 * `input()`. For instance, the previous example could have been written
 * as:
 *
 * ```js
 * div('.myClass', {style: {color: 'red'}}, [])
 * ```
 *
 * There are also SVG helper functions, which apply the appropriate SVG
 * namespace to the resulting elements. `svg()` function creates the top-most
 * SVG element, and `svg.g`, `svg.polygon`, `svg.circle`, `svg.path` are for
 * SVG-specific child elements. Example:
 *
 * ```js
 * svg({width: 150, height: 150}, [
 *   svg.polygon({
 *     attrs: {
 *       class: 'triangle',
 *       points: '20 0 20 150 150 20'
 *     }
 *   })
 * ])
 * ```
 *
 * @function h
 */
var hyperscript_1 = require('./hyperscript');
exports.h = hyperscript_1.h;
var hyperscript_helpers_1 = require('./hyperscript-helpers');
exports.svg = hyperscript_helpers_1.default.svg;
exports.a = hyperscript_helpers_1.default.a;
exports.abbr = hyperscript_helpers_1.default.abbr;
exports.address = hyperscript_helpers_1.default.address;
exports.area = hyperscript_helpers_1.default.area;
exports.article = hyperscript_helpers_1.default.article;
exports.aside = hyperscript_helpers_1.default.aside;
exports.audio = hyperscript_helpers_1.default.audio;
exports.b = hyperscript_helpers_1.default.b;
exports.base = hyperscript_helpers_1.default.base;
exports.bdi = hyperscript_helpers_1.default.bdi;
exports.bdo = hyperscript_helpers_1.default.bdo;
exports.blockquote = hyperscript_helpers_1.default.blockquote;
exports.body = hyperscript_helpers_1.default.body;
exports.br = hyperscript_helpers_1.default.br;
exports.button = hyperscript_helpers_1.default.button;
exports.canvas = hyperscript_helpers_1.default.canvas;
exports.caption = hyperscript_helpers_1.default.caption;
exports.cite = hyperscript_helpers_1.default.cite;
exports.code = hyperscript_helpers_1.default.code;
exports.col = hyperscript_helpers_1.default.col;
exports.colgroup = hyperscript_helpers_1.default.colgroup;
exports.dd = hyperscript_helpers_1.default.dd;
exports.del = hyperscript_helpers_1.default.del;
exports.dfn = hyperscript_helpers_1.default.dfn;
exports.dir = hyperscript_helpers_1.default.dir;
exports.div = hyperscript_helpers_1.default.div;
exports.dl = hyperscript_helpers_1.default.dl;
exports.dt = hyperscript_helpers_1.default.dt;
exports.em = hyperscript_helpers_1.default.em;
exports.embed = hyperscript_helpers_1.default.embed;
exports.fieldset = hyperscript_helpers_1.default.fieldset;
exports.figcaption = hyperscript_helpers_1.default.figcaption;
exports.figure = hyperscript_helpers_1.default.figure;
exports.footer = hyperscript_helpers_1.default.footer;
exports.form = hyperscript_helpers_1.default.form;
exports.h1 = hyperscript_helpers_1.default.h1;
exports.h2 = hyperscript_helpers_1.default.h2;
exports.h3 = hyperscript_helpers_1.default.h3;
exports.h4 = hyperscript_helpers_1.default.h4;
exports.h5 = hyperscript_helpers_1.default.h5;
exports.h6 = hyperscript_helpers_1.default.h6;
exports.head = hyperscript_helpers_1.default.head;
exports.header = hyperscript_helpers_1.default.header;
exports.hgroup = hyperscript_helpers_1.default.hgroup;
exports.hr = hyperscript_helpers_1.default.hr;
exports.html = hyperscript_helpers_1.default.html;
exports.i = hyperscript_helpers_1.default.i;
exports.iframe = hyperscript_helpers_1.default.iframe;
exports.img = hyperscript_helpers_1.default.img;
exports.input = hyperscript_helpers_1.default.input;
exports.ins = hyperscript_helpers_1.default.ins;
exports.kbd = hyperscript_helpers_1.default.kbd;
exports.keygen = hyperscript_helpers_1.default.keygen;
exports.label = hyperscript_helpers_1.default.label;
exports.legend = hyperscript_helpers_1.default.legend;
exports.li = hyperscript_helpers_1.default.li;
exports.link = hyperscript_helpers_1.default.link;
exports.main = hyperscript_helpers_1.default.main;
exports.map = hyperscript_helpers_1.default.map;
exports.mark = hyperscript_helpers_1.default.mark;
exports.menu = hyperscript_helpers_1.default.menu;
exports.meta = hyperscript_helpers_1.default.meta;
exports.nav = hyperscript_helpers_1.default.nav;
exports.noscript = hyperscript_helpers_1.default.noscript;
exports.object = hyperscript_helpers_1.default.object;
exports.ol = hyperscript_helpers_1.default.ol;
exports.optgroup = hyperscript_helpers_1.default.optgroup;
exports.option = hyperscript_helpers_1.default.option;
exports.p = hyperscript_helpers_1.default.p;
exports.param = hyperscript_helpers_1.default.param;
exports.pre = hyperscript_helpers_1.default.pre;
exports.progress = hyperscript_helpers_1.default.progress;
exports.q = hyperscript_helpers_1.default.q;
exports.rp = hyperscript_helpers_1.default.rp;
exports.rt = hyperscript_helpers_1.default.rt;
exports.ruby = hyperscript_helpers_1.default.ruby;
exports.s = hyperscript_helpers_1.default.s;
exports.samp = hyperscript_helpers_1.default.samp;
exports.script = hyperscript_helpers_1.default.script;
exports.section = hyperscript_helpers_1.default.section;
exports.select = hyperscript_helpers_1.default.select;
exports.small = hyperscript_helpers_1.default.small;
exports.source = hyperscript_helpers_1.default.source;
exports.span = hyperscript_helpers_1.default.span;
exports.strong = hyperscript_helpers_1.default.strong;
exports.style = hyperscript_helpers_1.default.style;
exports.sub = hyperscript_helpers_1.default.sub;
exports.sup = hyperscript_helpers_1.default.sup;
exports.table = hyperscript_helpers_1.default.table;
exports.tbody = hyperscript_helpers_1.default.tbody;
exports.td = hyperscript_helpers_1.default.td;
exports.textarea = hyperscript_helpers_1.default.textarea;
exports.tfoot = hyperscript_helpers_1.default.tfoot;
exports.th = hyperscript_helpers_1.default.th;
exports.thead = hyperscript_helpers_1.default.thead;
exports.title = hyperscript_helpers_1.default.title;
exports.tr = hyperscript_helpers_1.default.tr;
exports.u = hyperscript_helpers_1.default.u;
exports.ul = hyperscript_helpers_1.default.ul;
exports.video = hyperscript_helpers_1.default.video;

},{"./hyperscript":16,"./hyperscript-helpers":15,"./makeDOMDriver":20,"./makeHTMLDriver":21,"./mockDOMSource":22,"snabbdom/thunk":125}],18:[function(require,module,exports){
"use strict";
var utils_1 = require('./utils');
function isolateSource(source, scope) {
    return source.select(utils_1.SCOPE_PREFIX + scope);
}
exports.isolateSource = isolateSource;
function isolateSink(sink, scope) {
    return sink.map(function (vTree) {
        if (vTree.data && vTree.data.isolate) {
            var existingScope = vTree.data.isolate.replace(/(cycle|\-)/g, '');
            var _scope = scope.replace(/(cycle|\-)/g, '');
            if (isNaN(parseInt(existingScope))
                || isNaN(parseInt(_scope))
                || existingScope > _scope) {
                return vTree;
            }
        }
        vTree.data = vTree.data || {};
        vTree.data.isolate = scope;
        if (typeof vTree.key === 'undefined') {
            vTree.key = utils_1.SCOPE_PREFIX + scope;
        }
        return vTree;
    });
}
exports.isolateSink = isolateSink;

},{"./utils":25}],19:[function(require,module,exports){
"use strict";
var MapPolyfill = require('es6-map');
var IsolateModule = (function () {
    function IsolateModule(isolatedElements) {
        this.isolatedElements = isolatedElements;
        this.eventDelegators = new MapPolyfill();
    }
    IsolateModule.prototype.setScope = function (elm, scope) {
        this.isolatedElements.set(scope, elm);
    };
    IsolateModule.prototype.removeScope = function (scope) {
        this.isolatedElements.delete(scope);
    };
    IsolateModule.prototype.cleanupVNode = function (_a) {
        var data = _a.data, elm = _a.elm;
        data = data || {};
        var scope = data.isolate || '';
        var isCurrentElm = this.isolatedElements.get(scope) === elm;
        if (scope && isCurrentElm) {
            this.removeScope(scope);
            if (this.eventDelegators.get(scope)) {
                this.eventDelegators.set(scope, []);
            }
        }
    };
    IsolateModule.prototype.getIsolatedElement = function (scope) {
        return this.isolatedElements.get(scope);
    };
    IsolateModule.prototype.isIsolatedElement = function (elm) {
        var iterator = this.isolatedElements.entries();
        for (var result = iterator.next(); !!result.value; result = iterator.next()) {
            var _a = result.value, scope = _a[0], element = _a[1];
            if (elm === element) {
                return scope;
            }
        }
        return false;
    };
    IsolateModule.prototype.addEventDelegator = function (scope, eventDelegator) {
        var delegators = this.eventDelegators.get(scope);
        if (!delegators) {
            delegators = [];
            this.eventDelegators.set(scope, delegators);
        }
        delegators[delegators.length] = eventDelegator;
    };
    IsolateModule.prototype.reset = function () {
        this.isolatedElements.clear();
    };
    IsolateModule.prototype.createModule = function () {
        var self = this;
        return {
            create: function (oldVNode, vNode) {
                var _a = oldVNode.data, oldData = _a === void 0 ? {} : _a;
                var elm = vNode.elm, _b = vNode.data, data = _b === void 0 ? {} : _b;
                var oldScope = oldData.isolate || "";
                var scope = data.isolate || "";
                if (scope) {
                    if (oldScope) {
                        self.removeScope(oldScope);
                    }
                    self.setScope(elm, scope);
                    var delegators = self.eventDelegators.get(scope);
                    if (delegators) {
                        for (var i = 0, len = delegators.length; i < len; ++i) {
                            delegators[i].updateTopElement(elm);
                        }
                    }
                    else if (delegators === void 0) {
                        self.eventDelegators.set(scope, []);
                    }
                }
                if (oldScope && !scope) {
                    self.removeScope(scope);
                }
            },
            update: function (oldVNode, vNode) {
                var _a = oldVNode.data, oldData = _a === void 0 ? {} : _a;
                var elm = vNode.elm, _b = vNode.data, data = _b === void 0 ? {} : _b;
                var oldScope = oldData.isolate || "";
                var scope = data.isolate || "";
                if (scope && scope !== oldScope) {
                    if (oldScope) {
                        self.removeScope(oldScope);
                    }
                    self.setScope(elm, scope);
                }
                if (oldScope && !scope) {
                    self.removeScope(scope);
                }
            },
            remove: function (vNode, cb) {
                self.cleanupVNode(vNode);
                cb();
            },
            destroy: function (vNode) {
                self.cleanupVNode(vNode);
            },
        };
    };
    return IsolateModule;
}());
exports.IsolateModule = IsolateModule;

},{"es6-map":73}],20:[function(require,module,exports){
"use strict";
var snabbdom_1 = require('snabbdom');
var xstream_1 = require('xstream');
var MainDOMSource_1 = require('./MainDOMSource');
var VNodeWrapper_1 = require('./VNodeWrapper');
var utils_1 = require('./utils');
var modules_1 = require('./modules');
var isolateModule_1 = require('./isolateModule');
var transposition_1 = require('./transposition');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var MapPolyfill = require('es6-map');
function makeDOMDriverInputGuard(modules) {
    if (!Array.isArray(modules)) {
        throw new Error("Optional modules option must be " +
            "an array for snabbdom modules");
    }
}
function domDriverInputGuard(view$) {
    if (!view$
        || typeof view$.addListener !== "function"
        || typeof view$.fold !== "function") {
        throw new Error("The DOM driver function expects as input a Stream of " +
            "virtual DOM elements");
    }
}
function makeDOMDriver(container, options) {
    if (!options) {
        options = {};
    }
    var transposition = options.transposition || false;
    var modules = options.modules || modules_1.default;
    var isolateModule = new isolateModule_1.IsolateModule((new MapPolyfill()));
    var patch = snabbdom_1.init([isolateModule.createModule()].concat(modules));
    var rootElement = utils_1.getElement(container);
    var vnodeWrapper = new VNodeWrapper_1.VNodeWrapper(rootElement);
    var delegators = new MapPolyfill();
    makeDOMDriverInputGuard(modules);
    function DOMDriver(vnode$, runStreamAdapter, name) {
        domDriverInputGuard(vnode$);
        var transposeVNode = transposition_1.makeTransposeVNode(runStreamAdapter);
        var preprocessedVNode$ = (transposition ? vnode$.map(transposeVNode).flatten() : vnode$);
        var sanitation$ = xstream_1.default.create();
        var rootElement$ = xstream_1.default.merge(preprocessedVNode$.endWhen(sanitation$), sanitation$)
            .map(function (vnode) { return vnodeWrapper.call(vnode); })
            .fold(patch, rootElement)
            .drop(1)
            .map(function unwrapElementFromVNode(vnode) { return vnode.elm; })
            .compose(function (stream) { return xstream_1.default.merge(stream, xstream_1.default.never()); }) // don't complete this stream
            .startWith(rootElement);
        rootElement$.addListener({ next: function () { }, error: function () { }, complete: function () { } });
        return new MainDOMSource_1.MainDOMSource(rootElement$, sanitation$, runStreamAdapter, [], isolateModule, delegators, name);
    }
    ;
    DOMDriver.streamAdapter = xstream_adapter_1.default;
    return DOMDriver;
}
exports.makeDOMDriver = makeDOMDriver;

},{"./MainDOMSource":11,"./VNodeWrapper":13,"./isolateModule":19,"./modules":23,"./transposition":24,"./utils":25,"@cycle/xstream-adapter":26,"es6-map":73,"snabbdom":124,"xstream":131}],21:[function(require,module,exports){
"use strict";
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var transposition_1 = require('./transposition');
var HTMLSource_1 = require('./HTMLSource');
var toHTML = require('snabbdom-to-html');
var noop = function () { };
function makeHTMLDriver(effect, options) {
    if (!options) {
        options = {};
    }
    var transposition = options.transposition || false;
    function htmlDriver(vnode$, runStreamAdapter, name) {
        var transposeVNode = transposition_1.makeTransposeVNode(runStreamAdapter);
        var preprocessedVNode$ = (transposition ? vnode$.map(transposeVNode).flatten() : vnode$);
        var html$ = preprocessedVNode$.map(toHTML);
        html$.addListener({
            next: effect || noop,
            error: noop,
            complete: noop,
        });
        return new HTMLSource_1.HTMLSource(html$, runStreamAdapter, name);
    }
    ;
    htmlDriver.streamAdapter = xstream_adapter_1.default;
    return htmlDriver;
}
exports.makeHTMLDriver = makeHTMLDriver;

},{"./HTMLSource":10,"./transposition":24,"@cycle/xstream-adapter":26,"snabbdom-to-html":109}],22:[function(require,module,exports){
"use strict";
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var xstream_1 = require('xstream');
var SCOPE_PREFIX = '___';
var MockedDOMSource = (function () {
    function MockedDOMSource(_streamAdapter, _mockConfig) {
        this._streamAdapter = _streamAdapter;
        this._mockConfig = _mockConfig;
        if (_mockConfig.elements) {
            this._elements = _mockConfig.elements;
        }
        else {
            this._elements = _streamAdapter.adapt(xstream_1.default.empty(), xstream_adapter_1.default.streamSubscribe);
        }
    }
    MockedDOMSource.prototype.elements = function () {
        var out = this._elements;
        out._isCycleSource = 'MockedDOM';
        return out;
    };
    MockedDOMSource.prototype.events = function (eventType, options) {
        var mockConfig = this._mockConfig;
        var keys = Object.keys(mockConfig);
        var keysLen = keys.length;
        for (var i = 0; i < keysLen; i++) {
            var key = keys[i];
            if (key === eventType) {
                var out_1 = mockConfig[key];
                out_1._isCycleSource = 'MockedDOM';
                return out_1;
            }
        }
        var out = this._streamAdapter.adapt(xstream_1.default.empty(), xstream_adapter_1.default.streamSubscribe);
        out._isCycleSource = 'MockedDOM';
        return out;
    };
    MockedDOMSource.prototype.select = function (selector) {
        var mockConfig = this._mockConfig;
        var keys = Object.keys(mockConfig);
        var keysLen = keys.length;
        for (var i = 0; i < keysLen; i++) {
            var key = keys[i];
            if (key === selector) {
                return new MockedDOMSource(this._streamAdapter, mockConfig[key]);
            }
        }
        return new MockedDOMSource(this._streamAdapter, {});
    };
    MockedDOMSource.prototype.isolateSource = function (source, scope) {
        return source.select('.' + SCOPE_PREFIX + scope);
    };
    MockedDOMSource.prototype.isolateSink = function (sink, scope) {
        return sink.map(function (vnode) {
            if (vnode.sel && vnode.sel.indexOf(SCOPE_PREFIX + scope) !== -1) {
                return vnode;
            }
            else {
                vnode.sel += "." + SCOPE_PREFIX + scope;
                return vnode;
            }
        });
    };
    return MockedDOMSource;
}());
exports.MockedDOMSource = MockedDOMSource;
function mockDOMSource(streamAdapter, mockConfig) {
    return new MockedDOMSource(streamAdapter, mockConfig);
}
exports.mockDOMSource = mockDOMSource;

},{"@cycle/xstream-adapter":26,"xstream":131}],23:[function(require,module,exports){
"use strict";
var ClassModule = require('snabbdom/modules/class');
exports.ClassModule = ClassModule;
var PropsModule = require('snabbdom/modules/props');
exports.PropsModule = PropsModule;
var AttrsModule = require('snabbdom/modules/attributes');
exports.AttrsModule = AttrsModule;
var EventsModule = require('snabbdom/modules/eventlisteners');
exports.EventsModule = EventsModule;
var StyleModule = require('snabbdom/modules/style');
exports.StyleModule = StyleModule;
var HeroModule = require('snabbdom/modules/hero');
exports.HeroModule = HeroModule;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = [StyleModule, ClassModule, PropsModule, AttrsModule];

},{"snabbdom/modules/attributes":118,"snabbdom/modules/class":119,"snabbdom/modules/eventlisteners":120,"snabbdom/modules/hero":121,"snabbdom/modules/props":122,"snabbdom/modules/style":123}],24:[function(require,module,exports){
"use strict";
var xstream_adapter_1 = require('@cycle/xstream-adapter');
var xstream_1 = require('xstream');
function createVTree(vnode, children) {
    return {
        sel: vnode.sel,
        data: vnode.data,
        text: vnode.text,
        elm: vnode.elm,
        key: vnode.key,
        children: children,
    };
}
function makeTransposeVNode(runStreamAdapter) {
    function internalTransposeVNode(vnode) {
        if (!vnode) {
            return null;
        }
        else if (vnode && vnode.data && vnode.data.static) {
            return xstream_1.default.of(vnode);
        }
        else if (runStreamAdapter.isValidStream(vnode)) {
            var xsStream = xstream_adapter_1.default.adapt(vnode, runStreamAdapter.streamSubscribe);
            return xsStream.map(internalTransposeVNode).flatten();
        }
        else if (typeof vnode === "object") {
            if (!vnode.children || vnode.children.length === 0) {
                return xstream_1.default.of(vnode);
            }
            var vnodeChildren = vnode.children
                .map(internalTransposeVNode)
                .filter(function (x) { return x !== null; });
            if (vnodeChildren.length === 0) {
                return xstream_1.default.of(createVTree(vnode, []));
            }
            else {
                return xstream_1.default.combine.apply(xstream_1.default, vnodeChildren)
                    .map(function (children) { return createVTree(vnode, children.slice()); });
            }
        }
        else {
            throw new Error("Unhandled vTree Value");
        }
    }
    ;
    return function transposeVNode(vnode) {
        return internalTransposeVNode(vnode);
    };
}
exports.makeTransposeVNode = makeTransposeVNode;

},{"@cycle/xstream-adapter":26,"xstream":131}],25:[function(require,module,exports){
"use strict";
function isElement(obj) {
    return typeof HTMLElement === "object" ?
        obj instanceof HTMLElement || obj instanceof DocumentFragment :
        obj && typeof obj === "object" && obj !== null &&
            (obj.nodeType === 1 || obj.nodeType === 11) &&
            typeof obj.nodeName === "string";
}
exports.SCOPE_PREFIX = "$$CYCLEDOM$$-";
function getElement(selectors) {
    var domElement = typeof selectors === 'string' ?
        document.querySelector(selectors) :
        selectors;
    if (typeof selectors === 'string' && domElement === null) {
        throw new Error("Cannot render into unknown element `" + selectors + "`");
    }
    else if (!isElement(domElement)) {
        throw new Error("Given container is not a DOM element neither a " +
            "selector string.");
    }
    return domElement;
}
exports.getElement = getElement;
function getScope(namespace) {
    return namespace
        .filter(function (c) { return c.indexOf(exports.SCOPE_PREFIX) > -1; })
        .map(function (c) { return c.replace(exports.SCOPE_PREFIX, ''); })
        .join("-");
}
exports.getScope = getScope;
function getSelectors(namespace) {
    return namespace.filter(function (c) { return c.indexOf(exports.SCOPE_PREFIX) === -1; }).join(" ");
}
exports.getSelectors = getSelectors;

},{}],26:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var XStreamAdapter = {
    adapt: function (originStream, originStreamSubscribe) {
        if (XStreamAdapter.isValidStream(originStream)) {
            return originStream;
        }
        ;
        var dispose = null;
        return xstream_1.default.create({
            start: function (out) {
                var observer = out;
                dispose = originStreamSubscribe(originStream, observer);
            },
            stop: function () {
                if (typeof dispose === 'function') {
                    dispose();
                }
            },
        });
    },
    makeSubject: function () {
        var stream = xstream_1.default.create();
        var observer = {
            next: function (x) { stream.shamefullySendNext(x); },
            error: function (err) { stream.shamefullySendError(err); },
            complete: function () { stream.shamefullySendComplete(); },
        };
        return { observer: observer, stream: stream };
    },
    remember: function (stream) {
        return stream.remember();
    },
    isValidStream: function (stream) {
        return (typeof stream.addListener === 'function' &&
            typeof stream.shamefullySendNext === 'function');
    },
    streamSubscribe: function (stream, observer) {
        stream.addListener(observer);
        return function () { return stream.removeListener(observer); };
    },
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = XStreamAdapter;

},{"xstream":131}],27:[function(require,module,exports){
"use strict";
var base_1 = require('@cycle/base');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
/**
 * Takes a `main` function and circularly connects it to the given collection
 * of driver functions.
 *
 * **Example:**
 * ```js
 * import {run} from '@cycle/xstream-run';
 * const dispose = run(main, drivers);
 * // ...
 * dispose();
 * ```
 *
 * The `main` function expects a collection of "source" streams (returned from
 * drivers) as input, and should return a collection of "sink" streams (to be
 * given to drivers). A "collection of streams" is a JavaScript object where
 * keys match the driver names registered by the `drivers` object, and values
 * are the streams. Refer to the documentation of each driver to see more
 * details on what types of sources it outputs and sinks it receives.
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Function} a dispose function, used to terminate the execution of the
 * Cycle.js program, cleaning up resources used.
 * @function run
 */
function run(main, drivers) {
    var _a = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default }), run = _a.run, sinks = _a.sinks;
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](sinks);
    }
    return run();
}
exports.run = run;
/**
 * A function that prepares the Cycle application to be executed. Takes a `main`
 * function and prepares to circularly connects it to the given collection of
 * driver functions. As an output, `Cycle()` returns an object with three
 * properties: `sources`, `sinks` and `run`. Only when `run()` is called will
 * the application actually execute. Refer to the documentation of `run()` for
 * more details.
 *
 * **Example:**
 * ```js
 * import Cycle from '@cycle/xstream-run';
 * const {sources, sinks, run} = Cycle(main, drivers);
 * // ...
 * const dispose = run(); // Executes the application
 * // ...
 * dispose();
 * ```
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Object} an object with three properties: `sources`, `sinks` and
 * `run`. `sources` is the collection of driver sources, `sinks` is the
 * collection of driver sinks, these can be used for debugging or testing. `run`
 * is the function that once called will execute the application.
 * @function Cycle
 */
var Cycle = function (main, drivers) {
    var out = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default });
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](out.sinks);
    }
    return out;
};
Cycle.run = run;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{"@cycle/base":5,"@cycle/xstream-adapter":26}],28:[function(require,module,exports){
/*!
 * Cross-Browser Split 1.1.1
 * Copyright 2007-2012 Steven Levithan <stevenlevithan.com>
 * Available under the MIT License
 * ECMAScript compliant, uniform cross-browser split method
 */

/**
 * Splits a string into an array of strings using a regex or string separator. Matches of the
 * separator are not included in the result array. However, if `separator` is a regex that contains
 * capturing groups, backreferences are spliced into the result each time `separator` is matched.
 * Fixes browser bugs compared to the native `String.prototype.split` and can be used reliably
 * cross-browser.
 * @param {String} str String to split.
 * @param {RegExp|String} separator Regex or string to use for separating the string.
 * @param {Number} [limit] Maximum number of items to include in the result array.
 * @returns {Array} Array of substrings.
 * @example
 *
 * // Basic use
 * split('a b c d', ' ');
 * // -> ['a', 'b', 'c', 'd']
 *
 * // With limit
 * split('a b c d', ' ', 2);
 * // -> ['a', 'b']
 *
 * // Backreferences in result array
 * split('..word1 word2..', /([a-z]+)(\d+)/i);
 * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
 */
module.exports = (function split(undef) {

  var nativeSplit = String.prototype.split,
    compliantExecNpcg = /()??/.exec("")[1] === undef,
    // NPCG: nonparticipating capturing group
    self;

  self = function(str, separator, limit) {
    // If `separator` is not a regex, use `nativeSplit`
    if (Object.prototype.toString.call(separator) !== "[object RegExp]") {
      return nativeSplit.call(str, separator, limit);
    }
    var output = [],
      flags = (separator.ignoreCase ? "i" : "") + (separator.multiline ? "m" : "") + (separator.extended ? "x" : "") + // Proposed for ES6
      (separator.sticky ? "y" : ""),
      // Firefox 3+
      lastLastIndex = 0,
      // Make `global` and avoid `lastIndex` issues by working with a copy
      separator = new RegExp(separator.source, flags + "g"),
      separator2, match, lastIndex, lastLength;
    str += ""; // Type-convert
    if (!compliantExecNpcg) {
      // Doesn't need flags gy, but they don't hurt
      separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
    }
    /* Values for `limit`, per the spec:
     * If undefined: 4294967295 // Math.pow(2, 32) - 1
     * If 0, Infinity, or NaN: 0
     * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
     * If negative number: 4294967296 - Math.floor(Math.abs(limit))
     * If other: Type-convert, then use the above rules
     */
    limit = limit === undef ? -1 >>> 0 : // Math.pow(2, 32) - 1
    limit >>> 0; // ToUint32(limit)
    while (match = separator.exec(str)) {
      // `separator.lastIndex` is not reliable cross-browser
      lastIndex = match.index + match[0].length;
      if (lastIndex > lastLastIndex) {
        output.push(str.slice(lastLastIndex, match.index));
        // Fix browsers whose `exec` methods don't consistently return `undefined` for
        // nonparticipating capturing groups
        if (!compliantExecNpcg && match.length > 1) {
          match[0].replace(separator2, function() {
            for (var i = 1; i < arguments.length - 2; i++) {
              if (arguments[i] === undef) {
                match[i] = undef;
              }
            }
          });
        }
        if (match.length > 1 && match.index < str.length) {
          Array.prototype.push.apply(output, match.slice(1));
        }
        lastLength = match[0].length;
        lastLastIndex = lastIndex;
        if (output.length >= limit) {
          break;
        }
      }
      if (separator.lastIndex === match.index) {
        separator.lastIndex++; // Avoid an infinite loop
      }
    }
    if (lastLastIndex === str.length) {
      if (lastLength || !separator.test("")) {
        output.push("");
      }
    } else {
      output.push(str.slice(lastLastIndex));
    }
    return output.length > limit ? output.slice(0, limit) : output;
  };

  return self;
})();

},{}],29:[function(require,module,exports){
'use strict';

var copy       = require('es5-ext/object/copy')
  , map        = require('es5-ext/object/map')
  , callable   = require('es5-ext/object/valid-callable')
  , validValue = require('es5-ext/object/valid-value')

  , bind = Function.prototype.bind, defineProperty = Object.defineProperty
  , hasOwnProperty = Object.prototype.hasOwnProperty
  , define;

define = function (name, desc, bindTo) {
	var value = validValue(desc) && callable(desc.value), dgs;
	dgs = copy(desc);
	delete dgs.writable;
	delete dgs.value;
	dgs.get = function () {
		if (hasOwnProperty.call(this, name)) return value;
		desc.value = bind.call(value, (bindTo == null) ? this : this[bindTo]);
		defineProperty(this, name, desc);
		return this[name];
	};
	return dgs;
};

module.exports = function (props/*, bindTo*/) {
	var bindTo = arguments[1];
	return map(props, function (desc, name) {
		return define(name, desc, bindTo);
	});
};

},{"es5-ext/object/copy":46,"es5-ext/object/map":54,"es5-ext/object/valid-callable":60,"es5-ext/object/valid-value":61}],30:[function(require,module,exports){
'use strict';

var assign        = require('es5-ext/object/assign')
  , normalizeOpts = require('es5-ext/object/normalize-options')
  , isCallable    = require('es5-ext/object/is-callable')
  , contains      = require('es5-ext/string/#/contains')

  , d;

d = module.exports = function (dscr, value/*, options*/) {
	var c, e, w, options, desc;
	if ((arguments.length < 2) || (typeof dscr !== 'string')) {
		options = value;
		value = dscr;
		dscr = null;
	} else {
		options = arguments[2];
	}
	if (dscr == null) {
		c = w = true;
		e = false;
	} else {
		c = contains.call(dscr, 'c');
		e = contains.call(dscr, 'e');
		w = contains.call(dscr, 'w');
	}

	desc = { value: value, configurable: c, enumerable: e, writable: w };
	return !options ? desc : assign(normalizeOpts(options), desc);
};

d.gs = function (dscr, get, set/*, options*/) {
	var c, e, options, desc;
	if (typeof dscr !== 'string') {
		options = set;
		set = get;
		get = dscr;
		dscr = null;
	} else {
		options = arguments[3];
	}
	if (get == null) {
		get = undefined;
	} else if (!isCallable(get)) {
		options = get;
		get = set = undefined;
	} else if (set == null) {
		set = undefined;
	} else if (!isCallable(set)) {
		options = set;
		set = undefined;
	}
	if (dscr == null) {
		c = true;
		e = false;
	} else {
		c = contains.call(dscr, 'c');
		e = contains.call(dscr, 'e');
	}

	desc = { get: get, set: set, configurable: c, enumerable: e };
	return !options ? desc : assign(normalizeOpts(options), desc);
};

},{"es5-ext/object/assign":43,"es5-ext/object/is-callable":49,"es5-ext/object/normalize-options":55,"es5-ext/string/#/contains":62}],31:[function(require,module,exports){
var pSlice = Array.prototype.slice;
var objectKeys = require('./lib/keys.js');
var isArguments = require('./lib/is_arguments.js');

var deepEqual = module.exports = function (actual, expected, opts) {
  if (!opts) opts = {};
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!actual || !expected || typeof actual != 'object' && typeof expected != 'object') {
    return opts.strict ? actual === expected : actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected, opts);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isBuffer (x) {
  if (!x || typeof x !== 'object' || typeof x.length !== 'number') return false;
  if (typeof x.copy !== 'function' || typeof x.slice !== 'function') {
    return false;
  }
  if (x.length > 0 && typeof x[0] !== 'number') return false;
  return true;
}

function objEquiv(a, b, opts) {
  var i, key;
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b, opts);
  }
  if (isBuffer(a)) {
    if (!isBuffer(b)) {
      return false;
    }
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b);
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key], opts)) return false;
  }
  return typeof a === typeof b;
}

},{"./lib/is_arguments.js":32,"./lib/keys.js":33}],32:[function(require,module,exports){
var supportsArgumentsClass = (function(){
  return Object.prototype.toString.call(arguments)
})() == '[object Arguments]';

exports = module.exports = supportsArgumentsClass ? supported : unsupported;

exports.supported = supported;
function supported(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
};

exports.unsupported = unsupported;
function unsupported(object){
  return object &&
    typeof object == 'object' &&
    typeof object.length == 'number' &&
    Object.prototype.hasOwnProperty.call(object, 'callee') &&
    !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
    false;
};

},{}],33:[function(require,module,exports){
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;

exports.shim = shim;
function shim (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}

},{}],34:[function(require,module,exports){
// Inspired by Google Closure:
// http://closure-library.googlecode.com/svn/docs/
// closure_goog_array_array.js.html#goog.array.clear

'use strict';

var value = require('../../object/valid-value');

module.exports = function () {
	value(this).length = 0;
	return this;
};

},{"../../object/valid-value":61}],35:[function(require,module,exports){
'use strict';

var toPosInt = require('../../number/to-pos-integer')
  , value    = require('../../object/valid-value')

  , indexOf = Array.prototype.indexOf
  , hasOwnProperty = Object.prototype.hasOwnProperty
  , abs = Math.abs, floor = Math.floor;

module.exports = function (searchElement/*, fromIndex*/) {
	var i, l, fromIndex, val;
	if (searchElement === searchElement) { //jslint: ignore
		return indexOf.apply(this, arguments);
	}

	l = toPosInt(value(this).length);
	fromIndex = arguments[1];
	if (isNaN(fromIndex)) fromIndex = 0;
	else if (fromIndex >= 0) fromIndex = floor(fromIndex);
	else fromIndex = toPosInt(this.length) - floor(abs(fromIndex));

	for (i = fromIndex; i < l; ++i) {
		if (hasOwnProperty.call(this, i)) {
			val = this[i];
			if (val !== val) return i; //jslint: ignore
		}
	}
	return -1;
};

},{"../../number/to-pos-integer":41,"../../object/valid-value":61}],36:[function(require,module,exports){
'use strict';

var toString = Object.prototype.toString

  , id = toString.call((function () { return arguments; }()));

module.exports = function (x) { return (toString.call(x) === id); };

},{}],37:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')()
	? Math.sign
	: require('./shim');

},{"./is-implemented":38,"./shim":39}],38:[function(require,module,exports){
'use strict';

module.exports = function () {
	var sign = Math.sign;
	if (typeof sign !== 'function') return false;
	return ((sign(10) === 1) && (sign(-20) === -1));
};

},{}],39:[function(require,module,exports){
'use strict';

module.exports = function (value) {
	value = Number(value);
	if (isNaN(value) || (value === 0)) return value;
	return (value > 0) ? 1 : -1;
};

},{}],40:[function(require,module,exports){
'use strict';

var sign = require('../math/sign')

  , abs = Math.abs, floor = Math.floor;

module.exports = function (value) {
	if (isNaN(value)) return 0;
	value = Number(value);
	if ((value === 0) || !isFinite(value)) return value;
	return sign(value) * floor(abs(value));
};

},{"../math/sign":37}],41:[function(require,module,exports){
'use strict';

var toInteger = require('./to-integer')

  , max = Math.max;

module.exports = function (value) { return max(0, toInteger(value)); };

},{"./to-integer":40}],42:[function(require,module,exports){
// Internal method, used by iteration functions.
// Calls a function for each key-value pair found in object
// Optionally takes compareFn to iterate object in specific order

'use strict';

var callable = require('./valid-callable')
  , value    = require('./valid-value')

  , bind = Function.prototype.bind, call = Function.prototype.call, keys = Object.keys
  , propertyIsEnumerable = Object.prototype.propertyIsEnumerable;

module.exports = function (method, defVal) {
	return function (obj, cb/*, thisArg, compareFn*/) {
		var list, thisArg = arguments[2], compareFn = arguments[3];
		obj = Object(value(obj));
		callable(cb);

		list = keys(obj);
		if (compareFn) {
			list.sort((typeof compareFn === 'function') ? bind.call(compareFn, obj) : undefined);
		}
		if (typeof method !== 'function') method = list[method];
		return call.call(method, list, function (key, index) {
			if (!propertyIsEnumerable.call(obj, key)) return defVal;
			return call.call(cb, thisArg, obj[key], key, obj, index);
		});
	};
};

},{"./valid-callable":60,"./valid-value":61}],43:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')()
	? Object.assign
	: require('./shim');

},{"./is-implemented":44,"./shim":45}],44:[function(require,module,exports){
'use strict';

module.exports = function () {
	var assign = Object.assign, obj;
	if (typeof assign !== 'function') return false;
	obj = { foo: 'raz' };
	assign(obj, { bar: 'dwa' }, { trzy: 'trzy' });
	return (obj.foo + obj.bar + obj.trzy) === 'razdwatrzy';
};

},{}],45:[function(require,module,exports){
'use strict';

var keys  = require('../keys')
  , value = require('../valid-value')

  , max = Math.max;

module.exports = function (dest, src/*, …srcn*/) {
	var error, i, l = max(arguments.length, 2), assign;
	dest = Object(value(dest));
	assign = function (key) {
		try { dest[key] = src[key]; } catch (e) {
			if (!error) error = e;
		}
	};
	for (i = 1; i < l; ++i) {
		src = arguments[i];
		keys(src).forEach(assign);
	}
	if (error !== undefined) throw error;
	return dest;
};

},{"../keys":51,"../valid-value":61}],46:[function(require,module,exports){
'use strict';

var assign = require('./assign')
  , value  = require('./valid-value');

module.exports = function (obj) {
	var copy = Object(value(obj));
	if (copy !== obj) return copy;
	return assign({}, obj);
};

},{"./assign":43,"./valid-value":61}],47:[function(require,module,exports){
// Workaround for http://code.google.com/p/v8/issues/detail?id=2804

'use strict';

var create = Object.create, shim;

if (!require('./set-prototype-of/is-implemented')()) {
	shim = require('./set-prototype-of/shim');
}

module.exports = (function () {
	var nullObject, props, desc;
	if (!shim) return create;
	if (shim.level !== 1) return create;

	nullObject = {};
	props = {};
	desc = { configurable: false, enumerable: false, writable: true,
		value: undefined };
	Object.getOwnPropertyNames(Object.prototype).forEach(function (name) {
		if (name === '__proto__') {
			props[name] = { configurable: true, enumerable: false, writable: true,
				value: undefined };
			return;
		}
		props[name] = desc;
	});
	Object.defineProperties(nullObject, props);

	Object.defineProperty(shim, 'nullPolyfill', { configurable: false,
		enumerable: false, writable: false, value: nullObject });

	return function (prototype, props) {
		return create((prototype === null) ? nullObject : prototype, props);
	};
}());

},{"./set-prototype-of/is-implemented":58,"./set-prototype-of/shim":59}],48:[function(require,module,exports){
'use strict';

module.exports = require('./_iterate')('forEach');

},{"./_iterate":42}],49:[function(require,module,exports){
// Deprecated

'use strict';

module.exports = function (obj) { return typeof obj === 'function'; };

},{}],50:[function(require,module,exports){
'use strict';

var map = { function: true, object: true };

module.exports = function (x) {
	return ((x != null) && map[typeof x]) || false;
};

},{}],51:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')()
	? Object.keys
	: require('./shim');

},{"./is-implemented":52,"./shim":53}],52:[function(require,module,exports){
'use strict';

module.exports = function () {
	try {
		Object.keys('primitive');
		return true;
	} catch (e) { return false; }
};

},{}],53:[function(require,module,exports){
'use strict';

var keys = Object.keys;

module.exports = function (object) {
	return keys(object == null ? object : Object(object));
};

},{}],54:[function(require,module,exports){
'use strict';

var callable = require('./valid-callable')
  , forEach  = require('./for-each')

  , call = Function.prototype.call;

module.exports = function (obj, cb/*, thisArg*/) {
	var o = {}, thisArg = arguments[2];
	callable(cb);
	forEach(obj, function (value, key, obj, index) {
		o[key] = call.call(cb, thisArg, value, key, obj, index);
	});
	return o;
};

},{"./for-each":48,"./valid-callable":60}],55:[function(require,module,exports){
'use strict';

var forEach = Array.prototype.forEach, create = Object.create;

var process = function (src, obj) {
	var key;
	for (key in src) obj[key] = src[key];
};

module.exports = function (options/*, …options*/) {
	var result = create(null);
	forEach.call(arguments, function (options) {
		if (options == null) return;
		process(Object(options), result);
	});
	return result;
};

},{}],56:[function(require,module,exports){
'use strict';

var forEach = Array.prototype.forEach, create = Object.create;

module.exports = function (arg/*, …args*/) {
	var set = create(null);
	forEach.call(arguments, function (name) { set[name] = true; });
	return set;
};

},{}],57:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')()
	? Object.setPrototypeOf
	: require('./shim');

},{"./is-implemented":58,"./shim":59}],58:[function(require,module,exports){
'use strict';

var create = Object.create, getPrototypeOf = Object.getPrototypeOf
  , x = {};

module.exports = function (/*customCreate*/) {
	var setPrototypeOf = Object.setPrototypeOf
	  , customCreate = arguments[0] || create;
	if (typeof setPrototypeOf !== 'function') return false;
	return getPrototypeOf(setPrototypeOf(customCreate(null), x)) === x;
};

},{}],59:[function(require,module,exports){
// Big thanks to @WebReflection for sorting this out
// https://gist.github.com/WebReflection/5593554

'use strict';

var isObject      = require('../is-object')
  , value         = require('../valid-value')

  , isPrototypeOf = Object.prototype.isPrototypeOf
  , defineProperty = Object.defineProperty
  , nullDesc = { configurable: true, enumerable: false, writable: true,
		value: undefined }
  , validate;

validate = function (obj, prototype) {
	value(obj);
	if ((prototype === null) || isObject(prototype)) return obj;
	throw new TypeError('Prototype must be null or an object');
};

module.exports = (function (status) {
	var fn, set;
	if (!status) return null;
	if (status.level === 2) {
		if (status.set) {
			set = status.set;
			fn = function (obj, prototype) {
				set.call(validate(obj, prototype), prototype);
				return obj;
			};
		} else {
			fn = function (obj, prototype) {
				validate(obj, prototype).__proto__ = prototype;
				return obj;
			};
		}
	} else {
		fn = function self(obj, prototype) {
			var isNullBase;
			validate(obj, prototype);
			isNullBase = isPrototypeOf.call(self.nullPolyfill, obj);
			if (isNullBase) delete self.nullPolyfill.__proto__;
			if (prototype === null) prototype = self.nullPolyfill;
			obj.__proto__ = prototype;
			if (isNullBase) defineProperty(self.nullPolyfill, '__proto__', nullDesc);
			return obj;
		};
	}
	return Object.defineProperty(fn, 'level', { configurable: false,
		enumerable: false, writable: false, value: status.level });
}((function () {
	var x = Object.create(null), y = {}, set
	  , desc = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__');

	if (desc) {
		try {
			set = desc.set; // Opera crashes at this point
			set.call(x, y);
		} catch (ignore) { }
		if (Object.getPrototypeOf(x) === y) return { set: set, level: 2 };
	}

	x.__proto__ = y;
	if (Object.getPrototypeOf(x) === y) return { level: 2 };

	x = {};
	x.__proto__ = y;
	if (Object.getPrototypeOf(x) === y) return { level: 1 };

	return false;
}())));

require('../create');

},{"../create":47,"../is-object":50,"../valid-value":61}],60:[function(require,module,exports){
'use strict';

module.exports = function (fn) {
	if (typeof fn !== 'function') throw new TypeError(fn + " is not a function");
	return fn;
};

},{}],61:[function(require,module,exports){
'use strict';

module.exports = function (value) {
	if (value == null) throw new TypeError("Cannot use null or undefined");
	return value;
};

},{}],62:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')()
	? String.prototype.contains
	: require('./shim');

},{"./is-implemented":63,"./shim":64}],63:[function(require,module,exports){
'use strict';

var str = 'razdwatrzy';

module.exports = function () {
	if (typeof str.contains !== 'function') return false;
	return ((str.contains('dwa') === true) && (str.contains('foo') === false));
};

},{}],64:[function(require,module,exports){
'use strict';

var indexOf = String.prototype.indexOf;

module.exports = function (searchString/*, position*/) {
	return indexOf.call(this, searchString, arguments[1]) > -1;
};

},{}],65:[function(require,module,exports){
'use strict';

var toString = Object.prototype.toString

  , id = toString.call('');

module.exports = function (x) {
	return (typeof x === 'string') || (x && (typeof x === 'object') &&
		((x instanceof String) || (toString.call(x) === id))) || false;
};

},{}],66:[function(require,module,exports){
'use strict';

var setPrototypeOf = require('es5-ext/object/set-prototype-of')
  , contains       = require('es5-ext/string/#/contains')
  , d              = require('d')
  , Iterator       = require('./')

  , defineProperty = Object.defineProperty
  , ArrayIterator;

ArrayIterator = module.exports = function (arr, kind) {
	if (!(this instanceof ArrayIterator)) return new ArrayIterator(arr, kind);
	Iterator.call(this, arr);
	if (!kind) kind = 'value';
	else if (contains.call(kind, 'key+value')) kind = 'key+value';
	else if (contains.call(kind, 'key')) kind = 'key';
	else kind = 'value';
	defineProperty(this, '__kind__', d('', kind));
};
if (setPrototypeOf) setPrototypeOf(ArrayIterator, Iterator);

ArrayIterator.prototype = Object.create(Iterator.prototype, {
	constructor: d(ArrayIterator),
	_resolve: d(function (i) {
		if (this.__kind__ === 'value') return this.__list__[i];
		if (this.__kind__ === 'key+value') return [i, this.__list__[i]];
		return i;
	}),
	toString: d(function () { return '[object Array Iterator]'; })
});

},{"./":69,"d":30,"es5-ext/object/set-prototype-of":57,"es5-ext/string/#/contains":62}],67:[function(require,module,exports){
'use strict';

var isArguments = require('es5-ext/function/is-arguments')
  , callable    = require('es5-ext/object/valid-callable')
  , isString    = require('es5-ext/string/is-string')
  , get         = require('./get')

  , isArray = Array.isArray, call = Function.prototype.call
  , some = Array.prototype.some;

module.exports = function (iterable, cb/*, thisArg*/) {
	var mode, thisArg = arguments[2], result, doBreak, broken, i, l, char, code;
	if (isArray(iterable) || isArguments(iterable)) mode = 'array';
	else if (isString(iterable)) mode = 'string';
	else iterable = get(iterable);

	callable(cb);
	doBreak = function () { broken = true; };
	if (mode === 'array') {
		some.call(iterable, function (value) {
			call.call(cb, thisArg, value, doBreak);
			if (broken) return true;
		});
		return;
	}
	if (mode === 'string') {
		l = iterable.length;
		for (i = 0; i < l; ++i) {
			char = iterable[i];
			if ((i + 1) < l) {
				code = char.charCodeAt(0);
				if ((code >= 0xD800) && (code <= 0xDBFF)) char += iterable[++i];
			}
			call.call(cb, thisArg, char, doBreak);
			if (broken) break;
		}
		return;
	}
	result = iterable.next();

	while (!result.done) {
		call.call(cb, thisArg, result.value, doBreak);
		if (broken) return;
		result = iterable.next();
	}
};

},{"./get":68,"es5-ext/function/is-arguments":36,"es5-ext/object/valid-callable":60,"es5-ext/string/is-string":65}],68:[function(require,module,exports){
'use strict';

var isArguments    = require('es5-ext/function/is-arguments')
  , isString       = require('es5-ext/string/is-string')
  , ArrayIterator  = require('./array')
  , StringIterator = require('./string')
  , iterable       = require('./valid-iterable')
  , iteratorSymbol = require('es6-symbol').iterator;

module.exports = function (obj) {
	if (typeof iterable(obj)[iteratorSymbol] === 'function') return obj[iteratorSymbol]();
	if (isArguments(obj)) return new ArrayIterator(obj);
	if (isString(obj)) return new StringIterator(obj);
	return new ArrayIterator(obj);
};

},{"./array":66,"./string":71,"./valid-iterable":72,"es5-ext/function/is-arguments":36,"es5-ext/string/is-string":65,"es6-symbol":79}],69:[function(require,module,exports){
'use strict';

var clear    = require('es5-ext/array/#/clear')
  , assign   = require('es5-ext/object/assign')
  , callable = require('es5-ext/object/valid-callable')
  , value    = require('es5-ext/object/valid-value')
  , d        = require('d')
  , autoBind = require('d/auto-bind')
  , Symbol   = require('es6-symbol')

  , defineProperty = Object.defineProperty
  , defineProperties = Object.defineProperties
  , Iterator;

module.exports = Iterator = function (list, context) {
	if (!(this instanceof Iterator)) return new Iterator(list, context);
	defineProperties(this, {
		__list__: d('w', value(list)),
		__context__: d('w', context),
		__nextIndex__: d('w', 0)
	});
	if (!context) return;
	callable(context.on);
	context.on('_add', this._onAdd);
	context.on('_delete', this._onDelete);
	context.on('_clear', this._onClear);
};

defineProperties(Iterator.prototype, assign({
	constructor: d(Iterator),
	_next: d(function () {
		var i;
		if (!this.__list__) return;
		if (this.__redo__) {
			i = this.__redo__.shift();
			if (i !== undefined) return i;
		}
		if (this.__nextIndex__ < this.__list__.length) return this.__nextIndex__++;
		this._unBind();
	}),
	next: d(function () { return this._createResult(this._next()); }),
	_createResult: d(function (i) {
		if (i === undefined) return { done: true, value: undefined };
		return { done: false, value: this._resolve(i) };
	}),
	_resolve: d(function (i) { return this.__list__[i]; }),
	_unBind: d(function () {
		this.__list__ = null;
		delete this.__redo__;
		if (!this.__context__) return;
		this.__context__.off('_add', this._onAdd);
		this.__context__.off('_delete', this._onDelete);
		this.__context__.off('_clear', this._onClear);
		this.__context__ = null;
	}),
	toString: d(function () { return '[object Iterator]'; })
}, autoBind({
	_onAdd: d(function (index) {
		if (index >= this.__nextIndex__) return;
		++this.__nextIndex__;
		if (!this.__redo__) {
			defineProperty(this, '__redo__', d('c', [index]));
			return;
		}
		this.__redo__.forEach(function (redo, i) {
			if (redo >= index) this.__redo__[i] = ++redo;
		}, this);
		this.__redo__.push(index);
	}),
	_onDelete: d(function (index) {
		var i;
		if (index >= this.__nextIndex__) return;
		--this.__nextIndex__;
		if (!this.__redo__) return;
		i = this.__redo__.indexOf(index);
		if (i !== -1) this.__redo__.splice(i, 1);
		this.__redo__.forEach(function (redo, i) {
			if (redo > index) this.__redo__[i] = --redo;
		}, this);
	}),
	_onClear: d(function () {
		if (this.__redo__) clear.call(this.__redo__);
		this.__nextIndex__ = 0;
	})
})));

defineProperty(Iterator.prototype, Symbol.iterator, d(function () {
	return this;
}));
defineProperty(Iterator.prototype, Symbol.toStringTag, d('', 'Iterator'));

},{"d":30,"d/auto-bind":29,"es5-ext/array/#/clear":34,"es5-ext/object/assign":43,"es5-ext/object/valid-callable":60,"es5-ext/object/valid-value":61,"es6-symbol":79}],70:[function(require,module,exports){
'use strict';

var isArguments    = require('es5-ext/function/is-arguments')
  , isString       = require('es5-ext/string/is-string')
  , iteratorSymbol = require('es6-symbol').iterator

  , isArray = Array.isArray;

module.exports = function (value) {
	if (value == null) return false;
	if (isArray(value)) return true;
	if (isString(value)) return true;
	if (isArguments(value)) return true;
	return (typeof value[iteratorSymbol] === 'function');
};

},{"es5-ext/function/is-arguments":36,"es5-ext/string/is-string":65,"es6-symbol":79}],71:[function(require,module,exports){
// Thanks @mathiasbynens
// http://mathiasbynens.be/notes/javascript-unicode#iterating-over-symbols

'use strict';

var setPrototypeOf = require('es5-ext/object/set-prototype-of')
  , d              = require('d')
  , Iterator       = require('./')

  , defineProperty = Object.defineProperty
  , StringIterator;

StringIterator = module.exports = function (str) {
	if (!(this instanceof StringIterator)) return new StringIterator(str);
	str = String(str);
	Iterator.call(this, str);
	defineProperty(this, '__length__', d('', str.length));

};
if (setPrototypeOf) setPrototypeOf(StringIterator, Iterator);

StringIterator.prototype = Object.create(Iterator.prototype, {
	constructor: d(StringIterator),
	_next: d(function () {
		if (!this.__list__) return;
		if (this.__nextIndex__ < this.__length__) return this.__nextIndex__++;
		this._unBind();
	}),
	_resolve: d(function (i) {
		var char = this.__list__[i], code;
		if (this.__nextIndex__ === this.__length__) return char;
		code = char.charCodeAt(0);
		if ((code >= 0xD800) && (code <= 0xDBFF)) return char + this.__list__[this.__nextIndex__++];
		return char;
	}),
	toString: d(function () { return '[object String Iterator]'; })
});

},{"./":69,"d":30,"es5-ext/object/set-prototype-of":57}],72:[function(require,module,exports){
'use strict';

var isIterable = require('./is-iterable');

module.exports = function (value) {
	if (!isIterable(value)) throw new TypeError(value + " is not iterable");
	return value;
};

},{"./is-iterable":70}],73:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')() ? Map : require('./polyfill');

},{"./is-implemented":74,"./polyfill":78}],74:[function(require,module,exports){
'use strict';

module.exports = function () {
	var map, iterator, result;
	if (typeof Map !== 'function') return false;
	try {
		// WebKit doesn't support arguments and crashes
		map = new Map([['raz', 'one'], ['dwa', 'two'], ['trzy', 'three']]);
	} catch (e) {
		return false;
	}
	if (String(map) !== '[object Map]') return false;
	if (map.size !== 3) return false;
	if (typeof map.clear !== 'function') return false;
	if (typeof map.delete !== 'function') return false;
	if (typeof map.entries !== 'function') return false;
	if (typeof map.forEach !== 'function') return false;
	if (typeof map.get !== 'function') return false;
	if (typeof map.has !== 'function') return false;
	if (typeof map.keys !== 'function') return false;
	if (typeof map.set !== 'function') return false;
	if (typeof map.values !== 'function') return false;

	iterator = map.entries();
	result = iterator.next();
	if (result.done !== false) return false;
	if (!result.value) return false;
	if (result.value[0] !== 'raz') return false;
	if (result.value[1] !== 'one') return false;

	return true;
};

},{}],75:[function(require,module,exports){
// Exports true if environment provides native `Map` implementation,
// whatever that is.

'use strict';

module.exports = (function () {
	if (typeof Map === 'undefined') return false;
	return (Object.prototype.toString.call(new Map()) === '[object Map]');
}());

},{}],76:[function(require,module,exports){
'use strict';

module.exports = require('es5-ext/object/primitive-set')('key',
	'value', 'key+value');

},{"es5-ext/object/primitive-set":56}],77:[function(require,module,exports){
'use strict';

var setPrototypeOf    = require('es5-ext/object/set-prototype-of')
  , d                 = require('d')
  , Iterator          = require('es6-iterator')
  , toStringTagSymbol = require('es6-symbol').toStringTag
  , kinds             = require('./iterator-kinds')

  , defineProperties = Object.defineProperties
  , unBind = Iterator.prototype._unBind
  , MapIterator;

MapIterator = module.exports = function (map, kind) {
	if (!(this instanceof MapIterator)) return new MapIterator(map, kind);
	Iterator.call(this, map.__mapKeysData__, map);
	if (!kind || !kinds[kind]) kind = 'key+value';
	defineProperties(this, {
		__kind__: d('', kind),
		__values__: d('w', map.__mapValuesData__)
	});
};
if (setPrototypeOf) setPrototypeOf(MapIterator, Iterator);

MapIterator.prototype = Object.create(Iterator.prototype, {
	constructor: d(MapIterator),
	_resolve: d(function (i) {
		if (this.__kind__ === 'value') return this.__values__[i];
		if (this.__kind__ === 'key') return this.__list__[i];
		return [this.__list__[i], this.__values__[i]];
	}),
	_unBind: d(function () {
		this.__values__ = null;
		unBind.call(this);
	}),
	toString: d(function () { return '[object Map Iterator]'; })
});
Object.defineProperty(MapIterator.prototype, toStringTagSymbol,
	d('c', 'Map Iterator'));

},{"./iterator-kinds":76,"d":30,"es5-ext/object/set-prototype-of":57,"es6-iterator":69,"es6-symbol":79}],78:[function(require,module,exports){
'use strict';

var clear          = require('es5-ext/array/#/clear')
  , eIndexOf       = require('es5-ext/array/#/e-index-of')
  , setPrototypeOf = require('es5-ext/object/set-prototype-of')
  , callable       = require('es5-ext/object/valid-callable')
  , validValue     = require('es5-ext/object/valid-value')
  , d              = require('d')
  , ee             = require('event-emitter')
  , Symbol         = require('es6-symbol')
  , iterator       = require('es6-iterator/valid-iterable')
  , forOf          = require('es6-iterator/for-of')
  , Iterator       = require('./lib/iterator')
  , isNative       = require('./is-native-implemented')

  , call = Function.prototype.call
  , defineProperties = Object.defineProperties, getPrototypeOf = Object.getPrototypeOf
  , MapPoly;

module.exports = MapPoly = function (/*iterable*/) {
	var iterable = arguments[0], keys, values, self;
	if (!(this instanceof MapPoly)) throw new TypeError('Constructor requires \'new\'');
	if (isNative && setPrototypeOf && (Map !== MapPoly)) {
		self = setPrototypeOf(new Map(), getPrototypeOf(this));
	} else {
		self = this;
	}
	if (iterable != null) iterator(iterable);
	defineProperties(self, {
		__mapKeysData__: d('c', keys = []),
		__mapValuesData__: d('c', values = [])
	});
	if (!iterable) return self;
	forOf(iterable, function (value) {
		var key = validValue(value)[0];
		value = value[1];
		if (eIndexOf.call(keys, key) !== -1) return;
		keys.push(key);
		values.push(value);
	}, self);
	return self;
};

if (isNative) {
	if (setPrototypeOf) setPrototypeOf(MapPoly, Map);
	MapPoly.prototype = Object.create(Map.prototype, {
		constructor: d(MapPoly)
	});
}

ee(defineProperties(MapPoly.prototype, {
	clear: d(function () {
		if (!this.__mapKeysData__.length) return;
		clear.call(this.__mapKeysData__);
		clear.call(this.__mapValuesData__);
		this.emit('_clear');
	}),
	delete: d(function (key) {
		var index = eIndexOf.call(this.__mapKeysData__, key);
		if (index === -1) return false;
		this.__mapKeysData__.splice(index, 1);
		this.__mapValuesData__.splice(index, 1);
		this.emit('_delete', index, key);
		return true;
	}),
	entries: d(function () { return new Iterator(this, 'key+value'); }),
	forEach: d(function (cb/*, thisArg*/) {
		var thisArg = arguments[1], iterator, result;
		callable(cb);
		iterator = this.entries();
		result = iterator._next();
		while (result !== undefined) {
			call.call(cb, thisArg, this.__mapValuesData__[result],
				this.__mapKeysData__[result], this);
			result = iterator._next();
		}
	}),
	get: d(function (key) {
		var index = eIndexOf.call(this.__mapKeysData__, key);
		if (index === -1) return;
		return this.__mapValuesData__[index];
	}),
	has: d(function (key) {
		return (eIndexOf.call(this.__mapKeysData__, key) !== -1);
	}),
	keys: d(function () { return new Iterator(this, 'key'); }),
	set: d(function (key, value) {
		var index = eIndexOf.call(this.__mapKeysData__, key), emit;
		if (index === -1) {
			index = this.__mapKeysData__.push(key) - 1;
			emit = true;
		}
		this.__mapValuesData__[index] = value;
		if (emit) this.emit('_add', index, key);
		return this;
	}),
	size: d.gs(function () { return this.__mapKeysData__.length; }),
	values: d(function () { return new Iterator(this, 'value'); }),
	toString: d(function () { return '[object Map]'; })
}));
Object.defineProperty(MapPoly.prototype, Symbol.iterator, d(function () {
	return this.entries();
}));
Object.defineProperty(MapPoly.prototype, Symbol.toStringTag, d('c', 'Map'));

},{"./is-native-implemented":75,"./lib/iterator":77,"d":30,"es5-ext/array/#/clear":34,"es5-ext/array/#/e-index-of":35,"es5-ext/object/set-prototype-of":57,"es5-ext/object/valid-callable":60,"es5-ext/object/valid-value":61,"es6-iterator/for-of":67,"es6-iterator/valid-iterable":72,"es6-symbol":79,"event-emitter":84}],79:[function(require,module,exports){
'use strict';

module.exports = require('./is-implemented')() ? Symbol : require('./polyfill');

},{"./is-implemented":80,"./polyfill":82}],80:[function(require,module,exports){
'use strict';

var validTypes = { object: true, symbol: true };

module.exports = function () {
	var symbol;
	if (typeof Symbol !== 'function') return false;
	symbol = Symbol('test symbol');
	try { String(symbol); } catch (e) { return false; }

	// Return 'true' also for polyfills
	if (!validTypes[typeof Symbol.iterator]) return false;
	if (!validTypes[typeof Symbol.toPrimitive]) return false;
	if (!validTypes[typeof Symbol.toStringTag]) return false;

	return true;
};

},{}],81:[function(require,module,exports){
'use strict';

module.exports = function (x) {
	if (!x) return false;
	if (typeof x === 'symbol') return true;
	if (!x.constructor) return false;
	if (x.constructor.name !== 'Symbol') return false;
	return (x[x.constructor.toStringTag] === 'Symbol');
};

},{}],82:[function(require,module,exports){
// ES2015 Symbol polyfill for environments that do not support it (or partially support it)

'use strict';

var d              = require('d')
  , validateSymbol = require('./validate-symbol')

  , create = Object.create, defineProperties = Object.defineProperties
  , defineProperty = Object.defineProperty, objPrototype = Object.prototype
  , NativeSymbol, SymbolPolyfill, HiddenSymbol, globalSymbols = create(null)
  , isNativeSafe;

if (typeof Symbol === 'function') {
	NativeSymbol = Symbol;
	try {
		String(NativeSymbol());
		isNativeSafe = true;
	} catch (ignore) {}
}

var generateName = (function () {
	var created = create(null);
	return function (desc) {
		var postfix = 0, name, ie11BugWorkaround;
		while (created[desc + (postfix || '')]) ++postfix;
		desc += (postfix || '');
		created[desc] = true;
		name = '@@' + desc;
		defineProperty(objPrototype, name, d.gs(null, function (value) {
			// For IE11 issue see:
			// https://connect.microsoft.com/IE/feedbackdetail/view/1928508/
			//    ie11-broken-getters-on-dom-objects
			// https://github.com/medikoo/es6-symbol/issues/12
			if (ie11BugWorkaround) return;
			ie11BugWorkaround = true;
			defineProperty(this, name, d(value));
			ie11BugWorkaround = false;
		}));
		return name;
	};
}());

// Internal constructor (not one exposed) for creating Symbol instances.
// This one is used to ensure that `someSymbol instanceof Symbol` always return false
HiddenSymbol = function Symbol(description) {
	if (this instanceof HiddenSymbol) throw new TypeError('TypeError: Symbol is not a constructor');
	return SymbolPolyfill(description);
};

// Exposed `Symbol` constructor
// (returns instances of HiddenSymbol)
module.exports = SymbolPolyfill = function Symbol(description) {
	var symbol;
	if (this instanceof Symbol) throw new TypeError('TypeError: Symbol is not a constructor');
	if (isNativeSafe) return NativeSymbol(description);
	symbol = create(HiddenSymbol.prototype);
	description = (description === undefined ? '' : String(description));
	return defineProperties(symbol, {
		__description__: d('', description),
		__name__: d('', generateName(description))
	});
};
defineProperties(SymbolPolyfill, {
	for: d(function (key) {
		if (globalSymbols[key]) return globalSymbols[key];
		return (globalSymbols[key] = SymbolPolyfill(String(key)));
	}),
	keyFor: d(function (s) {
		var key;
		validateSymbol(s);
		for (key in globalSymbols) if (globalSymbols[key] === s) return key;
	}),

	// If there's native implementation of given symbol, let's fallback to it
	// to ensure proper interoperability with other native functions e.g. Array.from
	hasInstance: d('', (NativeSymbol && NativeSymbol.hasInstance) || SymbolPolyfill('hasInstance')),
	isConcatSpreadable: d('', (NativeSymbol && NativeSymbol.isConcatSpreadable) ||
		SymbolPolyfill('isConcatSpreadable')),
	iterator: d('', (NativeSymbol && NativeSymbol.iterator) || SymbolPolyfill('iterator')),
	match: d('', (NativeSymbol && NativeSymbol.match) || SymbolPolyfill('match')),
	replace: d('', (NativeSymbol && NativeSymbol.replace) || SymbolPolyfill('replace')),
	search: d('', (NativeSymbol && NativeSymbol.search) || SymbolPolyfill('search')),
	species: d('', (NativeSymbol && NativeSymbol.species) || SymbolPolyfill('species')),
	split: d('', (NativeSymbol && NativeSymbol.split) || SymbolPolyfill('split')),
	toPrimitive: d('', (NativeSymbol && NativeSymbol.toPrimitive) || SymbolPolyfill('toPrimitive')),
	toStringTag: d('', (NativeSymbol && NativeSymbol.toStringTag) || SymbolPolyfill('toStringTag')),
	unscopables: d('', (NativeSymbol && NativeSymbol.unscopables) || SymbolPolyfill('unscopables'))
});

// Internal tweaks for real symbol producer
defineProperties(HiddenSymbol.prototype, {
	constructor: d(SymbolPolyfill),
	toString: d('', function () { return this.__name__; })
});

// Proper implementation of methods exposed on Symbol.prototype
// They won't be accessible on produced symbol instances as they derive from HiddenSymbol.prototype
defineProperties(SymbolPolyfill.prototype, {
	toString: d(function () { return 'Symbol (' + validateSymbol(this).__description__ + ')'; }),
	valueOf: d(function () { return validateSymbol(this); })
});
defineProperty(SymbolPolyfill.prototype, SymbolPolyfill.toPrimitive, d('', function () {
	var symbol = validateSymbol(this);
	if (typeof symbol === 'symbol') return symbol;
	return symbol.toString();
}));
defineProperty(SymbolPolyfill.prototype, SymbolPolyfill.toStringTag, d('c', 'Symbol'));

// Proper implementaton of toPrimitive and toStringTag for returned symbol instances
defineProperty(HiddenSymbol.prototype, SymbolPolyfill.toStringTag,
	d('c', SymbolPolyfill.prototype[SymbolPolyfill.toStringTag]));

// Note: It's important to define `toPrimitive` as last one, as some implementations
// implement `toPrimitive` natively without implementing `toStringTag` (or other specified symbols)
// And that may invoke error in definition flow:
// See: https://github.com/medikoo/es6-symbol/issues/13#issuecomment-164146149
defineProperty(HiddenSymbol.prototype, SymbolPolyfill.toPrimitive,
	d('c', SymbolPolyfill.prototype[SymbolPolyfill.toPrimitive]));

},{"./validate-symbol":83,"d":30}],83:[function(require,module,exports){
'use strict';

var isSymbol = require('./is-symbol');

module.exports = function (value) {
	if (!isSymbol(value)) throw new TypeError(value + " is not a symbol");
	return value;
};

},{"./is-symbol":81}],84:[function(require,module,exports){
'use strict';

var d        = require('d')
  , callable = require('es5-ext/object/valid-callable')

  , apply = Function.prototype.apply, call = Function.prototype.call
  , create = Object.create, defineProperty = Object.defineProperty
  , defineProperties = Object.defineProperties
  , hasOwnProperty = Object.prototype.hasOwnProperty
  , descriptor = { configurable: true, enumerable: false, writable: true }

  , on, once, off, emit, methods, descriptors, base;

on = function (type, listener) {
	var data;

	callable(listener);

	if (!hasOwnProperty.call(this, '__ee__')) {
		data = descriptor.value = create(null);
		defineProperty(this, '__ee__', descriptor);
		descriptor.value = null;
	} else {
		data = this.__ee__;
	}
	if (!data[type]) data[type] = listener;
	else if (typeof data[type] === 'object') data[type].push(listener);
	else data[type] = [data[type], listener];

	return this;
};

once = function (type, listener) {
	var once, self;

	callable(listener);
	self = this;
	on.call(this, type, once = function () {
		off.call(self, type, once);
		apply.call(listener, this, arguments);
	});

	once.__eeOnceListener__ = listener;
	return this;
};

off = function (type, listener) {
	var data, listeners, candidate, i;

	callable(listener);

	if (!hasOwnProperty.call(this, '__ee__')) return this;
	data = this.__ee__;
	if (!data[type]) return this;
	listeners = data[type];

	if (typeof listeners === 'object') {
		for (i = 0; (candidate = listeners[i]); ++i) {
			if ((candidate === listener) ||
					(candidate.__eeOnceListener__ === listener)) {
				if (listeners.length === 2) data[type] = listeners[i ? 0 : 1];
				else listeners.splice(i, 1);
			}
		}
	} else {
		if ((listeners === listener) ||
				(listeners.__eeOnceListener__ === listener)) {
			delete data[type];
		}
	}

	return this;
};

emit = function (type) {
	var i, l, listener, listeners, args;

	if (!hasOwnProperty.call(this, '__ee__')) return;
	listeners = this.__ee__[type];
	if (!listeners) return;

	if (typeof listeners === 'object') {
		l = arguments.length;
		args = new Array(l - 1);
		for (i = 1; i < l; ++i) args[i - 1] = arguments[i];

		listeners = listeners.slice();
		for (i = 0; (listener = listeners[i]); ++i) {
			apply.call(listener, this, args);
		}
	} else {
		switch (arguments.length) {
		case 1:
			call.call(listeners, this);
			break;
		case 2:
			call.call(listeners, this, arguments[1]);
			break;
		case 3:
			call.call(listeners, this, arguments[1], arguments[2]);
			break;
		default:
			l = arguments.length;
			args = new Array(l - 1);
			for (i = 1; i < l; ++i) {
				args[i - 1] = arguments[i];
			}
			apply.call(listeners, this, args);
		}
	}
};

methods = {
	on: on,
	once: once,
	off: off,
	emit: emit
};

descriptors = {
	on: d(on),
	once: d(once),
	off: d(off),
	emit: d(emit)
};

base = defineProperties({}, descriptors);

module.exports = exports = function (o) {
	return (o == null) ? create(base) : defineProperties(Object(o), descriptors);
};
exports.methods = methods;

},{"d":30,"es5-ext/object/valid-callable":60}],85:[function(require,module,exports){
(function (global){
;(function(){

	function Gun(o){
		var gun = this;
		if(!Gun.is(gun)){ return new Gun(o) }
		if(Gun.is(o)){ return gun }
		return gun.opt(o);
	}

	;(function(Util){ // Generic javascript utilities.
		;(function(Type){
			Type.fns = {is: function(fn){ return (fn instanceof Function)? true : false }};
			Type.bi = {is: function(b){ return (b instanceof Boolean || typeof b == 'boolean')? true : false }}
			Type.num = {is: function(n){ return !Type.list.is(n) && (Infinity === n || n - parseFloat(n) + 1 >= 0) }}
			Type.text = {is: function(t){ return typeof t == 'string'? true : false }}
			Type.text.ify = function(t){
				if(Type.text.is(t)){ return t }
				if(typeof JSON !== "undefined"){ return JSON.stringify(t) }
				return (t && t.toString)? t.toString() : t;
			}
			Type.text.random = function(l, c){
				var s = '';
				l = l || 24; // you are not going to make a 0 length random number, so no need to check type
				c = c || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz';
				while(l > 0){ s += c.charAt(Math.floor(Math.random() * c.length)); l-- }
				return s;
			}
			Type.text.match = function(t, o){ var r = false;
				t = t || '';
				o = Gun.text.is(o)? {'=': o} : o || {}; // {'~', '=', '*', '<', '>', '+', '-', '?', '!'} // ignore uppercase, exactly equal, anything after, lexically larger, lexically lesser, added in, subtacted from, questionable fuzzy match, and ends with.
				if(Type.obj.has(o,'~')){ t = t.toLowerCase() }
				if(Type.obj.has(o,'=')){ return t === o['='] }
				if(Type.obj.has(o,'*')){ if(t.slice(0, o['*'].length) === o['*']){ r = true; t = t.slice(o['*'].length) } else { return false }}
				if(Type.obj.has(o,'!')){ if(t.slice(-o['!'].length) === o['!']){ r = true } else { return false }}
				if(Type.obj.has(o,'+')){
					if(Type.list.map(Type.list.is(o['+'])? o['+'] : [o['+']], function(m){
						if(t.indexOf(m) >= 0){ r = true } else { return true }
					})){ return false }
				}
				if(Type.obj.has(o,'-')){
					if(Type.list.map(Type.list.is(o['-'])? o['-'] : [o['-']], function(m){
						if(t.indexOf(m) < 0){ r = true } else { return true }
					})){ return false }
				}
				if(Type.obj.has(o,'>')){ if(t > o['>']){ r = true } else { return false }}
				if(Type.obj.has(o,'<')){ if(t < o['<']){ r = true } else { return false }}
				function fuzzy(t,f){ var n = -1, i = 0, c; for(;c = f[i++];){ if(!~(n = t.indexOf(c, n+1))){ return false }} return true } // via http://stackoverflow.com/questions/9206013/javascript-fuzzy-search
				if(Type.obj.has(o,'?')){ if(fuzzy(t, o['?'])){ r = true } else { return false }} // change name!
				return r;
			}
			Type.list = {is: function(l){ return (l instanceof Array)? true : false }}
			Type.list.slit = Array.prototype.slice;
			Type.list.sort = function(k){ // creates a new sort function based off some field
				return function(A,B){
					if(!A || !B){ return 0 } A = A[k]; B = B[k];
					if(A < B){ return -1 }else if(A > B){ return 1 }
					else { return 0 }
				}
			}
			Type.list.map = function(l, c, _){ return Type.obj.map(l, c, _) }
			Type.list.index = 1; // change this to 0 if you want non-logical, non-mathematical, non-matrix, non-convenient array notation
			Type.obj = {is: function(o) { return !o || !o.constructor? false : o.constructor === Object? true : !o.constructor.call || o.constructor.toString().match(/\[native\ code\]/)? false : true }}
			Type.obj.put = function(o, f, v){ return (o||{})[f] = v, o }
			Type.obj.del = function(o, k){
				if(!o){ return }
				o[k] = null;
				delete o[k];
				return true;
			}
			Type.obj.ify = function(o){
				if(Type.obj.is(o)){ return o }
				try{o = JSON.parse(o);
				}catch(e){o={}};
				return o;
			}
			Type.obj.copy = function(o){ // because http://web.archive.org/web/20140328224025/http://jsperf.com/cloning-an-object/2
				return !o? o : JSON.parse(JSON.stringify(o)); // is shockingly faster than anything else, and our data has to be a subset of JSON anyways!
			}
			Type.obj.as = function(b, f, d){ return b[f] = b[f] || (arguments.length >= 3? d : {}) }
			Type.obj.has = function(o, t){ return o && Object.prototype.hasOwnProperty.call(o, t) }
			Type.obj.empty = function(o, n){
				if(!o){ return true }
				return Type.obj.map(o,function(v,i){
					if(n && (i === n || (Type.obj.is(n) && Type.obj.has(n, i)))){ return }
					if(i){ return true }
				})? false : true;
			}
			Type.obj.map = function(l, c, _){
				var u, i = 0, ii = 0, x, r, rr, ll, lle, f = Type.fns.is(c),
				t = function(k,v){
					if(2 === arguments.length){
						rr = rr || {};
						rr[k] = v;
						return;
					} rr = rr || [];
					rr.push(k);
				};
				if(Object.keys && Type.obj.is(l)){
					ll = Object.keys(l); lle = true;
				}
				if(Type.list.is(l) || ll){
					x = (ll || l).length;
					for(;i < x; i++){
						ii = (i + Type.list.index);
						if(f){
							r = lle? c.call(_ || this, l[ll[i]], ll[i], t) : c.call(_ || this, l[i], ii, t);
							if(r !== u){ return r }
						} else {
							//if(Type.test.is(c,l[i])){ return ii } // should implement deep equality testing!
							if(c === l[lle? ll[i] : i]){ return ll? ll[i] : ii } // use this for now
						}
					}
				} else {
					for(i in l){
						if(f){
							if(Type.obj.has(l,i)){
								r = _? c.call(_, l[i], i, t) : c(l[i], i, t);
								if(r !== u){ return r }
							}
						} else {
							//if(a.test.is(c,l[i])){ return i } // should implement deep equality testing!
							if(c === l[i]){ return i } // use this for now
						}
					}
				}
				return f? rr : Type.list.index? 0 : -1;
			}
			Type.time = {};
			Type.time.is = function(t){ return t? t instanceof Date : (+new Date().getTime()) }
			Type.time.now = (function(){
			    var time = Type.time.is, last = -Infinity, n = 0, d = 1000;
			    return function(){
			        var t = time();
			        if(last < t){
			            n = 0;
			            return last = t;
			        }
			        return last = t + ((n += 1) / d);
			    }
			}());
		}(Util));
		;(function(exports){ // On event emitter generic javascript utility.
			function On(){};
			On.create = function(){
				var on = function(e){
					on.event.e = e;
					on.event.s[e] = on.event.s[e] || [];
					return on;
				};
				on.emit = function(a){
					var e = on.event.e, s = on.event.s[e], args = arguments, l = args.length;
					exports.list.map(s, function(hear, i){
						if(!hear.fn){ s.splice(i-1, 0); return; }
						if(1 === l){ hear.fn(a); return; }
						hear.fn.apply(hear, args);
					});
					if(!s.length){ delete on.event.s[e] }
				}
				on.event = function(fn, i){
					var s = on.event.s[on.event.e]; if(!s){ return }
					var e = {fn: fn, i: i || 0, off: function(){ return !(e.fn = false) }};
					return s.push(e), i? s.sort(sort) : i, e;
				}
				on.event.s = {};
				return on;
			}
			var sort = exports.list.sort('i');
			exports.on = On.create();
			exports.on.create = On.create;
		}(Util));
		;(function(exports){ // Generic javascript scheduler utility.
			var schedule = function(state, cb){ // maybe use lru-cache?
				schedule.waiting.push({when: state, event: cb || function(){}});
				if(schedule.soonest < state){ return }
				schedule.set(state);
			}
			schedule.waiting = [];
			schedule.soonest = Infinity;
			schedule.sort = exports.list.sort('when');
			schedule.set = function(future){
				if(Infinity <= (schedule.soonest = future)){ return }
				var now = exports.time.now(); // WAS time.is() TODO: Hmmm, this would make it hard for every gun instance to have their own version of time.
				future = (future <= now)? 0 : (future - now);
				clearTimeout(schedule.id);
				schedule.id = setTimeout(schedule.check, future);
			}
			schedule.check = function(){
				var now = exports.time.now(), soonest = Infinity; // WAS time.is() TODO: Same as above about time. Hmmm.
				schedule.waiting.sort(schedule.sort);
				schedule.waiting = exports.list.map(schedule.waiting, function(wait, i, map){
					if(!wait){ return }
					if(wait.when <= now){
						if(exports.fns.is(wait.event)){
							setTimeout(function(){ wait.event() },0);
						}
					} else {
						soonest = (soonest < wait.when)? soonest : wait.when;
						map(wait);
					}
				}) || [];
				schedule.set(soonest);
			}
			exports.schedule = schedule;
		}(Util));
	}(Gun));

	;(function(Gun){ // Gun specific utilities.

		Gun.version = 0.3;

		Gun._ = { // some reserved key words, these are not the only ones.
			meta: '_' // all metadata of the node is stored in the meta property on the node.
			,soul: '#' // a soul is a UUID of a node but it always points to the "latest" data known.
			,field: '.' // a field is a property on a node which points to a value.
			,state: '>' // other than the soul, we store HAM metadata.
			,'#':'soul'
			,'.':'field'
			,'=':'value'
			,'>':'state'
		}

		Gun.is = function(gun){ return (gun instanceof Gun)? true : false } // check to see if it is a GUN instance.

		Gun.is.val = function(v){ // Valid values are a subset of JSON: null, binary, number (!Infinity), text, or a soul relation. Arrays need special algorithms to handle concurrency, so they are not supported directly. Use an extension that supports them if needed but research their problems first.
			if(v === null){ return true } // "deletes", nulling out fields.
			if(v === Infinity){ return false } // we want this to be, but JSON does not support it, sad face.
			if(Gun.bi.is(v) // by "binary" we mean boolean.
			|| Gun.num.is(v)
			|| Gun.text.is(v)){ // by "text" we mean strings.
				return true; // simple values are valid.
			}
			return Gun.is.rel(v) || false; // is the value a soul relation? Then it is valid and return it. If not, everything else remaining is an invalid data type. Custom extensions can be built on top of these primitives to support other types.
		}

		Gun.is.rel = function(v){ // this defines whether an object is a soul relation or not, they look like this: {'#': 'UUID'}
			if(Gun.obj.is(v)){ // must be an object.
				var id;
				Gun.obj.map(v, function(s, f){ // map over the object...
					if(id){ return id = false } // if ID is already defined AND we're still looping through the object, it is considered invalid.
					if(f == Gun._.soul && Gun.text.is(s)){ // the field should be '#' and have a text value.
						id = s; // we found the soul!
					} else {
						return id = false; // if there exists anything else on the object that isn't the soul, then it is considered invalid.
					}
				});
				if(id){ // a valid id was found.
					return id; // yay! Return it.
				}
			}
			return false; // the value was not a valid soul relation.
		}

		Gun.is.rel.ify = function(s){ var r = {}; return Gun.obj.put(r, Gun._.soul, s), r } // convert a soul into a relation and return it.

		Gun.is.lex = function(l){ var r = true;
			if(!Gun.obj.is(l)){ return false }
			Gun.obj.map(l, function(v,f){
				if(!Gun.obj.has(Gun._,f) || !(Gun.text.is(v) || Gun.obj.is(v))){ return r = false }
			}); // TODO: What if the lex cursor has a document on the match, that shouldn't be allowed!
			return r;
		}

		Gun.is.node = function(n, cb, t){ var s; // checks to see if an object is a valid node.
			if(!Gun.obj.is(n)){ return false } // must be an object.
			if(s = Gun.is.node.soul(n)){ // must have a soul on it.
				return !Gun.obj.map(n, function(v, f){ // we invert this because the way we check for this is via a negation.
					if(f == Gun._.meta){ return } // skip over the metadata.
					if(!Gun.is.val(v)){ return true } // it is true that this is an invalid node.
					if(cb){ cb.call(t, v, f, n) } // optionally callback each field/value.
				});
			}
			return false; // nope! This was not a valid node.
		}

		Gun.is.node.ify = function(n, s, o){ // convert a shallow object into a node.
			o = Gun.bi.is(o)? {force: o} : o || {}; // detect options.
			n = Gun.is.node.soul.ify(n, s, o.force); // put a soul on it.
			Gun.obj.map(n, function(v, f){ // iterate over each field/value.
				if(Gun._.meta === f){ return } // ignore meta.
				Gun.is.node.state.ify([n], f, v, o.state = o.state || Gun.time.now()); // and set the state for this field and value on this node.
			});
			return n; // This will only be a valid node if the object wasn't already deep!
		}

		Gun.is.node.soul = function(n, s){ return (n && n._ && n._[s || Gun._.soul]) || false } // convenience function to check to see if there is a soul on a node and return it.

		Gun.is.node.soul.ify = function(n, s, o){ // put a soul on an object.
			n = n || {}; // make sure it exists.
			n._ = n._ || {}; // make sure meta exists.
			n._[Gun._.soul] = o? s : n._[Gun._.soul] || s || Gun.text.random(); // if it already has a soul then use that instead - unless you force the soul you want with an option.
			return n;
		}

		Gun.is.node.state = function(n, f){ return (f && n && n._ && n._[Gun._.state] && Gun.num.is(n._[Gun._.state][f]))? n._[Gun._.state][f] : false } // convenience function to get the state on a field on a node and return it.

		Gun.is.node.state.ify = function(l, f, v, state){ // put a field's state and value on some nodes.
			l = Gun.list.is(l)? l : [l]; // handle a list of nodes or just one node.
			var l = l.reverse(), d = l[0]; // we might want to inherit the state from the last node in the list.
			Gun.list.map(l, function(n, i){ // iterate over each node.
				n = n || {}; // make sure it exists.
				if(Gun.is.val(v)){ n[f] = v } // if we have a value, then put it.
				n._ = n._ || {}; // make sure meta exists.
				n = n._[Gun._.state] = n._[Gun._.state] || {}; // make sure HAM state exists.
				if(i = d._[Gun._.state][f]){ n[f] = i } // inherit the state!
				if(Gun.num.is(state)){ n[f] = state } // or manually set the state.
			});
		}

		Gun.is.graph = function(g, cb, fn, t){ // checks to see if an object is a valid graph.
			var exist = false;
			if(!Gun.obj.is(g)){ return false } // must be an object.
			return !Gun.obj.map(g, function(n, s){ // we invert this because the way we check for this is via a negation.
				if(!n || s !== Gun.is.node.soul(n) || !Gun.is.node(n, fn)){ return true } // it is true that this is an invalid graph.
				(cb || function(){}).call(t, n, s, function(fn){ // optional callback for each node.
					if(fn){ Gun.is.node(n, fn, t) } // where we then have an optional callback for each field/value.
				});
				exist = true;
			}) && exist; // makes sure it wasn't an empty object.
		}

		Gun.is.graph.ify = function(n){ var s; // wrap a node into a graph.
			if(s = Gun.is.node.soul(n)){ // grab the soul from the node, if it is a node.
				return Gun.obj.put({}, s, n); // then create and return a graph which has a node on the matching soul property.
			}
		}


		Gun.HAM = function(machineState, incomingState, currentState, incomingValue, currentValue){ // TODO: Lester's comments on roll backs could be vulnerable to divergence, investigate!
			if(machineState < incomingState){
				// the incoming value is outside the boundary of the machine's state, it must be reprocessed in another state.
				return {defer: true};
			}
			if(incomingState < currentState){
				// the incoming value is within the boundary of the machine's state, but not within the range.
				return {historical: true};
			}
			if(currentState < incomingState){
				// the incoming value is within both the boundary and the range of the machine's state.
				return {converge: true, incoming: true};
			}
			if(incomingState === currentState){
				if(incomingValue === currentValue){ // Note: while these are practically the same, the deltas could be technically different
					return {state: true};
				}
				/*
					The following is a naive implementation, but will always work.
					Never change it unless you have specific needs that absolutely require it.
					If changed, your data will diverge unless you guarantee every peer's algorithm has also been changed to be the same.
					As a result, it is highly discouraged to modify despite the fact that it is naive,
					because convergence (data integrity) is generally more important.
					Any difference in this algorithm must be given a new and different name.
				*/
				if(String(incomingValue) < String(currentValue)){ // String only works on primitive values!
					return {converge: true, current: true};
				}
				if(String(currentValue) < String(incomingValue)){ // String only works on primitive values!
					return {converge: true, incoming: true};
				}
			}
			return {err: "you have not properly handled recursion through your data or filtered it as JSON"};
		}

		Gun.union = function(gun, prime, cb, opt){ // merge two graphs into the first.
			var opt = opt || Gun.obj.is(cb)? cb : {};
			var ctx = {graph: gun.__.graph, count: 0};
			ctx.cb = function(){
				cb = Gun.fns.is(cb)? cb() && null : null;
			}
			if(!ctx.graph){ ctx.err = {err: Gun.log("No graph!") } }
			if(!prime){ ctx.err = {err: Gun.log("No data to merge!") } }
			if(ctx.soul = Gun.is.node.soul(prime)){ prime = Gun.is.graph.ify(prime) }
			if(!Gun.is.graph(prime, null, function(val, field, node){ var meta;
				if(!Gun.num.is(Gun.is.node.state(node, field))){
					return ctx.err = {err: Gun.log("No state on '" + field + "'!") }
				}
			}) || ctx.err){ return ctx.err = ctx.err || {err: Gun.log("Invalid graph!", prime)}, ctx }
			function emit(at){
				Gun.on('operating').emit(gun, at);
			}
			(function union(graph, prime){
				var prime = Gun.obj.map(prime, function(n,s,t){t(n)}).sort(function(A,B){
					var s = Gun.is.node.soul(A);
					if(graph[s]){ return 1 }
					return 0;
				});
				ctx.count += 1;
				ctx.err = Gun.list.map(prime, function(node, soul){
					soul = Gun.is.node.soul(node);
					if(!soul){ return {err: Gun.log("Soul missing or mismatching!")} }
					ctx.count += 1;
					var vertex = graph[soul];
					if(!vertex){ graph[soul] = vertex = Gun.is.node.ify({}, soul) }
					Gun.union.HAM(vertex, node, function(vertex, field, val, state){
						Gun.on('historical').emit(gun, {soul: soul, field: field, value: val, state: state, change: node});
						gun.__.on('historical').emit({soul: soul, field: field, change: node});
					}, function(vertex, field, val, state){
						if(!vertex){ return }
						var change = Gun.is.node.soul.ify({}, soul);
						if(field){
							Gun.is.node.state.ify([vertex, change, node], field, val);
						}
						emit({soul: soul, field: field, value: val, state: state, change: change});
					}, function(vertex, field, val, state){
						Gun.on('deferred').emit(gun, {soul: soul, field: field, value: val, state: state, change: node});
					})(function(){
						emit({soul: soul, change: node});
						if(opt.soul){ opt.soul(soul) }
						if(!(ctx.count -= 1)){ ctx.cb() }
					}); // TODO: BUG? Handle error!
				});
				ctx.count -= 1;
			})(ctx.graph, prime);
			if(!ctx.count){ ctx.cb() }
			return ctx;
		}

		Gun.union.ify = function(gun, prime, cb, opt){
			if(gun){ gun = (gun.__ && gun.__.graph)? gun.__.graph : gun }
			if(Gun.text.is(prime)){
				if(gun && gun[prime]){
					prime = gun[prime];
				} else {
					return Gun.is.node.ify({}, prime);
				}
			}
			var vertex = Gun.is.node.soul.ify({}, Gun.is.node.soul(prime)), prime = Gun.is.graph.ify(prime) || prime;
			if(Gun.is.graph(prime, null, function(val, field){ var node;
				function merge(a, f, v){ Gun.is.node.state.ify(a, f, v) }
				if(Gun.is.rel(val)){ node = gun? gun[field] || prime[field] : prime[field] }
				Gun.union.HAM(vertex, node, function(){}, function(vert, f, v){
					merge([vertex, node], f, v);
				}, function(){})(function(err){
					if(err){ merge([vertex], field, val) }
				})
			})){ return vertex }
		}

		Gun.union.HAM = function(vertex, delta, lower, now, upper){
			upper.max = -Infinity;
			now.end = true;
			delta = delta || {};
			vertex = vertex || {};
			Gun.obj.map(delta._, function(v,f){
				if(Gun._.state === f || Gun._.soul === f){ return }
				vertex._[f] = v;
			});
			if(!Gun.is.node(delta, function update(incoming, field){
				now.end = false;
				var ctx = {incoming: {}, current: {}}, state;
				ctx.drift = Gun.time.now(); // DANGEROUS!
				ctx.incoming.value = Gun.is.rel(incoming) || incoming;
				ctx.current.value = Gun.is.rel(vertex[field]) || vertex[field];
				ctx.incoming.state = Gun.num.is(ctx.tmp = ((delta._||{})[Gun._.state]||{})[field])? ctx.tmp : -Infinity;
				ctx.current.state = Gun.num.is(ctx.tmp = ((vertex._||{})[Gun._.state]||{})[field])? ctx.tmp : -Infinity;
				upper.max = ctx.incoming.state > upper.max? ctx.incoming.state : upper.max;
				state = Gun.HAM(ctx.drift, ctx.incoming.state, ctx.current.state, ctx.incoming.value, ctx.current.value);
				if(state.err){
					root.console.log(".!HYPOTHETICAL AMNESIA MACHINE ERR!.", state.err); // this error should never happen.
					return;
				}
				if(state.state || state.historical || state.current){
					lower.call(state, vertex, field, incoming, ctx.incoming.state);
					return;
				}
				if(state.incoming){
					now.call(state, vertex, field, incoming, ctx.incoming.state);
					return;
				}
				if(state.defer){
					upper.wait = true;
					upper.call(state, vertex, field, incoming, ctx.incoming.state); // signals that there are still future modifications.
					Gun.schedule(ctx.incoming.state, function(){
						update(incoming, field);
						if(ctx.incoming.state === upper.max){ (upper.last || function(){})() }
					});
				}
			})){ return function(fn){ if(fn){ fn({err: 'Not a node!'}) } } }
			if(now.end){ now.call({}, vertex) } // TODO: Should HAM handle empty updates? YES.
			return function(fn){
				upper.last = fn || function(){};
				if(!upper.wait){ upper.last() }
			}
		}

		Gun.on.at = function(on){ // On event emitter customized for gun.
			var proxy = function(e){ return proxy.e = e, proxy }
			proxy.emit = function(at){
				if(at.soul){
					at.hash = Gun.on.at.hash(at);
					//Gun.obj.as(proxy.mem, proxy.e)[at.soul] = at;
					Gun.obj.as(proxy.mem, proxy.e)[at.hash] = at;
				}
				if(proxy.all.cb){ proxy.all.cb(at, proxy.e) }
				on(proxy.e).emit(at);
				return {chain: function(c){
					if(!c || !c._ || !c._.at){ return }
					return c._.at(proxy.e).emit(at)
				}};
			}
			proxy.only = function(cb){
				if(proxy.only.cb){ return }
				return proxy.event(proxy.only.cb = cb);
			}
			proxy.all = function(cb){
				proxy.all.cb = cb;
				Gun.obj.map(proxy.mem, function(mem, e){
					Gun.obj.map(mem, function(at, i){
						cb(at, e);
					});
				});
			}
			proxy.event = function(cb, i){
				i = on(proxy.e).event(cb, i);
				return Gun.obj.map(proxy.mem[proxy.e], function(at){
					i.stat = {first: true};
					cb.call(i, at);
				}), i.stat = {}, i;
			}
			proxy.map = function(cb, i){
				return proxy.event(cb, i);
			};
			proxy.mem = {};
			return proxy;
		}

		Gun.on.at.hash = function(at){ return (at.at && at.at.soul)? at.at.soul + (at.at.field || '') : at.soul + (at.field || '') }

		Gun.on.at.copy = function(at){ return Gun.obj.del(at, 'hash'), Gun.obj.map(at, function(v,f,t){t(f,v)}) }

		Gun.root = function(gun) {
			if (!Gun.is(gun)) return null;
			if (gun.back === gun) return gun;
			return Gun.root(gun.back);
		};

	}(Gun));

	;(function(Gun){ // Gun prototype chain methods.

		Gun.chain = Gun.prototype;

		Gun.chain.opt = function(opt, stun){
			opt = opt || {};
			var gun = this, root = (gun.__ && gun.__.gun)? gun.__.gun : (gun._ = gun.__ = {gun: gun}).gun.chain(); // if root does not exist, then create a root chain.
			root.__.by = root.__.by || function(f){ return gun.__.by[f] = gun.__.by[f] || {} };
			root.__.graph = root.__.graph || {};
			root.__.opt = root.__.opt || {peers: {}};
			root.__.opt.wire = root.__.opt.wire || {};
			if(Gun.text.is(opt)){ opt = {peers: opt} }
			if(Gun.list.is(opt)){ opt = {peers: opt} }
			if(Gun.text.is(opt.peers)){ opt.peers = [opt.peers] }
			if(Gun.list.is(opt.peers)){ opt.peers = Gun.obj.map(opt.peers, function(n,f,m){ m(n,{}) }) }
			Gun.obj.map(opt.peers, function(v, f){
				root.__.opt.peers[f] = v;
			});
			Gun.obj.map(opt.wire, function(h, f){
				if(!Gun.fns.is(h)){ return }
				root.__.opt.wire[f] = h;
			});
			Gun.obj.map(['key', 'on', 'path', 'map', 'not', 'init'], function(f){
				if(!opt[f]){ return }
				root.__.opt[f] = opt[f] || root.__.opt[f];
			});
			if(!stun){ Gun.on('opt').emit(root, opt) }
			return gun;
		}

		Gun.chain.chain = function(s){
			var from = this, gun = !from.back? from : new this.constructor(from);//Gun(from);
			gun._ = gun._ || {};
			gun._.back = gun.back || from;
			gun.back = gun.back || from;
			gun.__ = gun.__ || from.__;
			gun._.on = gun._.on || Gun.on.create();
			gun._.at = gun._.at || Gun.on.at(gun._.on);
			return gun;
		}

		Gun.chain.put = function(val, cb, opt){
			opt = opt || {};
			cb = cb || function(){}; cb.hash = {};
			var gun = this, chain = gun.chain(), tmp = {val: val}, drift = Gun.time.now();
			function put(at){
				var val = tmp.val;
				var ctx = {obj: val}; // prep the value for serialization
				ctx.soul = at.field? at.soul : (at.at && at.at.soul) || at.soul; // figure out where we are
				ctx.field = at.field? at.field : (at.at && at.at.field) || at.field; // did we come from some where?
				if(Gun.is(val)){
					if(!ctx.field){ return cb.call(chain, {err: ctx.err = Gun.log('No field to link node to!')}), chain._.at('err').emit(ctx.err) }
					return val.val(function(node){
						var soul = Gun.is.node.soul(node);
						if(!soul){ return cb.call(chain, {err: ctx.err = Gun.log('Only a node can be linked! Not "' + node + '"!')}), chain._.at('err').emit(ctx.err) }
						tmp.val = Gun.is.rel.ify(soul);
						put(at);
					});
				}
				if(cb.hash[at.hash = at.hash || Gun.on.at.hash(at)]){ return } // if we have already seen this hash...
				cb.hash[at.hash] = true; // else mark that we're processing the data (failure to write could still occur).
				ctx.by = chain.__.by(ctx.soul);
				ctx.not = at.not || (at.at && at.at.not);
				Gun.obj.del(at, 'not'); Gun.obj.del(at.at || at, 'not'); // the data is no longer not known! // TODO: BUG! It could have been asynchronous by the time we now delete these properties. Don't other parts of the code assume their deletion is synchronous?
				if(ctx.field){ Gun.obj.as(ctx.obj = {}, ctx.field, val) } // if there is a field, then data is actually getting put on the parent.
				else if(!Gun.obj.is(val)){ return cb.call(chain, ctx.err = {err: Gun.log("No node exists to put " + (typeof val) + ' "' + val + '" in!')}), chain._.at('err').emit(ctx.err) } // if the data is a primitive and there is no context for it yet, then we have an error.
				// TODO: BUG? gun.get(key).path(field).put() isn't doing it as pseudo.
				function soul(env, cb, map){ var eat;
					if(!env || !(eat = env.at) || !env.at.node){ return }
					if(!eat.node._){ eat.node._ = {} }
					if(!eat.node._[Gun._.state]){ eat.node._[Gun._.state] = {} }
					if(!Gun.is.node.soul(eat.node)){
						if(ctx.obj === eat.obj){
							Gun.obj.as(env.graph, eat.soul = Gun.obj.as(eat.node._, Gun._.soul, Gun.is.node.soul(eat.obj) || ctx.soul), eat.node);
							cb(eat, eat.soul);
						} else {
							var path = function(err, node){
								if(path.opt && path.opt.on && path.opt.on.off){ path.opt.on.off() }
								if(path.opt.done){ return }
								path.opt.done = true;
								if(err){ env.err = err }
								eat.soul = Gun.is.node.soul(node) || Gun.is.node.soul(eat.obj) || Gun.is.node.soul(eat.node) || Gun.text.random();
								Gun.obj.as(env.graph, Gun.obj.as(eat.node._, Gun._.soul, eat.soul), eat.node);
								cb(eat, eat.soul);
							}; path.opt = {put: true};
							(ctx.not)? path() : ((at.field || at.at)? gun._.back : gun).path(eat.path || [], path, path.opt);
						}
					}
					if(!eat.field){ return }
					eat.node._[Gun._.state][eat.field] = drift;
				}
				function end(err, ify){
					ctx.ify = ify;
					Gun.on('put').emit(chain, at, ctx, opt, cb, val);
					if(err || ify.err){ return cb.call(chain, err || ify.err), chain._.at('err').emit(err || ify.err) } // check for serialization error, emit if so.
					if(err = Gun.union(chain, ify.graph, {end: false, soul: function(soul){
						if(chain.__.by(soul).end){ return }
						Gun.union(chain, Gun.is.node.soul.ify({}, soul)); // fire off an end node if there hasn't already been one, to comply with the wire spec.
					}}).err){ return cb.call(chain, err), chain._.at('err').emit(err) } // now actually union the serialized data, emit error if any occur.
					if(Gun.fns.is(end.wire = chain.__.opt.wire.put)){
						var wcb = function(err, ok, info){
							if(err){ return Gun.log(err.err || err), cb.call(chain, err), chain._.at('err').emit(err) }
							return cb.call(chain, err, ok);
						}
						end.wire(ify.graph, wcb, opt);
					} else {
						if(!Gun.log.count('no-wire-put')){ Gun.log("Warning! You have no persistence layer to save to!") }
						cb.call(chain, null); // This is in memory success, hardly "success" at all.
					}
					if(ctx.field){
						return gun._.back.path(ctx.field, null, {chain: opt.chain || chain});
					}
					if(ctx.not){
						return gun.__.gun.get(ctx.soul, null, {chain: opt.chain || chain});
					}
					chain.get(ctx.soul, null, {chain: opt.chain || chain, at: gun._.at })
				}
				Gun.ify(ctx.obj, soul, {pure: true})(end); // serialize the data!
			}
			if(gun === gun.back){ // if we are the root chain...
				put({soul: Gun.is.node.soul(val) || Gun.text.random(), not: true}); // then cause the new chain to save data!
			} else { // else if we are on an existing chain then...
				gun._.at('soul').map(put); // put data on every soul that flows through this chain.
				var back = function(gun){
					if(back.get || gun._.back === gun || gun._.not){ return } // TODO: CLEAN UP! Would be ideal to accomplish this in a more ideal way.
					if(gun._.get){ back.get = true }
					gun._.at('null').event(function(at){ this.off();
						if(opt.init || gun.__.opt.init){ return Gun.log("Warning! You have no context to `.put`", val, "!") }
						gun.init();
					}, -999);
					return back(gun._.back);
				};
				if(!opt.init && !gun.__.opt.init){ back(gun) }
			}
			chain.back = gun.back;
			return chain;
		}

		Gun.chain.get = (function(){
			Gun.on('operating').event(function(gun, at){
				if(!gun.__.by(at.soul).node){ gun.__.by(at.soul).node = gun.__.graph[at.soul]  }
				if(at.field){ return } // TODO: It would be ideal to reuse HAM's field emit.
				gun.__.on(at.soul).emit(at);
			});
			Gun.on('get').event(function(gun, at, ctx, opt, cb){
				if(ctx.halt){ return } // TODO: CLEAN UP with event emitter option?
				at.change = at.change || gun.__.by(at.soul).node;
				if(opt.raw){ return cb.call(opt.on, at) }
				if(!ctx.cb.no){ cb.call(ctx.by.chain, null, Gun.obj.copy(ctx.node || gun.__.by(at.soul).node)) }
				gun._.at('soul').emit(at).chain(opt.chain);
			},0);
			Gun.on('get').event(function(gun, at, ctx){
				if(ctx.halt){ ctx.halt = false; return } // TODO: CLEAN UP with event emitter option?
			}, Infinity);
			return function(lex, cb, opt){ // get opens up a reference to a node and loads it.
				var gun = this, ctx = {
					opt: opt || {},
					cb: cb || function(){},
					lex: (Gun.text.is(lex) || Gun.num.is(lex))? Gun.is.rel.ify(lex) : lex,
				};
				ctx.force = ctx.opt.force;
				if(cb !== ctx.cb){ ctx.cb.no = true }
				if(!Gun.obj.is(ctx.lex)){ return ctx.cb.call(gun = gun.chain(), {err: Gun.log('Invalid get request!', lex)}), gun }
				if(!(ctx.soul = ctx.lex[Gun._.soul])){ return ctx.cb.call(gun = this.chain(), {err: Gun.log('No soul to get!')}), gun } // TODO: With `.all` it'll be okay to not have an exact match!
				ctx.by = gun.__.by(ctx.soul);
				ctx.by.chain = ctx.by.chain || gun.chain();
				function load(lex){
					var soul = lex[Gun._.soul];
					var cached = gun.__.by(soul).node || gun.__.graph[soul];
					if(ctx.force){ ctx.force = false }
					else if(cached){ return false }
					wire(lex, stream, ctx.opt);
					return true;
				}
				function stream(err, data, info){
					//console.log("wire.get <--", err, data);
					Gun.on('wire.get').emit(ctx.by.chain, ctx, err, data, info);
					if(err){
						Gun.log(err.err || err);
						ctx.cb.call(ctx.by.chain, err);
						return ctx.by.chain._.at('err').emit({soul: ctx.soul, err: err.err || err}).chain(ctx.opt.chain);
					}
					if(!data){
						ctx.cb.call(ctx.by.chain, null);
						return ctx.by.chain._.at('null').emit({soul: ctx.soul, not: true}).chain(ctx.opt.chain);
					}
					if(Gun.obj.empty(data)){ return }
					if(err = Gun.union(ctx.by.chain, data).err){
						ctx.cb.call(ctx.by.chain, err);
						return ctx.by.chain._.at('err').emit({soul: Gun.is.node.soul(data) || ctx.soul, err: err.err || err}).chain(ctx.opt.chain);
					}
				}
				function wire(lex, cb, opt){
					Gun.on('get.wire').emit(ctx.by.chain, ctx, lex, cb, opt);
					if(Gun.fns.is(gun.__.opt.wire.get)){ return gun.__.opt.wire.get(lex, cb, opt) }
					if(!Gun.log.count('no-wire-get')){ Gun.log("Warning! You have no persistence layer to get from!") }
					cb(null); // This is in memory success, hardly "success" at all.
				}
				function on(at){
					if(on.ran = true){ ctx.opt.on = this }
					if(load(ctx.lex)){ return }
					Gun.on('get').emit(ctx.by.chain, at, ctx, ctx.opt, ctx.cb, ctx.lex);
				}
				ctx.opt.on = (ctx.opt.at || gun.__.at)(ctx.soul).event(on);
				ctx.by.chain._.get = ctx.lex;
				if(!ctx.opt.ran && !on.ran){ on.call(ctx.opt.on, {soul: ctx.soul}) }
				return ctx.by.chain;
			}
		}());

		Gun.chain.key = (function(){
			Gun.on('put').event(function(gun, at, ctx, opt, cb){
				if(opt.key){ return }
				Gun.is.graph(ctx.ify.graph, function(node, soul){
					var key = {node: gun.__.graph[soul]};
					if(!Gun.is.node.soul(key.node, 'key')){ return }
					if(!gun.__.by(soul).end){ gun.__.by(soul).end = 1 }
					Gun.is.node(key.node, function each(rel, s){
						var n = gun.__.graph[s];
						if(n && Gun.is.node.soul(n, 'key')){
							Gun.is.node(n, each);
							return;
						}
						rel = ctx.ify.graph[s] = ctx.ify.graph[s] || Gun.is.node.soul.ify({}, s);
						Gun.is.node(node, function(v,f){ Gun.is.node.state.ify([rel, node], f, v) });
						Gun.obj.del(ctx.ify.graph, soul);
					})
				});
			});
			Gun.on('get').event(function(gun, at, ctx, opt, cb){
				if(ctx.halt){ return } // TODO: CLEAN UP with event emitter option?
				if(opt.key && opt.key.soul){
					at.soul = opt.key.soul;
					gun.__.by(opt.key.soul).node = Gun.union.ify(gun, opt.key.soul); // TODO: Check performance?
					gun.__.by(opt.key.soul).node._['key'] = 'pseudo';
					at.change = Gun.is.node.soul.ify(Gun.obj.copy(at.change || gun.__.by(at.soul).node), at.soul, true); // TODO: Check performance?
					return;
				}
				if(!(Gun.is.node.soul(gun.__.graph[at.soul], 'key') === 1)){ return }
				var node = at.change || gun.__.graph[at.soul];
				function map(rel, soul){ gun.__.gun.get(rel, cb, {key: ctx, chain: opt.chain || gun, force: opt.force}) }
				ctx.halt = true;
				Gun.is.node(node, map);
			},-999);
			return function(key, cb, opt){
				var gun = this;
				opt = Gun.text.is(opt)? {soul: opt} : opt || {};
				cb = cb || function(){}; cb.hash = {};
				if(!Gun.text.is(key) || !key){ return cb.call(gun, {err: Gun.log('No key!')}), gun }
				function index(at){
					var ctx = {node: gun.__.graph[at.soul]};
					if(at.soul === key || at.key === key){ return }
					if(cb.hash[at.hash = at.hash || Gun.on.at.hash(at)]){ return } cb.hash[at.hash] = true;
					ctx.obj = (1 === Gun.is.node.soul(ctx.node, 'key'))? Gun.obj.copy(ctx.node) : Gun.obj.put({}, at.soul, Gun.is.rel.ify(at.soul));
					Gun.obj.as((ctx.put = Gun.is.node.ify(ctx.obj, key, true))._, 'key', 1);
					gun.__.gun.put(ctx.put, function(err, ok){cb.call(this, err, ok)}, {chain: opt.chain, key: true, init: true});
				}
				if(opt.soul){
					index({soul: opt.soul});
					return gun;
				}
				if(gun === gun.back){
					cb.call(gun, {err: Gun.log('You have no context to `.key`', key, '!')});
				} else {
					gun._.at('soul').map(index);
				}
				return gun;
			}
		}());

		Gun.chain.on = function(cb, opt){ // on subscribes to any changes on the souls.
			var gun = this, u, oldoff = this.off;
			opt = Gun.obj.is(opt)? opt : {change: opt};
			cb = cb || function(){};
			function map(at){
				opt.on = opt.on || this;
				var ctx = {by: gun.__.by(at.soul)}, change = ctx.by.node;
				if(opt.on.stat && opt.on.stat.first){ (at = Gun.on.at.copy(at)).change = ctx.by.node }
				if(opt.raw){ return cb.call(opt.on, at) }
				if(opt.once){ this.off() }
				if(opt.change){ change = at.change }
				if(!opt.empty && Gun.obj.empty(change, Gun._.meta)){ return }
				cb.call(ctx.by.chain || gun, Gun.obj.copy(at.field? change[at.field] : change), at.field || (at.at && at.at.field));
			};
			opt.on = gun._.at('soul').map(map);
			if(gun === gun.back){ Gun.log('You have no context to `.on`!') }
			gun.off = oldoff ? function() { oldoff(); opt.on.off(); } : opt.on.off // Chain offs
			return gun;
		}

		Gun.chain.path = (function(){
			Gun.on('get').event(function(gun, at, ctx, opt, cb, lex){
				if(ctx.halt){ return } // TODO: CLEAN UP with event emitter option?
				if(opt.path){ at.at = opt.path }
				var xtc = {soul: lex[Gun._.soul], field: lex[Gun._.field]};
				xtc.change = at.change || gun.__.by(at.soul).node;
				if(xtc.field){ // TODO: future feature!
					if(!Gun.obj.has(xtc.change, xtc.field)){ return }
					ctx.node = Gun.is.node.soul.ify({}, at.soul); // TODO: CLEAN UP! ctx.node usage.
					Gun.is.node.state.ify([ctx.node, xtc.change], xtc.field, xtc.change[xtc.field]);
					at.change = ctx.node; at.field = xtc.field;
				}
			},-99);
			Gun.on('get').event(function(gun, at, ctx, opt, cb, lex){
				if(ctx.halt){ return } // TODO: CLEAN UP with event emitter option?
				var xtc = {}; xtc.change = at.change || gun.__.by(at.soul).node;
				if(!opt.put){ // TODO: CLEAN UP be nice if path didn't have to worry about this.
					Gun.is.node(xtc.change, function(v,f){
						var fat = Gun.on.at.copy(at); fat.field = f; fat.value = v;
						Gun.obj.del(fat, 'at'); // TODO: CLEAN THIS UP! It would be nice in every other function every where else it didn't matter whether there was a cascading at.at.at.at or not, just and only whether the current context as a field or should rely on a previous field. But maybe that is the gotcha right there?
						fat.change = fat.change || xtc.change;
						if(v = Gun.is.rel(fat.value)){ fat = {soul: v, at: fat} }
						gun._.at('path:' + f).emit(fat).chain(opt.chain);
					});
				}
				if(!ctx.end){
					ctx.end = gun._.at('end').emit(at).chain(opt.chain);
				}
			},99);
			return function(path, cb, opt){
				opt = opt || {};
				cb = cb || (function(){ var cb = function(){}; cb.no = true; return cb }()); cb.hash = {};
				var gun = this, chain = gun.chain(), ons = [], f, c, u;
				if(!Gun.list.is(path)){ if(!Gun.text.is(path)){ if(!Gun.num.is(path)){ // if not a list, text, or number
					return cb.call(chain, {err: Gun.log("Invalid path '" + path + "'!")}), chain; // then complain
				} else { return this.path(path + '', cb, opt)  } } else { return this.path(path.split('.'), cb, opt) } } // else coerce upward to a list.
				if(gun === gun.back){
					cb.call(chain, opt.put? null : {err: Gun.log('You have no context to `.path`', path, '!')}, opt.put? gun.__.graph[(path||[])[0]] : u);
					return chain;
				}
				ons.push(gun._.at('path:' + path[0]).event(function(at){
					if(opt.done){ this.off(); return } // TODO: BUG - THIS IS A FIX FOR A BUG! TEST #"context no double emit", COMMENT THIS LINE OUT AND SEE IT FAIL!
					var ctx = {soul: at.soul, field: at.field, by: gun.__.by(at.soul)}, field = path[0];
					var on = Gun.obj.as(cb.hash, at.hash, {off: function(){}});
					if(at.soul === on.soul){ return }
					else { on.off() }
					if(ctx.rel = (Gun.is.rel(at.value) || Gun.is.rel(at.at && at.at.value))){
						if(opt.put && 1 === path.length){
							return cb.call(ctx.by.chain || chain, null, Gun.is.node.soul.ify({}, ctx.rel));
						}
						var get = function(err, node){
							if(!err && 1 !== path.length){ return }
							cb.call(this, err, node, field);
						};
						ctx.opt = {chain: opt.chain || chain, put: opt.put, path: {soul: (at.at && at.at.soul) || at.soul, field: field }};
						gun.__.gun.get(ctx.rel || at.soul, cb.no? null : get, ctx.opt);
						(opt.on = cb.hash[at.hash] = on = ctx.opt.on).soul = at.soul; // TODO: BUG! CB getting reused as the hash point for multiple paths potentially! Could cause problems!
						return;
					}
					if(1 === path.length){ cb.call(ctx.by.chain || chain, null, at.value, ctx.field) }
					chain._.at('soul').emit(at).chain(opt.chain);
				}));
				ons.push(gun._.at('null').only(function(at){
					if(!at.field){ return }
					if(at.not){
						gun.put({}, null, {init: true});
						if(opt.init || gun.__.opt.init){ return }
					}
					(at = Gun.on.at.copy(at)).field = path[0];
					at.not = true;
					chain._.at('null').emit(at).chain(opt.chain);
				}));
				ons.push(gun._.at('end').event(function(at){
					this.off();
					if(at.at && at.at.field === path[0]){ return } // TODO: BUG! THIS FIXES SO MANY PROBLEMS BUT DOES IT CATCH VARYING SOULS EDGE CASE?
					var ctx = {by: gun.__.by(at.soul)};
					if(Gun.obj.has(ctx.by.node, path[0])){ return }
					(at = Gun.on.at.copy(at)).field = path[0];
					at.not = true;
					cb.call(ctx.by.chain || chain, null);
					chain._.at('null').emit(at).chain(opt.chain);
				}));
				if(path.length > 1){
					(c = chain.path(path.slice(1), cb, opt)).back = gun;
				}
				(c || chain).off = function() {
					ons.forEach(function(on) {
						on.off();
					})
				};
				return c || chain;
			}
		}());

		Gun.chain.map = function(cb, opt){
			var u, gun = this, chain = gun.chain();
			cb = cb || function(){}; cb.hash = {};
			opt = Gun.bi.is(opt)? {change: opt} : opt || {};
			opt.change = Gun.bi.is(opt.change)? opt.change : true;
			function path(err, val, field){
				if(err || (val === u)){ return }
				cb.call(this, val, field);
			}
			function each(val, field){
				//if(!Gun.is.rel(val)){ path.call(this.gun, null, val, field);return;}
				if(opt.node){
					if(!Gun.is.rel(val)){
						return;
					}
				}
				cb.hash[this.soul + field] = cb.hash[this.soul + field] || (pathon = this.gun.path(field, path, {chain: chain, via: 'map'})); // TODO: path should reuse itself! We shouldn't have to do it ourselves.
				// TODO:
				// 1. Ability to turn off an event. // automatically happens within path since reusing is manual?
				// 2. Ability to pass chain context to fire on. // DONE
				// 3. Pseudoness handled for us. // DONE
				// 4. Reuse. // MANUALLY DONE
			}
			function map(at){
				var ref = gun.__.by(at.soul).chain || gun;
				Gun.is.node(at.change, each, {gun: ref, soul: at.soul});
			}
			on = gun.on(map, {raw: true, change: true}); // TODO: ALLOW USER TO DO map change false!
			chain.off = function() {
				if (pathon) pathon.off();
				on.off();
			}
			if(gun === gun.back){ Gun.log('You have no context to `.map`!') }
			return chain;
		}

		Gun.chain.val = (function(){
			Gun.on('get.wire').event(function(gun, ctx){
				if(!ctx.soul){ return } var end;
				(end = gun.__.by(ctx.soul)).end = (end.end || -1); // TODO: CLEAN UP! This should be per peer!
			},-999);
			Gun.on('wire.get').event(function(gun, ctx, err, data){
				if(err || !ctx.soul){ return }
				if(data && !Gun.obj.empty(data, Gun._.meta)){ return }
				var end = gun.__.by(ctx.soul);
				end.end = (!end.end || end.end < 0)? 1 : end.end + 1;
			},-999);
			return function(cb, opt){
				var gun = this, args = Gun.list.slit.call(arguments);
				cb = Gun.fns.is(cb)? cb : function(val, field){ root.console.log.apply(root.console, args.concat([field && (field += ':'), val])) }; cb.hash = {};
				opt = opt || {};
				function val(at){
					var ctx = {by: gun.__.by(at.soul), at: at.at || at}, node = ctx.by.node, field = ctx.at.field, hash = Gun.on.at.hash({soul: ctx.at.key || ctx.at.soul, field: field});
					if(cb.hash[hash]){ return }
					if(at.field && Gun.obj.has(node, at.field)){
						return cb.hash[hash] = true, cb.call(ctx.by.chain || gun, Gun.obj.copy(node[at.field]), at.field);
					}
					if(!opt.empty && Gun.obj.empty(node, Gun._.meta)){ return } // TODO: CLEAN UP! .on already does this without the .raw!
					if(ctx.by.end < 0){ return }
					return cb.hash[hash] = true, cb.call(ctx.by.chain || gun, Gun.obj.copy(node), field);
				}
				gun.on(val, {raw: true});
				if(gun === gun.back){ Gun.log('You have no context to `.val`!') }
				return gun;
			}
		}());

		Gun.chain.not = function(cb, opt){
			var gun = this, chain = gun.chain();
			cb = cb || function(){};
			opt = opt || {};
			function not(at,e){
				if(at.field){
					if(Gun.obj.has(gun.__.by(at.soul).node, at.field)){ return Gun.obj.del(at, 'not'), chain._.at(e).emit(at) }
				} else
				if(at.soul && gun.__.by(at.soul).node){ return Gun.obj.del(at, 'not'), chain._.at(e).emit(at) }
				if(!at.not){ return }
				var kick = function(next){
					if(++kick.c){ return Gun.log("Warning! Multiple `not` resumes!"); }
					next._.at.all(function(on ,e){ // TODO: BUG? Switch back to .at? I think .on is actually correct so it doesn't memorize. // TODO: BUG! What about other events?
						chain._.at(e).emit(on);
					});
				};
				kick.c = -1
				kick.chain = gun.chain();
				kick.next = cb.call(kick.chain, opt.raw? at : (at.field || at.soul || at.not), kick);
				kick.soul = Gun.text.random();
				if(Gun.is(kick.next)){ kick(kick.next) }
				kick.chain._.at('soul').emit({soul: kick.soul, field: at.field, not: true, via: 'not'});
			}
			gun._.at.all(not);
			if(gun === gun.back){ Gun.log('You have no context to `.not`!') }
			chain._.not = true; // TODO: CLEAN UP! Would be ideal if we could accomplish this in a more elegant way.
			return chain;
		}

		Gun.chain.set = function(item, cb, opt){
			var gun = this, ctx = {}, chain, rel;
			cb = cb || function(){};
			if(Gun.is.node(item) && (rel=Gun.is.rel(item._))){
				// Resolve set with a node
				return gun.set(gun.get(rel), cb, opt);
			}
			if(typeof(item)=='object'&&!Gun.is(item)&&!Gun.is.rel(item)&&!Gun.is.lex(item)&&!Gun.is.node(item)&&!Gun.is.graph(item)){
				// Resolve set with a new soul
				return gun.set(Gun.root(gun).put(item), cb, opt);
			}
			if(!Gun.is(item)){ return cb.call(gun, {err: Gun.log('Set only supports node references currently!')}), gun } // TODO: Bug? Should we return not gun on error?
			(ctx.chain = item.chain()).back = gun;
			ctx.chain._ = item._;
			item.val(function(node){ // TODO: BUG! Return proxy chain with back = list.
				if(ctx.done){ return } ctx.done = true;
				var put = {}, soul = Gun.is.node.soul(node);
				if(!soul){ return cb.call(gun, {err: Gun.log('Only a node can be linked! Not "' + node + '"!')}) }
				gun.put(Gun.obj.put(put, soul, Gun.is.rel.ify(soul)), cb, opt);
			});
			return ctx.chain;
		}

		Gun.chain.init = function(cb, opt){
			var gun = this;
			gun._.at('null').event(function(at){
				if(!at.not){ return } // TODO: BUG! This check is synchronous but it could be asynchronous!
				var ctx = {by: gun.__.by(at.soul)};
				this.off();
				if(at.field){
					if(Gun.obj.has(ctx.by.node, at.field)){ return }
					gun._.at('soul').emit({soul: at.soul, field: at.field, not: true});
					return;
				}
				if(at.soul){
					if(ctx.by.node){ return }
					var soul = Gun.text.random();
					gun.__.gun.put(Gun.is.node.soul.ify({}, soul), null, {init: true});
					gun.__.gun.key(at.soul, null, soul);
				}
			}, {raw: true});
			return gun;
		}

	}(Gun));

	;(function(Gun){ // Javascript to Gun Serializer.
		function ify(data, cb, opt){
			opt = opt || {};
			cb = cb || function(env, cb){ cb(env.at, Gun.is.node.soul(env.at.obj) || Gun.is.node.soul(env.at.node) || Gun.text.random()) };
			var end = function(fn){
				ctx.end = fn || function(){};
				unique(ctx);
			}, ctx = {at: {path: [], obj: data}, root: {}, graph: {}, queue: [], seen: [], opt: opt, loop: true};
			if(!data){ return ctx.err = {err: Gun.log('Serializer does not have correct parameters.')}, end }
			if(ctx.opt.start){ Gun.is.node.soul.ify(ctx.root, ctx.opt.start) }
			ctx.at.node = ctx.root;
			while(ctx.loop && !ctx.err){
				seen(ctx, ctx.at);
				map(ctx, cb);
				if(ctx.queue.length){
					ctx.at = ctx.queue.shift();
				} else {
					ctx.loop = false;
				}
			}
			return end;
		}
		function map(ctx, cb){
			var u, rel = function(at, soul){
				at.soul = at.soul || soul || Gun.is.node.soul(at.obj) || Gun.is.node.soul(at.node);
				if(!ctx.opt.pure){
					ctx.graph[at.soul] = Gun.is.node.soul.ify(at.node, at.soul);
					if(ctx.at.field){
						Gun.is.node.state.ify([at.node], at.field, u, ctx.opt.state);
					}
				}
				Gun.list.map(at.back, function(rel){
					rel[Gun._.soul] = at.soul;
				});
				unique(ctx);
			}, it;
			Gun.obj.map(ctx.at.obj, function(val, field){
				ctx.at.val = val;
				ctx.at.field = field;
				it = cb(ctx, rel, map) || true;
				if(field === Gun._.meta){
					ctx.at.node[field] = Gun.obj.copy(val); // TODO: BUG! Is this correct?
					return;
				}
				if(String(field).indexOf('.') != -1 || (false && notValidField(field))){ // TODO: BUG! Do later for ACID "consistency" guarantee.
					return ctx.err = {err: Gun.log("Invalid field name on '" + ctx.at.path.join('.') + "'!")};
				}
				if(!Gun.is.val(val)){
					var at = {obj: val, node: {}, back: [], path: [field]}, tmp = {}, was;
					at.path = (ctx.at.path||[]).concat(at.path || []);
					if(!Gun.obj.is(val)){
						return ctx.err = {err: Gun.log("Invalid value at '" + at.path.join('.') + "'!" )};
					}
					if(was = seen(ctx, at)){
						tmp[Gun._.soul] = Gun.is.node.soul(was.node) || null;
						(was.back = was.back || []).push(ctx.at.node[field] = tmp);
					} else {
						ctx.queue.push(at);
						tmp[Gun._.soul] = null;
						at.back.push(ctx.at.node[field] = tmp);
					}
				} else {
					ctx.at.node[field] = Gun.obj.copy(val);
				}
			});
			if(!it){ cb(ctx, rel) }
		}
		function unique(ctx){
			if(ctx.err || (!Gun.list.map(ctx.seen, function(at){
				if(!at.soul){ return true }
			}) && !ctx.loop)){ return ctx.end(ctx.err, ctx), ctx.end = function(){}; }
		}
		function seen(ctx, at){
			return Gun.list.map(ctx.seen, function(has){
				if(at.obj === has.obj){ return has }
			}) || (ctx.seen.push(at) && false);
		}
		ify.wire = function(n, cb, opt){ return Gun.text.is(n)? ify.wire.from(n, cb, opt) : ify.wire.to(n, cb, opt) }
		ify.wire.to = function(n, cb, opt){ var t, b;
			if(!n || !(t = Gun.is.node.soul(n))){ return null }
			cb = cb || function(){};
			t = (b = "#'" + JSON.stringify(t) + "'");
			Gun.obj.map(n, function(v,f){
				if(Gun._.meta === f){ return }
				var w = '', s = Gun.is.node.state(n,f);
				if(!s){ return }
				w += ".'" + JSON.stringify(f) + "'";
				w += "='" + JSON.stringify(v) + "'";
				w += ">'" + JSON.stringify(s) + "'";
				t += w;
				w = b + w;
				cb(null, w);
			});
			return t;
		}
		ify.wire.from = function(n, cb, opt){
			if(!n){ return null }
			var a = [], s = -1, e = 0, end = 1;
			while((e = n.indexOf("'", s + 1)) >= 0){
				if(s === e || '\\' === n.charAt(e-1)){}else{
					a.push(n.slice(s + 1,e));
					s = e;
				}
			}
			return a;
		}
		Gun.ify = ify;
	}(Gun));

	var root = this || {}; // safe for window, global, root, and 'use strict'.
	if(typeof window !== "undefined"){ (root = window).Gun = Gun }
	if(typeof module !== "undefined" && module.exports){ module.exports = Gun }
	if(typeof global !== "undefined"){ root = global; }
	root.console = root.console || {log: function(s){ return s }}; // safe for old browsers
	var console = {
		log: function(s){return root.console.log.apply(root.console, arguments), s},
		Log: Gun.log = function(s){ return (!Gun.log.squelch && root.console.log.apply(root.console, arguments)), s }
	};
	console.debug = function(i, s){ return (Gun.log.debug && i === Gun.log.debug && Gun.log.debug++) && root.console.log.apply(root.console, arguments), s };
	Gun.log.count = function(s){ return Gun.log.count[s] = Gun.log.count[s] || 0, Gun.log.count[s]++ }
}.bind(this || module)());


;(function(Tab){

	if(typeof window === "undefined"){ return; }
	if(!window.Gun){ return }
	if(!window.JSON){ throw new Error("Include JSON first: ajax.cdnjs.com/ajax/libs/json2/20110223/json2.js") } // for old IE use

	;(function(exports){
		function s(){}
		s.put = function(key, val, cb){ try{ store.setItem(key, Gun.text.ify(val)) }catch(e){if(cb)cb(e)} }
		s.get = function(key, cb){ /*setTimeout(function(){*/ try{ cb(null, Gun.obj.ify(store.getItem(key) || null)) }catch(e){cb(e)} /*},1)*/}
		s.del = function(key){ return store.removeItem(key) }
		// Feature detect + local reference
		var storage;
		var fail;
		var uid;
		try {
			uid = new Date;
			(storage = window.localStorage).setItem(uid, uid);
			fail = storage.getItem(uid) != uid;
			storage.removeItem(uid);
			fail && (storage = false);
		} catch (exception) {}
		var store = (storage && window.localStorage) || {setItem: function(){}, removeItem: function(){}, getItem: function(){}};
		exports.store = s;
	}.bind(this || module)(Tab));

	Gun.on('opt').event(function(gun, opt){
		opt = opt || {};
		var tab = gun.tab = gun.tab || {};
		tab.store = tab.store || Tab.store;
		tab.request = tab.request || Gun.request;
		if(!tab.request){ throw new Error("Default GUN driver could not find default network abstraction.") }
		tab.request.s = tab.request.s || {};
		tab.headers = opt.headers || {};
		tab.headers['gun-sid'] = tab.headers['gun-sid'] || Gun.text.random(); // stream id
		tab.prefix = tab.prefix || opt.prefix || 'gun/';
		tab.get = tab.get || function(lex, cb, opt){
			if(!lex){ return }
			var soul = lex[Gun._.soul];
			if(!soul){ return }
			cb = cb || function(){};
			var ropt = {};
			(ropt.headers = Gun.obj.copy(tab.headers)).id = tab.msg();
			(function local(soul, cb){
				tab.store.get(tab.prefix + soul, function(err, data){
					if(!data){ return } // let the peers handle no data.
					if(err){ return cb(err) }
					cb(err, cb.node = data); // node
					cb(err, Gun.is.node.soul.ify({}, Gun.is.node.soul(data))); // end
					cb(err, {}); // terminate
				});
			}(soul, cb));
			if(!(cb.local = opt.local)){
				tab.request.s[ropt.headers.id] = tab.error(cb, "Error: Get failed!", function(reply){
					setTimeout(function(){ tab.put(Gun.is.graph.ify(reply.body), function(){}, {local: true, peers: {}}) },1); // and flush the in memory nodes of this graph to localStorage after we've had a chance to union on it.
				});
				Gun.obj.map(opt.peers || gun.__.opt.peers, function(peer, url){ var p = {};
					tab.request(url, lex, tab.request.s[ropt.headers.id], ropt);
					cb.peers = true;
				});
				var node = gun.__.graph[soul];
				if(node){
					tab.put(Gun.is.graph.ify(node));
				}
			} tab.peers(cb);
		}
		tab.put = tab.put || function(graph, cb, opt){
			cb = cb || function(){};
			opt = opt || {};
			var ropt = {};
			(ropt.headers = Gun.obj.copy(tab.headers)).id = tab.msg();
			Gun.is.graph(graph, function(node, soul){
				if(!gun.__.graph[soul]){ return }
				tab.store.put(tab.prefix + soul, gun.__.graph[soul], function(err){if(err){ cb({err: err}) }});
			});
			if(!(cb.local = opt.local)){
				tab.request.s[ropt.headers.id] = tab.error(cb, "Error: Put failed!");
				Gun.obj.map(opt.peers || gun.__.opt.peers, function(peer, url){
					tab.request(url, graph, tab.request.s[ropt.headers.id], ropt);
					cb.peers = true;
				});
			} tab.peers(cb);
		}
		tab.error = function(cb, error, fn){
			return function(err, reply){
				reply.body = reply.body || reply.chunk || reply.end || reply.write;
				if(err || !reply || (err = reply.body && reply.body.err)){
					return cb({err: Gun.log(err || error) });
				}
				if(fn){ fn(reply) }
				cb(null, reply.body);
			}
		}
		tab.peers = function(cb, o){
			if(Gun.text.is(cb)){ return (o = {})[cb] = {}, o }
			if(cb && !cb.peers){ setTimeout(function(){
				if(!cb.local){ if(!Gun.log.count('no-peers')){ Gun.log("Warning! You have no peers to connect to!") } }
				if(!(cb.graph || cb.node)){ cb(null) }
			},1)}
		}
		tab.msg = tab.msg || function(id){
			if(!id){
				return tab.msg.debounce[id = Gun.text.random(9)] = Gun.time.is(), id;
			}
			clearTimeout(tab.msg.clear);
			tab.msg.clear = setTimeout(function(){
				var now = Gun.time.is();
				Gun.obj.map(tab.msg.debounce, function(t,id){
					if(now - t < 1000 * 60 * 5){ return }
					Gun.obj.del(tab.msg.debounce, id);
				});
			},500);
			if(id = tab.msg.debounce[id]){
				return tab.msg.debounce[id] = Gun.time.is(), id;
			}
		};
		tab.msg.debounce = tab.msg.debounce || {};
		tab.server = tab.server || function(req, res){
			if(!req || !res || !req.body || !req.headers || !req.headers.id){ return }
			if(tab.request.s[req.headers.rid]){ return tab.request.s[req.headers.rid](null, req) }
			if(tab.msg(req.headers.id)){ return }
			// TODO: Re-emit message to other peers if we have any non-overlaping ones.
			if(req.headers.rid){ return } // no need to process
			if(Gun.is.lex(req.body)){ return tab.server.get(req, res) }
			else { return tab.server.put(req, res) }
		}
		tab.server.json = 'application/json';
		tab.server.regex = gun.__.opt.route = gun.__.opt.route || opt.route || /^\/gun/i;
		tab.server.get = function(req, cb){
			var soul = req.body[Gun._.soul], node;
			if(!(node = gun.__.graph[soul])){ return }
			var reply = {headers: {'Content-Type': tab.server.json, rid: req.headers.id, id: tab.msg()}};
			cb({headers: reply.headers, body: node});
		}
		tab.server.put = function(req, cb){
			var reply = {headers: {'Content-Type': tab.server.json, rid: req.headers.id, id: tab.msg()}}, keep;
			if(!req.body){ return cb({headers: reply.headers, body: {err: "No body"}}) }
			if(!Gun.obj.is(req.body, function(node, soul){
				if(gun.__.graph[soul]){ return true }
			})){ return }
			if(req.err = Gun.union(gun, req.body, function(err, ctx){
				if(err){ return cb({headers: reply.headers, body: {err: err || "Union failed."}}) }
				var ctx = ctx || {}; ctx.graph = {};
				Gun.is.graph(req.body, function(node, soul){ ctx.graph[soul] = gun.__.graph[soul] });
				gun.__.opt.wire.put(ctx.graph, function(err, ok){
					if(err){ return cb({headers: reply.headers, body: {err: err || "Failed."}}) }
					cb({headers: reply.headers, body: {ok: ok || "Persisted."}});
				}, {local: true, peers: {}});
			}).err){ cb({headers: reply.headers, body: {err: req.err || "Union failed."}}) }
		}
		Gun.obj.map(gun.__.opt.peers, function(){ // only create server if peers and do it once by returning immediately.
			return (tab.server.able = tab.server.able || tab.request.createServer(tab.server) || true);
		});
		gun.__.opt.wire.get = gun.__.opt.wire.get || tab.get;
		gun.__.opt.wire.put = gun.__.opt.wire.put || tab.put;
		gun.__.opt.wire.key = gun.__.opt.wire.key || tab.key;

		Tab.request = tab.request;
		Gun.Tab = Tab;
	});

}.bind(this || module)({}));


;(function(Tab){
	var request = (function(){
		function r(base, body, cb, opt){ opt = opt || {};
			var o = base.length? {base: base} : {};
			o.base = opt.base || base;
			o.body = opt.body || body;
			o.headers = opt.headers;
			o.url = opt.url;
			cb = cb || function(){};
			if(!o.base){ return }
			r.transport(o, cb);
		}
		r.createServer = function(fn){ r.createServer.s.push(fn) }
		r.createServer.ing = function(req, cb){
			var i = r.createServer.s.length;
			while(i--){ (r.createServer.s[i] || function(){})(req, cb) }
		}
		r.createServer.s = [];
		r.back = 2; r.backoff = 2; r.backmax = 2000;
		r.transport = function(opt, cb){
			//Gun.log("TRANSPORT:", opt);
			if(r.ws(opt, cb)){ return }
			r.jsonp(opt, cb);
		}

		var queues = r.queues = {};

		r.ws = function(opt, cb){
			var ws, WS = r.WebSocket || window.WebSocket || window.mozWebSocket || window.webkitWebSocket;
			if(!WS){ return }

			// Queued offline updates.
			var queue = queues[opt.base];

			// Create the queue if it doesn't exist.
			if (!queue) {
				queue = queues[opt.base] = {};
			}

			// Try to de-duplicate queued messages.
			var reqID = ((opt || {}).headers || {}).id || Gun.text.random(9);

			ws = r.ws.peers[opt.base];
			if(ws && (ws.readyState <= ws.OPEN)){
				if(ws.readyState === ws.CONNECTING){
					queue[reqID] = [opt, cb];

					return true;
				}

				var req = {};
				if(opt.headers){ req.headers = opt.headers }
				if(opt.body){ req.body = opt.body }
				if(opt.url){ req.url = opt.url }
				req.headers = req.headers || {};
				r.ws.cbs[req.headers['ws-rid'] = 'WS' + (+ new Date()) + '.' + Math.floor((Math.random()*65535)+1)] = function(err,res){
					if(res.body || res.end){ delete r.ws.cbs[req.headers['ws-rid']] }
					cb(err,res);
				}

				ws.send(JSON.stringify(req),function(err){});
				return true;
			}

			if(ws === false){ return }

			// If we've made it this far, the socket isn't open.
			queue[reqID] = [opt, cb];

			try{ws = r.ws.peers[opt.base] = new WS(opt.base.replace('http','ws'));
			}catch(e){}

			ws.onopen = function(o){

				// Send the queued messages.
				r.each(queue, function (deferred) {
					r.ws.apply(null, deferred);
				});

				// Clear the queue.
				queue = queues[opt.base] = {};

				// Reset the reconnect backoff.
				r.back = 2;
			};

			ws.onclose = function(c){
				if(!c){ return }
				if(ws && ws.close instanceof Function){ ws.close() }
				if(1006 === c.code){ // websockets cannot be used
					/*ws = r.ws.peers[opt.base] = false; // 1006 has mixed meanings, therefore we can no longer respect it.
					r.transport(opt, cb);
					return;*/
				}
				ws = r.ws.peers[opt.base] = null; // this will make the next request try to reconnect
				setTimeout(function(){
					r.ws(opt, function(){}); // opt here is a race condition, is it not? Does this matter?
				}, (r.back *= r.backoff) > r.backmax ? (r.back = r.backmax) : r.back);
			};
			if(typeof window !== "undefined"){ window.onbeforeunload = ws.onclose; }
			ws.onmessage = function(m){
				if(!m || !m.data){ return }
				var res;
				try{res = JSON.parse(m.data);
				}catch(e){ return }
				if(!res){ return }
				res.headers = res.headers || {};
				if(res.headers['ws-rid']){ return (r.ws.cbs[res.headers['ws-rid']]||function(){})(null, res) }
				if(res.body){ r.createServer.ing(res, function(res){ r(opt.base, null, null, res)}) } // emit extra events.
			};
			ws.onerror = function(e){ console.log(e); };
			return true;
		}
		r.ws.peers = {};
		r.ws.cbs = {};
		r.jsonp = function(opt, cb){
			if(typeof window === "undefined"){
				return cb("JSONP is currently browser only.");
			}
			//Gun.log("jsonp send", opt);
			r.jsonp.ify(opt, function(url){
				//Gun.log(url);
				if(!url){ return }
				r.jsonp.send(url, function(reply){
					//Gun.log("jsonp reply", reply);
					cb(null, reply);
					r.jsonp.poll(opt, reply);
				}, opt.jsonp);
			});
		}
		r.jsonp.send = function(url, cb, id){
			var js = document.createElement('script');
			js.src = url;
			window[js.id = id] = function(res){
				cb(res);
				cb.id = js.id;
				js.parentNode.removeChild(js);
				window[cb.id] = null; // TODO: BUG: This needs to handle chunking!
				try{delete window[cb.id];
				}catch(e){}
			}
			js.async = true;
			document.getElementsByTagName('head')[0].appendChild(js);
			return js;
		}
		r.jsonp.poll = function(opt, res){
			if(!opt || !opt.base || !res || !res.headers || !res.headers.poll){ return }
			(r.jsonp.poll.s = r.jsonp.poll.s || {})[opt.base] = r.jsonp.poll.s[opt.base] || setTimeout(function(){ // TODO: Need to optimize for Chrome's 6 req limit?
				//Gun.log("polling again");
				var o = {base: opt.base, headers: {pull: 1}};
				r.each(opt.headers, function(v,i){ o.headers[i] = v })
				r.jsonp(o, function(err, reply){
					delete r.jsonp.poll.s[opt.base];
					while(reply.body && reply.body.length && reply.body.shift){ // we're assuming an array rather than chunk encoding. :(
						var res = reply.body.shift();
						//Gun.log("-- go go go", res);
						if(res && res.body){ r.createServer.ing(res, function(){ r(opt.base, null, null, res) }) } // emit extra events.
					}
				});
			}, res.headers.poll);
		}
		r.jsonp.ify = function(opt, cb){
			var uri = encodeURIComponent, q = '?';
			if(opt.url && opt.url.pathname){ q = opt.url.pathname + q; }
			q = opt.base + q;
			r.each((opt.url||{}).query, function(v, i){ q += uri(i) + '=' + uri(v) + '&' });
			if(opt.headers){ q += uri('`') + '=' + uri(JSON.stringify(opt.headers)) + '&' }
			if(r.jsonp.max < q.length){ return cb() }
			q += uri('jsonp') + '=' + uri(opt.jsonp = 'P'+Math.floor((Math.random()*65535)+1));
			if(opt.body){
				q += '&';
				var w = opt.body, wls = function(w,l,s){
					return uri('%') + '=' + uri(w+'-'+(l||w)+'/'+(s||w))  + '&' + uri('$') + '=';
				}
				if(typeof w != 'string'){
					w = JSON.stringify(w);
					q += uri('^') + '=' + uri('json') + '&';
				}
				w = uri(w);
				var i = 0, l = w.length
				, s = r.jsonp.max - (q.length + wls(l.toString()).length);
				if(s < 0){ return cb() }
				while(w){
					cb(q + wls(i, (i = i + s), l) + w.slice(0, i));
					w = w.slice(i);
				}
			} else {
				cb(q);
			}
		}
		r.jsonp.max = 2000;
		r.each = function(obj, cb){
			if(!obj || !cb){ return }
			for(var i in obj){
				if(obj.hasOwnProperty(i)){
					cb(obj[i], i);
				}
			}
		}
		return r;
	}());
	if(typeof window !== "undefined"){ Gun.request = request }
	if(typeof module !== "undefined" && module.exports){ module.exports.request = request }
}.bind(this || module)({}));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],86:[function(require,module,exports){
/**
 * lodash 3.1.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var isArguments = require('lodash.isarguments'),
    isArray = require('lodash.isarray');

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

/**
 * The base implementation of `_.flatten` with added support for restricting
 * flattening and specifying the start index.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {boolean} [isDeep] Specify a deep flatten.
 * @param {boolean} [isStrict] Restrict flattening to arrays-like objects.
 * @param {Array} [result=[]] The initial result value.
 * @returns {Array} Returns the new flattened array.
 */
function baseFlatten(array, isDeep, isStrict, result) {
  result || (result = []);

  var index = -1,
      length = array.length;

  while (++index < length) {
    var value = array[index];
    if (isObjectLike(value) && isArrayLike(value) &&
        (isStrict || isArray(value) || isArguments(value))) {
      if (isDeep) {
        // Recursively flatten arrays (susceptible to call stack limits).
        baseFlatten(value, isDeep, isStrict, result);
      } else {
        arrayPush(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = baseFlatten;

},{"lodash.isarguments":98,"lodash.isarray":99}],87:[function(require,module,exports){
/**
 * lodash 3.0.3 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iteratee functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor = createBaseFor();

/**
 * Creates a base function for methods like `_.forIn`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var index = -1,
        iterable = Object(object),
        props = keysFunc(object),
        length = props.length;

    while (length--) {
      var key = props[fromRight ? length : ++index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

module.exports = baseFor;

},{}],88:[function(require,module,exports){
/**
 * lodash 3.1.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * The base implementation of `_.indexOf` without support for binary searches.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return indexOfNaN(array, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

/**
 * Gets the index at which the first occurrence of `NaN` is found in `array`.
 * If `fromRight` is provided elements of `array` are iterated from right to left.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched `NaN`, else `-1`.
 */
function indexOfNaN(array, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 0 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    var other = array[index];
    if (other !== other) {
      return index;
    }
  }
  return -1;
}

module.exports = baseIndexOf;

},{}],89:[function(require,module,exports){
/**
 * lodash 3.0.3 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseIndexOf = require('lodash._baseindexof'),
    cacheIndexOf = require('lodash._cacheindexof'),
    createCache = require('lodash._createcache');

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * The base implementation of `_.uniq` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} [iteratee] The function invoked per iteration.
 * @returns {Array} Returns the new duplicate-value-free array.
 */
function baseUniq(array, iteratee) {
  var index = -1,
      indexOf = baseIndexOf,
      length = array.length,
      isCommon = true,
      isLarge = isCommon && length >= LARGE_ARRAY_SIZE,
      seen = isLarge ? createCache() : null,
      result = [];

  if (seen) {
    indexOf = cacheIndexOf;
    isCommon = false;
  } else {
    isLarge = false;
    seen = iteratee ? [] : result;
  }
  outer:
  while (++index < length) {
    var value = array[index],
        computed = iteratee ? iteratee(value, index, array) : value;

    if (isCommon && value === value) {
      var seenIndex = seen.length;
      while (seenIndex--) {
        if (seen[seenIndex] === computed) {
          continue outer;
        }
      }
      if (iteratee) {
        seen.push(computed);
      }
      result.push(value);
    }
    else if (indexOf(seen, computed, 0) < 0) {
      if (iteratee || isLarge) {
        seen.push(computed);
      }
      result.push(value);
    }
  }
  return result;
}

module.exports = baseUniq;

},{"lodash._baseindexof":88,"lodash._cacheindexof":91,"lodash._createcache":92}],90:[function(require,module,exports){
/**
 * lodash 3.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (thisArg === undefined) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = bindCallback;

},{}],91:[function(require,module,exports){
/**
 * lodash 3.0.2 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * Checks if `value` is in `cache` mimicking the return signature of
 * `_.indexOf` by returning `0` if the value is found, else `-1`.
 *
 * @private
 * @param {Object} cache The cache to search.
 * @param {*} value The value to search for.
 * @returns {number} Returns `0` if `value` is found, else `-1`.
 */
function cacheIndexOf(cache, value) {
  var data = cache.data,
      result = (typeof value == 'string' || isObject(value)) ? data.set.has(value) : data.hash[value];

  return result ? 0 : -1;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = cacheIndexOf;

},{}],92:[function(require,module,exports){
(function (global){
/**
 * lodash 3.1.2 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var getNative = require('lodash._getnative');

/** Native method references. */
var Set = getNative(global, 'Set');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeCreate = getNative(Object, 'create');

/**
 *
 * Creates a cache object to store unique values.
 *
 * @private
 * @param {Array} [values] The values to cache.
 */
function SetCache(values) {
  var length = values ? values.length : 0;

  this.data = { 'hash': nativeCreate(null), 'set': new Set };
  while (length--) {
    this.push(values[length]);
  }
}

/**
 * Adds `value` to the cache.
 *
 * @private
 * @name push
 * @memberOf SetCache
 * @param {*} value The value to cache.
 */
function cachePush(value) {
  var data = this.data;
  if (typeof value == 'string' || isObject(value)) {
    data.set.add(value);
  } else {
    data.hash[value] = true;
  }
}

/**
 * Creates a `Set` cache object to optimize linear searches of large arrays.
 *
 * @private
 * @param {Array} [values] The values to cache.
 * @returns {null|Object} Returns the new cache object if `Set` is supported, else `null`.
 */
function createCache(values) {
  return (nativeCreate && Set) ? new SetCache(values) : null;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

// Add functions to the `Set` cache.
SetCache.prototype.push = cachePush;

module.exports = createCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"lodash._getnative":93}],93:[function(require,module,exports){
/**
 * lodash 3.9.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = getNative;

},{}],94:[function(require,module,exports){
(function (global){
/**
 * lodash 3.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** Used to determine if values are of the language type `Object`. */
var objectTypes = {
  'function': true,
  'object': true
};

/** Detect free variable `exports`. */
var freeExports = (objectTypes[typeof exports] && exports && !exports.nodeType)
  ? exports
  : undefined;

/** Detect free variable `module`. */
var freeModule = (objectTypes[typeof module] && module && !module.nodeType)
  ? module
  : undefined;

/** Detect free variable `global` from Node.js. */
var freeGlobal = checkGlobal(freeExports && freeModule && typeof global == 'object' && global);

/** Detect free variable `self`. */
var freeSelf = checkGlobal(objectTypes[typeof self] && self);

/** Detect free variable `window`. */
var freeWindow = checkGlobal(objectTypes[typeof window] && window);

/** Detect `this` as the global object. */
var thisGlobal = checkGlobal(objectTypes[typeof this] && this);

/**
 * Used as a reference to the global object.
 *
 * The `this` value is used if it's the global object to avoid Greasemonkey's
 * restricted `window` object, otherwise the `window` object is used.
 */
var root = freeGlobal ||
  ((freeWindow !== (thisGlobal && thisGlobal.window)) && freeWindow) ||
    freeSelf || thisGlobal || Function('return this')();

/**
 * Checks if `value` is a global object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {null|Object} Returns `value` if it's a global object, else `null`.
 */
function checkGlobal(value) {
  return (value && value.Object === Object) ? value : null;
}

module.exports = root;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],95:[function(require,module,exports){
/**
 * lodash 3.2.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var root = require('lodash._root');

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match latin-1 supplementary letters (excluding mathematical operators). */
var reLatin1 = /[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g;

/** Used to compose unicode character classes. */
var rsComboMarksRange = '\\u0300-\\u036f\\ufe20-\\ufe23',
    rsComboSymbolsRange = '\\u20d0-\\u20f0';

/** Used to compose unicode capture groups. */
var rsCombo = '[' + rsComboMarksRange + rsComboSymbolsRange + ']';

/**
 * Used to match [combining diacritical marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks) and
 * [combining diacritical marks for symbols](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks_for_Symbols).
 */
var reComboMark = RegExp(rsCombo, 'g');

/** Used to map latin-1 supplementary letters to basic latin letters. */
var deburredLetters = {
  '\xc0': 'A',  '\xc1': 'A', '\xc2': 'A', '\xc3': 'A', '\xc4': 'A', '\xc5': 'A',
  '\xe0': 'a',  '\xe1': 'a', '\xe2': 'a', '\xe3': 'a', '\xe4': 'a', '\xe5': 'a',
  '\xc7': 'C',  '\xe7': 'c',
  '\xd0': 'D',  '\xf0': 'd',
  '\xc8': 'E',  '\xc9': 'E', '\xca': 'E', '\xcb': 'E',
  '\xe8': 'e',  '\xe9': 'e', '\xea': 'e', '\xeb': 'e',
  '\xcC': 'I',  '\xcd': 'I', '\xce': 'I', '\xcf': 'I',
  '\xeC': 'i',  '\xed': 'i', '\xee': 'i', '\xef': 'i',
  '\xd1': 'N',  '\xf1': 'n',
  '\xd2': 'O',  '\xd3': 'O', '\xd4': 'O', '\xd5': 'O', '\xd6': 'O', '\xd8': 'O',
  '\xf2': 'o',  '\xf3': 'o', '\xf4': 'o', '\xf5': 'o', '\xf6': 'o', '\xf8': 'o',
  '\xd9': 'U',  '\xda': 'U', '\xdb': 'U', '\xdc': 'U',
  '\xf9': 'u',  '\xfa': 'u', '\xfb': 'u', '\xfc': 'u',
  '\xdd': 'Y',  '\xfd': 'y', '\xff': 'y',
  '\xc6': 'Ae', '\xe6': 'ae',
  '\xde': 'Th', '\xfe': 'th',
  '\xdf': 'ss'
};

/**
 * Used by `_.deburr` to convert latin-1 supplementary letters to basic latin letters.
 *
 * @private
 * @param {string} letter The matched letter to deburr.
 * @returns {string} Returns the deburred letter.
 */
function deburrLetter(letter) {
  return deburredLetters[letter];
}

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var Symbol = root.Symbol;

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = Symbol ? symbolProto.toString : undefined;

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  if (isSymbol(value)) {
    return Symbol ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Deburrs `string` by converting [latin-1 supplementary letters](https://en.wikipedia.org/wiki/Latin-1_Supplement_(Unicode_block)#Character_table)
 * to basic latin letters and removing [combining diacritical marks](https://en.wikipedia.org/wiki/Combining_Diacritical_Marks).
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to deburr.
 * @returns {string} Returns the deburred string.
 * @example
 *
 * _.deburr('déjà vu');
 * // => 'deja vu'
 */
function deburr(string) {
  string = toString(string);
  return string && string.replace(reLatin1, deburrLetter).replace(reComboMark, '');
}

module.exports = deburr;

},{"lodash._root":94}],96:[function(require,module,exports){
/**
 * lodash 3.2.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var root = require('lodash._root');

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match HTML entities and HTML characters. */
var reUnescapedHtml = /[&<>"'`]/g,
    reHasUnescapedHtml = RegExp(reUnescapedHtml.source);

/** Used to map characters to HTML entities. */
var htmlEscapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

/**
 * Used by `_.escape` to convert characters to HTML entities.
 *
 * @private
 * @param {string} chr The matched character to escape.
 * @returns {string} Returns the escaped character.
 */
function escapeHtmlChar(chr) {
  return htmlEscapes[chr];
}

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var Symbol = root.Symbol;

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = Symbol ? symbolProto.toString : undefined;

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  if (isSymbol(value)) {
    return Symbol ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Converts the characters "&", "<", ">", '"', "'", and "\`" in `string` to
 * their corresponding HTML entities.
 *
 * **Note:** No other characters are escaped. To escape additional
 * characters use a third-party library like [_he_](https://mths.be/he).
 *
 * Though the ">" character is escaped for symmetry, characters like
 * ">" and "/" don't need escaping in HTML and have no special meaning
 * unless they're part of a tag or unquoted attribute value.
 * See [Mathias Bynens's article](https://mathiasbynens.be/notes/ambiguous-ampersands)
 * (under "semi-related fun fact") for more details.
 *
 * Backticks are escaped because in IE < 9, they can break out of
 * attribute values or HTML comments. See [#59](https://html5sec.org/#59),
 * [#102](https://html5sec.org/#102), [#108](https://html5sec.org/#108), and
 * [#133](https://html5sec.org/#133) of the [HTML5 Security Cheatsheet](https://html5sec.org/)
 * for more details.
 *
 * When working with HTML you should always [quote attribute values](http://wonko.com/post/html-escaping)
 * to reduce XSS vectors.
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to escape.
 * @returns {string} Returns the escaped string.
 * @example
 *
 * _.escape('fred, barney, & pebbles');
 * // => 'fred, barney, &amp; pebbles'
 */
function escape(string) {
  string = toString(string);
  return (string && reHasUnescapedHtml.test(string))
    ? string.replace(reUnescapedHtml, escapeHtmlChar)
    : string;
}

module.exports = escape;

},{"lodash._root":94}],97:[function(require,module,exports){
/**
 * lodash 3.0.2 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseFor = require('lodash._basefor'),
    bindCallback = require('lodash._bindcallback'),
    keys = require('lodash.keys');

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

/**
 * Creates a function for `_.forOwn` or `_.forOwnRight`.
 *
 * @private
 * @param {Function} objectFunc The function to iterate over an object.
 * @returns {Function} Returns the new each function.
 */
function createForOwn(objectFunc) {
  return function(object, iteratee, thisArg) {
    if (typeof iteratee != 'function' || thisArg !== undefined) {
      iteratee = bindCallback(iteratee, thisArg, 3);
    }
    return objectFunc(object, iteratee);
  };
}

/**
 * Iterates over own enumerable properties of an object invoking `iteratee`
 * for each property. The `iteratee` is bound to `thisArg` and invoked with
 * three arguments: (value, key, object). Iteratee functions may exit iteration
 * early by explicitly returning `false`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.forOwn(new Foo, function(value, key) {
 *   console.log(key);
 * });
 * // => logs 'a' and 'b' (iteration order is not guaranteed)
 */
var forOwn = createForOwn(baseForOwn);

module.exports = forOwn;

},{"lodash._basefor":87,"lodash._bindcallback":90,"lodash.keys":101}],98:[function(require,module,exports){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object,
 *  else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = isArguments;

},{}],99:[function(require,module,exports){
/**
 * lodash 3.0.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var arrayTag = '[object Array]',
    funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = isArray;

},{}],100:[function(require,module,exports){
/**
 * lodash 3.1.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var deburr = require('lodash.deburr'),
    words = require('lodash.words');

/**
 * A specialized version of `_.reduce` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {boolean} [initAccum] Specify using the first element of `array` as the initial value.
 * @returns {*} Returns the accumulated value.
 */
function arrayReduce(array, iteratee, accumulator, initAccum) {
  var index = -1,
      length = array.length;

  if (initAccum && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}

/**
 * Creates a function like `_.camelCase`.
 *
 * @private
 * @param {Function} callback The function to combine each word.
 * @returns {Function} Returns the new compounder function.
 */
function createCompounder(callback) {
  return function(string) {
    return arrayReduce(words(deburr(string)), callback, '');
  };
}

/**
 * Converts `string` to [kebab case](https://en.wikipedia.org/wiki/Letter_case#Special_case_styles).
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to convert.
 * @returns {string} Returns the kebab cased string.
 * @example
 *
 * _.kebabCase('Foo Bar');
 * // => 'foo-bar'
 *
 * _.kebabCase('fooBar');
 * // => 'foo-bar'
 *
 * _.kebabCase('__foo_bar__');
 * // => 'foo-bar'
 */
var kebabCase = createCompounder(function(result, word, index) {
  return result + (index ? '-' : '') + word.toLowerCase();
});

module.exports = kebabCase;

},{"lodash.deburr":95,"lodash.words":104}],101:[function(require,module,exports){
/**
 * lodash 3.1.2 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var getNative = require('lodash._getnative'),
    isArguments = require('lodash.isarguments'),
    isArray = require('lodash.isarray');

/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/6.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? undefined : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object != 'function' && isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;
  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      isProto = typeof Ctor == 'function' && Ctor.prototype === object,
      result = Array(length),
      skipIndexes = length > 0;

  while (++index < length) {
    result[index] = (index + '');
  }
  for (var key in object) {
    if (!(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = keys;

},{"lodash._getnative":93,"lodash.isarguments":98,"lodash.isarray":99}],102:[function(require,module,exports){
/**
 * lodash 3.6.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that invokes `func` with the `this` binding of the
 * created function and arguments from `start` and beyond provided as an array.
 *
 * **Note:** This method is based on the [rest parameter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/rest_parameters).
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var say = _.restParam(function(what, names) {
 *   return what + ' ' + _.initial(names).join(', ') +
 *     (_.size(names) > 1 ? ', & ' : '') + _.last(names);
 * });
 *
 * say('hello', 'fred', 'barney', 'pebbles');
 * // => 'hello fred, barney, & pebbles'
 */
function restParam(func, start) {
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        rest = Array(length);

    while (++index < length) {
      rest[index] = args[start + index];
    }
    switch (start) {
      case 0: return func.call(this, rest);
      case 1: return func.call(this, args[0], rest);
      case 2: return func.call(this, args[0], args[1], rest);
    }
    var otherArgs = Array(start + 1);
    index = -1;
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = rest;
    return func.apply(this, otherArgs);
  };
}

module.exports = restParam;

},{}],103:[function(require,module,exports){
/**
 * lodash 3.1.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseFlatten = require('lodash._baseflatten'),
    baseUniq = require('lodash._baseuniq'),
    restParam = require('lodash.restparam');

/**
 * Creates an array of unique values, in order, of the provided arrays using
 * `SameValueZero` for equality comparisons.
 *
 * **Note:** [`SameValueZero`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-samevaluezero)
 * comparisons are like strict equality comparisons, e.g. `===`, except that
 * `NaN` matches `NaN`.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {...Array} [arrays] The arrays to inspect.
 * @returns {Array} Returns the new array of combined values.
 * @example
 *
 * _.union([1, 2], [4, 2], [2, 1]);
 * // => [1, 2, 4]
 */
var union = restParam(function(arrays) {
  return baseUniq(baseFlatten(arrays, false, true));
});

module.exports = union;

},{"lodash._baseflatten":86,"lodash._baseuniq":89,"lodash.restparam":102}],104:[function(require,module,exports){
/**
 * lodash 3.2.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var root = require('lodash._root');

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to compose unicode character classes. */
var rsAstralRange = '\\ud800-\\udfff',
    rsComboMarksRange = '\\u0300-\\u036f\\ufe20-\\ufe23',
    rsComboSymbolsRange = '\\u20d0-\\u20f0',
    rsDingbatRange = '\\u2700-\\u27bf',
    rsLowerRange = 'a-z\\xdf-\\xf6\\xf8-\\xff',
    rsMathOpRange = '\\xac\\xb1\\xd7\\xf7',
    rsNonCharRange = '\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf',
    rsQuoteRange = '\\u2018\\u2019\\u201c\\u201d',
    rsSpaceRange = ' \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000',
    rsUpperRange = 'A-Z\\xc0-\\xd6\\xd8-\\xde',
    rsVarRange = '\\ufe0e\\ufe0f',
    rsBreakRange = rsMathOpRange + rsNonCharRange + rsQuoteRange + rsSpaceRange;

/** Used to compose unicode capture groups. */
var rsBreak = '[' + rsBreakRange + ']',
    rsCombo = '[' + rsComboMarksRange + rsComboSymbolsRange + ']',
    rsDigits = '\\d+',
    rsDingbat = '[' + rsDingbatRange + ']',
    rsLower = '[' + rsLowerRange + ']',
    rsMisc = '[^' + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + ']',
    rsFitz = '\\ud83c[\\udffb-\\udfff]',
    rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
    rsNonAstral = '[^' + rsAstralRange + ']',
    rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
    rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
    rsUpper = '[' + rsUpperRange + ']',
    rsZWJ = '\\u200d';

/** Used to compose unicode regexes. */
var rsLowerMisc = '(?:' + rsLower + '|' + rsMisc + ')',
    rsUpperMisc = '(?:' + rsUpper + '|' + rsMisc + ')',
    reOptMod = rsModifier + '?',
    rsOptVar = '[' + rsVarRange + ']?',
    rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
    rsSeq = rsOptVar + reOptMod + rsOptJoin,
    rsEmoji = '(?:' + [rsDingbat, rsRegional, rsSurrPair].join('|') + ')' + rsSeq;

/** Used to match non-compound words composed of alphanumeric characters. */
var reBasicWord = /[a-zA-Z0-9]+/g;

/** Used to match complex or compound words. */
var reComplexWord = RegExp([
  rsUpper + '?' + rsLower + '+(?=' + [rsBreak, rsUpper, '$'].join('|') + ')',
  rsUpperMisc + '+(?=' + [rsBreak, rsUpper + rsLowerMisc, '$'].join('|') + ')',
  rsUpper + '?' + rsLowerMisc + '+',
  rsUpper + '+',
  rsDigits,
  rsEmoji
].join('|'), 'g');

/** Used to detect strings that need a more robust regexp to match words. */
var reHasComplexWord = /[a-z][A-Z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var Symbol = root.Symbol;

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = Symbol ? symbolProto.toString : undefined;

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  if (isSymbol(value)) {
    return Symbol ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Splits `string` into an array of its words.
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to inspect.
 * @param {RegExp|string} [pattern] The pattern to match words.
 * @param- {Object} [guard] Enables use as an iteratee for functions like `_.map`.
 * @returns {Array} Returns the words of `string`.
 * @example
 *
 * _.words('fred, barney, & pebbles');
 * // => ['fred', 'barney', 'pebbles']
 *
 * _.words('fred, barney, & pebbles', /[^, ]+/g);
 * // => ['fred', 'barney', '&', 'pebbles']
 */
function words(string, pattern, guard) {
  string = toString(string);
  pattern = guard ? undefined : pattern;

  if (pattern === undefined) {
    pattern = reHasComplexWord.test(string) ? reComplexWord : reBasicWord;
  }
  return string.match(pattern) || [];
}

module.exports = words;

},{"lodash._root":94}],105:[function(require,module,exports){
'use strict';

var proto = Element.prototype;
var vendor = proto.matches
  || proto.matchesSelector
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

module.exports = match;

/**
 * Match `el` to `selector`.
 *
 * @param {Element} el
 * @param {String} selector
 * @return {Boolean}
 * @api public
 */

function match(el, selector) {
  if (vendor) return vendor.call(el, selector);
  var nodes = el.parentNode.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] == el) return true;
  }
  return false;
}
},{}],106:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = classNameFromVNode;

var _selectorParser2 = require('./selectorParser');

var _selectorParser3 = _interopRequireDefault(_selectorParser2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function classNameFromVNode(vNode) {
  var _selectorParser = (0, _selectorParser3.default)(vNode.sel);

  var cn = _selectorParser.className;


  if (!vNode.data) {
    return cn;
  }

  var _vNode$data = vNode.data;
  var dataClass = _vNode$data.class;
  var props = _vNode$data.props;


  if (dataClass) {
    var c = Object.keys(vNode.data.class).filter(function (cl) {
      return vNode.data.class[cl];
    });
    cn += ' ' + c.join(' ');
  }

  if (props && props.className) {
    cn += ' ' + props.className;
  }

  return cn.trim();
}
},{"./selectorParser":107}],107:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = selectorParser;

var _browserSplit = require('browser-split');

var _browserSplit2 = _interopRequireDefault(_browserSplit);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var classIdSplit = /([\.#]?[a-zA-Z0-9\u007F-\uFFFF_:-]+)/;
var notClassId = /^\.|#/;

function selectorParser() {
  var selector = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];

  var tagName = void 0;
  var id = '';
  var classes = [];

  var tagParts = (0, _browserSplit2.default)(selector, classIdSplit);

  if (notClassId.test(tagParts[1]) || selector === '') {
    tagName = 'div';
  }

  var part = void 0;
  var type = void 0;
  var i = void 0;

  for (i = 0; i < tagParts.length; i++) {
    part = tagParts[i];

    if (!part) {
      continue;
    }

    type = part.charAt(0);

    if (!tagName) {
      tagName = part;
    } else if (type === '.') {
      classes.push(part.substring(1, part.length));
    } else if (type === '#') {
      id = part.substring(1, part.length);
    }
  }

  return {
    tagName: tagName,
    id: id,
    className: classes.join(' ')
  };
}
},{"browser-split":28}],108:[function(require,module,exports){

// All SVG children elements, not in this list, should self-close

module.exports = {
  // http://www.w3.org/TR/SVG/intro.html#TermContainerElement
  'a': true,
  'defs': true,
  'glyph': true,
  'g': true,
  'marker': true,
  'mask': true,
  'missing-glyph': true,
  'pattern': true,
  'svg': true,
  'switch': true,
  'symbol': true,

  // http://www.w3.org/TR/SVG/intro.html#TermDescriptiveElement
  'desc': true,
  'metadata': true,
  'title': true
};
},{}],109:[function(require,module,exports){

var init = require('./init');

module.exports = init([require('./modules/attributes'), require('./modules/style')]);
},{"./init":110,"./modules/attributes":111,"./modules/style":112}],110:[function(require,module,exports){

var parseSelector = require('./parse-selector');
var VOID_ELEMENTS = require('./void-elements');
var CONTAINER_ELEMENTS = require('./container-elements');

module.exports = function init(modules) {
  function parse(data) {
    return modules.reduce(function (arr, fn) {
      arr.push(fn(data));
      return arr;
    }, []).filter(function (result) {
      return result !== '';
    });
  }

  return function renderToString(vnode) {
    if (!vnode.sel && vnode.text) {
      return vnode.text;
    }

    vnode.data = vnode.data || {};

    // Support thunks
    if (typeof vnode.sel === 'string' && vnode.sel.slice(0, 5) === 'thunk') {
      vnode = vnode.data.fn.apply(null, vnode.data.args);
    }

    var tagName = parseSelector(vnode.sel).tagName;
    var attributes = parse(vnode);
    var svg = vnode.data.ns === 'http://www.w3.org/2000/svg';
    var tag = [];

    // Open tag
    tag.push('<' + tagName);
    if (attributes.length) {
      tag.push(' ' + attributes.join(' '));
    }
    if (svg && CONTAINER_ELEMENTS[tagName] !== true) {
      tag.push(' /');
    }
    tag.push('>');

    // Close tag, if needed
    if (VOID_ELEMENTS[tagName] !== true && !svg || svg && CONTAINER_ELEMENTS[tagName] === true) {
      if (vnode.data.props && vnode.data.props.innerHTML) {
        tag.push(vnode.data.props.innerHTML);
      } else if (vnode.text) {
        tag.push(vnode.text);
      } else if (vnode.children) {
        vnode.children.forEach(function (child) {
          tag.push(renderToString(child));
        });
      }
      tag.push('</' + tagName + '>');
    }

    return tag.join('');
  };
};
},{"./container-elements":108,"./parse-selector":113,"./void-elements":114}],111:[function(require,module,exports){

var forOwn = require('lodash.forown');
var escape = require('lodash.escape');
var union = require('lodash.union');

var parseSelector = require('../parse-selector');

// data.attrs, data.props, data.class

module.exports = function attributes(vnode) {
  var selector = parseSelector(vnode.sel);
  var parsedClasses = selector.className.split(' ');

  var attributes = [];
  var classes = [];
  var values = {};

  if (selector.id) {
    values.id = selector.id;
  }

  setAttributes(vnode.data.props, values);
  setAttributes(vnode.data.attrs, values); // `attrs` override `props`, not sure if this is good so

  if (vnode.data.class) {
    // Omit `className` attribute if `class` is set on vnode
    values.class = undefined;
  }
  forOwn(vnode.data.class, function (value, key) {
    if (value === true) {
      classes.push(key);
    }
  });
  classes = union(classes, values.class, parsedClasses).filter(function (x) {
    return x !== '';
  });

  if (classes.length) {
    values.class = classes.join(' ');
  }

  forOwn(values, function (value, key) {
    attributes.push(value === true ? key : key + '="' + escape(value) + '"');
  });

  return attributes.length ? attributes.join(' ') : '';
};

function setAttributes(values, target) {
  forOwn(values, function (value, key) {
    if (key === 'htmlFor') {
      target['for'] = value;
      return;
    }
    if (key === 'className') {
      target['class'] = value.split(' ');
      return;
    }
    if (key === 'innerHTML') {
      return;
    }
    target[key] = value;
  });
}
},{"../parse-selector":113,"lodash.escape":96,"lodash.forown":97,"lodash.union":103}],112:[function(require,module,exports){
var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var forOwn = require('lodash.forown');
var escape = require('lodash.escape');
var kebabCase = require('lodash.kebabcase');

// data.style

module.exports = function style(vnode) {
  var styles = [];
  var style = vnode.data.style || {};

  // merge in `delayed` properties
  if (style.delayed) {
    _extends(style, style.delayed);
  }

  forOwn(style, function (value, key) {
    // omit hook objects
    if (typeof value === 'string') {
      styles.push(kebabCase(key) + ': ' + escape(value));
    }
  });

  return styles.length ? 'style="' + styles.join('; ') + '"' : '';
};
},{"lodash.escape":96,"lodash.forown":97,"lodash.kebabcase":100}],113:[function(require,module,exports){

// https://github.com/Matt-Esch/virtual-dom/blob/master/virtual-hyperscript/parse-tag.js

var split = require('browser-split');

var classIdSplit = /([\.#]?[a-zA-Z0-9\u007F-\uFFFF_:-]+)/;
var notClassId = /^\.|#/;

module.exports = function parseSelector(selector, upper) {
  selector = selector || '';
  var tagName;
  var id = '';
  var classes = [];

  var tagParts = split(selector, classIdSplit);

  if (notClassId.test(tagParts[1]) || selector === '') {
    tagName = 'div';
  }

  var part, type, i;

  for (i = 0; i < tagParts.length; i++) {
    part = tagParts[i];

    if (!part) {
      continue;
    }

    type = part.charAt(0);

    if (!tagName) {
      tagName = part;
    } else if (type === '.') {
      classes.push(part.substring(1, part.length));
    } else if (type === '#') {
      id = part.substring(1, part.length);
    }
  }

  return {
    tagName: upper === true ? tagName.toUpperCase() : tagName,
    id: id,
    className: classes.join(' ')
  };
};
},{"browser-split":28}],114:[function(require,module,exports){

// http://www.w3.org/html/wg/drafts/html/master/syntax.html#void-elements

module.exports = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true
};
},{}],115:[function(require,module,exports){
var VNode = require('./vnode');
var is = require('./is');

function addNS(data, children) {
  data.ns = 'http://www.w3.org/2000/svg';
  if (children !== undefined) {
    for (var i = 0; i < children.length; ++i) {
      addNS(children[i].data, children[i].children);
    }
  }
}

module.exports = function h(sel, b, c) {
  var data = {}, children, text, i;
  if (c !== undefined) {
    data = b;
    if (is.array(c)) { children = c; }
    else if (is.primitive(c)) { text = c; }
  } else if (b !== undefined) {
    if (is.array(b)) { children = b; }
    else if (is.primitive(b)) { text = b; }
    else { data = b; }
  }
  if (is.array(children)) {
    for (i = 0; i < children.length; ++i) {
      if (is.primitive(children[i])) children[i] = VNode(undefined, undefined, undefined, children[i]);
    }
  }
  if (sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g') {
    addNS(data, children);
  }
  return VNode(sel, data, children, text, undefined);
};

},{"./is":117,"./vnode":126}],116:[function(require,module,exports){
function createElement(tagName){
  return document.createElement(tagName);
}

function createElementNS(namespaceURI, qualifiedName){
  return document.createElementNS(namespaceURI, qualifiedName);
}

function createTextNode(text){
  return document.createTextNode(text);
}


function insertBefore(parentNode, newNode, referenceNode){
  parentNode.insertBefore(newNode, referenceNode);
}


function removeChild(node, child){
  node.removeChild(child);
}

function appendChild(node, child){
  node.appendChild(child);
}

function parentNode(node){
  return node.parentElement;
}

function nextSibling(node){
  return node.nextSibling;
}

function tagName(node){
  return node.tagName;
}

function setTextContent(node, text){
  node.textContent = text;
}

module.exports = {
  createElement: createElement,
  createElementNS: createElementNS,
  createTextNode: createTextNode,
  appendChild: appendChild,
  removeChild: removeChild,
  insertBefore: insertBefore,
  parentNode: parentNode,
  nextSibling: nextSibling,
  tagName: tagName,
  setTextContent: setTextContent
};

},{}],117:[function(require,module,exports){
module.exports = {
  array: Array.isArray,
  primitive: function(s) { return typeof s === 'string' || typeof s === 'number'; },
};

},{}],118:[function(require,module,exports){
var booleanAttrs = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "compact", "controls", "declare", 
                "default", "defaultchecked", "defaultmuted", "defaultselected", "defer", "disabled", "draggable", 
                "enabled", "formnovalidate", "hidden", "indeterminate", "inert", "ismap", "itemscope", "loop", "multiple", 
                "muted", "nohref", "noresize", "noshade", "novalidate", "nowrap", "open", "pauseonexit", "readonly", 
                "required", "reversed", "scoped", "seamless", "selected", "sortable", "spellcheck", "translate", 
                "truespeed", "typemustmatch", "visible"];
    
var booleanAttrsDict = {};
for(var i=0, len = booleanAttrs.length; i < len; i++) {
  booleanAttrsDict[booleanAttrs[i]] = true;
}
    
function updateAttrs(oldVnode, vnode) {
  var key, cur, old, elm = vnode.elm,
      oldAttrs = oldVnode.data.attrs || {}, attrs = vnode.data.attrs || {};
  
  // update modified attributes, add new attributes
  for (key in attrs) {
    cur = attrs[key];
    old = oldAttrs[key];
    if (old !== cur) {
      // TODO: add support to namespaced attributes (setAttributeNS)
      if(!cur && booleanAttrsDict[key])
        elm.removeAttribute(key);
      else
        elm.setAttribute(key, cur);
    }
  }
  //remove removed attributes
  // use `in` operator since the previous `for` iteration uses it (.i.e. add even attributes with undefined value)
  // the other option is to remove all attributes with value == undefined
  for (key in oldAttrs) {
    if (!(key in attrs)) {
      elm.removeAttribute(key);
    }
  }
}

module.exports = {create: updateAttrs, update: updateAttrs};

},{}],119:[function(require,module,exports){
function updateClass(oldVnode, vnode) {
  var cur, name, elm = vnode.elm,
      oldClass = oldVnode.data.class || {},
      klass = vnode.data.class || {};
  for (name in oldClass) {
    if (!klass[name]) {
      elm.classList.remove(name);
    }
  }
  for (name in klass) {
    cur = klass[name];
    if (cur !== oldClass[name]) {
      elm.classList[cur ? 'add' : 'remove'](name);
    }
  }
}

module.exports = {create: updateClass, update: updateClass};

},{}],120:[function(require,module,exports){
var is = require('../is');

function arrInvoker(arr) {
  return function() {
    if (!arr.length) return;
    // Special case when length is two, for performance
    arr.length === 2 ? arr[0](arr[1]) : arr[0].apply(undefined, arr.slice(1));
  };
}

function fnInvoker(o) {
  return function(ev) { 
    if (o.fn === null) return;
    o.fn(ev); 
  };
}

function updateEventListeners(oldVnode, vnode) {
  var name, cur, old, elm = vnode.elm,
      oldOn = oldVnode.data.on || {}, on = vnode.data.on;
  if (!on) return;
  for (name in on) {
    cur = on[name];
    old = oldOn[name];
    if (old === undefined) {
      if (is.array(cur)) {
        elm.addEventListener(name, arrInvoker(cur));
      } else {
        cur = {fn: cur};
        on[name] = cur;
        elm.addEventListener(name, fnInvoker(cur));
      }
    } else if (is.array(old)) {
      // Deliberately modify old array since it's captured in closure created with `arrInvoker`
      old.length = cur.length;
      for (var i = 0; i < old.length; ++i) old[i] = cur[i];
      on[name]  = old;
    } else {
      old.fn = cur;
      on[name] = old;
    }
  }
  if (oldOn) {
    for (name in oldOn) {
      if (on[name] === undefined) {
        var old = oldOn[name];
        if (is.array(old)) {
          old.length = 0;
        }
        else {
          old.fn = null;
        }
      }
    }
  }
}

module.exports = {create: updateEventListeners, update: updateEventListeners};

},{"../is":117}],121:[function(require,module,exports){
var raf = (typeof window !== 'undefined' && window.requestAnimationFrame) || setTimeout;
var nextFrame = function(fn) { raf(function() { raf(fn); }); };

function setNextFrame(obj, prop, val) {
  nextFrame(function() { obj[prop] = val; });
}

function getTextNodeRect(textNode) {
  var rect;
  if (document.createRange) {
    var range = document.createRange();
    range.selectNodeContents(textNode);
    if (range.getBoundingClientRect) {
        rect = range.getBoundingClientRect();
    }
  }
  return rect;
}

function calcTransformOrigin(isTextNode, textRect, boundingRect) {
  if (isTextNode) {
    if (textRect) {
      //calculate pixels to center of text from left edge of bounding box
      var relativeCenterX = textRect.left + textRect.width/2 - boundingRect.left;
      var relativeCenterY = textRect.top + textRect.height/2 - boundingRect.top;
      return relativeCenterX + 'px ' + relativeCenterY + 'px';
    }
  }
  return '0 0'; //top left
}

function getTextDx(oldTextRect, newTextRect) {
  if (oldTextRect && newTextRect) {
    return ((oldTextRect.left + oldTextRect.width/2) - (newTextRect.left + newTextRect.width/2));
  }
  return 0;
}
function getTextDy(oldTextRect, newTextRect) {
  if (oldTextRect && newTextRect) {
    return ((oldTextRect.top + oldTextRect.height/2) - (newTextRect.top + newTextRect.height/2));
  }
  return 0;
}

function isTextElement(elm) {
  return elm.childNodes.length === 1 && elm.childNodes[0].nodeType === 3;
}

var removed, created;

function pre(oldVnode, vnode) {
  removed = {};
  created = [];
}

function create(oldVnode, vnode) {
  var hero = vnode.data.hero;
  if (hero && hero.id) {
    created.push(hero.id);
    created.push(vnode);
  }
}

function destroy(vnode) {
  var hero = vnode.data.hero;
  if (hero && hero.id) {
    var elm = vnode.elm;
    vnode.isTextNode = isTextElement(elm); //is this a text node?
    vnode.boundingRect = elm.getBoundingClientRect(); //save the bounding rectangle to a new property on the vnode
    vnode.textRect = vnode.isTextNode ? getTextNodeRect(elm.childNodes[0]) : null; //save bounding rect of inner text node
    var computedStyle = window.getComputedStyle(elm, null); //get current styles (includes inherited properties)
    vnode.savedStyle = JSON.parse(JSON.stringify(computedStyle)); //save a copy of computed style values
    removed[hero.id] = vnode;
  }
}

function post() {
  var i, id, newElm, oldVnode, oldElm, hRatio, wRatio,
      oldRect, newRect, dx, dy, origTransform, origTransition,
      newStyle, oldStyle, newComputedStyle, isTextNode,
      newTextRect, oldTextRect;
  for (i = 0; i < created.length; i += 2) {
    id = created[i];
    newElm = created[i+1].elm;
    oldVnode = removed[id];
    if (oldVnode) {
      isTextNode = oldVnode.isTextNode && isTextElement(newElm); //Are old & new both text?
      newStyle = newElm.style;
      newComputedStyle = window.getComputedStyle(newElm, null); //get full computed style for new element
      oldElm = oldVnode.elm;
      oldStyle = oldElm.style;
      //Overall element bounding boxes
      newRect = newElm.getBoundingClientRect();
      oldRect = oldVnode.boundingRect; //previously saved bounding rect
      //Text node bounding boxes & distances
      if (isTextNode) {
        newTextRect = getTextNodeRect(newElm.childNodes[0]);
        oldTextRect = oldVnode.textRect;
        dx = getTextDx(oldTextRect, newTextRect);
        dy = getTextDy(oldTextRect, newTextRect);
      } else {
        //Calculate distances between old & new positions
        dx = oldRect.left - newRect.left;
        dy = oldRect.top - newRect.top;
      }
      hRatio = newRect.height / (Math.max(oldRect.height, 1));
      wRatio = isTextNode ? hRatio : newRect.width / (Math.max(oldRect.width, 1)); //text scales based on hRatio
      // Animate new element
      origTransform = newStyle.transform;
      origTransition = newStyle.transition;
      if (newComputedStyle.display === 'inline') //inline elements cannot be transformed
        newStyle.display = 'inline-block';        //this does not appear to have any negative side effects
      newStyle.transition = origTransition + 'transform 0s';
      newStyle.transformOrigin = calcTransformOrigin(isTextNode, newTextRect, newRect);
      newStyle.opacity = '0';
      newStyle.transform = origTransform + 'translate('+dx+'px, '+dy+'px) ' +
                               'scale('+1/wRatio+', '+1/hRatio+')';
      setNextFrame(newStyle, 'transition', origTransition);
      setNextFrame(newStyle, 'transform', origTransform);
      setNextFrame(newStyle, 'opacity', '1');
      // Animate old element
      for (var key in oldVnode.savedStyle) { //re-apply saved inherited properties
        if (parseInt(key) != key) {
          var ms = key.substring(0,2) === 'ms';
          var moz = key.substring(0,3) === 'moz';
          var webkit = key.substring(0,6) === 'webkit';
      	  if (!ms && !moz && !webkit) //ignore prefixed style properties
        	  oldStyle[key] = oldVnode.savedStyle[key];
        }
      }
      oldStyle.position = 'absolute';
      oldStyle.top = oldRect.top + 'px'; //start at existing position
      oldStyle.left = oldRect.left + 'px';
      oldStyle.width = oldRect.width + 'px'; //Needed for elements who were sized relative to their parents
      oldStyle.height = oldRect.height + 'px'; //Needed for elements who were sized relative to their parents
      oldStyle.margin = 0; //Margin on hero element leads to incorrect positioning
      oldStyle.transformOrigin = calcTransformOrigin(isTextNode, oldTextRect, oldRect);
      oldStyle.transform = '';
      oldStyle.opacity = '1';
      document.body.appendChild(oldElm);
      setNextFrame(oldStyle, 'transform', 'translate('+ -dx +'px, '+ -dy +'px) scale('+wRatio+', '+hRatio+')'); //scale must be on far right for translate to be correct
      setNextFrame(oldStyle, 'opacity', '0');
      oldElm.addEventListener('transitionend', function(ev) {
        if (ev.propertyName === 'transform')
          document.body.removeChild(ev.target);
      });
    }
  }
  removed = created = undefined;
}

module.exports = {pre: pre, create: create, destroy: destroy, post: post};

},{}],122:[function(require,module,exports){
function updateProps(oldVnode, vnode) {
  var key, cur, old, elm = vnode.elm,
      oldProps = oldVnode.data.props || {}, props = vnode.data.props || {};
  for (key in oldProps) {
    if (!props[key]) {
      delete elm[key];
    }
  }
  for (key in props) {
    cur = props[key];
    old = oldProps[key];
    if (old !== cur && (key !== 'value' || elm[key] !== cur)) {
      elm[key] = cur;
    }
  }
}

module.exports = {create: updateProps, update: updateProps};

},{}],123:[function(require,module,exports){
var raf = (typeof window !== 'undefined' && window.requestAnimationFrame) || setTimeout;
var nextFrame = function(fn) { raf(function() { raf(fn); }); };

function setNextFrame(obj, prop, val) {
  nextFrame(function() { obj[prop] = val; });
}

function updateStyle(oldVnode, vnode) {
  var cur, name, elm = vnode.elm,
      oldStyle = oldVnode.data.style || {},
      style = vnode.data.style || {},
      oldHasDel = 'delayed' in oldStyle;
  for (name in oldStyle) {
    if (!style[name]) {
      elm.style[name] = '';
    }
  }
  for (name in style) {
    cur = style[name];
    if (name === 'delayed') {
      for (name in style.delayed) {
        cur = style.delayed[name];
        if (!oldHasDel || cur !== oldStyle.delayed[name]) {
          setNextFrame(elm.style, name, cur);
        }
      }
    } else if (name !== 'remove' && cur !== oldStyle[name]) {
      elm.style[name] = cur;
    }
  }
}

function applyDestroyStyle(vnode) {
  var style, name, elm = vnode.elm, s = vnode.data.style;
  if (!s || !(style = s.destroy)) return;
  for (name in style) {
    elm.style[name] = style[name];
  }
}

function applyRemoveStyle(vnode, rm) {
  var s = vnode.data.style;
  if (!s || !s.remove) {
    rm();
    return;
  }
  var name, elm = vnode.elm, idx, i = 0, maxDur = 0,
      compStyle, style = s.remove, amount = 0, applied = [];
  for (name in style) {
    applied.push(name);
    elm.style[name] = style[name];
  }
  compStyle = getComputedStyle(elm);
  var props = compStyle['transition-property'].split(', ');
  for (; i < props.length; ++i) {
    if(applied.indexOf(props[i]) !== -1) amount++;
  }
  elm.addEventListener('transitionend', function(ev) {
    if (ev.target === elm) --amount;
    if (amount === 0) rm();
  });
}

module.exports = {create: updateStyle, update: updateStyle, destroy: applyDestroyStyle, remove: applyRemoveStyle};

},{}],124:[function(require,module,exports){
// jshint newcap: false
/* global require, module, document, Node */
'use strict';

var VNode = require('./vnode');
var is = require('./is');
var domApi = require('./htmldomapi');

function isUndef(s) { return s === undefined; }
function isDef(s) { return s !== undefined; }

var emptyNode = VNode('', {}, [], undefined, undefined);

function sameVnode(vnode1, vnode2) {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}

function createKeyToOldIdx(children, beginIdx, endIdx) {
  var i, map = {}, key;
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key;
    if (isDef(key)) map[key] = i;
  }
  return map;
}

var hooks = ['create', 'update', 'remove', 'destroy', 'pre', 'post'];

function init(modules, api) {
  var i, j, cbs = {};

  if (isUndef(api)) api = domApi;

  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      if (modules[j][hooks[i]] !== undefined) cbs[hooks[i]].push(modules[j][hooks[i]]);
    }
  }

  function emptyNodeAt(elm) {
    return VNode(api.tagName(elm).toLowerCase(), {}, [], undefined, elm);
  }

  function createRmCb(childElm, listeners) {
    return function() {
      if (--listeners === 0) {
        var parent = api.parentNode(childElm);
        api.removeChild(parent, childElm);
      }
    };
  }

  function createElm(vnode, insertedVnodeQueue) {
    var i, data = vnode.data;
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.init)) {
        i(vnode);
        data = vnode.data;
      }
    }
    var elm, children = vnode.children, sel = vnode.sel;
    if (isDef(sel)) {
      // Parse selector
      var hashIdx = sel.indexOf('#');
      var dotIdx = sel.indexOf('.', hashIdx);
      var hash = hashIdx > 0 ? hashIdx : sel.length;
      var dot = dotIdx > 0 ? dotIdx : sel.length;
      var tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel;
      elm = vnode.elm = isDef(data) && isDef(i = data.ns) ? api.createElementNS(i, tag)
                                                          : api.createElement(tag);
      if (hash < dot) elm.id = sel.slice(hash + 1, dot);
      if (dotIdx > 0) elm.className = sel.slice(dot+1).replace(/\./g, ' ');
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          api.appendChild(elm, createElm(children[i], insertedVnodeQueue));
        }
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text));
      }
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);
      i = vnode.data.hook; // Reuse variable
      if (isDef(i)) {
        if (i.create) i.create(emptyNode, vnode);
        if (i.insert) insertedVnodeQueue.push(vnode);
      }
    } else {
      elm = vnode.elm = api.createTextNode(vnode.text);
    }
    return vnode.elm;
  }

  function addVnodes(parentElm, before, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      api.insertBefore(parentElm, createElm(vnodes[startIdx], insertedVnodeQueue), before);
    }
  }

  function invokeDestroyHook(vnode) {
    var i, j, data = vnode.data;
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode);
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);
      if (isDef(i = vnode.children)) {
        for (j = 0; j < vnode.children.length; ++j) {
          invokeDestroyHook(vnode.children[j]);
        }
      }
    }
  }

  function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      var i, listeners, rm, ch = vnodes[startIdx];
      if (isDef(ch)) {
        if (isDef(ch.sel)) {
          invokeDestroyHook(ch);
          listeners = cbs.remove.length + 1;
          rm = createRmCb(ch.elm, listeners);
          for (i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm);
          if (isDef(i = ch.data) && isDef(i = i.hook) && isDef(i = i.remove)) {
            i(ch, rm);
          } else {
            rm();
          }
        } else { // Text node
          api.removeChild(parentElm, ch.elm);
        }
      }
    }
  }

  function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue) {
    var oldStartIdx = 0, newStartIdx = 0;
    var oldEndIdx = oldCh.length - 1;
    var oldStartVnode = oldCh[0];
    var oldEndVnode = oldCh[oldEndIdx];
    var newEndIdx = newCh.length - 1;
    var newStartVnode = newCh[0];
    var newEndVnode = newCh[newEndIdx];
    var oldKeyToIdx, idxInOld, elmToMove, before;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldStartVnode.elm, api.nextSibling(oldEndVnode.elm));
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } else {
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        idxInOld = oldKeyToIdx[newStartVnode.key];
        if (isUndef(idxInOld)) { // New element
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);
          newStartVnode = newCh[++newStartIdx];
        } else {
          elmToMove = oldCh[idxInOld];
          patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
          oldCh[idxInOld] = undefined;
          api.insertBefore(parentElm, elmToMove.elm, oldStartVnode.elm);
          newStartVnode = newCh[++newStartIdx];
        }
      }
    }
    if (oldStartIdx > oldEndIdx) {
      before = isUndef(newCh[newEndIdx+1]) ? null : newCh[newEndIdx+1].elm;
      addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
    } else if (newStartIdx > newEndIdx) {
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
    }
  }

  function patchVnode(oldVnode, vnode, insertedVnodeQueue) {
    var i, hook;
    if (isDef(i = vnode.data) && isDef(hook = i.hook) && isDef(i = hook.prepatch)) {
      i(oldVnode, vnode);
    }
    var elm = vnode.elm = oldVnode.elm, oldCh = oldVnode.children, ch = vnode.children;
    if (oldVnode === vnode) return;
    if (!sameVnode(oldVnode, vnode)) {
      var parentElm = api.parentNode(oldVnode.elm);
      elm = createElm(vnode, insertedVnodeQueue);
      api.insertBefore(parentElm, elm, oldVnode.elm);
      removeVnodes(parentElm, [oldVnode], 0, 0);
      return;
    }
    if (isDef(vnode.data)) {
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode);
      i = vnode.data.hook;
      if (isDef(i) && isDef(i = i.update)) i(oldVnode, vnode);
    }
    if (isUndef(vnode.text)) {
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue);
      } else if (isDef(ch)) {
        if (isDef(oldVnode.text)) api.setTextContent(elm, '');
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
      } else if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, '');
      }
    } else if (oldVnode.text !== vnode.text) {
      api.setTextContent(elm, vnode.text);
    }
    if (isDef(hook) && isDef(i = hook.postpatch)) {
      i(oldVnode, vnode);
    }
  }

  return function(oldVnode, vnode) {
    var i, elm, parent;
    var insertedVnodeQueue = [];
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();

    if (isUndef(oldVnode.sel)) {
      oldVnode = emptyNodeAt(oldVnode);
    }

    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    } else {
      elm = oldVnode.elm;
      parent = api.parentNode(elm);

      createElm(vnode, insertedVnodeQueue);

      if (parent !== null) {
        api.insertBefore(parent, vnode.elm, api.nextSibling(elm));
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data.hook.insert(insertedVnodeQueue[i]);
    }
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();
    return vnode;
  };
}

module.exports = {init: init};

},{"./htmldomapi":116,"./is":117,"./vnode":126}],125:[function(require,module,exports){
var h = require('./h');

function copyToThunk(vnode, thunk) {
  thunk.elm = vnode.elm;
  vnode.data.fn = thunk.data.fn;
  vnode.data.args = thunk.data.args;
  thunk.data = vnode.data;
  thunk.children = vnode.children;
  thunk.text = vnode.text;
  thunk.elm = vnode.elm;
}

function init(thunk) {
  var i, cur = thunk.data;
  var vnode = cur.fn.apply(undefined, cur.args);
  copyToThunk(vnode, thunk);
}

function prepatch(oldVnode, thunk) {
  var i, old = oldVnode.data, cur = thunk.data, vnode;
  var oldArgs = old.args, args = cur.args;
  if (old.fn !== cur.fn || oldArgs.length !== args.length) {
    copyToThunk(cur.fn.apply(undefined, args), thunk);
  }
  for (i = 0; i < args.length; ++i) {
    if (oldArgs[i] !== args[i]) {
      copyToThunk(cur.fn.apply(undefined, args), thunk);
      return;
    }
  }
  copyToThunk(oldVnode, thunk);
}

module.exports = function(sel, key, fn, args) {
  if (args === undefined) {
    args = fn;
    fn = key;
    key = undefined;
  }
  return h(sel, {
    key: key,
    hook: {init: init, prepatch: prepatch},
    fn: fn,
    args: args
  });
};

},{"./h":115}],126:[function(require,module,exports){
module.exports = function(sel, data, children, text, elm) {
  var key = data === undefined ? undefined : data.key;
  return {sel: sel, data: data, children: children,
          text: text, elm: elm, key: key};
};

},{}],127:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":128}],128:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ponyfill = require('./ponyfill');

var _ponyfill2 = _interopRequireDefault(_ponyfill);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var root; /* global window */


if (typeof self !== 'undefined') {
  root = self;
} else if (typeof window !== 'undefined') {
  root = window;
} else if (typeof global !== 'undefined') {
  root = global;
} else if (typeof module !== 'undefined') {
  root = module;
} else {
  root = Function('return this')();
}

var result = (0, _ponyfill2['default'])(root);
exports['default'] = result;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./ponyfill":129}],129:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports['default'] = symbolObservablePonyfill;
function symbolObservablePonyfill(root) {
	var result;
	var _Symbol = root.Symbol;

	if (typeof _Symbol === 'function') {
		if (_Symbol.observable) {
			result = _Symbol.observable;
		} else {
			result = _Symbol('observable');
			_Symbol.observable = result;
		}
	} else {
		result = '@@observable';
	}

	return result;
};
},{}],130:[function(require,module,exports){
"use strict";
var index_1 = require('../index');
var empty = {};
var DropRepeatsOperator = (function () {
    function DropRepeatsOperator(ins, fn) {
        this.ins = ins;
        this.fn = fn;
        this.type = 'dropRepeats';
        this.out = null;
        this.v = empty;
    }
    DropRepeatsOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    DropRepeatsOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = null;
        this.v = empty;
    };
    DropRepeatsOperator.prototype.isEq = function (x, y) {
        return this.fn ? this.fn(x, y) : x === y;
    };
    DropRepeatsOperator.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        var v = this.v;
        if (v !== empty && this.isEq(t, v))
            return;
        this.v = Array.isArray(t) ? t.slice() : t;
        u._n(t);
    };
    DropRepeatsOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    DropRepeatsOperator.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        u._c();
    };
    return DropRepeatsOperator;
}());
exports.DropRepeatsOperator = DropRepeatsOperator;
/**
 * Drops consecutive duplicate values in a stream.
 *
 * Marble diagram:
 *
 * ```text
 * --1--2--1--1--1--2--3--4--3--3|
 *     dropRepeats
 * --1--2--1--------2--3--4--3---|
 * ```
 *
 * Example:
 *
 * ```js
 * import dropRepeats from 'xstream/extra/dropRepeats'
 *
 * const stream = xs.of(1, 2, 1, 1, 1, 2, 3, 4, 3, 3)
 *   .compose(dropRepeats())
 *
 * stream.addListener({
 *   next: i => console.log(i),
 *   error: err => console.error(err),
 *   complete: () => console.log('completed')
 * })
 * ```
 *
 * ```text
 * > 1
 * > 2
 * > 1
 * > 2
 * > 3
 * > 4
 * > 3
 * > completed
 * ```
 *
 * Example with a custom isEqual function:
 *
 * ```js
 * import dropRepeats from 'xstream/extra/dropRepeats'
 *
 * const stream = xs.of('a', 'b', 'a', 'A', 'B', 'b')
 *   .compose(dropRepeats((x, y) => x.toLowerCase() === y.toLowerCase()))
 *
 * stream.addListener({
 *   next: i => console.log(i),
 *   error: err => console.error(err),
 *   complete: () => console.log('completed')
 * })
 * ```
 *
 * ```text
 * > a
 * > b
 * > a
 * > B
 * > completed
 * ```
 *
 * @param {Function} isEqual An optional function of type
 * `(x: T, y: T) => boolean` that takes an event from the input stream and
 * checks if it is equal to previous event, by returning a boolean.
 * @return {Stream}
 */
function dropRepeats(isEqual) {
    if (isEqual === void 0) { isEqual = void 0; }
    return function dropRepeatsOperator(ins) {
        return new index_1.Stream(new DropRepeatsOperator(ins, isEqual));
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = dropRepeats;

},{"../index":131}],131:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var symbol_observable_1 = require('symbol-observable');
var NO = {};
exports.NO = NO;
function noop() { }
function copy(a) {
    var l = a.length;
    var b = Array(l);
    for (var i = 0; i < l; ++i) {
        b[i] = a[i];
    }
    return b;
}
function and(f1, f2) {
    return function andFn(t) {
        return f1(t) && f2(t);
    };
}
function _try(c, t, u) {
    try {
        return c.f(t);
    }
    catch (e) {
        u._e(e);
        return NO;
    }
}
var NO_IL = {
    _n: noop,
    _e: noop,
    _c: noop,
};
exports.NO_IL = NO_IL;
// mutates the input
function internalizeProducer(producer) {
    producer._start =
        function _start(il) {
            il.next = il._n;
            il.error = il._e;
            il.complete = il._c;
            this.start(il);
        };
    producer._stop = producer.stop;
}
var StreamSub = (function () {
    function StreamSub(_stream, _listener) {
        this._stream = _stream;
        this._listener = _listener;
    }
    StreamSub.prototype.unsubscribe = function () {
        this._stream.removeListener(this._listener);
    };
    return StreamSub;
}());
var Observer = (function () {
    function Observer(_listener) {
        this._listener = _listener;
    }
    Observer.prototype.next = function (value) {
        this._listener._n(value);
    };
    Observer.prototype.error = function (err) {
        this._listener._e(err);
    };
    Observer.prototype.complete = function () {
        this._listener._c();
    };
    return Observer;
}());
var FromObservable = (function () {
    function FromObservable(observable) {
        this.type = 'fromObservable';
        this.ins = observable;
        this.active = false;
    }
    FromObservable.prototype._start = function (out) {
        this.out = out;
        this.active = true;
        this._sub = this.ins.subscribe(new Observer(out));
        if (!this.active)
            this._sub.unsubscribe();
    };
    FromObservable.prototype._stop = function () {
        if (this._sub)
            this._sub.unsubscribe();
        this.active = false;
    };
    return FromObservable;
}());
var Merge = (function () {
    function Merge(insArr) {
        this.type = 'merge';
        this.insArr = insArr;
        this.out = NO;
        this.ac = 0;
    }
    Merge.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var L = s.length;
        this.ac = L;
        for (var i = 0; i < L; i++) {
            s[i]._add(this);
        }
    };
    Merge.prototype._stop = function () {
        var s = this.insArr;
        var L = s.length;
        for (var i = 0; i < L; i++) {
            s[i]._remove(this);
        }
        this.out = NO;
    };
    Merge.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    Merge.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Merge.prototype._c = function () {
        if (--this.ac <= 0) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    return Merge;
}());
var CombineListener = (function () {
    function CombineListener(i, out, p) {
        this.i = i;
        this.out = out;
        this.p = p;
        p.ils.push(this);
    }
    CombineListener.prototype._n = function (t) {
        var p = this.p, out = this.out;
        if (out === NO)
            return;
        if (p.up(t, this.i)) {
            out._n(p.vals);
        }
    };
    CombineListener.prototype._e = function (err) {
        var out = this.out;
        if (out === NO)
            return;
        out._e(err);
    };
    CombineListener.prototype._c = function () {
        var p = this.p;
        if (p.out === NO)
            return;
        if (--p.Nc === 0) {
            p.out._c();
        }
    };
    return CombineListener;
}());
var Combine = (function () {
    function Combine(insArr) {
        this.type = 'combine';
        this.insArr = insArr;
        this.out = NO;
        this.ils = [];
        this.Nc = this.Nn = 0;
        this.vals = [];
    }
    Combine.prototype.up = function (t, i) {
        var v = this.vals[i];
        var Nn = !this.Nn ? 0 : v === NO ? --this.Nn : this.Nn;
        this.vals[i] = t;
        return Nn === 0;
    };
    Combine.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var n = this.Nc = this.Nn = s.length;
        var vals = this.vals = new Array(n);
        if (n === 0) {
            out._n([]);
            out._c();
        }
        else {
            for (var i = 0; i < n; i++) {
                vals[i] = NO;
                s[i]._add(new CombineListener(i, out, this));
            }
        }
    };
    Combine.prototype._stop = function () {
        var s = this.insArr;
        var n = s.length;
        var ils = this.ils;
        for (var i = 0; i < n; i++) {
            s[i]._remove(ils[i]);
        }
        this.out = NO;
        this.ils = [];
        this.vals = [];
    };
    return Combine;
}());
var FromArray = (function () {
    function FromArray(a) {
        this.type = 'fromArray';
        this.a = a;
    }
    FromArray.prototype._start = function (out) {
        var a = this.a;
        for (var i = 0, l = a.length; i < l; i++) {
            out._n(a[i]);
        }
        out._c();
    };
    FromArray.prototype._stop = function () {
    };
    return FromArray;
}());
var FromPromise = (function () {
    function FromPromise(p) {
        this.type = 'fromPromise';
        this.on = false;
        this.p = p;
    }
    FromPromise.prototype._start = function (out) {
        var prod = this;
        this.on = true;
        this.p.then(function (v) {
            if (prod.on) {
                out._n(v);
                out._c();
            }
        }, function (e) {
            out._e(e);
        }).then(noop, function (err) {
            setTimeout(function () { throw err; });
        });
    };
    FromPromise.prototype._stop = function () {
        this.on = false;
    };
    return FromPromise;
}());
var Periodic = (function () {
    function Periodic(period) {
        this.type = 'periodic';
        this.period = period;
        this.intervalID = -1;
        this.i = 0;
    }
    Periodic.prototype._start = function (out) {
        var self = this;
        function intervalHandler() { out._n(self.i++); }
        this.intervalID = setInterval(intervalHandler, this.period);
    };
    Periodic.prototype._stop = function () {
        if (this.intervalID !== -1)
            clearInterval(this.intervalID);
        this.intervalID = -1;
        this.i = 0;
    };
    return Periodic;
}());
var Debug = (function () {
    function Debug(ins, arg) {
        this.type = 'debug';
        this.ins = ins;
        this.out = NO;
        this.s = noop;
        this.l = '';
        if (typeof arg === 'string') {
            this.l = arg;
        }
        else if (typeof arg === 'function') {
            this.s = arg;
        }
    }
    Debug.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    Debug.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Debug.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var s = this.s, l = this.l;
        if (s !== noop) {
            try {
                s(t);
            }
            catch (e) {
                u._e(e);
            }
        }
        else if (l) {
            console.log(l + ':', t);
        }
        else {
            console.log(t);
        }
        u._n(t);
    };
    Debug.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Debug.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Debug;
}());
var Drop = (function () {
    function Drop(max, ins) {
        this.type = 'drop';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.dropped = 0;
    }
    Drop.prototype._start = function (out) {
        this.out = out;
        this.dropped = 0;
        this.ins._add(this);
    };
    Drop.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Drop.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        if (this.dropped++ >= this.max)
            u._n(t);
    };
    Drop.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Drop.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Drop;
}());
var EndWhenListener = (function () {
    function EndWhenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    EndWhenListener.prototype._n = function () {
        this.op.end();
    };
    EndWhenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    EndWhenListener.prototype._c = function () {
        this.op.end();
    };
    return EndWhenListener;
}());
var EndWhen = (function () {
    function EndWhen(o, ins) {
        this.type = 'endWhen';
        this.ins = ins;
        this.out = NO;
        this.o = o;
        this.oil = NO_IL;
    }
    EndWhen.prototype._start = function (out) {
        this.out = out;
        this.o._add(this.oil = new EndWhenListener(out, this));
        this.ins._add(this);
    };
    EndWhen.prototype._stop = function () {
        this.ins._remove(this);
        this.o._remove(this.oil);
        this.out = NO;
        this.oil = NO_IL;
    };
    EndWhen.prototype.end = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    EndWhen.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    EndWhen.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    EndWhen.prototype._c = function () {
        this.end();
    };
    return EndWhen;
}());
var Filter = (function () {
    function Filter(passes, ins) {
        this.type = 'filter';
        this.ins = ins;
        this.out = NO;
        this.f = passes;
    }
    Filter.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    Filter.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Filter.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO || !r)
            return;
        u._n(t);
    };
    Filter.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Filter.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Filter;
}());
var FlattenListener = (function () {
    function FlattenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    FlattenListener.prototype._n = function (t) {
        this.out._n(t);
    };
    FlattenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    FlattenListener.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return FlattenListener;
}());
var Flatten = (function () {
    function Flatten(ins) {
        this.type = 'flatten';
        this.ins = ins;
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = NO_IL;
    }
    Flatten.prototype._start = function (out) {
        this.out = out;
        this.open = true;
        this.inner = NO;
        this.il = NO_IL;
        this.ins._add(this);
    };
    Flatten.prototype._stop = function () {
        this.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = NO_IL;
    };
    Flatten.prototype.less = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (!this.open && this.inner === NO)
            u._c();
    };
    Flatten.prototype._n = function (s) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        if (inner !== NO && il !== NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new FlattenListener(u, this));
    };
    Flatten.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Flatten.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return Flatten;
}());
var Fold = (function () {
    function Fold(f, seed, ins) {
        var _this = this;
        this.type = 'fold';
        this.ins = ins;
        this.out = NO;
        this.f = function (t) { return f(_this.acc, t); };
        this.acc = this.seed = seed;
    }
    Fold.prototype._start = function (out) {
        this.out = out;
        this.acc = this.seed;
        out._n(this.acc);
        this.ins._add(this);
    };
    Fold.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.acc = this.seed;
    };
    Fold.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO)
            return;
        u._n(this.acc = r);
    };
    Fold.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Fold.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Fold;
}());
var Last = (function () {
    function Last(ins) {
        this.type = 'last';
        this.ins = ins;
        this.out = NO;
        this.has = false;
        this.val = NO;
    }
    Last.prototype._start = function (out) {
        this.out = out;
        this.has = false;
        this.ins._add(this);
    };
    Last.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.val = NO;
    };
    Last.prototype._n = function (t) {
        this.has = true;
        this.val = t;
    };
    Last.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Last.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (this.has) {
            u._n(this.val);
            u._c();
        }
        else {
            u._e('TODO show proper error');
        }
    };
    return Last;
}());
var MapFlattenListener = (function () {
    function MapFlattenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    MapFlattenListener.prototype._n = function (r) {
        this.out._n(r);
    };
    MapFlattenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    MapFlattenListener.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return MapFlattenListener;
}());
var MapFlatten = (function () {
    function MapFlatten(mapOp) {
        this.type = mapOp.type + "+flatten";
        this.ins = mapOp.ins;
        this.out = NO;
        this.mapOp = mapOp;
        this.inner = NO;
        this.il = NO_IL;
        this.open = true;
    }
    MapFlatten.prototype._start = function (out) {
        this.out = out;
        this.inner = NO;
        this.il = NO_IL;
        this.open = true;
        this.mapOp.ins._add(this);
    };
    MapFlatten.prototype._stop = function () {
        this.mapOp.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.inner = NO;
        this.il = NO_IL;
    };
    MapFlatten.prototype.less = function () {
        if (!this.open && this.inner === NO) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    MapFlatten.prototype._n = function (v) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        var s = _try(this.mapOp, v, u);
        if (s === NO)
            return;
        if (inner !== NO && il !== NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new MapFlattenListener(u, this));
    };
    MapFlatten.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapFlatten.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return MapFlatten;
}());
var MapOp = (function () {
    function MapOp(project, ins) {
        this.type = 'map';
        this.ins = ins;
        this.out = NO;
        this.f = project;
    }
    MapOp.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    MapOp.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    MapOp.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO)
            return;
        u._n(r);
    };
    MapOp.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapOp.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return MapOp;
}());
var FilterMapFusion = (function (_super) {
    __extends(FilterMapFusion, _super);
    function FilterMapFusion(passes, project, ins) {
        _super.call(this, project, ins);
        this.type = 'filter+map';
        this.passes = passes;
    }
    FilterMapFusion.prototype._n = function (t) {
        if (!this.passes(t))
            return;
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO)
            return;
        u._n(r);
    };
    return FilterMapFusion;
}(MapOp));
var Remember = (function () {
    function Remember(ins) {
        this.type = 'remember';
        this.ins = ins;
        this.out = NO;
    }
    Remember.prototype._start = function (out) {
        this.out = out;
        this.ins._add(out);
    };
    Remember.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return Remember;
}());
var ReplaceError = (function () {
    function ReplaceError(replacer, ins) {
        this.type = 'replaceError';
        this.ins = ins;
        this.out = NO;
        this.f = replacer;
    }
    ReplaceError.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    ReplaceError.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    ReplaceError.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    ReplaceError.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            this.ins._remove(this);
            (this.ins = this.f(err))._add(this);
        }
        catch (e) {
            u._e(e);
        }
    };
    ReplaceError.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return ReplaceError;
}());
var StartWith = (function () {
    function StartWith(ins, val) {
        this.type = 'startWith';
        this.ins = ins;
        this.out = NO;
        this.val = val;
    }
    StartWith.prototype._start = function (out) {
        this.out = out;
        this.out._n(this.val);
        this.ins._add(out);
    };
    StartWith.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return StartWith;
}());
var Take = (function () {
    function Take(max, ins) {
        this.type = 'take';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.taken = 0;
    }
    Take.prototype._start = function (out) {
        this.out = out;
        this.taken = 0;
        if (this.max <= 0) {
            out._c();
        }
        else {
            this.ins._add(this);
        }
    };
    Take.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Take.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var m = ++this.taken;
        if (m < this.max) {
            u._n(t);
        }
        else if (m === this.max) {
            u._n(t);
            u._c();
        }
    };
    Take.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Take.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Take;
}());
var Stream = (function () {
    function Stream(producer) {
        this._prod = producer || NO;
        this._ils = [];
        this._stopID = NO;
        this._dl = NO;
        this._d = false;
        this._target = NO;
        this._err = NO;
    }
    Stream.prototype._n = function (t) {
        var a = this._ils;
        var L = a.length;
        if (this._d)
            this._dl._n(t);
        if (L == 1)
            a[0]._n(t);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._n(t);
        }
    };
    Stream.prototype._e = function (err) {
        if (this._err !== NO)
            return;
        this._err = err;
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._e(err);
        if (L == 1)
            a[0]._e(err);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._e(err);
        }
        if (!this._d && L == 0)
            throw this._err;
    };
    Stream.prototype._c = function () {
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._c();
        if (L == 1)
            a[0]._c();
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._c();
        }
    };
    Stream.prototype._x = function () {
        if (this._ils.length === 0)
            return;
        if (this._prod !== NO)
            this._prod._stop();
        this._err = NO;
        this._ils = [];
    };
    Stream.prototype._stopNow = function () {
        // WARNING: code that calls this method should
        // first check if this._prod is valid (not `NO`)
        this._prod._stop();
        this._err = NO;
        this._stopID = NO;
    };
    Stream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1)
            return;
        if (this._stopID !== NO) {
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    Stream.prototype._remove = function (il) {
        var _this = this;
        var ta = this._target;
        if (ta !== NO)
            return ta._remove(il);
        var a = this._ils;
        var i = a.indexOf(il);
        if (i > -1) {
            a.splice(i, 1);
            if (this._prod !== NO && a.length <= 0) {
                this._err = NO;
                this._stopID = setTimeout(function () { return _this._stopNow(); });
            }
            else if (a.length === 1) {
                this._pruneCycles();
            }
        }
    };
    // If all paths stemming from `this` stream eventually end at `this`
    // stream, then we remove the single listener of `this` stream, to
    // force it to end its execution and dispose resources. This method
    // assumes as a precondition that this._ils has just one listener.
    Stream.prototype._pruneCycles = function () {
        if (this._hasNoSinks(this, [])) {
            this._remove(this._ils[0]);
        }
    };
    // Checks whether *there is no* path starting from `x` that leads to an end
    // listener (sink) in the stream graph, following edges A->B where B is a
    // listener of A. This means these paths constitute a cycle somehow. Is given
    // a trace of all visited nodes so far.
    Stream.prototype._hasNoSinks = function (x, trace) {
        if (trace.indexOf(x) !== -1) {
            return true;
        }
        else if (x.out === this) {
            return true;
        }
        else if (x.out && x.out !== NO) {
            return this._hasNoSinks(x.out, trace.concat(x));
        }
        else if (x._ils) {
            for (var i = 0, N = x._ils.length; i < N; i++) {
                if (!this._hasNoSinks(x._ils[i], trace.concat(x))) {
                    return false;
                }
            }
            return true;
        }
        else {
            return false;
        }
    };
    Stream.prototype.ctor = function () {
        return this instanceof MemoryStream ? MemoryStream : Stream;
    };
    /**
     * Adds a Listener to the Stream.
     *
     * @param {Listener} listener
     */
    Stream.prototype.addListener = function (listener) {
        listener._n = listener.next || noop;
        listener._e = listener.error || noop;
        listener._c = listener.complete || noop;
        this._add(listener);
    };
    /**
     * Removes a Listener from the Stream, assuming the Listener was added to it.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.removeListener = function (listener) {
        this._remove(listener);
    };
    /**
     * Adds a Listener to the Stream returning a Subscription to remove that
     * listener.
     *
     * @param {Listener} listener
     * @returns {Subscription}
     */
    Stream.prototype.subscribe = function (listener) {
        this.addListener(listener);
        return new StreamSub(this, listener);
    };
    /**
     * Add interop between most.js and RxJS 5
     *
     * @returns {Stream}
     */
    Stream.prototype[symbol_observable_1.default] = function () {
        return this;
    };
    /**
     * Creates a new Stream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {Stream}
     */
    Stream.create = function (producer) {
        if (producer) {
            if (typeof producer.start !== 'function'
                || typeof producer.stop !== 'function') {
                throw new Error('producer requires both start and stop functions');
            }
            internalizeProducer(producer); // mutates the input
        }
        return new Stream(producer);
    };
    /**
     * Creates a new MemoryStream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {MemoryStream}
     */
    Stream.createWithMemory = function (producer) {
        if (producer) {
            internalizeProducer(producer); // mutates the input
        }
        return new MemoryStream(producer);
    };
    /**
     * Creates a Stream that does nothing when started. It never emits any event.
     *
     * Marble diagram:
     *
     * ```text
     *          never
     * -----------------------
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.never = function () {
        return new Stream({ _start: noop, _stop: noop });
    };
    /**
     * Creates a Stream that immediately emits the "complete" notification when
     * started, and that's it.
     *
     * Marble diagram:
     *
     * ```text
     * empty
     * -|
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.empty = function () {
        return new Stream({
            _start: function (il) { il._c(); },
            _stop: noop,
        });
    };
    /**
     * Creates a Stream that immediately emits an "error" notification with the
     * value you passed as the `error` argument when the stream starts, and that's
     * it.
     *
     * Marble diagram:
     *
     * ```text
     * throw(X)
     * -X
     * ```
     *
     * @factory true
     * @param error The error event to emit on the created stream.
     * @return {Stream}
     */
    Stream.throw = function (error) {
        return new Stream({
            _start: function (il) { il._e(error); },
            _stop: noop,
        });
    };
    /**
     * Creates a stream from an Array, Promise, or an Observable.
     *
     * @factory true
     * @param {Array|Promise|Observable} input The input to make a stream from.
     * @return {Stream}
     */
    Stream.from = function (input) {
        if (typeof input[symbol_observable_1.default] === 'function') {
            return Stream.fromObservable(input);
        }
        else if (typeof input.then === 'function') {
            return Stream.fromPromise(input);
        }
        else if (Array.isArray(input)) {
            return Stream.fromArray(input);
        }
        throw new TypeError("Type of input to from() must be an Array, Promise, or Observable");
    };
    /**
     * Creates a Stream that immediately emits the arguments that you give to
     * *of*, then completes.
     *
     * Marble diagram:
     *
     * ```text
     * of(1,2,3)
     * 123|
     * ```
     *
     * @factory true
     * @param a The first value you want to emit as an event on the stream.
     * @param b The second value you want to emit as an event on the stream. One
     * or more of these values may be given as arguments.
     * @return {Stream}
     */
    Stream.of = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i - 0] = arguments[_i];
        }
        return Stream.fromArray(items);
    };
    /**
     * Converts an array to a stream. The returned stream will emit synchronously
     * all the items in the array, and then complete.
     *
     * Marble diagram:
     *
     * ```text
     * fromArray([1,2,3])
     * 123|
     * ```
     *
     * @factory true
     * @param {Array} array The array to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromArray = function (array) {
        return new Stream(new FromArray(array));
    };
    /**
     * Converts a promise to a stream. The returned stream will emit the resolved
     * value of the promise, and then complete. However, if the promise is
     * rejected, the stream will emit the corresponding error.
     *
     * Marble diagram:
     *
     * ```text
     * fromPromise( ----42 )
     * -----------------42|
     * ```
     *
     * @factory true
     * @param {Promise} promise The promise to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromPromise = function (promise) {
        return new Stream(new FromPromise(promise));
    };
    /**
     * Converts an Observable into a Stream.
     *
     * @factory true
     * @param {any} observable The observable to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromObservable = function (observable) {
        return new Stream(new FromObservable(observable));
    };
    /**
     * Creates a stream that periodically emits incremental numbers, every
     * `period` milliseconds.
     *
     * Marble diagram:
     *
     * ```text
     *     periodic(1000)
     * ---0---1---2---3---4---...
     * ```
     *
     * @factory true
     * @param {number} period The interval in milliseconds to use as a rate of
     * emission.
     * @return {Stream}
     */
    Stream.periodic = function (period) {
        return new Stream(new Periodic(period));
    };
    Stream.prototype._map = function (project) {
        var p = this._prod;
        var ctor = this.ctor();
        if (p instanceof Filter) {
            return new ctor(new FilterMapFusion(p.f, project, p.ins));
        }
        return new ctor(new MapOp(project, this));
    };
    /**
     * Transforms each event from the input Stream through a `project` function,
     * to get a Stream that emits those transformed events.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7------
     *    map(i => i * 10)
     * --10--30-50----70-----
     * ```
     *
     * @param {Function} project A function of type `(t: T) => U` that takes event
     * `t` of type `T` from the input Stream and produces an event of type `U`, to
     * be emitted on the output Stream.
     * @return {Stream}
     */
    Stream.prototype.map = function (project) {
        return this._map(project);
    };
    /**
     * It's like `map`, but transforms each input event to always the same
     * constant value on the output Stream.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7-----
     *       mapTo(10)
     * --10--10-10----10----
     * ```
     *
     * @param projectedValue A value to emit on the output Stream whenever the
     * input Stream emits any value.
     * @return {Stream}
     */
    Stream.prototype.mapTo = function (projectedValue) {
        var s = this.map(function () { return projectedValue; });
        var op = s._prod;
        op.type = op.type.replace('map', 'mapTo');
        return s;
    };
    /**
     * Only allows events that pass the test given by the `passes` argument.
     *
     * Each event from the input stream is given to the `passes` function. If the
     * function returns `true`, the event is forwarded to the output stream,
     * otherwise it is ignored and not forwarded.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2--3-----4-----5---6--7-8--
     *     filter(i => i % 2 === 0)
     * ------2--------4---------6----8--
     * ```
     *
     * @param {Function} passes A function of type `(t: T) +> boolean` that takes
     * an event from the input stream and checks if it passes, by returning a
     * boolean.
     * @return {Stream}
     */
    Stream.prototype.filter = function (passes) {
        var p = this._prod;
        if (p instanceof Filter) {
            return new Stream(new Filter(and(p.f, passes), p.ins));
        }
        return new Stream(new Filter(passes, this));
    };
    /**
     * Lets the first `amount` many events from the input stream pass to the
     * output stream, then makes the output stream complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *    take(3)
     * --a---b--c|
     * ```
     *
     * @param {number} amount How many events to allow from the input stream
     * before completing the output stream.
     * @return {Stream}
     */
    Stream.prototype.take = function (amount) {
        return new (this.ctor())(new Take(amount, this));
    };
    /**
     * Ignores the first `amount` many events from the input stream, and then
     * after that starts forwarding events from the input stream to the output
     * stream.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *       drop(3)
     * --------------d---e--
     * ```
     *
     * @param {number} amount How many events to ignore from the input stream
     * before forwarding all events from the input stream to the output stream.
     * @return {Stream}
     */
    Stream.prototype.drop = function (amount) {
        return new Stream(new Drop(amount, this));
    };
    /**
     * When the input stream completes, the output stream will emit the last event
     * emitted by the input stream, and then will also complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c--d----|
     *       last()
     * -----------------d|
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.last = function () {
        return new Stream(new Last(this));
    };
    /**
     * Prepends the given `initial` value to the sequence of events emitted by the
     * input stream. The returned stream is a MemoryStream, which means it is
     * already `remember()`'d.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3---
     *   startWith(0)
     * 0--1---2-----3---
     * ```
     *
     * @param initial The value or event to prepend.
     * @return {MemoryStream}
     */
    Stream.prototype.startWith = function (initial) {
        return new MemoryStream(new StartWith(this, initial));
    };
    /**
     * Uses another stream to determine when to complete the current stream.
     *
     * When the given `other` stream emits an event or completes, the output
     * stream will complete. Before that happens, the output stream will behaves
     * like the input stream.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3--4----5----6---
     *   endWhen( --------a--b--| )
     * ---1---2-----3--4--|
     * ```
     *
     * @param other Some other stream that is used to know when should the output
     * stream of this operator complete.
     * @return {Stream}
     */
    Stream.prototype.endWhen = function (other) {
        return new (this.ctor())(new EndWhen(other, this));
    };
    /**
     * "Folds" the stream onto itself.
     *
     * Combines events from the past throughout
     * the entire execution of the input stream, allowing you to accumulate them
     * together. It's essentially like `Array.prototype.reduce`. The returned
     * stream is a MemoryStream, which means it is already `remember()`'d.
     *
     * The output stream starts by emitting the `seed` which you give as argument.
     * Then, when an event happens on the input stream, it is combined with that
     * seed value through the `accumulate` function, and the output value is
     * emitted on the output stream. `fold` remembers that output value as `acc`
     * ("accumulator"), and then when a new input event `t` happens, `acc` will be
     * combined with that to produce the new `acc` and so forth.
     *
     * Marble diagram:
     *
     * ```text
     * ------1-----1--2----1----1------
     *   fold((acc, x) => acc + x, 3)
     * 3-----4-----5--7----8----9------
     * ```
     *
     * @param {Function} accumulate A function of type `(acc: R, t: T) => R` that
     * takes the previous accumulated value `acc` and the incoming event from the
     * input stream and produces the new accumulated value.
     * @param seed The initial accumulated value, of type `R`.
     * @return {MemoryStream}
     */
    Stream.prototype.fold = function (accumulate, seed) {
        return new MemoryStream(new Fold(accumulate, seed, this));
    };
    /**
     * Replaces an error with another stream.
     *
     * When (and if) an error happens on the input stream, instead of forwarding
     * that error to the output stream, *replaceError* will call the `replace`
     * function which returns the stream that the output stream will replicate.
     * And, in case that new stream also emits an error, `replace` will be called
     * again to get another stream to start replicating.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2-----3--4-----X
     *   replaceError( () => --10--| )
     * --1---2-----3--4--------10--|
     * ```
     *
     * @param {Function} replace A function of type `(err) => Stream` that takes
     * the error that occurred on the input stream or on the previous replacement
     * stream and returns a new stream. The output stream will behave like the
     * stream that this function returns.
     * @return {Stream}
     */
    Stream.prototype.replaceError = function (replace) {
        return new (this.ctor())(new ReplaceError(replace, this));
    };
    /**
     * Flattens a "stream of streams", handling only one nested stream at a time
     * (no concurrency).
     *
     * If the input stream is a stream that emits streams, then this operator will
     * return an output stream which is a flat stream: emits regular events. The
     * flattening happens without concurrency. It works like this: when the input
     * stream emits a nested stream, *flatten* will start imitating that nested
     * one. However, as soon as the next nested stream is emitted on the input
     * stream, *flatten* will forget the previous nested one it was imitating, and
     * will start imitating the new nested one.
     *
     * Marble diagram:
     *
     * ```text
     * --+--------+---------------
     *   \        \
     *    \       ----1----2---3--
     *    --a--b----c----d--------
     *           flatten
     * -----a--b------1----2---3--
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.flatten = function () {
        var p = this._prod;
        return new Stream(p instanceof MapOp && !(p instanceof FilterMapFusion) ?
            new MapFlatten(p) :
            new Flatten(this));
    };
    /**
     * Passes the input stream to a custom operator, to produce an output stream.
     *
     * *compose* is a handy way of using an existing function in a chained style.
     * Instead of writing `outStream = f(inStream)` you can write
     * `outStream = inStream.compose(f)`.
     *
     * @param {function} operator A function that takes a stream as input and
     * returns a stream as well.
     * @return {Stream}
     */
    Stream.prototype.compose = function (operator) {
        return operator(this);
    };
    /**
     * Returns an output stream that behaves like the input stream, but also
     * remembers the most recent event that happens on the input stream, so that a
     * newly added listener will immediately receive that memorised event.
     *
     * @return {MemoryStream}
     */
    Stream.prototype.remember = function () {
        return new MemoryStream(new Remember(this));
    };
    /**
     * Returns an output stream that identically behaves like the input stream,
     * but also runs a `spy` function fo each event, to help you debug your app.
     *
     * *debug* takes a `spy` function as argument, and runs that for each event
     * happening on the input stream. If you don't provide the `spy` argument,
     * then *debug* will just `console.log` each event. This helps you to
     * understand the flow of events through some operator chain.
     *
     * Please note that if the output stream has no listeners, then it will not
     * start, which means `spy` will never run because no actual event happens in
     * that case.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3-----4--
     *         debug
     * --1----2-----3-----4--
     * ```
     *
     * @param {function} labelOrSpy A string to use as the label when printing
     * debug information on the console, or a 'spy' function that takes an event
     * as argument, and does not need to return anything.
     * @return {Stream}
     */
    Stream.prototype.debug = function (labelOrSpy) {
        return new (this.ctor())(new Debug(this, labelOrSpy));
    };
    /**
     * *imitate* changes this current Stream to emit the same events that the
     * `other` given Stream does. This method returns nothing.
     *
     * This method exists to allow one thing: **circular dependency of streams**.
     * For instance, let's imagine that for some reason you need to create a
     * circular dependency where stream `first$` depends on stream `second$`
     * which in turn depends on `first$`:
     *
     * <!-- skip-example -->
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var first$ = second$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * ```
     *
     * However, that is invalid JavaScript, because `second$` is undefined
     * on the first line. This is how *imitate* can help solve it:
     *
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var secondProxy$ = xs.create();
     * var first$ = secondProxy$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * secondProxy$.imitate(second$);
     * ```
     *
     * We create `secondProxy$` before the others, so it can be used in the
     * declaration of `first$`. Then, after both `first$` and `second$` are
     * defined, we hook `secondProxy$` with `second$` with `imitate()` to tell
     * that they are "the same". `imitate` will not trigger the start of any
     * stream, it just binds `secondProxy$` and `second$` together.
     *
     * The following is an example where `imitate()` is important in Cycle.js
     * applications. A parent component contains some child components. A child
     * has an action stream which is given to the parent to define its state:
     *
     * <!-- skip-example -->
     * ```js
     * const childActionProxy$ = xs.create();
     * const parent = Parent({...sources, childAction$: childActionProxy$});
     * const childAction$ = parent.state$.map(s => s.child.action$).flatten();
     * childActionProxy$.imitate(childAction$);
     * ```
     *
     * Note, though, that **`imitate()` does not support MemoryStreams**. If we
     * would attempt to imitate a MemoryStream in a circular dependency, we would
     * either get a race condition (where the symptom would be "nothing happens")
     * or an infinite cyclic emission of values. It's useful to think about
     * MemoryStreams as cells in a spreadsheet. It doesn't make any sense to
     * define a spreadsheet cell `A1` with a formula that depends on `B1` and
     * cell `B1` defined with a formula that depends on `A1`.
     *
     * If you find yourself wanting to use `imitate()` with a
     * MemoryStream, you should rework your code around `imitate()` to use a
     * Stream instead. Look for the stream in the circular dependency that
     * represents an event stream, and that would be a candidate for creating a
     * proxy Stream which then imitates the target Stream.
     *
     * @param {Stream} target The other stream to imitate on the current one. Must
     * not be a MemoryStream.
     */
    Stream.prototype.imitate = function (target) {
        if (target instanceof MemoryStream) {
            throw new Error('A MemoryStream was given to imitate(), but it only ' +
                'supports a Stream. Read more about this restriction here: ' +
                'https://github.com/staltz/xstream#faq');
        }
        this._target = target;
        for (var ils = this._ils, N = ils.length, i = 0; i < N; i++) {
            target._add(ils[i]);
        }
        this._ils = [];
    };
    /**
     * Forces the Stream to emit the given value to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param value The "next" value you want to broadcast to all listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendNext = function (value) {
        this._n(value);
    };
    /**
     * Forces the Stream to emit the given error to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param {any} error The error you want to broadcast to all the listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendError = function (error) {
        this._e(error);
    };
    /**
     * Forces the Stream to emit the "completed" event to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     */
    Stream.prototype.shamefullySendComplete = function () {
        this._c();
    };
    /**
     * Adds a "debug" listener to the stream. There can only be one debug
     * listener, that's why this is 'setDebugListener'. To remove the debug
     * listener, just call setDebugListener(null).
     *
     * A debug listener is like any other listener. The only difference is that a
     * debug listener is "stealthy": its presence/absence does not trigger the
     * start/stop of the stream (or the producer inside the stream). This is
     * useful so you can inspect what is going on without changing the behavior
     * of the program. If you have an idle stream and you add a normal listener to
     * it, the stream will start executing. But if you set a debug listener on an
     * idle stream, it won't start executing (not until the first normal listener
     * is added).
     *
     * As the name indicates, we don't recommend using this method to build app
     * logic. In fact, in most cases the debug operator works just fine. Only use
     * this one if you know what you're doing.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.setDebugListener = function (listener) {
        if (!listener) {
            this._d = false;
            this._dl = NO;
        }
        else {
            this._d = true;
            listener._n = listener.next || noop;
            listener._e = listener.error || noop;
            listener._c = listener.complete || noop;
            this._dl = listener;
        }
    };
    /**
     * Blends multiple streams together, emitting events from all of them
     * concurrently.
     *
     * *merge* takes multiple streams as arguments, and creates a stream that
     * behaves like each of the argument streams, in parallel.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b----c---d------
     *            merge
     * --1-a--2--b--3-c---d--4---
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to merge together with other streams.
     * @param {Stream} stream2 A stream to merge together with other streams. Two
     * or more streams may be given as arguments.
     * @return {Stream}
     */
    Stream.merge = function merge() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new Merge(streams));
    };
    /**
     * Combines multiple input streams together to return a stream whose events
     * are arrays that collect the latest events from each input stream.
     *
     * *combine* internally remembers the most recent event from each of the input
     * streams. When any of the input streams emits an event, that event together
     * with all the other saved events are combined into an array. That array will
     * be emitted on the output stream. It's essentially a way of joining together
     * the events from multiple streams.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b-----c--d------
     *          combine
     * ----1a-2a-2b-3b-3c-3d-4d--
     * ```
     *
     * Note: to minimize garbage collection, *combine* uses the same array
     * instance for each emission.  If you need to compare emissions over time,
     * cache the values with `map` first:
     *
     * ```js
     * import pairwise from 'xstream/extra/pairwise'
     *
     * const stream1 = xs.of(1);
     * const stream2 = xs.of(2);
     *
     * xs.combine(stream1, stream2).map(
     *   combinedEmissions => ([ ...combinedEmissions ])
     * ).compose(pairwise)
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to combine together with other streams.
     * @param {Stream} stream2 A stream to combine together with other streams.
     * Multiple streams, not just two, may be given as arguments.
     * @return {Stream}
     */
    Stream.combine = function combine() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new Combine(streams));
    };
    return Stream;
}());
exports.Stream = Stream;
var MemoryStream = (function (_super) {
    __extends(MemoryStream, _super);
    function MemoryStream(producer) {
        _super.call(this, producer);
        this._has = false;
    }
    MemoryStream.prototype._n = function (x) {
        this._v = x;
        this._has = true;
        _super.prototype._n.call(this, x);
    };
    MemoryStream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1) {
            if (this._has)
                il._n(this._v);
            return;
        }
        if (this._stopID !== NO) {
            if (this._has)
                il._n(this._v);
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else if (this._has)
            il._n(this._v);
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    MemoryStream.prototype._stopNow = function () {
        this._has = false;
        _super.prototype._stopNow.call(this);
    };
    MemoryStream.prototype._x = function () {
        this._has = false;
        _super.prototype._x.call(this);
    };
    MemoryStream.prototype.map = function (project) {
        return this._map(project);
    };
    MemoryStream.prototype.mapTo = function (projectedValue) {
        return _super.prototype.mapTo.call(this, projectedValue);
    };
    MemoryStream.prototype.take = function (amount) {
        return _super.prototype.take.call(this, amount);
    };
    MemoryStream.prototype.endWhen = function (other) {
        return _super.prototype.endWhen.call(this, other);
    };
    MemoryStream.prototype.replaceError = function (replace) {
        return _super.prototype.replaceError.call(this, replace);
    };
    MemoryStream.prototype.remember = function () {
        return this;
    };
    MemoryStream.prototype.debug = function (labelOrSpy) {
        return _super.prototype.debug.call(this, labelOrSpy);
    };
    return MemoryStream;
}(Stream));
exports.MemoryStream = MemoryStream;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Stream;

},{"symbol-observable":127}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvY3ljbGUtZ3VuLmpzIiwibGliL2V4YW1wbGUvYnJvd3Nlci9hcHAuanMiLCJsaWIvZXhhbXBsZS9icm93c2VyL2luZGV4LmpzIiwibGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9iYXNlL2xpYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9AY3ljbGUvZG9tL2xpYi9Cb2R5RE9NU291cmNlLmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9kb20vbGliL0RvY3VtZW50RE9NU291cmNlLmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9kb20vbGliL0VsZW1lbnRGaW5kZXIuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvRXZlbnREZWxlZ2F0b3IuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvSFRNTFNvdXJjZS5qcyIsIm5vZGVfbW9kdWxlcy9AY3ljbGUvZG9tL2xpYi9NYWluRE9NU291cmNlLmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9kb20vbGliL1Njb3BlQ2hlY2tlci5qcyIsIm5vZGVfbW9kdWxlcy9AY3ljbGUvZG9tL2xpYi9WTm9kZVdyYXBwZXIuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvZnJvbUV2ZW50LmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9kb20vbGliL2h5cGVyc2NyaXB0LWhlbHBlcnMuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvaHlwZXJzY3JpcHQuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvaXNvbGF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9AY3ljbGUvZG9tL2xpYi9pc29sYXRlTW9kdWxlLmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9kb20vbGliL21ha2VET01Ecml2ZXIuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvbWFrZUhUTUxEcml2ZXIuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvbW9ja0RPTVNvdXJjZS5qcyIsIm5vZGVfbW9kdWxlcy9AY3ljbGUvZG9tL2xpYi9tb2R1bGVzLmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9kb20vbGliL3RyYW5zcG9zaXRpb24uanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL2RvbS9saWIvdXRpbHMuanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL3hzdHJlYW0tYWRhcHRlci9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGN5Y2xlL3hzdHJlYW0tcnVuL2xpYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyLXNwbGl0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2QvYXV0by1iaW5kLmpzIiwibm9kZV9tb2R1bGVzL2QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVlcC1lcXVhbC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWVwLWVxdWFsL2xpYi9pc19hcmd1bWVudHMuanMiLCJub2RlX21vZHVsZXMvZGVlcC1lcXVhbC9saWIva2V5cy5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L2FycmF5LyMvY2xlYXIuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9hcnJheS8jL2UtaW5kZXgtb2YuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9mdW5jdGlvbi9pcy1hcmd1bWVudHMuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9tYXRoL3NpZ24vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9tYXRoL3NpZ24vaXMtaW1wbGVtZW50ZWQuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9tYXRoL3NpZ24vc2hpbS5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L251bWJlci90by1pbnRlZ2VyLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvbnVtYmVyL3RvLXBvcy1pbnRlZ2VyLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvb2JqZWN0L19pdGVyYXRlLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvb2JqZWN0L2Fzc2lnbi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L29iamVjdC9hc3NpZ24vaXMtaW1wbGVtZW50ZWQuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3QvYXNzaWduL3NoaW0uanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3QvY29weS5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L29iamVjdC9jcmVhdGUuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3QvZm9yLWVhY2guanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3QvaXMtY2FsbGFibGUuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3QvaXMtb2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvb2JqZWN0L2tleXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3Qva2V5cy9pcy1pbXBsZW1lbnRlZC5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L29iamVjdC9rZXlzL3NoaW0uanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3QvbWFwLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvb2JqZWN0L25vcm1hbGl6ZS1vcHRpb25zLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvb2JqZWN0L3ByaW1pdGl2ZS1zZXQuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9vYmplY3Qvc2V0LXByb3RvdHlwZS1vZi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L29iamVjdC9zZXQtcHJvdG90eXBlLW9mL2lzLWltcGxlbWVudGVkLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvb2JqZWN0L3NldC1wcm90b3R5cGUtb2Yvc2hpbS5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L29iamVjdC92YWxpZC1jYWxsYWJsZS5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L29iamVjdC92YWxpZC12YWx1ZS5qcyIsIm5vZGVfbW9kdWxlcy9lczUtZXh0L3N0cmluZy8jL2NvbnRhaW5zL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvc3RyaW5nLyMvY29udGFpbnMvaXMtaW1wbGVtZW50ZWQuanMiLCJub2RlX21vZHVsZXMvZXM1LWV4dC9zdHJpbmcvIy9jb250YWlucy9zaGltLmpzIiwibm9kZV9tb2R1bGVzL2VzNS1leHQvc3RyaW5nL2lzLXN0cmluZy5qcyIsIm5vZGVfbW9kdWxlcy9lczYtaXRlcmF0b3IvYXJyYXkuanMiLCJub2RlX21vZHVsZXMvZXM2LWl0ZXJhdG9yL2Zvci1vZi5qcyIsIm5vZGVfbW9kdWxlcy9lczYtaXRlcmF0b3IvZ2V0LmpzIiwibm9kZV9tb2R1bGVzL2VzNi1pdGVyYXRvci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9lczYtaXRlcmF0b3IvaXMtaXRlcmFibGUuanMiLCJub2RlX21vZHVsZXMvZXM2LWl0ZXJhdG9yL3N0cmluZy5qcyIsIm5vZGVfbW9kdWxlcy9lczYtaXRlcmF0b3IvdmFsaWQtaXRlcmFibGUuanMiLCJub2RlX21vZHVsZXMvZXM2LW1hcC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9lczYtbWFwL2lzLWltcGxlbWVudGVkLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1tYXAvaXMtbmF0aXZlLWltcGxlbWVudGVkLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1tYXAvbGliL2l0ZXJhdG9yLWtpbmRzLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1tYXAvbGliL2l0ZXJhdG9yLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1tYXAvcG9seWZpbGwuanMiLCJub2RlX21vZHVsZXMvZXM2LXN5bWJvbC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9lczYtc3ltYm9sL2lzLWltcGxlbWVudGVkLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1zeW1ib2wvaXMtc3ltYm9sLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1zeW1ib2wvcG9seWZpbGwuanMiLCJub2RlX21vZHVsZXMvZXM2LXN5bWJvbC92YWxpZGF0ZS1zeW1ib2wuanMiLCJub2RlX21vZHVsZXMvZXZlbnQtZW1pdHRlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9ndW4vZ3VuLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWZsYXR0ZW4vaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZm9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWluZGV4b2YvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNldW5pcS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guX2JpbmRjYWxsYmFjay9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guX2NhY2hlaW5kZXhvZi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZWNhY2hlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC5fZ2V0bmF0aXZlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC5fcm9vdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guZGVidXJyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC5lc2NhcGUvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLmZvcm93bi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guaXNhcmd1bWVudHMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLmlzYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLmtlYmFiY2FzZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gua2V5cy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gucmVzdHBhcmFtL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC51bmlvbi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gud29yZHMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWF0Y2hlcy1zZWxlY3Rvci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS1zZWxlY3Rvci9saWIvY2xhc3NOYW1lRnJvbVZOb2RlLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tLXNlbGVjdG9yL2xpYi9zZWxlY3RvclBhcnNlci5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS10by1odG1sL2xpYi9jb250YWluZXItZWxlbWVudHMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20tdG8taHRtbC9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20tdG8taHRtbC9saWIvaW5pdC5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS10by1odG1sL2xpYi9tb2R1bGVzL2F0dHJpYnV0ZXMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20tdG8taHRtbC9saWIvbW9kdWxlcy9zdHlsZS5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS10by1odG1sL2xpYi9wYXJzZS1zZWxlY3Rvci5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS10by1odG1sL2xpYi92b2lkLWVsZW1lbnRzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL2guanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vaHRtbGRvbWFwaS5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9pcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vbW9kdWxlcy9jbGFzcy5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvaGVyby5qcyIsIm5vZGVfbW9kdWxlcy9zbmFiYmRvbS9tb2R1bGVzL3Byb3BzLmpzIiwibm9kZV9tb2R1bGVzL3NuYWJiZG9tL21vZHVsZXMvc3R5bGUuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vc25hYmJkb20uanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vdGh1bmsuanMiLCJub2RlX21vZHVsZXMvc25hYmJkb20vdm5vZGUuanMiLCJub2RlX21vZHVsZXMvc3ltYm9sLW9ic2VydmFibGUvaW5kZXguanMiLCJub2RlX21vZHVsZXMvc3ltYm9sLW9ic2VydmFibGUvbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3N5bWJvbC1vYnNlcnZhYmxlL2xpYi9wb255ZmlsbC5qcyIsIm5vZGVfbW9kdWxlcy94c3RyZWFtL2V4dHJhL2Ryb3BSZXBlYXRzLmpzIiwibm9kZV9tb2R1bGVzL3hzdHJlYW0vaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNySUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3BJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2xoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDeklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBOzs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbnZhciB4c3RyZWFtXzEgPSByZXF1aXJlKCd4c3RyZWFtJyk7XHJcbnZhciBHdW4gPSByZXF1aXJlKCcuLi9ub2RlX21vZHVsZXMvZ3VuL2d1bi5qcycpO1xyXG52YXIgZHJvcFJlcGVhdHNfMSA9IHJlcXVpcmUoJ3hzdHJlYW0vZXh0cmEvZHJvcFJlcGVhdHMnKTtcclxudmFyIGVxdWFsID0gcmVxdWlyZSgnZGVlcC1lcXVhbCcpO1xyXG5mdW5jdGlvbiBtYWtlR3VuRHJpdmVyKHVybCkge1xyXG4gICAgLy8gVE9ETzogbXVsdGlwbGUgcGVlciBoYW5kbGluZz9cclxuICAgIHZhciBndW4gPSBHdW4odXJsKTtcclxuICAgIGZ1bmN0aW9uIGdldChndW5Gbikge1xyXG4gICAgICAgIGlmICh0eXBlb2YgZ3VuRm4gIT09ICdmdW5jdGlvbicpXHJcbiAgICAgICAgICAgIHRocm93ICdGdW5jdGlvbiBSZXF1aXJlZCB0byBnZXQgZ3VuIHN0cmVhbSc7XHJcbiAgICAgICAgdmFyIGxvYyA9IGd1bkZuKGd1bik7XHJcbiAgICAgICAgdmFyIGV2ZW50TGlzdGVuZXIgPSBudWxsO1xyXG4gICAgICAgIHJldHVybiB4c3RyZWFtXzEuZGVmYXVsdC5jcmVhdGUoe1xyXG4gICAgICAgICAgICBzdGFydDogZnVuY3Rpb24gKGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBldmVudExpc3RlbmVyID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGxpc3RlbmVyLm5leHQoZXZlbnQpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGxvYy5vbihldmVudExpc3RlbmVyKTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgLy8gc29ja2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZUtleSwgdGhpcy5ldmVudExpc3RlbmVyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5jb21wb3NlKGRyb3BSZXBlYXRzXzEuZGVmYXVsdChlcXVhbCkpO1xyXG4gICAgfVxyXG4gICAgO1xyXG4gICAgZnVuY3Rpb24gcHJvY2Vzc1RyYW5zZm9ybShpbnB1dEZ1bmN0aW9uKSB7XHJcbiAgICAgICAgcmV0dXJuIGlucHV0RnVuY3Rpb24oZ3VuKTtcclxuICAgIH1cclxuICAgIHJldHVybiBmdW5jdGlvbiAoZXZlbnQkKSB7XHJcbiAgICAgICAgZXZlbnQkLmFkZExpc3RlbmVyKHtcclxuICAgICAgICAgICAgbmV4dDogZnVuY3Rpb24gKHRyYW5zZm9ybSkge1xyXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogRXJyb3IgaGFuZGxpbmdcclxuICAgICAgICAgICAgICAgIHJldHVybiBwcm9jZXNzVHJhbnNmb3JtKHRyYW5zZm9ybSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBnZXQ6IGdldFxyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG59XHJcbmV4cG9ydHMubWFrZUd1bkRyaXZlciA9IG1ha2VHdW5Ecml2ZXI7XHJcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWN5Y2xlLWd1bi5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcclxudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcclxudmFyIGRvbV8xID0gcmVxdWlyZSgnQGN5Y2xlL2RvbScpO1xyXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ub2RvU3RyZWFtKGluU3RyZWFtKSB7XHJcbiAgICByZXR1cm4gaW5TdHJlYW0ubWFwKGZ1bmN0aW9uIChzdGF0ZSkge1xyXG4gICAgICAgIHZhciByb3dzID0gW107XHJcbiAgICAgICAgdmFyIGNvdW50ID0gMTtcclxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gc3RhdGUpIHtcclxuICAgICAgICAgICAgdmFyIHJvdyA9IHN0YXRlW2tleV07XHJcbiAgICAgICAgICAgIGlmICghc3RhdGVba2V5XSB8fCB0eXBlb2Ygcm93ID09PSAnb2JqZWN0JylcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB2YXIgYyA9IGNvdW50Kys7XHJcbiAgICAgICAgICAgIC8vIG1pZ2h0IHdhbnQgdG8gY29udmVydCB0byBqc29uIGhlcmUuLi5cclxuICAgICAgICAgICAgcm93cy5wdXNoKHsgaWQ6IGMsIGtleToga2V5LCB2YWw6IHJvdyB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIGhlYWRpbmdzID0gT2JqZWN0LmtleXMocm93c1swXSk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaGVhZGluZ3M6IGhlYWRpbmdzLFxyXG4gICAgICAgICAgICByb3dzOiByb3dzXHJcbiAgICAgICAgfTtcclxuICAgIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHRib2R5RWxlbXModGFibGVEYXRhKSB7XHJcbiAgICB2YXIgaGVhZGluZ3MgPSB0YWJsZURhdGEuaGVhZGluZ3MsIHJvd3MgPSB0YWJsZURhdGEucm93cztcclxuICAgIC8vIGdlbmVyYXRvciByb3dzIGJhc2VkIG9uIGhlYWRlcnNcclxuICAgIHJldHVybiByb3dzLm1hcChmdW5jdGlvbiAocm93KSB7XHJcbiAgICAgICAgLy8gZ2VuZXJhdGUgZGF0YSBpdGVtcyB3aXRoaW4gZWFjaCByb3dcclxuICAgICAgICB2YXIgdGRFbGVtcyA9IGhlYWRpbmdzLm1hcChmdW5jdGlvbiAoaGVhZGluZykge1xyXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKGhlYWRpbmcpXHJcbiAgICAgICAgICAgIHJldHVybiBkb21fMS50ZCh7IGF0dHJzOiB7IGNsYXNzOiAnbWRsLWRhdGEtdGFibGVfX2NlbGwtLW5vbi1udW1lcmljJyB9IH0sIHJvd1toZWFkaW5nXSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGRvbV8xLnRyKHsgYXR0cnM6IHsgY2xhc3M6ICcnIH0gfSwgdGRFbGVtcyk7XHJcbiAgICB9KTtcclxufVxyXG5mdW5jdGlvbiB0YWJsZUVsZW0oc3RhdGUpIHtcclxuICAgIC8vY29uc29sZS5sb2coc3RhdGUpO1xyXG4gICAgcmV0dXJuIGRvbV8xLnRhYmxlKHsgYXR0cnM6IHsgY2xhc3M6ICdtZGwtZGF0YS10YWJsZScgfSB9LCB0Ym9keUVsZW1zKHN0YXRlKSk7XHJcbn1cclxuZnVuY3Rpb24gYXBwKHNvdXJjZXMpIHtcclxuICAgIHZhciBET00gPSBzb3VyY2VzLkRPTSwgZ3VuID0gc291cmNlcy5ndW47XHJcbiAgICB2YXIgZ3VuVG9kb3MkID0gZ3VuLmdldChmdW5jdGlvbiAoZ3VuSW5zdGFuY2UpIHtcclxuICAgICAgICByZXR1cm4gZ3VuSW5zdGFuY2UuZ2V0KCdleGFtcGxlL3RvZG8vZGF0YScpO1xyXG4gICAgfSk7XHJcbiAgICAvLyBXZSBhcmUgcmVtb3ZpbmcgbnVsbHMsIGtleXMgdGhhdCBcclxuICAgIHZhciBndW5UYWJsZSQgPSB0cmFuc2Zvcm1Ub2RvU3RyZWFtKGd1blRvZG9zJCk7XHJcbiAgICBmdW5jdGlvbiB2dHJlZShzdGF0ZVN0cmVhbSkge1xyXG4gICAgICAgIHJldHVybiBzdGF0ZVN0cmVhbS5tYXAoZnVuY3Rpb24gKHN0YXRlKSB7XHJcbiAgICAgICAgICAgIHZhciBoZWFkaW5ncyA9IHN0YXRlLmhlYWRpbmdzLCByb3dzID0gc3RhdGUucm93cztcclxuICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdGUpO1xyXG4gICAgICAgICAgICByZXR1cm4gZG9tXzEuZGl2KCcuZXhhbXBsZV9fbGF5b3V0Lm1kbC1sYXlvdXQnLCBbXHJcbiAgICAgICAgICAgICAgICBkb21fMS5oZWFkZXIoJy5leGFtcGxlX19oZWFkZXIubWRsLWxheW91dF9faGVhZGVyJywgW1xyXG4gICAgICAgICAgICAgICAgICAgIGRvbV8xLmRpdignLm1kbC1sYXlvdXRfX2hlYWRlci1yb3cnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvbV8xLnNwYW4oJy5tZGwtbGF5b3V0X190aXRsZScsICdFeGFtcGxlIFRvZG8nKVxyXG4gICAgICAgICAgICAgICAgICAgIF0pXHJcbiAgICAgICAgICAgICAgICBdKSxcclxuICAgICAgICAgICAgICAgIC8vIGRpdihyb3dzLm1hcCgocm93KSA9PiB7cmV0dXJuIHRyKHJvdy52YWwpfSkpXHJcbiAgICAgICAgICAgICAgICBkb21fMS5kaXYoJy5leGFtcGxlX19jb250ZW50Lm1kbC1sYXlvdXRfX2NvbnRlbnQnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgZG9tXzEuZGl2KCcuZXhhbXBsZV9faG9yaXpvbnRhbC1mb3JtJywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkb21fMS5mb3JtKCcuZXhhbXBsZV9faG9yaXpvbnRhbC1mb3JtX19lbGVtZW50JywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9tXzEuZGl2KCcubWRsLXRleHRmaWVsZCBtZGwtanMtdGV4dGZpZWxkJywgW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvbV8xLmlucHV0KHsgYXR0cnM6IHsgY2xhc3M6ICdtZGwtdGV4dGZpZWxkX19pbnB1dCcsIHR5cGU6ICd0ZXh0JywgaWQ6ICdzYW1wbGUxJyB9IH0pLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvbV8xLmxhYmVsKHsgYXR0cnM6IHsgY2xhc3M6ICdtZGwtdGV4dGZpZWxkX19sYWJlbCcsIGZvcjogJ3NhbXBsZTEnIH0gfSwgJ1RleHQnKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgXSksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvbV8xLmJ1dHRvbignLmV4YW1wbGVfX2hvcml6b250YWxfX2J1dHRvbi5tZGwtYnV0dG9uLm1kbC1idXR0b24tLXJhaXNlZCBtZGwtYnV0dG9uLS1jb2xvcmVkJywgJ3NhdmUnKVxyXG4gICAgICAgICAgICAgICAgICAgIF0pLFxyXG4gICAgICAgICAgICAgICAgICAgIGRvbV8xLmRpdignLmV4YW1wbGVfX2NvbnRlbnQnLCBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvbV8xLnRhYmxlKCcubWRsLWRhdGEtdGFibGUnLCB0Ym9keUVsZW1zKHN0YXRlKSlcclxuICAgICAgICAgICAgICAgICAgICBdKVxyXG4gICAgICAgICAgICAgICAgXSlcclxuICAgICAgICAgICAgXSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICB2YXIgZ3VuRXZlbnRzJCA9IHhzdHJlYW1fMS5kZWZhdWx0Lm5ldmVyKCk7XHJcbiAgICB2YXIgdnRyZWUkID0gdnRyZWUoZ3VuVGFibGUkKTtcclxuICAgIGNvbnNvbGUubG9nKHZ0cmVlJCk7XHJcbiAgICB2YXIgc2lua3MgPSB7XHJcbiAgICAgICAgZ3VuOiBndW5FdmVudHMkLFxyXG4gICAgICAgIERPTTogdnRyZWUkXHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHNpbmtzO1xyXG59XHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcclxuZXhwb3J0cy5kZWZhdWx0ID0gYXBwO1xyXG4vLyMgc291cmNlTWFwcGluZ1VSTD1hcHAuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbnZhciB4c3RyZWFtXzEgPSByZXF1aXJlKCd4c3RyZWFtJyk7XHJcbnZhciB4c3RyZWFtX3J1bl8xID0gcmVxdWlyZSgnQGN5Y2xlL3hzdHJlYW0tcnVuJyk7XHJcbnZhciBkb21fMSA9IHJlcXVpcmUoJ0BjeWNsZS9kb20nKTtcclxudmFyIGluZGV4X2pzXzEgPSByZXF1aXJlKCcuLi8uLi8uLi9saWIvaW5kZXguanMnKTtcclxudmFyIGFwcF8xID0gcmVxdWlyZSgnLi9hcHAnKTtcclxuZnVuY3Rpb24gbWFpbihzb3VyY2VzKSB7XHJcbiAgICB2YXIgRE9NID0gc291cmNlcy5ET007XHJcbiAgICB2YXIgYXBwUGFnZSA9IGFwcF8xLmRlZmF1bHQoc291cmNlcyk7XHJcbiAgICB2YXIgc2lua3MgPSB7XHJcbiAgICAgICAgRE9NOiBhcHBQYWdlLkRPTSxcclxuICAgICAgICBndW46IHhzdHJlYW1fMS5kZWZhdWx0Lm1lcmdlKGFwcFBhZ2UuZ3VuKVxyXG4gICAgfTtcclxuICAgIHJldHVybiBzaW5rcztcclxufVxyXG52YXIgZHJpdmVycyA9IHtcclxuICAgIERPTTogZG9tXzEubWFrZURPTURyaXZlcignI2FwcCcpLFxyXG4gICAgZ3VuOiBpbmRleF9qc18xLm1ha2VHdW5Ecml2ZXIoJ2h0dHA6Ly9sb2NhbGhvc3Q6MzUwMCcpXHJcbn07XHJcbnhzdHJlYW1fcnVuXzEucnVuKG1haW4sIGRyaXZlcnMpO1xyXG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcclxudmFyIGN5Y2xlX2d1bl8xID0gcmVxdWlyZSgnLi9jeWNsZS1ndW4nKTtcclxuZXhwb3J0cy5tYWtlR3VuRHJpdmVyID0gY3ljbGVfZ3VuXzEubWFrZUd1bkRyaXZlcjtcclxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBsb2dUb0NvbnNvbGVFcnJvcihlcnIpIHtcbiAgICB2YXIgdGFyZ2V0ID0gZXJyLnN0YWNrIHx8IGVycjtcbiAgICBpZiAoY29uc29sZSAmJiBjb25zb2xlLmVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IodGFyZ2V0KTtcbiAgICB9XG4gICAgZWxzZSBpZiAoY29uc29sZSAmJiBjb25zb2xlLmxvZykge1xuICAgICAgICBjb25zb2xlLmxvZyh0YXJnZXQpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1ha2VTaW5rUHJveGllcyhkcml2ZXJzLCBzdHJlYW1BZGFwdGVyKSB7XG4gICAgdmFyIHNpbmtQcm94aWVzID0ge307XG4gICAgZm9yICh2YXIgbmFtZV8xIGluIGRyaXZlcnMpIHtcbiAgICAgICAgaWYgKGRyaXZlcnMuaGFzT3duUHJvcGVydHkobmFtZV8xKSkge1xuICAgICAgICAgICAgdmFyIHN1YmplY3QgPSBzdHJlYW1BZGFwdGVyLm1ha2VTdWJqZWN0KCk7XG4gICAgICAgICAgICB2YXIgZHJpdmVyU3RyZWFtQWRhcHRlciA9IGRyaXZlcnNbbmFtZV8xXS5zdHJlYW1BZGFwdGVyIHx8IHN0cmVhbUFkYXB0ZXI7XG4gICAgICAgICAgICB2YXIgc3RyZWFtID0gZHJpdmVyU3RyZWFtQWRhcHRlci5hZGFwdChzdWJqZWN0LnN0cmVhbSwgc3RyZWFtQWRhcHRlci5zdHJlYW1TdWJzY3JpYmUpO1xuICAgICAgICAgICAgc2lua1Byb3hpZXNbbmFtZV8xXSA9IHtcbiAgICAgICAgICAgICAgICBzdHJlYW06IHN0cmVhbSxcbiAgICAgICAgICAgICAgICBvYnNlcnZlcjogc3ViamVjdC5vYnNlcnZlcixcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNpbmtQcm94aWVzO1xufVxuZnVuY3Rpb24gY2FsbERyaXZlcnMoZHJpdmVycywgc2lua1Byb3hpZXMsIHN0cmVhbUFkYXB0ZXIpIHtcbiAgICB2YXIgc291cmNlcyA9IHt9O1xuICAgIGZvciAodmFyIG5hbWVfMiBpbiBkcml2ZXJzKSB7XG4gICAgICAgIGlmIChkcml2ZXJzLmhhc093blByb3BlcnR5KG5hbWVfMikpIHtcbiAgICAgICAgICAgIHZhciBkcml2ZXJPdXRwdXQgPSBkcml2ZXJzW25hbWVfMl0oc2lua1Byb3hpZXNbbmFtZV8yXS5zdHJlYW0sIHN0cmVhbUFkYXB0ZXIsIG5hbWVfMik7XG4gICAgICAgICAgICB2YXIgZHJpdmVyU3RyZWFtQWRhcHRlciA9IGRyaXZlcnNbbmFtZV8yXS5zdHJlYW1BZGFwdGVyO1xuICAgICAgICAgICAgaWYgKGRyaXZlclN0cmVhbUFkYXB0ZXIgJiYgZHJpdmVyU3RyZWFtQWRhcHRlci5pc1ZhbGlkU3RyZWFtKGRyaXZlck91dHB1dCkpIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VzW25hbWVfMl0gPSBzdHJlYW1BZGFwdGVyLmFkYXB0KGRyaXZlck91dHB1dCwgZHJpdmVyU3RyZWFtQWRhcHRlci5zdHJlYW1TdWJzY3JpYmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc291cmNlc1tuYW1lXzJdID0gZHJpdmVyT3V0cHV0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNvdXJjZXNbbmFtZV8yXSAmJiB0eXBlb2Ygc291cmNlc1tuYW1lXzJdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIHNvdXJjZXNbbmFtZV8yXS5faXNDeWNsZVNvdXJjZSA9IG5hbWVfMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc291cmNlcztcbn1cbmZ1bmN0aW9uIHJlcGxpY2F0ZU1hbnkoc2lua3MsIHNpbmtQcm94aWVzLCBzdHJlYW1BZGFwdGVyKSB7XG4gICAgdmFyIHNpbmtOYW1lcyA9IE9iamVjdC5rZXlzKHNpbmtzKS5maWx0ZXIoZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuICEhc2lua1Byb3hpZXNbbmFtZV07IH0pO1xuICAgIHZhciBidWZmZXJzID0ge307XG4gICAgdmFyIHJlcGxpY2F0b3JzID0ge307XG4gICAgc2lua05hbWVzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgYnVmZmVyc1tuYW1lXSA9IHsgbmV4dDogW10sIGVycm9yOiBbXSwgY29tcGxldGU6IFtdIH07XG4gICAgICAgIHJlcGxpY2F0b3JzW25hbWVdID0ge1xuICAgICAgICAgICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGJ1ZmZlcnNbbmFtZV0ubmV4dC5wdXNoKHgpOyB9LFxuICAgICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uICh4KSB7IHJldHVybiBidWZmZXJzW25hbWVdLmVycm9yLnB1c2goeCk7IH0sXG4gICAgICAgICAgICBjb21wbGV0ZTogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGJ1ZmZlcnNbbmFtZV0uY29tcGxldGUucHVzaCh4KTsgfSxcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICB2YXIgc3Vic2NyaXB0aW9ucyA9IHNpbmtOYW1lcy5tYXAoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHN0cmVhbUFkYXB0ZXIuc3RyZWFtU3Vic2NyaWJlKHNpbmtzW25hbWVdLCB7XG4gICAgICAgICAgICBuZXh0OiBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgIHJlcGxpY2F0b3JzW25hbWVdLm5leHQoeCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBsb2dUb0NvbnNvbGVFcnJvcihlcnIpO1xuICAgICAgICAgICAgICAgIHJlcGxpY2F0b3JzW25hbWVdLmVycm9yKGVycik7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29tcGxldGU6IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgcmVwbGljYXRvcnNbbmFtZV0uY29tcGxldGUoeCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICB2YXIgZGlzcG9zZUZ1bmN0aW9ucyA9IHN1YnNjcmlwdGlvbnNcbiAgICAgICAgLmZpbHRlcihmdW5jdGlvbiAoZm4pIHsgcmV0dXJuIHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJzsgfSk7XG4gICAgc2lua05hbWVzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIG9ic2VydmVyID0gc2lua1Byb3hpZXNbbmFtZV0ub2JzZXJ2ZXI7XG4gICAgICAgIHZhciBuZXh0ID0gb2JzZXJ2ZXIubmV4dDtcbiAgICAgICAgdmFyIGVycm9yID0gb2JzZXJ2ZXIuZXJyb3I7XG4gICAgICAgIHZhciBjb21wbGV0ZSA9IG9ic2VydmVyLmNvbXBsZXRlO1xuICAgICAgICBidWZmZXJzW25hbWVdLm5leHQuZm9yRWFjaChuZXh0KTtcbiAgICAgICAgYnVmZmVyc1tuYW1lXS5lcnJvci5mb3JFYWNoKGVycm9yKTtcbiAgICAgICAgYnVmZmVyc1tuYW1lXS5jb21wbGV0ZS5mb3JFYWNoKGNvbXBsZXRlKTtcbiAgICAgICAgcmVwbGljYXRvcnNbbmFtZV0ubmV4dCA9IG5leHQ7XG4gICAgICAgIHJlcGxpY2F0b3JzW25hbWVdLmVycm9yID0gZXJyb3I7XG4gICAgICAgIHJlcGxpY2F0b3JzW25hbWVdLmNvbXBsZXRlID0gY29tcGxldGU7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGlzcG9zZUZ1bmN0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChkaXNwb3NlKSB7IHJldHVybiBkaXNwb3NlKCk7IH0pO1xuICAgIH07XG59XG5mdW5jdGlvbiBkaXNwb3NlU291cmNlcyhzb3VyY2VzKSB7XG4gICAgZm9yICh2YXIgayBpbiBzb3VyY2VzKSB7XG4gICAgICAgIGlmIChzb3VyY2VzLmhhc093blByb3BlcnR5KGspICYmIHNvdXJjZXNba11cbiAgICAgICAgICAgICYmIHR5cGVvZiBzb3VyY2VzW2tdLmRpc3Bvc2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHNvdXJjZXNba10uZGlzcG9zZSgpO1xuICAgICAgICB9XG4gICAgfVxufVxudmFyIGlzT2JqZWN0RW1wdHkgPSBmdW5jdGlvbiAob2JqKSB7IHJldHVybiBPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA9PT0gMDsgfTtcbmZ1bmN0aW9uIEN5Y2xlKG1haW4sIGRyaXZlcnMsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZW9mIG1haW4gIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGaXJzdCBhcmd1bWVudCBnaXZlbiB0byBDeWNsZSBtdXN0IGJlIHRoZSAnbWFpbicgXCIgK1xuICAgICAgICAgICAgXCJmdW5jdGlvbi5cIik7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZHJpdmVycyAhPT0gXCJvYmplY3RcIiB8fCBkcml2ZXJzID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNlY29uZCBhcmd1bWVudCBnaXZlbiB0byBDeWNsZSBtdXN0IGJlIGFuIG9iamVjdCBcIiArXG4gICAgICAgICAgICBcIndpdGggZHJpdmVyIGZ1bmN0aW9ucyBhcyBwcm9wZXJ0aWVzLlwiKTtcbiAgICB9XG4gICAgaWYgKGlzT2JqZWN0RW1wdHkoZHJpdmVycykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2Vjb25kIGFyZ3VtZW50IGdpdmVuIHRvIEN5Y2xlIG11c3QgYmUgYW4gb2JqZWN0IFwiICtcbiAgICAgICAgICAgIFwid2l0aCBhdCBsZWFzdCBvbmUgZHJpdmVyIGZ1bmN0aW9uIGRlY2xhcmVkIGFzIGEgcHJvcGVydHkuXCIpO1xuICAgIH1cbiAgICB2YXIgc3RyZWFtQWRhcHRlciA9IG9wdGlvbnMuc3RyZWFtQWRhcHRlcjtcbiAgICBpZiAoIXN0cmVhbUFkYXB0ZXIgfHwgaXNPYmplY3RFbXB0eShzdHJlYW1BZGFwdGVyKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlyZCBhcmd1bWVudCBnaXZlbiB0byBDeWNsZSBtdXN0IGJlIGFuIG9wdGlvbnMgb2JqZWN0IFwiICtcbiAgICAgICAgICAgIFwid2l0aCB0aGUgc3RyZWFtQWRhcHRlciBrZXkgc3VwcGxpZWQgd2l0aCBhIHZhbGlkIHN0cmVhbSBhZGFwdGVyLlwiKTtcbiAgICB9XG4gICAgdmFyIHNpbmtQcm94aWVzID0gbWFrZVNpbmtQcm94aWVzKGRyaXZlcnMsIHN0cmVhbUFkYXB0ZXIpO1xuICAgIHZhciBzb3VyY2VzID0gY2FsbERyaXZlcnMoZHJpdmVycywgc2lua1Byb3hpZXMsIHN0cmVhbUFkYXB0ZXIpO1xuICAgIHZhciBzaW5rcyA9IG1haW4oc291cmNlcyk7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5DeWNsZWpzID0geyBzaW5rczogc2lua3MgfTtcbiAgICB9XG4gICAgdmFyIHJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRpc3Bvc2VSZXBsaWNhdGlvbiA9IHJlcGxpY2F0ZU1hbnkoc2lua3MsIHNpbmtQcm94aWVzLCBzdHJlYW1BZGFwdGVyKTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRpc3Bvc2VTb3VyY2VzKHNvdXJjZXMpO1xuICAgICAgICAgICAgZGlzcG9zZVJlcGxpY2F0aW9uKCk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICByZXR1cm4geyBzaW5rczogc2lua3MsIHNvdXJjZXM6IHNvdXJjZXMsIHJ1bjogcnVuIH07XG59XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmRlZmF1bHQgPSBDeWNsZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWluZGV4LmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcbnZhciB4c3RyZWFtX2FkYXB0ZXJfMSA9IHJlcXVpcmUoJ0BjeWNsZS94c3RyZWFtLWFkYXB0ZXInKTtcbnZhciBmcm9tRXZlbnRfMSA9IHJlcXVpcmUoJy4vZnJvbUV2ZW50Jyk7XG52YXIgQm9keURPTVNvdXJjZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQm9keURPTVNvdXJjZShfcnVuU3RyZWFtQWRhcHRlciwgX25hbWUpIHtcbiAgICAgICAgdGhpcy5fcnVuU3RyZWFtQWRhcHRlciA9IF9ydW5TdHJlYW1BZGFwdGVyO1xuICAgICAgICB0aGlzLl9uYW1lID0gX25hbWU7XG4gICAgfVxuICAgIEJvZHlET01Tb3VyY2UucHJvdG90eXBlLnNlbGVjdCA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uYWxpdHkgaXMgc3RpbGwgdW5kZWZpbmVkL3VuZGVjaWRlZC5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcbiAgICBCb2R5RE9NU291cmNlLnByb3RvdHlwZS5lbGVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHJ1blNBID0gdGhpcy5fcnVuU3RyZWFtQWRhcHRlcjtcbiAgICAgICAgdmFyIG91dCA9IHJ1blNBLnJlbWVtYmVyKHJ1blNBLmFkYXB0KHhzdHJlYW1fMS5kZWZhdWx0Lm9mKGRvY3VtZW50LmJvZHkpLCB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0LnN0cmVhbVN1YnNjcmliZSkpO1xuICAgICAgICBvdXQuX2lzQ3ljbGVTb3VyY2UgPSB0aGlzLl9uYW1lO1xuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH07XG4gICAgQm9keURPTVNvdXJjZS5wcm90b3R5cGUuZXZlbnRzID0gZnVuY3Rpb24gKGV2ZW50VHlwZSwgb3B0aW9ucykge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gdm9pZCAwKSB7IG9wdGlvbnMgPSB7fTsgfVxuICAgICAgICB2YXIgc3RyZWFtO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy51c2VDYXB0dXJlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHN0cmVhbSA9IGZyb21FdmVudF8xLmZyb21FdmVudChkb2N1bWVudC5ib2R5LCBldmVudFR5cGUsIG9wdGlvbnMudXNlQ2FwdHVyZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzdHJlYW0gPSBmcm9tRXZlbnRfMS5mcm9tRXZlbnQoZG9jdW1lbnQuYm9keSwgZXZlbnRUeXBlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgb3V0ID0gdGhpcy5fcnVuU3RyZWFtQWRhcHRlci5hZGFwdChzdHJlYW0sIHhzdHJlYW1fYWRhcHRlcl8xLmRlZmF1bHQuc3RyZWFtU3Vic2NyaWJlKTtcbiAgICAgICAgb3V0Ll9pc0N5Y2xlU291cmNlID0gdGhpcy5fbmFtZTtcbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9O1xuICAgIHJldHVybiBCb2R5RE9NU291cmNlO1xufSgpKTtcbmV4cG9ydHMuQm9keURPTVNvdXJjZSA9IEJvZHlET01Tb3VyY2U7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1Cb2R5RE9NU291cmNlLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcbnZhciB4c3RyZWFtX2FkYXB0ZXJfMSA9IHJlcXVpcmUoJ0BjeWNsZS94c3RyZWFtLWFkYXB0ZXInKTtcbnZhciBmcm9tRXZlbnRfMSA9IHJlcXVpcmUoJy4vZnJvbUV2ZW50Jyk7XG52YXIgRG9jdW1lbnRET01Tb3VyY2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERvY3VtZW50RE9NU291cmNlKF9ydW5TdHJlYW1BZGFwdGVyLCBfbmFtZSkge1xuICAgICAgICB0aGlzLl9ydW5TdHJlYW1BZGFwdGVyID0gX3J1blN0cmVhbUFkYXB0ZXI7XG4gICAgICAgIHRoaXMuX25hbWUgPSBfbmFtZTtcbiAgICB9XG4gICAgRG9jdW1lbnRET01Tb3VyY2UucHJvdG90eXBlLnNlbGVjdCA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uYWxpdHkgaXMgc3RpbGwgdW5kZWZpbmVkL3VuZGVjaWRlZC5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcbiAgICBEb2N1bWVudERPTVNvdXJjZS5wcm90b3R5cGUuZWxlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBydW5TQSA9IHRoaXMuX3J1blN0cmVhbUFkYXB0ZXI7XG4gICAgICAgIHZhciBvdXQgPSBydW5TQS5yZW1lbWJlcihydW5TQS5hZGFwdCh4c3RyZWFtXzEuZGVmYXVsdC5vZihkb2N1bWVudCksIHhzdHJlYW1fYWRhcHRlcl8xLmRlZmF1bHQuc3RyZWFtU3Vic2NyaWJlKSk7XG4gICAgICAgIG91dC5faXNDeWNsZVNvdXJjZSA9IHRoaXMuX25hbWU7XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfTtcbiAgICBEb2N1bWVudERPTVNvdXJjZS5wcm90b3R5cGUuZXZlbnRzID0gZnVuY3Rpb24gKGV2ZW50VHlwZSwgb3B0aW9ucykge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gdm9pZCAwKSB7IG9wdGlvbnMgPSB7fTsgfVxuICAgICAgICB2YXIgc3RyZWFtO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy51c2VDYXB0dXJlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHN0cmVhbSA9IGZyb21FdmVudF8xLmZyb21FdmVudChkb2N1bWVudCwgZXZlbnRUeXBlLCBvcHRpb25zLnVzZUNhcHR1cmUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3RyZWFtID0gZnJvbUV2ZW50XzEuZnJvbUV2ZW50KGRvY3VtZW50LCBldmVudFR5cGUpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBvdXQgPSB0aGlzLl9ydW5TdHJlYW1BZGFwdGVyLmFkYXB0KHN0cmVhbSwgeHN0cmVhbV9hZGFwdGVyXzEuZGVmYXVsdC5zdHJlYW1TdWJzY3JpYmUpO1xuICAgICAgICBvdXQuX2lzQ3ljbGVTb3VyY2UgPSB0aGlzLl9uYW1lO1xuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH07XG4gICAgcmV0dXJuIERvY3VtZW50RE9NU291cmNlO1xufSgpKTtcbmV4cG9ydHMuRG9jdW1lbnRET01Tb3VyY2UgPSBEb2N1bWVudERPTVNvdXJjZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPURvY3VtZW50RE9NU291cmNlLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIFNjb3BlQ2hlY2tlcl8xID0gcmVxdWlyZSgnLi9TY29wZUNoZWNrZXInKTtcbnZhciB1dGlsc18xID0gcmVxdWlyZSgnLi91dGlscycpO1xudmFyIG1hdGNoZXNTZWxlY3RvcjtcbnRyeSB7XG4gICAgbWF0Y2hlc1NlbGVjdG9yID0gcmVxdWlyZShcIm1hdGNoZXMtc2VsZWN0b3JcIik7XG59XG5jYXRjaCAoZSkge1xuICAgIG1hdGNoZXNTZWxlY3RvciA9IEZ1bmN0aW9uLnByb3RvdHlwZTtcbn1cbmZ1bmN0aW9uIHRvRWxBcnJheShpbnB1dCkge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChpbnB1dCk7XG59XG52YXIgRWxlbWVudEZpbmRlciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRWxlbWVudEZpbmRlcihuYW1lc3BhY2UsIGlzb2xhdGVNb2R1bGUpIHtcbiAgICAgICAgdGhpcy5uYW1lc3BhY2UgPSBuYW1lc3BhY2U7XG4gICAgICAgIHRoaXMuaXNvbGF0ZU1vZHVsZSA9IGlzb2xhdGVNb2R1bGU7XG4gICAgfVxuICAgIEVsZW1lbnRGaW5kZXIucHJvdG90eXBlLmNhbGwgPSBmdW5jdGlvbiAocm9vdEVsZW1lbnQpIHtcbiAgICAgICAgdmFyIG5hbWVzcGFjZSA9IHRoaXMubmFtZXNwYWNlO1xuICAgICAgICBpZiAobmFtZXNwYWNlLmpvaW4oXCJcIikgPT09IFwiXCIpIHtcbiAgICAgICAgICAgIHJldHVybiByb290RWxlbWVudDtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NvcGUgPSB1dGlsc18xLmdldFNjb3BlKG5hbWVzcGFjZSk7XG4gICAgICAgIHZhciBzY29wZUNoZWNrZXIgPSBuZXcgU2NvcGVDaGVja2VyXzEuU2NvcGVDaGVja2VyKHNjb3BlLCB0aGlzLmlzb2xhdGVNb2R1bGUpO1xuICAgICAgICB2YXIgc2VsZWN0b3IgPSB1dGlsc18xLmdldFNlbGVjdG9ycyhuYW1lc3BhY2UpO1xuICAgICAgICB2YXIgdG9wTm9kZSA9IHJvb3RFbGVtZW50O1xuICAgICAgICB2YXIgdG9wTm9kZU1hdGNoZXMgPSBbXTtcbiAgICAgICAgaWYgKHNjb3BlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRvcE5vZGUgPSB0aGlzLmlzb2xhdGVNb2R1bGUuZ2V0SXNvbGF0ZWRFbGVtZW50KHNjb3BlKSB8fCByb290RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChzZWxlY3RvciAmJiBtYXRjaGVzU2VsZWN0b3IodG9wTm9kZSwgc2VsZWN0b3IpKSB7XG4gICAgICAgICAgICAgICAgdG9wTm9kZU1hdGNoZXMucHVzaCh0b3BOb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdG9FbEFycmF5KHRvcE5vZGUucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpXG4gICAgICAgICAgICAuZmlsdGVyKHNjb3BlQ2hlY2tlci5pc1N0cmljdGx5SW5Sb290U2NvcGUsIHNjb3BlQ2hlY2tlcilcbiAgICAgICAgICAgIC5jb25jYXQodG9wTm9kZU1hdGNoZXMpO1xuICAgIH07XG4gICAgcmV0dXJuIEVsZW1lbnRGaW5kZXI7XG59KCkpO1xuZXhwb3J0cy5FbGVtZW50RmluZGVyID0gRWxlbWVudEZpbmRlcjtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPUVsZW1lbnRGaW5kZXIuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgU2NvcGVDaGVja2VyXzEgPSByZXF1aXJlKCcuL1Njb3BlQ2hlY2tlcicpO1xudmFyIHV0aWxzXzEgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG52YXIgbWF0Y2hlc1NlbGVjdG9yO1xudHJ5IHtcbiAgICBtYXRjaGVzU2VsZWN0b3IgPSByZXF1aXJlKFwibWF0Y2hlcy1zZWxlY3RvclwiKTtcbn1cbmNhdGNoIChlKSB7XG4gICAgbWF0Y2hlc1NlbGVjdG9yID0gRnVuY3Rpb24ucHJvdG90eXBlO1xufVxudmFyIGdEZXN0aW5hdGlvbklkID0gMDtcbmZ1bmN0aW9uIGZpbmREZXN0aW5hdGlvbklkKGFyciwgc2VhcmNoSWQpIHtcbiAgICB2YXIgbWluSW5kZXggPSAwO1xuICAgIHZhciBtYXhJbmRleCA9IGFyci5sZW5ndGggLSAxO1xuICAgIHZhciBjdXJyZW50SW5kZXg7XG4gICAgdmFyIGN1cnJlbnRFbGVtZW50O1xuICAgIHdoaWxlIChtaW5JbmRleCA8PSBtYXhJbmRleCkge1xuICAgICAgICBjdXJyZW50SW5kZXggPSAobWluSW5kZXggKyBtYXhJbmRleCkgLyAyIHwgMDsgLy8gdHNsaW50OmRpc2FibGUtbGluZTpuby1iaXR3aXNlXG4gICAgICAgIGN1cnJlbnRFbGVtZW50ID0gYXJyW2N1cnJlbnRJbmRleF07XG4gICAgICAgIHZhciBjdXJyZW50SWQgPSBjdXJyZW50RWxlbWVudC5kZXN0aW5hdGlvbklkO1xuICAgICAgICBpZiAoY3VycmVudElkIDwgc2VhcmNoSWQpIHtcbiAgICAgICAgICAgIG1pbkluZGV4ID0gY3VycmVudEluZGV4ICsgMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjdXJyZW50SWQgPiBzZWFyY2hJZCkge1xuICAgICAgICAgICAgbWF4SW5kZXggPSBjdXJyZW50SW5kZXggLSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnRJbmRleDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gLTE7XG59XG4vKipcbiAqIEF0dGFjaGVzIGFuIGFjdHVhbCBldmVudCBsaXN0ZW5lciB0byB0aGUgRE9NIHJvb3QgZWxlbWVudCxcbiAqIGhhbmRsZXMgXCJkZXN0aW5hdGlvbnNcIiAoaW50ZXJlc3RlZCBET01Tb3VyY2Ugb3V0cHV0IHN1YmplY3RzKSwgYW5kIGJ1YmJsaW5nLlxuICovXG52YXIgRXZlbnREZWxlZ2F0b3IgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEV2ZW50RGVsZWdhdG9yKHRvcEVsZW1lbnQsIGV2ZW50VHlwZSwgdXNlQ2FwdHVyZSwgaXNvbGF0ZU1vZHVsZSkge1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICB0aGlzLnRvcEVsZW1lbnQgPSB0b3BFbGVtZW50O1xuICAgICAgICB0aGlzLmV2ZW50VHlwZSA9IGV2ZW50VHlwZTtcbiAgICAgICAgdGhpcy51c2VDYXB0dXJlID0gdXNlQ2FwdHVyZTtcbiAgICAgICAgdGhpcy5pc29sYXRlTW9kdWxlID0gaXNvbGF0ZU1vZHVsZTtcbiAgICAgICAgdGhpcy5kZXN0aW5hdGlvbnMgPSBbXTtcbiAgICAgICAgdGhpcy5yb29mID0gdG9wRWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBpZiAodXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgdGhpcy5kb21MaXN0ZW5lciA9IGZ1bmN0aW9uIChldikgeyByZXR1cm4gX3RoaXMuY2FwdHVyZShldik7IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRvbUxpc3RlbmVyID0gZnVuY3Rpb24gKGV2KSB7IHJldHVybiBfdGhpcy5idWJibGUoZXYpOyB9O1xuICAgICAgICB9XG4gICAgICAgIHRvcEVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudFR5cGUsIHRoaXMuZG9tTGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgIH1cbiAgICBFdmVudERlbGVnYXRvci5wcm90b3R5cGUuYnViYmxlID0gZnVuY3Rpb24gKHJhd0V2ZW50KSB7XG4gICAgICAgIGlmICghdGhpcy50b3BFbGVtZW50LmNvbnRhaW5zKHJhd0V2ZW50LmN1cnJlbnRUYXJnZXQpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGV2ID0gdGhpcy5wYXRjaEV2ZW50KHJhd0V2ZW50KTtcbiAgICAgICAgZm9yICh2YXIgZWwgPSBldi50YXJnZXQ7IGVsICYmIGVsICE9PSB0aGlzLnJvb2Y7IGVsID0gZWwucGFyZW50RWxlbWVudCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnRvcEVsZW1lbnQuY29udGFpbnMoZWwpKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZXYucHJvcGFnYXRpb25IYXNCZWVuU3RvcHBlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubWF0Y2hFdmVudEFnYWluc3REZXN0aW5hdGlvbnMoZWwsIGV2KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgRXZlbnREZWxlZ2F0b3IucHJvdG90eXBlLm1hdGNoRXZlbnRBZ2FpbnN0RGVzdGluYXRpb25zID0gZnVuY3Rpb24gKGVsLCBldikge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IHRoaXMuZGVzdGluYXRpb25zLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgdmFyIGRlc3QgPSB0aGlzLmRlc3RpbmF0aW9uc1tpXTtcbiAgICAgICAgICAgIGlmICghZGVzdC5zY29wZUNoZWNrZXIuaXNTdHJpY3RseUluUm9vdFNjb3BlKGVsKSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1hdGNoZXNTZWxlY3RvcihlbCwgZGVzdC5zZWxlY3RvcikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm11dGF0ZUV2ZW50Q3VycmVudFRhcmdldChldiwgZWwpO1xuICAgICAgICAgICAgICAgIGRlc3Quc3ViamVjdC5fbihldik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIEV2ZW50RGVsZWdhdG9yLnByb3RvdHlwZS5jYXB0dXJlID0gZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gdGhpcy5kZXN0aW5hdGlvbnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGVzdCA9IHRoaXMuZGVzdGluYXRpb25zW2ldO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXNTZWxlY3Rvcihldi50YXJnZXQsIGRlc3Quc2VsZWN0b3IpKSB7XG4gICAgICAgICAgICAgICAgZGVzdC5zdWJqZWN0Ll9uKGV2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgRXZlbnREZWxlZ2F0b3IucHJvdG90eXBlLmFkZERlc3RpbmF0aW9uID0gZnVuY3Rpb24gKHN1YmplY3QsIG5hbWVzcGFjZSwgZGVzdGluYXRpb25JZCkge1xuICAgICAgICB2YXIgc2NvcGUgPSB1dGlsc18xLmdldFNjb3BlKG5hbWVzcGFjZSk7XG4gICAgICAgIHZhciBzZWxlY3RvciA9IHV0aWxzXzEuZ2V0U2VsZWN0b3JzKG5hbWVzcGFjZSk7XG4gICAgICAgIHZhciBzY29wZUNoZWNrZXIgPSBuZXcgU2NvcGVDaGVja2VyXzEuU2NvcGVDaGVja2VyKHNjb3BlLCB0aGlzLmlzb2xhdGVNb2R1bGUpO1xuICAgICAgICB0aGlzLmRlc3RpbmF0aW9ucy5wdXNoKHsgc3ViamVjdDogc3ViamVjdCwgc2NvcGVDaGVja2VyOiBzY29wZUNoZWNrZXIsIHNlbGVjdG9yOiBzZWxlY3RvciwgZGVzdGluYXRpb25JZDogZGVzdGluYXRpb25JZCB9KTtcbiAgICB9O1xuICAgIEV2ZW50RGVsZWdhdG9yLnByb3RvdHlwZS5jcmVhdGVEZXN0aW5hdGlvbklkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZ0Rlc3RpbmF0aW9uSWQrKztcbiAgICB9O1xuICAgIEV2ZW50RGVsZWdhdG9yLnByb3RvdHlwZS5yZW1vdmVEZXN0aW5hdGlvbklkID0gZnVuY3Rpb24gKGRlc3RpbmF0aW9uSWQpIHtcbiAgICAgICAgdmFyIGkgPSBmaW5kRGVzdGluYXRpb25JZCh0aGlzLmRlc3RpbmF0aW9ucywgZGVzdGluYXRpb25JZCk7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdGluYXRpb25zLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgRXZlbnREZWxlZ2F0b3IucHJvdG90eXBlLnBhdGNoRXZlbnQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgdmFyIHBFdmVudCA9IGV2ZW50O1xuICAgICAgICBwRXZlbnQucHJvcGFnYXRpb25IYXNCZWVuU3RvcHBlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgb2xkU3RvcFByb3BhZ2F0aW9uID0gcEV2ZW50LnN0b3BQcm9wYWdhdGlvbjtcbiAgICAgICAgcEV2ZW50LnN0b3BQcm9wYWdhdGlvbiA9IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICAgICAgICAgIG9sZFN0b3BQcm9wYWdhdGlvbi5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5wcm9wYWdhdGlvbkhhc0JlZW5TdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHBFdmVudDtcbiAgICB9O1xuICAgIEV2ZW50RGVsZWdhdG9yLnByb3RvdHlwZS5tdXRhdGVFdmVudEN1cnJlbnRUYXJnZXQgPSBmdW5jdGlvbiAoZXZlbnQsIGN1cnJlbnRUYXJnZXRFbGVtZW50KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZXZlbnQsIFwiY3VycmVudFRhcmdldFwiLCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6IGN1cnJlbnRUYXJnZXRFbGVtZW50LFxuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwicGxlYXNlIHVzZSBldmVudC5vd25lclRhcmdldFwiKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5vd25lclRhcmdldCA9IGN1cnJlbnRUYXJnZXRFbGVtZW50O1xuICAgIH07XG4gICAgRXZlbnREZWxlZ2F0b3IucHJvdG90eXBlLnVwZGF0ZVRvcEVsZW1lbnQgPSBmdW5jdGlvbiAobmV3VG9wRWxlbWVudCkge1xuICAgICAgICB0aGlzLnRvcEVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcih0aGlzLmV2ZW50VHlwZSwgdGhpcy5kb21MaXN0ZW5lciwgdGhpcy51c2VDYXB0dXJlKTtcbiAgICAgICAgbmV3VG9wRWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHRoaXMuZXZlbnRUeXBlLCB0aGlzLmRvbUxpc3RlbmVyLCB0aGlzLnVzZUNhcHR1cmUpO1xuICAgICAgICB0aGlzLnRvcEVsZW1lbnQgPSBuZXdUb3BFbGVtZW50O1xuICAgIH07XG4gICAgcmV0dXJuIEV2ZW50RGVsZWdhdG9yO1xufSgpKTtcbmV4cG9ydHMuRXZlbnREZWxlZ2F0b3IgPSBFdmVudERlbGVnYXRvcjtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPUV2ZW50RGVsZWdhdG9yLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcbnZhciB4c3RyZWFtX2FkYXB0ZXJfMSA9IHJlcXVpcmUoJ0BjeWNsZS94c3RyZWFtLWFkYXB0ZXInKTtcbnZhciBIVE1MU291cmNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBIVE1MU291cmNlKGh0bWwkLCBydW5TQSwgX25hbWUpIHtcbiAgICAgICAgdGhpcy5ydW5TQSA9IHJ1blNBO1xuICAgICAgICB0aGlzLl9uYW1lID0gX25hbWU7XG4gICAgICAgIHRoaXMuX2h0bWwkID0gaHRtbCQ7XG4gICAgICAgIHRoaXMuX2VtcHR5JCA9IHJ1blNBLmFkYXB0KHhzdHJlYW1fMS5kZWZhdWx0LmVtcHR5KCksIHhzdHJlYW1fYWRhcHRlcl8xLmRlZmF1bHQuc3RyZWFtU3Vic2NyaWJlKTtcbiAgICB9XG4gICAgSFRNTFNvdXJjZS5wcm90b3R5cGUuZWxlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBvdXQgPSB0aGlzLnJ1blNBLmFkYXB0KHRoaXMuX2h0bWwkLCB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0LnN0cmVhbVN1YnNjcmliZSk7XG4gICAgICAgIG91dC5faXNDeWNsZVNvdXJjZSA9IHRoaXMuX25hbWU7XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfTtcbiAgICBIVE1MU291cmNlLnByb3RvdHlwZS5zZWxlY3QgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBIVE1MU291cmNlKHhzdHJlYW1fMS5kZWZhdWx0LmVtcHR5KCksIHRoaXMucnVuU0EsIHRoaXMuX25hbWUpO1xuICAgIH07XG4gICAgSFRNTFNvdXJjZS5wcm90b3R5cGUuZXZlbnRzID0gZnVuY3Rpb24gKGV2ZW50VHlwZSwgb3B0aW9ucykge1xuICAgICAgICB2YXIgb3V0ID0gdGhpcy5fZW1wdHkkO1xuICAgICAgICBvdXQuX2lzQ3ljbGVTb3VyY2UgPSB0aGlzLl9uYW1lO1xuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH07XG4gICAgcmV0dXJuIEhUTUxTb3VyY2U7XG59KCkpO1xuZXhwb3J0cy5IVE1MU291cmNlID0gSFRNTFNvdXJjZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPUhUTUxTb3VyY2UuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgeHN0cmVhbV9hZGFwdGVyXzEgPSByZXF1aXJlKCdAY3ljbGUveHN0cmVhbS1hZGFwdGVyJyk7XG52YXIgRG9jdW1lbnRET01Tb3VyY2VfMSA9IHJlcXVpcmUoJy4vRG9jdW1lbnRET01Tb3VyY2UnKTtcbnZhciBCb2R5RE9NU291cmNlXzEgPSByZXF1aXJlKCcuL0JvZHlET01Tb3VyY2UnKTtcbnZhciB4c3RyZWFtXzEgPSByZXF1aXJlKCd4c3RyZWFtJyk7XG52YXIgRWxlbWVudEZpbmRlcl8xID0gcmVxdWlyZSgnLi9FbGVtZW50RmluZGVyJyk7XG52YXIgZnJvbUV2ZW50XzEgPSByZXF1aXJlKCcuL2Zyb21FdmVudCcpO1xudmFyIGlzb2xhdGVfMSA9IHJlcXVpcmUoJy4vaXNvbGF0ZScpO1xudmFyIEV2ZW50RGVsZWdhdG9yXzEgPSByZXF1aXJlKCcuL0V2ZW50RGVsZWdhdG9yJyk7XG52YXIgdXRpbHNfMSA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbnZhciBtYXRjaGVzU2VsZWN0b3I7XG50cnkge1xuICAgIG1hdGNoZXNTZWxlY3RvciA9IHJlcXVpcmUoXCJtYXRjaGVzLXNlbGVjdG9yXCIpO1xufVxuY2F0Y2ggKGUpIHtcbiAgICBtYXRjaGVzU2VsZWN0b3IgPSBGdW5jdGlvbi5wcm90b3R5cGU7XG59XG52YXIgZXZlbnRUeXBlc1RoYXREb250QnViYmxlID0gW1xuICAgIFwiYmx1clwiLFxuICAgIFwiY2FucGxheVwiLFxuICAgIFwiY2FucGxheXRocm91Z2hcIixcbiAgICBcImNoYW5nZVwiLFxuICAgIFwiZHVyYXRpb25jaGFuZ2VcIixcbiAgICBcImVtcHRpZWRcIixcbiAgICBcImVuZGVkXCIsXG4gICAgXCJmb2N1c1wiLFxuICAgIFwibG9hZFwiLFxuICAgIFwibG9hZGVkZGF0YVwiLFxuICAgIFwibG9hZGVkbWV0YWRhdGFcIixcbiAgICBcIm1vdXNlZW50ZXJcIixcbiAgICBcIm1vdXNlbGVhdmVcIixcbiAgICBcInBhdXNlXCIsXG4gICAgXCJwbGF5XCIsXG4gICAgXCJwbGF5aW5nXCIsXG4gICAgXCJyYXRlY2hhbmdlXCIsXG4gICAgXCJyZXNldFwiLFxuICAgIFwic2Nyb2xsXCIsXG4gICAgXCJzZWVrZWRcIixcbiAgICBcInNlZWtpbmdcIixcbiAgICBcInN0YWxsZWRcIixcbiAgICBcInN1Ym1pdFwiLFxuICAgIFwic3VzcGVuZFwiLFxuICAgIFwidGltZXVwZGF0ZVwiLFxuICAgIFwidW5sb2FkXCIsXG4gICAgXCJ2b2x1bWVjaGFuZ2VcIixcbiAgICBcIndhaXRpbmdcIixcbl07XG5mdW5jdGlvbiBkZXRlcm1pbmVVc2VDYXB0dXJlKGV2ZW50VHlwZSwgb3B0aW9ucykge1xuICAgIHZhciByZXN1bHQgPSBmYWxzZTtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMudXNlQ2FwdHVyZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJlc3VsdCA9IG9wdGlvbnMudXNlQ2FwdHVyZTtcbiAgICB9XG4gICAgaWYgKGV2ZW50VHlwZXNUaGF0RG9udEJ1YmJsZS5pbmRleE9mKGV2ZW50VHlwZSkgIT09IC0xKSB7XG4gICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiBmaWx0ZXJCYXNlZE9uSXNvbGF0aW9uKGRvbVNvdXJjZSwgc2NvcGUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gZmlsdGVyQmFzZWRPbklzb2xhdGlvbk9wZXJhdG9yKHJvb3RFbGVtZW50JCkge1xuICAgICAgICByZXR1cm4gcm9vdEVsZW1lbnQkXG4gICAgICAgICAgICAuZm9sZChmdW5jdGlvbiBzaG91bGRQYXNzKHN0YXRlLCBlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgaGFzSXNvbGF0ZWQgPSAhIWRvbVNvdXJjZS5faXNvbGF0ZU1vZHVsZS5nZXRJc29sYXRlZEVsZW1lbnQoc2NvcGUpO1xuICAgICAgICAgICAgdmFyIHNob3VsZFBhc3MgPSBoYXNJc29sYXRlZCAmJiAhc3RhdGUuaGFkSXNvbGF0ZWRNdXRhYmxlO1xuICAgICAgICAgICAgcmV0dXJuIHsgaGFkSXNvbGF0ZWRNdXRhYmxlOiBoYXNJc29sYXRlZCwgc2hvdWxkUGFzczogc2hvdWxkUGFzcywgZWxlbWVudDogZWxlbWVudCB9O1xuICAgICAgICB9LCB7IGhhZElzb2xhdGVkTXV0YWJsZTogZmFsc2UsIHNob3VsZFBhc3M6IGZhbHNlLCBlbGVtZW50OiBudWxsIH0pXG4gICAgICAgICAgICAuZHJvcCgxKVxuICAgICAgICAgICAgLmZpbHRlcihmdW5jdGlvbiAocykgeyByZXR1cm4gcy5zaG91bGRQYXNzOyB9KVxuICAgICAgICAgICAgLm1hcChmdW5jdGlvbiAocykgeyByZXR1cm4gcy5lbGVtZW50OyB9KTtcbiAgICB9O1xufVxudmFyIE1haW5ET01Tb3VyY2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIE1haW5ET01Tb3VyY2UoX3Jvb3RFbGVtZW50JCwgX3Nhbml0YXRpb24kLCBfcnVuU3RyZWFtQWRhcHRlciwgX25hbWVzcGFjZSwgX2lzb2xhdGVNb2R1bGUsIF9kZWxlZ2F0b3JzLCBfbmFtZSkge1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICBpZiAoX25hbWVzcGFjZSA9PT0gdm9pZCAwKSB7IF9uYW1lc3BhY2UgPSBbXTsgfVxuICAgICAgICB0aGlzLl9yb290RWxlbWVudCQgPSBfcm9vdEVsZW1lbnQkO1xuICAgICAgICB0aGlzLl9zYW5pdGF0aW9uJCA9IF9zYW5pdGF0aW9uJDtcbiAgICAgICAgdGhpcy5fcnVuU3RyZWFtQWRhcHRlciA9IF9ydW5TdHJlYW1BZGFwdGVyO1xuICAgICAgICB0aGlzLl9uYW1lc3BhY2UgPSBfbmFtZXNwYWNlO1xuICAgICAgICB0aGlzLl9pc29sYXRlTW9kdWxlID0gX2lzb2xhdGVNb2R1bGU7XG4gICAgICAgIHRoaXMuX2RlbGVnYXRvcnMgPSBfZGVsZWdhdG9ycztcbiAgICAgICAgdGhpcy5fbmFtZSA9IF9uYW1lO1xuICAgICAgICB0aGlzLl9fSkFOSV9FVkFLQUxMSU9fV0VfV0lMTF9NSVNTX1lPVV9QTEVBU0VfQ09NRV9CQUNLX0VWRU5UVUFMTFkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fX0pBTklfRVZBS0FMTElPX1dFX1dJTExfTUlTU19ZT1VfUExFQVNFX0NPTUVfQkFDS19FVkVOVFVBTExZID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5pc29sYXRlU291cmNlID0gaXNvbGF0ZV8xLmlzb2xhdGVTb3VyY2U7XG4gICAgICAgIHRoaXMuaXNvbGF0ZVNpbmsgPSBmdW5jdGlvbiAoc2luaywgc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBleGlzdGluZ1Njb3BlID0gdXRpbHNfMS5nZXRTY29wZShfdGhpcy5fbmFtZXNwYWNlKTtcbiAgICAgICAgICAgIHZhciBkZWVwZXJTY29wZSA9IFtleGlzdGluZ1Njb3BlLCBzY29wZV0uZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiAhIXg7IH0pLmpvaW4oJy0nKTtcbiAgICAgICAgICAgIHJldHVybiBpc29sYXRlXzEuaXNvbGF0ZVNpbmsoc2luaywgZGVlcGVyU2NvcGUpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBNYWluRE9NU291cmNlLnByb3RvdHlwZS5lbGVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG91dHB1dCQ7XG4gICAgICAgIGlmICh0aGlzLl9uYW1lc3BhY2UubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBvdXRwdXQkID0gdGhpcy5fcm9vdEVsZW1lbnQkO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGVsZW1lbnRGaW5kZXJfMSA9IG5ldyBFbGVtZW50RmluZGVyXzEuRWxlbWVudEZpbmRlcih0aGlzLl9uYW1lc3BhY2UsIHRoaXMuX2lzb2xhdGVNb2R1bGUpO1xuICAgICAgICAgICAgb3V0cHV0JCA9IHRoaXMuX3Jvb3RFbGVtZW50JC5tYXAoZnVuY3Rpb24gKGVsKSB7IHJldHVybiBlbGVtZW50RmluZGVyXzEuY2FsbChlbCk7IH0pO1xuICAgICAgICB9XG4gICAgICAgIHZhciBydW5TQSA9IHRoaXMuX3J1blN0cmVhbUFkYXB0ZXI7XG4gICAgICAgIHZhciBvdXQgPSBydW5TQS5yZW1lbWJlcihydW5TQS5hZGFwdChvdXRwdXQkLCB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0LnN0cmVhbVN1YnNjcmliZSkpO1xuICAgICAgICBvdXQuX2lzQ3ljbGVTb3VyY2UgPSB0aGlzLl9uYW1lO1xuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH07XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KE1haW5ET01Tb3VyY2UucHJvdG90eXBlLCBcIm5hbWVzcGFjZVwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX25hbWVzcGFjZTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgTWFpbkRPTVNvdXJjZS5wcm90b3R5cGUuc2VsZWN0ID0gZnVuY3Rpb24gKHNlbGVjdG9yKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2VsZWN0b3IgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJET00gZHJpdmVyJ3Mgc2VsZWN0KCkgZXhwZWN0cyB0aGUgYXJndW1lbnQgdG8gYmUgYSBcIiArXG4gICAgICAgICAgICAgICAgXCJzdHJpbmcgYXMgYSBDU1Mgc2VsZWN0b3JcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlbGVjdG9yID09PSAnZG9jdW1lbnQnKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERvY3VtZW50RE9NU291cmNlXzEuRG9jdW1lbnRET01Tb3VyY2UodGhpcy5fcnVuU3RyZWFtQWRhcHRlciwgdGhpcy5fbmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlbGVjdG9yID09PSAnYm9keScpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQm9keURPTVNvdXJjZV8xLkJvZHlET01Tb3VyY2UodGhpcy5fcnVuU3RyZWFtQWRhcHRlciwgdGhpcy5fbmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHRyaW1tZWRTZWxlY3RvciA9IHNlbGVjdG9yLnRyaW0oKTtcbiAgICAgICAgdmFyIGNoaWxkTmFtZXNwYWNlID0gdHJpbW1lZFNlbGVjdG9yID09PSBcIjpyb290XCIgP1xuICAgICAgICAgICAgdGhpcy5fbmFtZXNwYWNlIDpcbiAgICAgICAgICAgIHRoaXMuX25hbWVzcGFjZS5jb25jYXQodHJpbW1lZFNlbGVjdG9yKTtcbiAgICAgICAgcmV0dXJuIG5ldyBNYWluRE9NU291cmNlKHRoaXMuX3Jvb3RFbGVtZW50JCwgdGhpcy5fc2FuaXRhdGlvbiQsIHRoaXMuX3J1blN0cmVhbUFkYXB0ZXIsIGNoaWxkTmFtZXNwYWNlLCB0aGlzLl9pc29sYXRlTW9kdWxlLCB0aGlzLl9kZWxlZ2F0b3JzLCB0aGlzLl9uYW1lKTtcbiAgICB9O1xuICAgIE1haW5ET01Tb3VyY2UucHJvdG90eXBlLmV2ZW50cyA9IGZ1bmN0aW9uIChldmVudFR5cGUsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IHZvaWQgMCkgeyBvcHRpb25zID0ge307IH1cbiAgICAgICAgaWYgKHR5cGVvZiBldmVudFR5cGUgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRPTSBkcml2ZXIncyBldmVudHMoKSBleHBlY3RzIGFyZ3VtZW50IHRvIGJlIGEgXCIgK1xuICAgICAgICAgICAgICAgIFwic3RyaW5nIHJlcHJlc2VudGluZyB0aGUgZXZlbnQgdHlwZSB0byBsaXN0ZW4gZm9yLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdXNlQ2FwdHVyZSA9IGRldGVybWluZVVzZUNhcHR1cmUoZXZlbnRUeXBlLCBvcHRpb25zKTtcbiAgICAgICAgdmFyIG5hbWVzcGFjZSA9IHRoaXMuX25hbWVzcGFjZTtcbiAgICAgICAgdmFyIHNjb3BlID0gdXRpbHNfMS5nZXRTY29wZShuYW1lc3BhY2UpO1xuICAgICAgICB2YXIga2V5UGFydHMgPSBbZXZlbnRUeXBlLCB1c2VDYXB0dXJlXTtcbiAgICAgICAgaWYgKHNjb3BlKSB7XG4gICAgICAgICAgICBrZXlQYXJ0cy5wdXNoKHNjb3BlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5ID0ga2V5UGFydHMuam9pbignficpO1xuICAgICAgICB2YXIgZG9tU291cmNlID0gdGhpcztcbiAgICAgICAgdmFyIHJvb3RFbGVtZW50JDtcbiAgICAgICAgaWYgKHNjb3BlKSB7XG4gICAgICAgICAgICByb290RWxlbWVudCQgPSB0aGlzLl9yb290RWxlbWVudCRcbiAgICAgICAgICAgICAgICAuY29tcG9zZShmaWx0ZXJCYXNlZE9uSXNvbGF0aW9uKGRvbVNvdXJjZSwgc2NvcGUpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJvb3RFbGVtZW50JCA9IHRoaXMuX3Jvb3RFbGVtZW50JC50YWtlKDIpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBldmVudCQgPSByb290RWxlbWVudCRcbiAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24gc2V0dXBFdmVudERlbGVnYXRvck9uVG9wRWxlbWVudChyb290RWxlbWVudCkge1xuICAgICAgICAgICAgLy8gRXZlbnQgbGlzdGVuZXIganVzdCBmb3IgdGhlIHJvb3QgZWxlbWVudFxuICAgICAgICAgICAgaWYgKCFuYW1lc3BhY2UgfHwgbmFtZXNwYWNlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmcm9tRXZlbnRfMS5mcm9tRXZlbnQocm9vdEVsZW1lbnQsIGV2ZW50VHlwZSwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBFdmVudCBsaXN0ZW5lciBvbiB0aGUgdG9wIGVsZW1lbnQgYXMgYW4gRXZlbnREZWxlZ2F0b3JcbiAgICAgICAgICAgIHZhciBkZWxlZ2F0b3JzID0gZG9tU291cmNlLl9kZWxlZ2F0b3JzO1xuICAgICAgICAgICAgdmFyIHRvcCA9IGRvbVNvdXJjZS5faXNvbGF0ZU1vZHVsZS5nZXRJc29sYXRlZEVsZW1lbnQoc2NvcGUpIHx8IHJvb3RFbGVtZW50O1xuICAgICAgICAgICAgdmFyIGRlbGVnYXRvcjtcbiAgICAgICAgICAgIGlmIChkZWxlZ2F0b3JzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgZGVsZWdhdG9yID0gZGVsZWdhdG9ycy5nZXQoa2V5KTtcbiAgICAgICAgICAgICAgICBkZWxlZ2F0b3IudXBkYXRlVG9wRWxlbWVudCh0b3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVsZWdhdG9yID0gbmV3IEV2ZW50RGVsZWdhdG9yXzEuRXZlbnREZWxlZ2F0b3IodG9wLCBldmVudFR5cGUsIHVzZUNhcHR1cmUsIGRvbVNvdXJjZS5faXNvbGF0ZU1vZHVsZSk7XG4gICAgICAgICAgICAgICAgZGVsZWdhdG9ycy5zZXQoa2V5LCBkZWxlZ2F0b3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgZG9tU291cmNlLl9pc29sYXRlTW9kdWxlLmFkZEV2ZW50RGVsZWdhdG9yKHNjb3BlLCBkZWxlZ2F0b3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGRlc3RpbmF0aW9uSWQgPSBkZWxlZ2F0b3IuY3JlYXRlRGVzdGluYXRpb25JZCgpO1xuICAgICAgICAgICAgdmFyIHN1YmplY3QgPSB4c3RyZWFtXzEuZGVmYXVsdC5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBmdW5jdGlvbiAoKSB7IH0sXG4gICAgICAgICAgICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoJ3JlcXVlc3RJZGxlQ2FsbGJhY2snIGluIHdpbmRvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdElkbGVDYWxsYmFjayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdG9yLnJlbW92ZURlc3RpbmF0aW9uSWQoZGVzdGluYXRpb25JZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGVnYXRvci5yZW1vdmVEZXN0aW5hdGlvbklkKGRlc3RpbmF0aW9uSWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZGVsZWdhdG9yLmFkZERlc3RpbmF0aW9uKHN1YmplY3QsIG5hbWVzcGFjZSwgZGVzdGluYXRpb25JZCk7XG4gICAgICAgICAgICByZXR1cm4gc3ViamVjdDtcbiAgICAgICAgfSlcbiAgICAgICAgICAgIC5mbGF0dGVuKCk7XG4gICAgICAgIHZhciBvdXQgPSB0aGlzLl9ydW5TdHJlYW1BZGFwdGVyLmFkYXB0KGV2ZW50JCwgeHN0cmVhbV9hZGFwdGVyXzEuZGVmYXVsdC5zdHJlYW1TdWJzY3JpYmUpO1xuICAgICAgICBvdXQuX2lzQ3ljbGVTb3VyY2UgPSBkb21Tb3VyY2UuX25hbWU7XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfTtcbiAgICBNYWluRE9NU291cmNlLnByb3RvdHlwZS5kaXNwb3NlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLl9zYW5pdGF0aW9uJC5zaGFtZWZ1bGx5U2VuZE5leHQoJycpO1xuICAgICAgICB0aGlzLl9pc29sYXRlTW9kdWxlLnJlc2V0KCk7XG4gICAgfTtcbiAgICByZXR1cm4gTWFpbkRPTVNvdXJjZTtcbn0oKSk7XG5leHBvcnRzLk1haW5ET01Tb3VyY2UgPSBNYWluRE9NU291cmNlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9TWFpbkRPTVNvdXJjZS5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBTY29wZUNoZWNrZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFNjb3BlQ2hlY2tlcihzY29wZSwgaXNvbGF0ZU1vZHVsZSkge1xuICAgICAgICB0aGlzLnNjb3BlID0gc2NvcGU7XG4gICAgICAgIHRoaXMuaXNvbGF0ZU1vZHVsZSA9IGlzb2xhdGVNb2R1bGU7XG4gICAgfVxuICAgIFNjb3BlQ2hlY2tlci5wcm90b3R5cGUuaXNTdHJpY3RseUluUm9vdFNjb3BlID0gZnVuY3Rpb24gKGxlYWYpIHtcbiAgICAgICAgZm9yICh2YXIgZWwgPSBsZWFmOyBlbDsgZWwgPSBlbC5wYXJlbnRFbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgc2NvcGUgPSB0aGlzLmlzb2xhdGVNb2R1bGUuaXNJc29sYXRlZEVsZW1lbnQoZWwpO1xuICAgICAgICAgICAgaWYgKHNjb3BlICYmIHNjb3BlICE9PSB0aGlzLnNjb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICByZXR1cm4gU2NvcGVDaGVja2VyO1xufSgpKTtcbmV4cG9ydHMuU2NvcGVDaGVja2VyID0gU2NvcGVDaGVja2VyO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9U2NvcGVDaGVja2VyLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIGh5cGVyc2NyaXB0XzEgPSByZXF1aXJlKCcuL2h5cGVyc2NyaXB0Jyk7XG52YXIgY2xhc3NOYW1lRnJvbVZOb2RlXzEgPSByZXF1aXJlKCdzbmFiYmRvbS1zZWxlY3Rvci9saWIvY2xhc3NOYW1lRnJvbVZOb2RlJyk7XG52YXIgc2VsZWN0b3JQYXJzZXJfMSA9IHJlcXVpcmUoJ3NuYWJiZG9tLXNlbGVjdG9yL2xpYi9zZWxlY3RvclBhcnNlcicpO1xudmFyIFZOb2RlV3JhcHBlciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVk5vZGVXcmFwcGVyKHJvb3RFbGVtZW50KSB7XG4gICAgICAgIHRoaXMucm9vdEVsZW1lbnQgPSByb290RWxlbWVudDtcbiAgICB9XG4gICAgVk5vZGVXcmFwcGVyLnByb3RvdHlwZS5jYWxsID0gZnVuY3Rpb24gKHZub2RlKSB7XG4gICAgICAgIHZhciBfYSA9IHNlbGVjdG9yUGFyc2VyXzEuZGVmYXVsdCh2bm9kZS5zZWwpLCBzZWxlY3RvclRhZ05hbWUgPSBfYS50YWdOYW1lLCBzZWxlY3RvcklkID0gX2EuaWQ7XG4gICAgICAgIHZhciB2Tm9kZUNsYXNzTmFtZSA9IGNsYXNzTmFtZUZyb21WTm9kZV8xLmRlZmF1bHQodm5vZGUpO1xuICAgICAgICB2YXIgdk5vZGVEYXRhID0gdm5vZGUuZGF0YSB8fCB7fTtcbiAgICAgICAgdmFyIHZOb2RlRGF0YVByb3BzID0gdk5vZGVEYXRhLnByb3BzIHx8IHt9O1xuICAgICAgICB2YXIgX2IgPSB2Tm9kZURhdGFQcm9wcy5pZCwgdk5vZGVJZCA9IF9iID09PSB2b2lkIDAgPyBzZWxlY3RvcklkIDogX2I7XG4gICAgICAgIHZhciBpc1ZOb2RlQW5kUm9vdEVsZW1lbnRJZGVudGljYWwgPSB2Tm9kZUlkLnRvVXBwZXJDYXNlKCkgPT09IHRoaXMucm9vdEVsZW1lbnQuaWQudG9VcHBlckNhc2UoKSAmJlxuICAgICAgICAgICAgc2VsZWN0b3JUYWdOYW1lLnRvVXBwZXJDYXNlKCkgPT09IHRoaXMucm9vdEVsZW1lbnQudGFnTmFtZS50b1VwcGVyQ2FzZSgpICYmXG4gICAgICAgICAgICB2Tm9kZUNsYXNzTmFtZS50b1VwcGVyQ2FzZSgpID09PSB0aGlzLnJvb3RFbGVtZW50LmNsYXNzTmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBpZiAoaXNWTm9kZUFuZFJvb3RFbGVtZW50SWRlbnRpY2FsKSB7XG4gICAgICAgICAgICByZXR1cm4gdm5vZGU7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIF9jID0gdGhpcy5yb290RWxlbWVudCwgdGFnTmFtZSA9IF9jLnRhZ05hbWUsIGlkID0gX2MuaWQsIGNsYXNzTmFtZSA9IF9jLmNsYXNzTmFtZTtcbiAgICAgICAgdmFyIGVsZW1lbnRJZCA9IGlkID8gXCIjXCIgKyBpZCA6IFwiXCI7XG4gICAgICAgIHZhciBlbGVtZW50Q2xhc3NOYW1lID0gY2xhc3NOYW1lID9cbiAgICAgICAgICAgIFwiLlwiICsgY2xhc3NOYW1lLnNwbGl0KFwiIFwiKS5qb2luKFwiLlwiKSA6IFwiXCI7XG4gICAgICAgIHJldHVybiBoeXBlcnNjcmlwdF8xLmgoXCJcIiArIHRhZ05hbWUudG9Mb3dlckNhc2UoKSArIGVsZW1lbnRJZCArIGVsZW1lbnRDbGFzc05hbWUsIHt9LCBbXG4gICAgICAgICAgICB2bm9kZSxcbiAgICAgICAgXSk7XG4gICAgfTtcbiAgICByZXR1cm4gVk5vZGVXcmFwcGVyO1xufSgpKTtcbmV4cG9ydHMuVk5vZGVXcmFwcGVyID0gVk5vZGVXcmFwcGVyO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9Vk5vZGVXcmFwcGVyLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcbmZ1bmN0aW9uIGZyb21FdmVudChlbGVtZW50LCBldmVudE5hbWUsIHVzZUNhcHR1cmUpIHtcbiAgICBpZiAodXNlQ2FwdHVyZSA9PT0gdm9pZCAwKSB7IHVzZUNhcHR1cmUgPSBmYWxzZTsgfVxuICAgIHJldHVybiB4c3RyZWFtXzEuU3RyZWFtLmNyZWF0ZSh7XG4gICAgICAgIGVsZW1lbnQ6IGVsZW1lbnQsXG4gICAgICAgIG5leHQ6IG51bGwsXG4gICAgICAgIHN0YXJ0OiBmdW5jdGlvbiBzdGFydChsaXN0ZW5lcikge1xuICAgICAgICAgICAgdGhpcy5uZXh0ID0gZnVuY3Rpb24gbmV4dChldmVudCkgeyBsaXN0ZW5lci5uZXh0KGV2ZW50KTsgfTtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5uZXh0LCB1c2VDYXB0dXJlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RvcDogZnVuY3Rpb24gc3RvcCgpIHtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgdGhpcy5uZXh0LCB1c2VDYXB0dXJlKTtcbiAgICAgICAgfSxcbiAgICB9KTtcbn1cbmV4cG9ydHMuZnJvbUV2ZW50ID0gZnJvbUV2ZW50O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZnJvbUV2ZW50LmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIGh5cGVyc2NyaXB0XzEgPSByZXF1aXJlKCcuL2h5cGVyc2NyaXB0Jyk7XG5mdW5jdGlvbiBpc1ZhbGlkU3RyaW5nKHBhcmFtKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBwYXJhbSA9PT0gJ3N0cmluZycgJiYgcGFyYW0ubGVuZ3RoID4gMDtcbn1cbmZ1bmN0aW9uIGlzU2VsZWN0b3IocGFyYW0pIHtcbiAgICByZXR1cm4gaXNWYWxpZFN0cmluZyhwYXJhbSkgJiYgKHBhcmFtWzBdID09PSAnLicgfHwgcGFyYW1bMF0gPT09ICcjJyk7XG59XG5mdW5jdGlvbiBjcmVhdGVUYWdGdW5jdGlvbih0YWdOYW1lKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGh5cGVyc2NyaXB0KGZpcnN0LCBiLCBjKSB7XG4gICAgICAgIGlmIChpc1NlbGVjdG9yKGZpcnN0KSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBiICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgYyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaHlwZXJzY3JpcHRfMS5oKHRhZ05hbWUgKyBmaXJzdCwgYiwgYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgYiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaHlwZXJzY3JpcHRfMS5oKHRhZ05hbWUgKyBmaXJzdCwgYik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaHlwZXJzY3JpcHRfMS5oKHRhZ05hbWUgKyBmaXJzdCwge30pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCEhYikge1xuICAgICAgICAgICAgcmV0dXJuIGh5cGVyc2NyaXB0XzEuaCh0YWdOYW1lLCBmaXJzdCwgYik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoISFmaXJzdCkge1xuICAgICAgICAgICAgcmV0dXJuIGh5cGVyc2NyaXB0XzEuaCh0YWdOYW1lLCBmaXJzdCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gaHlwZXJzY3JpcHRfMS5oKHRhZ05hbWUsIHt9KTtcbiAgICAgICAgfVxuICAgIH07XG59XG52YXIgU1ZHX1RBR19OQU1FUyA9IFtcbiAgICAnYScsICdhbHRHbHlwaCcsICdhbHRHbHlwaERlZicsICdhbHRHbHlwaEl0ZW0nLCAnYW5pbWF0ZScsICdhbmltYXRlQ29sb3InLFxuICAgICdhbmltYXRlTW90aW9uJywgJ2FuaW1hdGVUcmFuc2Zvcm0nLCAnY2lyY2xlJywgJ2NsaXBQYXRoJywgJ2NvbG9yUHJvZmlsZScsXG4gICAgJ2N1cnNvcicsICdkZWZzJywgJ2Rlc2MnLCAnZWxsaXBzZScsICdmZUJsZW5kJywgJ2ZlQ29sb3JNYXRyaXgnLFxuICAgICdmZUNvbXBvbmVudFRyYW5zZmVyJywgJ2ZlQ29tcG9zaXRlJywgJ2ZlQ29udm9sdmVNYXRyaXgnLCAnZmVEaWZmdXNlTGlnaHRpbmcnLFxuICAgICdmZURpc3BsYWNlbWVudE1hcCcsICdmZURpc3RhbnRMaWdodCcsICdmZUZsb29kJywgJ2ZlRnVuY0EnLCAnZmVGdW5jQicsXG4gICAgJ2ZlRnVuY0cnLCAnZmVGdW5jUicsICdmZUdhdXNzaWFuQmx1cicsICdmZUltYWdlJywgJ2ZlTWVyZ2UnLCAnZmVNZXJnZU5vZGUnLFxuICAgICdmZU1vcnBob2xvZ3knLCAnZmVPZmZzZXQnLCAnZmVQb2ludExpZ2h0JywgJ2ZlU3BlY3VsYXJMaWdodGluZycsXG4gICAgJ2ZlU3BvdGxpZ2h0JywgJ2ZlVGlsZScsICdmZVR1cmJ1bGVuY2UnLCAnZmlsdGVyJywgJ2ZvbnQnLCAnZm9udEZhY2UnLFxuICAgICdmb250RmFjZUZvcm1hdCcsICdmb250RmFjZU5hbWUnLCAnZm9udEZhY2VTcmMnLCAnZm9udEZhY2VVcmknLFxuICAgICdmb3JlaWduT2JqZWN0JywgJ2cnLCAnZ2x5cGgnLCAnZ2x5cGhSZWYnLCAnaGtlcm4nLCAnaW1hZ2UnLCAnbGluZScsXG4gICAgJ2xpbmVhckdyYWRpZW50JywgJ21hcmtlcicsICdtYXNrJywgJ21ldGFkYXRhJywgJ21pc3NpbmdHbHlwaCcsICdtcGF0aCcsXG4gICAgJ3BhdGgnLCAncGF0dGVybicsICdwb2x5Z29uJywgJ3BvbHlsaW5lJywgJ3JhZGlhbEdyYWRpZW50JywgJ3JlY3QnLCAnc2NyaXB0JyxcbiAgICAnc2V0JywgJ3N0b3AnLCAnc3R5bGUnLCAnc3dpdGNoJywgJ3N5bWJvbCcsICd0ZXh0JywgJ3RleHRQYXRoJywgJ3RpdGxlJyxcbiAgICAndHJlZicsICd0c3BhbicsICd1c2UnLCAndmlldycsICd2a2VybicsXG5dO1xudmFyIHN2ZyA9IGNyZWF0ZVRhZ0Z1bmN0aW9uKCdzdmcnKTtcblNWR19UQUdfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAodGFnKSB7XG4gICAgc3ZnW3RhZ10gPSBjcmVhdGVUYWdGdW5jdGlvbih0YWcpO1xufSk7XG52YXIgVEFHX05BTUVTID0gW1xuICAgICdhJywgJ2FiYnInLCAnYWRkcmVzcycsICdhcmVhJywgJ2FydGljbGUnLCAnYXNpZGUnLCAnYXVkaW8nLCAnYicsICdiYXNlJyxcbiAgICAnYmRpJywgJ2JkbycsICdibG9ja3F1b3RlJywgJ2JvZHknLCAnYnInLCAnYnV0dG9uJywgJ2NhbnZhcycsICdjYXB0aW9uJyxcbiAgICAnY2l0ZScsICdjb2RlJywgJ2NvbCcsICdjb2xncm91cCcsICdkZCcsICdkZWwnLCAnZGZuJywgJ2RpcicsICdkaXYnLCAnZGwnLFxuICAgICdkdCcsICdlbScsICdlbWJlZCcsICdmaWVsZHNldCcsICdmaWdjYXB0aW9uJywgJ2ZpZ3VyZScsICdmb290ZXInLCAnZm9ybScsXG4gICAgJ2gxJywgJ2gyJywgJ2gzJywgJ2g0JywgJ2g1JywgJ2g2JywgJ2hlYWQnLCAnaGVhZGVyJywgJ2hncm91cCcsICdocicsICdodG1sJyxcbiAgICAnaScsICdpZnJhbWUnLCAnaW1nJywgJ2lucHV0JywgJ2lucycsICdrYmQnLCAna2V5Z2VuJywgJ2xhYmVsJywgJ2xlZ2VuZCcsXG4gICAgJ2xpJywgJ2xpbmsnLCAnbWFpbicsICdtYXAnLCAnbWFyaycsICdtZW51JywgJ21ldGEnLCAnbmF2JywgJ25vc2NyaXB0JyxcbiAgICAnb2JqZWN0JywgJ29sJywgJ29wdGdyb3VwJywgJ29wdGlvbicsICdwJywgJ3BhcmFtJywgJ3ByZScsICdwcm9ncmVzcycsICdxJyxcbiAgICAncnAnLCAncnQnLCAncnVieScsICdzJywgJ3NhbXAnLCAnc2NyaXB0JywgJ3NlY3Rpb24nLCAnc2VsZWN0JywgJ3NtYWxsJyxcbiAgICAnc291cmNlJywgJ3NwYW4nLCAnc3Ryb25nJywgJ3N0eWxlJywgJ3N1YicsICdzdXAnLCAndGFibGUnLCAndGJvZHknLCAndGQnLFxuICAgICd0ZXh0YXJlYScsICd0Zm9vdCcsICd0aCcsICd0aGVhZCcsICd0aXRsZScsICd0cicsICd1JywgJ3VsJywgJ3ZpZGVvJyxcbl07XG52YXIgZXhwb3J0ZWQgPSB7IFNWR19UQUdfTkFNRVM6IFNWR19UQUdfTkFNRVMsIFRBR19OQU1FUzogVEFHX05BTUVTLCBzdmc6IHN2ZywgaXNTZWxlY3RvcjogaXNTZWxlY3RvciwgY3JlYXRlVGFnRnVuY3Rpb246IGNyZWF0ZVRhZ0Z1bmN0aW9uIH07XG5UQUdfTkFNRVMuZm9yRWFjaChmdW5jdGlvbiAobikge1xuICAgIGV4cG9ydGVkW25dID0gY3JlYXRlVGFnRnVuY3Rpb24obik7XG59KTtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGV4cG9ydGVkO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aHlwZXJzY3JpcHQtaGVscGVycy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBpcyA9IHJlcXVpcmUoJ3NuYWJiZG9tL2lzJyk7XG52YXIgdm5vZGUgPSByZXF1aXJlKCdzbmFiYmRvbS92bm9kZScpO1xuZnVuY3Rpb24gaXNHZW5lcmljU3RyZWFtKHgpIHtcbiAgICByZXR1cm4gIUFycmF5LmlzQXJyYXkoeCkgJiYgdHlwZW9mIHgubWFwID09PSBcImZ1bmN0aW9uXCI7XG59XG5mdW5jdGlvbiBtdXRhdGVTdHJlYW1XaXRoTlModk5vZGUpIHtcbiAgICBhZGROUyh2Tm9kZS5kYXRhLCB2Tm9kZS5jaGlsZHJlbiwgdk5vZGUuc2VsKTtcbiAgICByZXR1cm4gdk5vZGU7XG59XG5mdW5jdGlvbiBhZGROUyhkYXRhLCBjaGlsZHJlbiwgc2VsZWN0b3IpIHtcbiAgICBkYXRhLm5zID0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiO1xuICAgIGlmIChzZWxlY3RvciAhPT0gXCJ0ZXh0XCIgJiYgc2VsZWN0b3IgIT09IFwiZm9yZWlnbk9iamVjdFwiICYmXG4gICAgICAgIHR5cGVvZiBjaGlsZHJlbiAhPT0gJ3VuZGVmaW5lZCcgJiYgaXMuYXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGlmIChpc0dlbmVyaWNTdHJlYW0oY2hpbGRyZW5baV0pKSB7XG4gICAgICAgICAgICAgICAgY2hpbGRyZW5baV0gPSBjaGlsZHJlbltpXS5tYXAobXV0YXRlU3RyZWFtV2l0aE5TKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGFkZE5TKGNoaWxkcmVuW2ldLmRhdGEsIGNoaWxkcmVuW2ldLmNoaWxkcmVuLCBjaGlsZHJlbltpXS5zZWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gaChzZWwsIGIsIGMpIHtcbiAgICB2YXIgZGF0YSA9IHt9O1xuICAgIHZhciBjaGlsZHJlbjtcbiAgICB2YXIgdGV4dDtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICBkYXRhID0gYjtcbiAgICAgICAgaWYgKGlzLmFycmF5KGMpKSB7XG4gICAgICAgICAgICBjaGlsZHJlbiA9IGM7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXMucHJpbWl0aXZlKGMpKSB7XG4gICAgICAgICAgICB0ZXh0ID0gYztcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIGlmIChpcy5hcnJheShiKSkge1xuICAgICAgICAgICAgY2hpbGRyZW4gPSBiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGlzLnByaW1pdGl2ZShiKSkge1xuICAgICAgICAgICAgdGV4dCA9IGI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBkYXRhID0gYjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoaXMuYXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgICAgIGNoaWxkcmVuID0gY2hpbGRyZW4uZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiB4OyB9KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaWYgKGlzLnByaW1pdGl2ZShjaGlsZHJlbltpXSkpIHtcbiAgICAgICAgICAgICAgICBjaGlsZHJlbltpXSA9IHZub2RlKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoaWxkcmVuW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoc2VsWzBdID09PSAncycgJiYgc2VsWzFdID09PSAndicgJiYgc2VsWzJdID09PSAnZycpIHtcbiAgICAgICAgYWRkTlMoZGF0YSwgY2hpbGRyZW4sIHNlbCk7XG4gICAgfVxuICAgIHJldHVybiB2bm9kZShzZWwsIGRhdGEsIGNoaWxkcmVuLCB0ZXh0LCB1bmRlZmluZWQpO1xufVxuZXhwb3J0cy5oID0gaDtcbjtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWh5cGVyc2NyaXB0LmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHRodW5rID0gcmVxdWlyZSgnc25hYmJkb20vdGh1bmsnKTtcbmV4cG9ydHMudGh1bmsgPSB0aHVuaztcbi8qKlxuICogQSBmYWN0b3J5IGZvciB0aGUgRE9NIGRyaXZlciBmdW5jdGlvbi5cbiAqXG4gKiBUYWtlcyBhIGBjb250YWluZXJgIHRvIGRlZmluZSB0aGUgdGFyZ2V0IG9uIHRoZSBleGlzdGluZyBET00gd2hpY2ggdGhpc1xuICogZHJpdmVyIHdpbGwgb3BlcmF0ZSBvbiwgYW5kIGFuIGBvcHRpb25zYCBvYmplY3QgYXMgdGhlIHNlY29uZCBhcmd1bWVudC4gVGhlXG4gKiBpbnB1dCB0byB0aGlzIGRyaXZlciBpcyBhIHN0cmVhbSBvZiB2aXJ0dWFsIERPTSBvYmplY3RzLCBvciBpbiBvdGhlciB3b3JkcyxcbiAqIFNuYWJiZG9tIFwiVk5vZGVcIiBvYmplY3RzLiBUaGUgb3V0cHV0IG9mIHRoaXMgZHJpdmVyIGlzIGEgXCJET01Tb3VyY2VcIjogYVxuICogY29sbGVjdGlvbiBvZiBPYnNlcnZhYmxlcyBxdWVyaWVkIHdpdGggdGhlIG1ldGhvZHMgYHNlbGVjdCgpYCBhbmQgYGV2ZW50cygpYC5cbiAqXG4gKiBgRE9NU291cmNlLnNlbGVjdChzZWxlY3RvcilgIHJldHVybnMgYSBuZXcgRE9NU291cmNlIHdpdGggc2NvcGUgcmVzdHJpY3RlZCB0b1xuICogdGhlIGVsZW1lbnQocykgdGhhdCBtYXRjaGVzIHRoZSBDU1MgYHNlbGVjdG9yYCBnaXZlbi5cbiAqXG4gKiBgRE9NU291cmNlLmV2ZW50cyhldmVudFR5cGUsIG9wdGlvbnMpYCByZXR1cm5zIGEgc3RyZWFtIG9mIGV2ZW50cyBvZlxuICogYGV2ZW50VHlwZWAgaGFwcGVuaW5nIG9uIHRoZSBlbGVtZW50cyB0aGF0IG1hdGNoIHRoZSBjdXJyZW50IERPTVNvdXJjZS4gVGhlXG4gKiBldmVudCBvYmplY3QgY29udGFpbnMgdGhlIGBvd25lclRhcmdldGAgcHJvcGVydHkgdGhhdCBiZWhhdmVzIGV4YWN0bHkgbGlrZVxuICogYGN1cnJlbnRUYXJnZXRgLiBUaGUgcmVhc29uIGZvciB0aGlzIGlzIHRoYXQgc29tZSBicm93c2VycyBkb2Vzbid0IGFsbG93XG4gKiBgY3VycmVudFRhcmdldGAgcHJvcGVydHkgdG8gYmUgbXV0YXRlZCwgaGVuY2UgYSBuZXcgcHJvcGVydHkgaXMgY3JlYXRlZC4gVGhlXG4gKiByZXR1cm5lZCBzdHJlYW0gaXMgYW4gKnhzdHJlYW0qIFN0cmVhbSBpZiB5b3UgdXNlIGBAY3ljbGUveHN0cmVhbS1ydW5gIHRvIHJ1blxuICogeW91ciBhcHAgd2l0aCB0aGlzIGRyaXZlciwgb3IgaXQgaXMgYW4gUnhKUyBPYnNlcnZhYmxlIGlmIHlvdSB1c2VcbiAqIGBAY3ljbGUvcnhqcy1ydW5gLCBhbmQgc28gZm9ydGguIFRoZSBgb3B0aW9uc2AgcGFyYW1ldGVyIGNhbiBoYXZlIHRoZVxuICogcHJvcGVydHkgYHVzZUNhcHR1cmVgLCB3aGljaCBpcyBieSBkZWZhdWx0IGBmYWxzZWAsIGV4Y2VwdCBpdCBpcyBgdHJ1ZWAgZm9yXG4gKiBldmVudCB0eXBlcyB0aGF0IGRvIG5vdCBidWJibGUuIFJlYWQgbW9yZSBoZXJlXG4gKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRXZlbnRUYXJnZXQvYWRkRXZlbnRMaXN0ZW5lclxuICogYWJvdXQgdGhlIGB1c2VDYXB0dXJlYCBhbmQgaXRzIHB1cnBvc2UuXG4gKlxuICogYERPTVNvdXJjZS5lbGVtZW50cygpYCByZXR1cm5zIGEgc3RyZWFtIG9mIHRoZSBET00gZWxlbWVudChzKSBtYXRjaGVkIGJ5IHRoZVxuICogc2VsZWN0b3JzIGluIHRoZSBET01Tb3VyY2UuIEFsc28sIGBET01Tb3VyY2Uuc2VsZWN0KCc6cm9vdCcpLmVsZW1lbnRzKClgXG4gKiByZXR1cm5zIGEgc3RyZWFtIG9mIERPTSBlbGVtZW50IGNvcnJlc3BvbmRpbmcgdG8gdGhlIHJvb3QgKG9yIGNvbnRhaW5lcikgb2ZcbiAqIHRoZSBhcHAgb24gdGhlIERPTS5cbiAqXG4gKiBAcGFyYW0geyhTdHJpbmd8SFRNTEVsZW1lbnQpfSBjb250YWluZXIgdGhlIERPTSBzZWxlY3RvciBmb3IgdGhlIGVsZW1lbnRcbiAqIChvciB0aGUgZWxlbWVudCBpdHNlbGYpIHRvIGNvbnRhaW4gdGhlIHJlbmRlcmluZyBvZiB0aGUgVlRyZWVzLlxuICogQHBhcmFtIHtET01Ecml2ZXJPcHRpb25zfSBvcHRpb25zIGFuIG9iamVjdCB3aXRoIHR3byBvcHRpb25hbCBwcm9wZXJ0aWVzOlxuICpcbiAqICAgLSBgbW9kdWxlczogYXJyYXlgIG92ZXJyaWRlcyBgQGN5Y2xlL2RvbWAncyBkZWZhdWx0IFNuYWJiZG9tIG1vZHVsZXMgYXNcbiAqICAgICBhcyBkZWZpbmVkIGluIFtgc3JjL21vZHVsZXMudHNgXSguL3NyYy9tb2R1bGVzLnRzKS5cbiAqICAgLSBgdHJhbnNwb3NpdGlvbjogYm9vbGVhbmAgZW5hYmxlcy9kaXNhYmxlcyB0cmFuc3Bvc2l0aW9uIG9mIGlubmVyIHN0cmVhbXNcbiAqICAgICBpbiB0aGUgdmlydHVhbCBET00gdHJlZS5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSB0aGUgRE9NIGRyaXZlciBmdW5jdGlvbi4gVGhlIGZ1bmN0aW9uIGV4cGVjdHMgYSBzdHJlYW0gb2ZcbiAqIFZOb2RlIGFzIGlucHV0LCBhbmQgb3V0cHV0cyB0aGUgRE9NU291cmNlIG9iamVjdC5cbiAqIEBmdW5jdGlvbiBtYWtlRE9NRHJpdmVyXG4gKi9cbnZhciBtYWtlRE9NRHJpdmVyXzEgPSByZXF1aXJlKCcuL21ha2VET01Ecml2ZXInKTtcbmV4cG9ydHMubWFrZURPTURyaXZlciA9IG1ha2VET01Ecml2ZXJfMS5tYWtlRE9NRHJpdmVyO1xuLyoqXG4gKiBBIGZhY3RvcnkgZm9yIHRoZSBIVE1MIGRyaXZlciBmdW5jdGlvbi5cbiAqXG4gKiBUYWtlcyBhbiBgZWZmZWN0YCBjYWxsYmFjayBmdW5jdGlvbiBhbmQgYW4gYG9wdGlvbnNgIG9iamVjdCBhcyBhcmd1bWVudHMuIFRoZVxuICogaW5wdXQgdG8gdGhpcyBkcml2ZXIgaXMgYSBzdHJlYW0gb2YgdmlydHVhbCBET00gb2JqZWN0cywgb3IgaW4gb3RoZXIgd29yZHMsXG4gKiBTbmFiYmRvbSBcIlZOb2RlXCIgb2JqZWN0cy4gVGhlIG91dHB1dCBvZiB0aGlzIGRyaXZlciBpcyBhIFwiRE9NU291cmNlXCI6IGFcbiAqIGNvbGxlY3Rpb24gb2YgT2JzZXJ2YWJsZXMgcXVlcmllZCB3aXRoIHRoZSBtZXRob2RzIGBzZWxlY3QoKWAgYW5kIGBldmVudHMoKWAuXG4gKlxuICogVGhlIEhUTUwgRHJpdmVyIGlzIHN1cHBsZW1lbnRhcnkgdG8gdGhlIERPTSBEcml2ZXIuIEluc3RlYWQgb2YgcHJvZHVjaW5nXG4gKiBlbGVtZW50cyBvbiB0aGUgRE9NLCBpdCBnZW5lcmF0ZXMgSFRNTCBhcyBzdHJpbmdzIGFuZCBkb2VzIGEgc2lkZSBlZmZlY3Qgb25cbiAqIHRob3NlIEhUTUwgc3RyaW5ncy4gVGhhdCBzaWRlIGVmZmVjdCBpcyBkZXNjcmliZWQgYnkgdGhlIGBlZmZlY3RgIGNhbGxiYWNrXG4gKiBmdW5jdGlvbi4gU28sIGlmIHlvdSB3YW50IHRvIHVzZSB0aGUgSFRNTCBEcml2ZXIgb24gdGhlIHNlcnZlci1zaWRlIHRvIHJlbmRlclxuICogeW91ciBhcHBsaWNhdGlvbiBhcyBIVE1MIGFuZCBzZW5kIGFzIGEgcmVzcG9uc2UgKHdoaWNoIGlzIHRoZSB0eXBpY2FsIHVzZVxuICogY2FzZSBmb3IgdGhlIEhUTUwgRHJpdmVyKSwgeW91IG5lZWQgdG8gcGFzcyBzb21ldGhpbmcgbGlrZSB0aGVcbiAqIGBodG1sID0+IHJlc3BvbnNlLnNlbmQoaHRtbClgIGZ1bmN0aW9uIGFzIHRoZSBgZWZmZWN0YCBhcmd1bWVudC4gVGhpcyB3YXksXG4gKiB0aGUgZHJpdmVyIGtub3dzIHdoYXQgc2lkZSBlZmZlY3QgdG8gY2F1c2UgYmFzZWQgb24gdGhlIEhUTUwgc3RyaW5nIGl0IGp1c3RcbiAqIHJlbmRlcmVkLlxuICpcbiAqIFRoZSBIVE1MIGRyaXZlciBpcyB1c2VmdWwgb25seSBmb3IgdGhhdCBzaWRlIGVmZmVjdCBpbiB0aGUgYGVmZmVjdGAgY2FsbGJhY2suXG4gKiBJdCBjYW4gYmUgY29uc2lkZXJlZCBhIHNpbmstb25seSBkcml2ZXIuIEhvd2V2ZXIsIGluIG9yZGVyIHRvIHNlcnZlIGFzIGFcbiAqIHRyYW5zcGFyZW50IHJlcGxhY2VtZW50IHRvIHRoZSBET00gRHJpdmVyIHdoZW4gcmVuZGVyaW5nIGZyb20gdGhlIHNlcnZlciwgdGhlXG4gKiBIVE1MIGRyaXZlciByZXR1cm5zIGEgc291cmNlIG9iamVjdCB0aGF0IGJlaGF2ZXMganVzdCBsaWtlIHRoZSBET01Tb3VyY2UuXG4gKiBUaGlzIGhlbHBzIHJldXNlIHRoZSBzYW1lIGFwcGxpY2F0aW9uIHRoYXQgaXMgd3JpdHRlbiBmb3IgdGhlIERPTSBEcml2ZXIuXG4gKiBUaGlzIGZha2UgRE9NU291cmNlIHJldHVybnMgZW1wdHkgc3RyZWFtcyB3aGVuIHlvdSBxdWVyeSBpdCwgYmVjYXVzZSB0aGVyZVxuICogYXJlIG5vIHVzZXIgZXZlbnRzIG9uIHRoZSBzZXJ2ZXIuXG4gKlxuICogYERPTVNvdXJjZS5zZWxlY3Qoc2VsZWN0b3IpYCByZXR1cm5zIGEgbmV3IERPTVNvdXJjZSB3aXRoIHNjb3BlIHJlc3RyaWN0ZWQgdG9cbiAqIHRoZSBlbGVtZW50KHMpIHRoYXQgbWF0Y2hlcyB0aGUgQ1NTIGBzZWxlY3RvcmAgZ2l2ZW4uXG4gKlxuICogYERPTVNvdXJjZS5ldmVudHMoZXZlbnRUeXBlLCBvcHRpb25zKWAgcmV0dXJucyBhbiBlbXB0eSBzdHJlYW0uIFRoZSByZXR1cm5lZFxuICogc3RyZWFtIGlzIGFuICp4c3RyZWFtKiBTdHJlYW0gaWYgeW91IHVzZSBgQGN5Y2xlL3hzdHJlYW0tcnVuYCB0byBydW4geW91ciBhcHBcbiAqIHdpdGggdGhpcyBkcml2ZXIsIG9yIGl0IGlzIGFuIFJ4SlMgT2JzZXJ2YWJsZSBpZiB5b3UgdXNlIGBAY3ljbGUvcnhqcy1ydW5gLFxuICogYW5kIHNvIGZvcnRoLlxuICpcbiAqIGBET01Tb3VyY2UuZWxlbWVudHMoKWAgcmV0dXJucyB0aGUgc3RyZWFtIG9mIEhUTUwgc3RyaW5nIHJlbmRlcmVkIGZyb20geW91clxuICogc2luayB2aXJ0dWFsIERPTSBzdHJlYW0uXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZWZmZWN0IGEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHN0cmluZyBvZiByZW5kZXJlZFxuICogSFRNTCBhcyBpbnB1dCBhbmQgc2hvdWxkIHJ1biBhIHNpZGUgZWZmZWN0LCByZXR1cm5pbmcgbm90aGluZy5cbiAqIEBwYXJhbSB7SFRNTERyaXZlck9wdGlvbnN9IG9wdGlvbnMgYW4gb2JqZWN0IHdpdGggb25lIG9wdGlvbmFsIHByb3BlcnR5OlxuICogYHRyYW5zcG9zaXRpb246IGJvb2xlYW5gIGVuYWJsZXMvZGlzYWJsZXMgdHJhbnNwb3NpdGlvbiBvZiBpbm5lciBzdHJlYW1zIGluXG4gKiB0aGUgdmlydHVhbCBET00gdHJlZS5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSB0aGUgSFRNTCBkcml2ZXIgZnVuY3Rpb24uIFRoZSBmdW5jdGlvbiBleHBlY3RzIGEgc3RyZWFtIG9mXG4gKiBWTm9kZSBhcyBpbnB1dCwgYW5kIG91dHB1dHMgdGhlIERPTVNvdXJjZSBvYmplY3QuXG4gKiBAZnVuY3Rpb24gbWFrZUhUTUxEcml2ZXJcbiAqL1xudmFyIG1ha2VIVE1MRHJpdmVyXzEgPSByZXF1aXJlKCcuL21ha2VIVE1MRHJpdmVyJyk7XG5leHBvcnRzLm1ha2VIVE1MRHJpdmVyID0gbWFrZUhUTUxEcml2ZXJfMS5tYWtlSFRNTERyaXZlcjtcbi8qKlxuICogQSBmYWN0b3J5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBtb2NrZWQgRE9NU291cmNlIG9iamVjdHMsIGZvciB0ZXN0aW5nIHB1cnBvc2VzLlxuICpcbiAqIFRha2VzIGEgYHN0cmVhbUFkYXB0ZXJgIGFuZCBhIGBtb2NrQ29uZmlnYCBvYmplY3QgYXMgYXJndW1lbnRzLCBhbmQgcmV0dXJuc1xuICogYSBET01Tb3VyY2UgdGhhdCBjYW4gYmUgZ2l2ZW4gdG8gYW55IEN5Y2xlLmpzIGFwcCB0aGF0IGV4cGVjdHMgYSBET01Tb3VyY2UgaW5cbiAqIHRoZSBzb3VyY2VzLCBmb3IgdGVzdGluZy5cbiAqXG4gKiBUaGUgYHN0cmVhbUFkYXB0ZXJgIHBhcmFtZXRlciBpcyBhIHBhY2thZ2Ugc3VjaCBhcyBgQGN5Y2xlL3hzdHJlYW0tYWRhcHRlcmAsXG4gKiBgQGN5Y2xlL3J4anMtYWRhcHRlcmAsIGV0Yy4gSW1wb3J0IGl0IGFzIGBpbXBvcnQgYSBmcm9tICdAY3ljbGUvcngtYWRhcHRlcmAsXG4gKiB0aGVuIHByb3ZpZGUgaXQgdG8gYG1vY2tET01Tb3VyY2UuIFRoaXMgaXMgaW1wb3J0YW50IHNvIHRoZSBET01Tb3VyY2UgY3JlYXRlZFxuICoga25vd3Mgd2hpY2ggc3RyZWFtIGxpYnJhcnkgc2hvdWxkIGl0IHVzZSB0byBleHBvcnQgaXRzIHN0cmVhbXMgd2hlbiB5b3UgY2FsbFxuICogYERPTVNvdXJjZS5ldmVudHMoKWAgZm9yIGluc3RhbmNlLlxuICpcbiAqIFRoZSBgbW9ja0NvbmZpZ2AgcGFyYW1ldGVyIGlzIGFuIG9iamVjdCBzcGVjaWZ5aW5nIHNlbGVjdG9ycywgZXZlbnRUeXBlcyBhbmRcbiAqIHRoZWlyIHN0cmVhbXMuIEV4YW1wbGU6XG4gKlxuICogYGBganNcbiAqIGNvbnN0IGRvbVNvdXJjZSA9IG1vY2tET01Tb3VyY2UoUnhBZGFwdGVyLCB7XG4gKiAgICcuZm9vJzoge1xuICogICAgICdjbGljayc6IFJ4Lk9ic2VydmFibGUub2Yoe3RhcmdldDoge319KSxcbiAqICAgICAnbW91c2VvdmVyJzogUnguT2JzZXJ2YWJsZS5vZih7dGFyZ2V0OiB7fX0pLFxuICogICB9LFxuICogICAnLmJhcic6IHtcbiAqICAgICAnc2Nyb2xsJzogUnguT2JzZXJ2YWJsZS5vZih7dGFyZ2V0OiB7fX0pLFxuICogICAgIGVsZW1lbnRzOiBSeC5PYnNlcnZhYmxlLm9mKHt0YWdOYW1lOiAnZGl2J30pLFxuICogICB9XG4gKiB9KTtcbiAqXG4gKiAvLyBVc2FnZVxuICogY29uc3QgY2xpY2skID0gZG9tU291cmNlLnNlbGVjdCgnLmZvbycpLmV2ZW50cygnY2xpY2snKTtcbiAqIGNvbnN0IGVsZW1lbnQkID0gZG9tU291cmNlLnNlbGVjdCgnLmJhcicpLmVsZW1lbnRzKCk7XG4gKiBgYGBcbiAqXG4gKiBUaGUgbW9ja2VkIERPTSBTb3VyY2Ugc3VwcG9ydHMgaXNvbGF0aW9uLiBJdCBoYXMgdGhlIGZ1bmN0aW9ucyBgaXNvbGF0ZVNpbmtgXG4gKiBhbmQgYGlzb2xhdGVTb3VyY2VgIGF0dGFjaGVkIHRvIGl0LCBhbmQgcGVyZm9ybXMgc2ltcGxlIGlzb2xhdGlvbiB1c2luZ1xuICogY2xhc3NOYW1lcy4gKmlzb2xhdGVTaW5rKiB3aXRoIHNjb3BlIGBmb29gIHdpbGwgYXBwZW5kIHRoZSBjbGFzcyBgX19fZm9vYCB0b1xuICogdGhlIHN0cmVhbSBvZiB2aXJ0dWFsIERPTSBub2RlcywgYW5kICppc29sYXRlU291cmNlKiB3aXRoIHNjb3BlIGBmb29gIHdpbGxcbiAqIHBlcmZvcm0gYSBjb252ZW50aW9uYWwgYG1vY2tlZERPTVNvdXJjZS5zZWxlY3QoJy5fX2ZvbycpYCBjYWxsLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBtb2NrQ29uZmlnIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSBzZWxlY3RvciBzdHJpbmdzXG4gKiBhbmQgdmFsdWVzIGFyZSBvYmplY3RzLiBUaG9zZSBuZXN0ZWQgb2JqZWN0cyBoYXZlIGBldmVudFR5cGVgIHN0cmluZ3MgYXMga2V5c1xuICogYW5kIHZhbHVlcyBhcmUgc3RyZWFtcyB5b3UgY3JlYXRlZC5cbiAqIEByZXR1cm4ge09iamVjdH0gZmFrZSBET00gc291cmNlIG9iamVjdCwgd2l0aCBhbiBBUEkgY29udGFpbmluZyBgc2VsZWN0KClgXG4gKiBhbmQgYGV2ZW50cygpYCBhbmQgYGVsZW1lbnRzKClgIHdoaWNoIGNhbiBiZSB1c2VkIGp1c3QgbGlrZSB0aGUgRE9NIERyaXZlcidzXG4gKiBET01Tb3VyY2UuXG4gKlxuICogQGZ1bmN0aW9uIG1vY2tET01Tb3VyY2VcbiAqL1xudmFyIG1vY2tET01Tb3VyY2VfMSA9IHJlcXVpcmUoJy4vbW9ja0RPTVNvdXJjZScpO1xuZXhwb3J0cy5tb2NrRE9NU291cmNlID0gbW9ja0RPTVNvdXJjZV8xLm1vY2tET01Tb3VyY2U7XG4vKipcbiAqIFRoZSBoeXBlcnNjcmlwdCBmdW5jdGlvbiBgaCgpYCBpcyBhIGZ1bmN0aW9uIHRvIGNyZWF0ZSB2aXJ0dWFsIERPTSBvYmplY3RzLFxuICogYWxzbyBrbm93biBhcyBWTm9kZXMuIENhbGxcbiAqXG4gKiBgYGBqc1xuICogaCgnZGl2Lm15Q2xhc3MnLCB7c3R5bGU6IHtjb2xvcjogJ3JlZCd9fSwgW10pXG4gKiBgYGBcbiAqXG4gKiB0byBjcmVhdGUgYSBWTm9kZSB0aGF0IHJlcHJlc2VudHMgYSBgRElWYCBlbGVtZW50IHdpdGggY2xhc3NOYW1lIGBteUNsYXNzYCxcbiAqIHN0eWxlZCB3aXRoIHJlZCBjb2xvciwgYW5kIG5vIGNoaWxkcmVuIGJlY2F1c2UgdGhlIGBbXWAgYXJyYXkgd2FzIHBhc3NlZC4gVGhlXG4gKiBBUEkgaXMgYGgodGFnT3JTZWxlY3Rvciwgb3B0aW9uYWxEYXRhLCBvcHRpb25hbENoaWxkcmVuT3JUZXh0KWAuXG4gKlxuICogSG93ZXZlciwgdXN1YWxseSB5b3Ugc2hvdWxkIHVzZSBcImh5cGVyc2NyaXB0IGhlbHBlcnNcIiwgd2hpY2ggYXJlIHNob3J0Y3V0XG4gKiBmdW5jdGlvbnMgYmFzZWQgb24gaHlwZXJzY3JpcHQuIFRoZXJlIGlzIG9uZSBoeXBlcnNjcmlwdCBoZWxwZXIgZnVuY3Rpb24gZm9yXG4gKiBlYWNoIERPTSB0YWdOYW1lLCBzdWNoIGFzIGBoMSgpYCwgYGgyKClgLCBgZGl2KClgLCBgc3BhbigpYCwgYGxhYmVsKClgLFxuICogYGlucHV0KClgLiBGb3IgaW5zdGFuY2UsIHRoZSBwcmV2aW91cyBleGFtcGxlIGNvdWxkIGhhdmUgYmVlbiB3cml0dGVuXG4gKiBhczpcbiAqXG4gKiBgYGBqc1xuICogZGl2KCcubXlDbGFzcycsIHtzdHlsZToge2NvbG9yOiAncmVkJ319LCBbXSlcbiAqIGBgYFxuICpcbiAqIFRoZXJlIGFyZSBhbHNvIFNWRyBoZWxwZXIgZnVuY3Rpb25zLCB3aGljaCBhcHBseSB0aGUgYXBwcm9wcmlhdGUgU1ZHXG4gKiBuYW1lc3BhY2UgdG8gdGhlIHJlc3VsdGluZyBlbGVtZW50cy4gYHN2ZygpYCBmdW5jdGlvbiBjcmVhdGVzIHRoZSB0b3AtbW9zdFxuICogU1ZHIGVsZW1lbnQsIGFuZCBgc3ZnLmdgLCBgc3ZnLnBvbHlnb25gLCBgc3ZnLmNpcmNsZWAsIGBzdmcucGF0aGAgYXJlIGZvclxuICogU1ZHLXNwZWNpZmljIGNoaWxkIGVsZW1lbnRzLiBFeGFtcGxlOlxuICpcbiAqIGBgYGpzXG4gKiBzdmcoe3dpZHRoOiAxNTAsIGhlaWdodDogMTUwfSwgW1xuICogICBzdmcucG9seWdvbih7XG4gKiAgICAgYXR0cnM6IHtcbiAqICAgICAgIGNsYXNzOiAndHJpYW5nbGUnLFxuICogICAgICAgcG9pbnRzOiAnMjAgMCAyMCAxNTAgMTUwIDIwJ1xuICogICAgIH1cbiAqICAgfSlcbiAqIF0pXG4gKiBgYGBcbiAqXG4gKiBAZnVuY3Rpb24gaFxuICovXG52YXIgaHlwZXJzY3JpcHRfMSA9IHJlcXVpcmUoJy4vaHlwZXJzY3JpcHQnKTtcbmV4cG9ydHMuaCA9IGh5cGVyc2NyaXB0XzEuaDtcbnZhciBoeXBlcnNjcmlwdF9oZWxwZXJzXzEgPSByZXF1aXJlKCcuL2h5cGVyc2NyaXB0LWhlbHBlcnMnKTtcbmV4cG9ydHMuc3ZnID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuc3ZnO1xuZXhwb3J0cy5hID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYTtcbmV4cG9ydHMuYWJiciA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmFiYnI7XG5leHBvcnRzLmFkZHJlc3MgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5hZGRyZXNzO1xuZXhwb3J0cy5hcmVhID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYXJlYTtcbmV4cG9ydHMuYXJ0aWNsZSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmFydGljbGU7XG5leHBvcnRzLmFzaWRlID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYXNpZGU7XG5leHBvcnRzLmF1ZGlvID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYXVkaW87XG5leHBvcnRzLmIgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5iO1xuZXhwb3J0cy5iYXNlID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYmFzZTtcbmV4cG9ydHMuYmRpID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYmRpO1xuZXhwb3J0cy5iZG8gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5iZG87XG5leHBvcnRzLmJsb2NrcXVvdGUgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5ibG9ja3F1b3RlO1xuZXhwb3J0cy5ib2R5ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYm9keTtcbmV4cG9ydHMuYnIgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5icjtcbmV4cG9ydHMuYnV0dG9uID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuYnV0dG9uO1xuZXhwb3J0cy5jYW52YXMgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5jYW52YXM7XG5leHBvcnRzLmNhcHRpb24gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5jYXB0aW9uO1xuZXhwb3J0cy5jaXRlID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuY2l0ZTtcbmV4cG9ydHMuY29kZSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmNvZGU7XG5leHBvcnRzLmNvbCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmNvbDtcbmV4cG9ydHMuY29sZ3JvdXAgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5jb2xncm91cDtcbmV4cG9ydHMuZGQgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5kZDtcbmV4cG9ydHMuZGVsID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuZGVsO1xuZXhwb3J0cy5kZm4gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5kZm47XG5leHBvcnRzLmRpciA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmRpcjtcbmV4cG9ydHMuZGl2ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuZGl2O1xuZXhwb3J0cy5kbCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmRsO1xuZXhwb3J0cy5kdCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmR0O1xuZXhwb3J0cy5lbSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmVtO1xuZXhwb3J0cy5lbWJlZCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmVtYmVkO1xuZXhwb3J0cy5maWVsZHNldCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmZpZWxkc2V0O1xuZXhwb3J0cy5maWdjYXB0aW9uID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuZmlnY2FwdGlvbjtcbmV4cG9ydHMuZmlndXJlID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuZmlndXJlO1xuZXhwb3J0cy5mb290ZXIgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5mb290ZXI7XG5leHBvcnRzLmZvcm0gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5mb3JtO1xuZXhwb3J0cy5oMSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmgxO1xuZXhwb3J0cy5oMiA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmgyO1xuZXhwb3J0cy5oMyA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmgzO1xuZXhwb3J0cy5oNCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lmg0O1xuZXhwb3J0cy5oNSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lmg1O1xuZXhwb3J0cy5oNiA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lmg2O1xuZXhwb3J0cy5oZWFkID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuaGVhZDtcbmV4cG9ydHMuaGVhZGVyID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuaGVhZGVyO1xuZXhwb3J0cy5oZ3JvdXAgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5oZ3JvdXA7XG5leHBvcnRzLmhyID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuaHI7XG5leHBvcnRzLmh0bWwgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5odG1sO1xuZXhwb3J0cy5pID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuaTtcbmV4cG9ydHMuaWZyYW1lID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuaWZyYW1lO1xuZXhwb3J0cy5pbWcgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5pbWc7XG5leHBvcnRzLmlucHV0ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuaW5wdXQ7XG5leHBvcnRzLmlucyA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmlucztcbmV4cG9ydHMua2JkID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQua2JkO1xuZXhwb3J0cy5rZXlnZW4gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5rZXlnZW47XG5leHBvcnRzLmxhYmVsID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQubGFiZWw7XG5leHBvcnRzLmxlZ2VuZCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LmxlZ2VuZDtcbmV4cG9ydHMubGkgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5saTtcbmV4cG9ydHMubGluayA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lmxpbms7XG5leHBvcnRzLm1haW4gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5tYWluO1xuZXhwb3J0cy5tYXAgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5tYXA7XG5leHBvcnRzLm1hcmsgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5tYXJrO1xuZXhwb3J0cy5tZW51ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQubWVudTtcbmV4cG9ydHMubWV0YSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lm1ldGE7XG5leHBvcnRzLm5hdiA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lm5hdjtcbmV4cG9ydHMubm9zY3JpcHQgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5ub3NjcmlwdDtcbmV4cG9ydHMub2JqZWN0ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQub2JqZWN0O1xuZXhwb3J0cy5vbCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lm9sO1xuZXhwb3J0cy5vcHRncm91cCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0Lm9wdGdyb3VwO1xuZXhwb3J0cy5vcHRpb24gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5vcHRpb247XG5leHBvcnRzLnAgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5wO1xuZXhwb3J0cy5wYXJhbSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnBhcmFtO1xuZXhwb3J0cy5wcmUgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5wcmU7XG5leHBvcnRzLnByb2dyZXNzID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQucHJvZ3Jlc3M7XG5leHBvcnRzLnEgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5xO1xuZXhwb3J0cy5ycCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnJwO1xuZXhwb3J0cy5ydCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnJ0O1xuZXhwb3J0cy5ydWJ5ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQucnVieTtcbmV4cG9ydHMucyA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnM7XG5leHBvcnRzLnNhbXAgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5zYW1wO1xuZXhwb3J0cy5zY3JpcHQgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5zY3JpcHQ7XG5leHBvcnRzLnNlY3Rpb24gPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5zZWN0aW9uO1xuZXhwb3J0cy5zZWxlY3QgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5zZWxlY3Q7XG5leHBvcnRzLnNtYWxsID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuc21hbGw7XG5leHBvcnRzLnNvdXJjZSA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnNvdXJjZTtcbmV4cG9ydHMuc3BhbiA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnNwYW47XG5leHBvcnRzLnN0cm9uZyA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnN0cm9uZztcbmV4cG9ydHMuc3R5bGUgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5zdHlsZTtcbmV4cG9ydHMuc3ViID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQuc3ViO1xuZXhwb3J0cy5zdXAgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC5zdXA7XG5leHBvcnRzLnRhYmxlID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGFibGU7XG5leHBvcnRzLnRib2R5ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGJvZHk7XG5leHBvcnRzLnRkID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGQ7XG5leHBvcnRzLnRleHRhcmVhID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGV4dGFyZWE7XG5leHBvcnRzLnRmb290ID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGZvb3Q7XG5leHBvcnRzLnRoID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGg7XG5leHBvcnRzLnRoZWFkID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGhlYWQ7XG5leHBvcnRzLnRpdGxlID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudGl0bGU7XG5leHBvcnRzLnRyID0gaHlwZXJzY3JpcHRfaGVscGVyc18xLmRlZmF1bHQudHI7XG5leHBvcnRzLnUgPSBoeXBlcnNjcmlwdF9oZWxwZXJzXzEuZGVmYXVsdC51O1xuZXhwb3J0cy51bCA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnVsO1xuZXhwb3J0cy52aWRlbyA9IGh5cGVyc2NyaXB0X2hlbHBlcnNfMS5kZWZhdWx0LnZpZGVvO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgdXRpbHNfMSA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbmZ1bmN0aW9uIGlzb2xhdGVTb3VyY2Uoc291cmNlLCBzY29wZSkge1xuICAgIHJldHVybiBzb3VyY2Uuc2VsZWN0KHV0aWxzXzEuU0NPUEVfUFJFRklYICsgc2NvcGUpO1xufVxuZXhwb3J0cy5pc29sYXRlU291cmNlID0gaXNvbGF0ZVNvdXJjZTtcbmZ1bmN0aW9uIGlzb2xhdGVTaW5rKHNpbmssIHNjb3BlKSB7XG4gICAgcmV0dXJuIHNpbmsubWFwKGZ1bmN0aW9uICh2VHJlZSkge1xuICAgICAgICBpZiAodlRyZWUuZGF0YSAmJiB2VHJlZS5kYXRhLmlzb2xhdGUpIHtcbiAgICAgICAgICAgIHZhciBleGlzdGluZ1Njb3BlID0gdlRyZWUuZGF0YS5pc29sYXRlLnJlcGxhY2UoLyhjeWNsZXxcXC0pL2csICcnKTtcbiAgICAgICAgICAgIHZhciBfc2NvcGUgPSBzY29wZS5yZXBsYWNlKC8oY3ljbGV8XFwtKS9nLCAnJyk7XG4gICAgICAgICAgICBpZiAoaXNOYU4ocGFyc2VJbnQoZXhpc3RpbmdTY29wZSkpXG4gICAgICAgICAgICAgICAgfHwgaXNOYU4ocGFyc2VJbnQoX3Njb3BlKSlcbiAgICAgICAgICAgICAgICB8fCBleGlzdGluZ1Njb3BlID4gX3Njb3BlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZUcmVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZUcmVlLmRhdGEgPSB2VHJlZS5kYXRhIHx8IHt9O1xuICAgICAgICB2VHJlZS5kYXRhLmlzb2xhdGUgPSBzY29wZTtcbiAgICAgICAgaWYgKHR5cGVvZiB2VHJlZS5rZXkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB2VHJlZS5rZXkgPSB1dGlsc18xLlNDT1BFX1BSRUZJWCArIHNjb3BlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2VHJlZTtcbiAgICB9KTtcbn1cbmV4cG9ydHMuaXNvbGF0ZVNpbmsgPSBpc29sYXRlU2luaztcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWlzb2xhdGUuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgTWFwUG9seWZpbGwgPSByZXF1aXJlKCdlczYtbWFwJyk7XG52YXIgSXNvbGF0ZU1vZHVsZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gSXNvbGF0ZU1vZHVsZShpc29sYXRlZEVsZW1lbnRzKSB7XG4gICAgICAgIHRoaXMuaXNvbGF0ZWRFbGVtZW50cyA9IGlzb2xhdGVkRWxlbWVudHM7XG4gICAgICAgIHRoaXMuZXZlbnREZWxlZ2F0b3JzID0gbmV3IE1hcFBvbHlmaWxsKCk7XG4gICAgfVxuICAgIElzb2xhdGVNb2R1bGUucHJvdG90eXBlLnNldFNjb3BlID0gZnVuY3Rpb24gKGVsbSwgc2NvcGUpIHtcbiAgICAgICAgdGhpcy5pc29sYXRlZEVsZW1lbnRzLnNldChzY29wZSwgZWxtKTtcbiAgICB9O1xuICAgIElzb2xhdGVNb2R1bGUucHJvdG90eXBlLnJlbW92ZVNjb3BlID0gZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHRoaXMuaXNvbGF0ZWRFbGVtZW50cy5kZWxldGUoc2NvcGUpO1xuICAgIH07XG4gICAgSXNvbGF0ZU1vZHVsZS5wcm90b3R5cGUuY2xlYW51cFZOb2RlID0gZnVuY3Rpb24gKF9hKSB7XG4gICAgICAgIHZhciBkYXRhID0gX2EuZGF0YSwgZWxtID0gX2EuZWxtO1xuICAgICAgICBkYXRhID0gZGF0YSB8fCB7fTtcbiAgICAgICAgdmFyIHNjb3BlID0gZGF0YS5pc29sYXRlIHx8ICcnO1xuICAgICAgICB2YXIgaXNDdXJyZW50RWxtID0gdGhpcy5pc29sYXRlZEVsZW1lbnRzLmdldChzY29wZSkgPT09IGVsbTtcbiAgICAgICAgaWYgKHNjb3BlICYmIGlzQ3VycmVudEVsbSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVTY29wZShzY29wZSk7XG4gICAgICAgICAgICBpZiAodGhpcy5ldmVudERlbGVnYXRvcnMuZ2V0KHNjb3BlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnREZWxlZ2F0b3JzLnNldChzY29wZSwgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBJc29sYXRlTW9kdWxlLnByb3RvdHlwZS5nZXRJc29sYXRlZEVsZW1lbnQgPSBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNvbGF0ZWRFbGVtZW50cy5nZXQoc2NvcGUpO1xuICAgIH07XG4gICAgSXNvbGF0ZU1vZHVsZS5wcm90b3R5cGUuaXNJc29sYXRlZEVsZW1lbnQgPSBmdW5jdGlvbiAoZWxtKSB7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IHRoaXMuaXNvbGF0ZWRFbGVtZW50cy5lbnRyaWVzKCk7XG4gICAgICAgIGZvciAodmFyIHJlc3VsdCA9IGl0ZXJhdG9yLm5leHQoKTsgISFyZXN1bHQudmFsdWU7IHJlc3VsdCA9IGl0ZXJhdG9yLm5leHQoKSkge1xuICAgICAgICAgICAgdmFyIF9hID0gcmVzdWx0LnZhbHVlLCBzY29wZSA9IF9hWzBdLCBlbGVtZW50ID0gX2FbMV07XG4gICAgICAgICAgICBpZiAoZWxtID09PSBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIElzb2xhdGVNb2R1bGUucHJvdG90eXBlLmFkZEV2ZW50RGVsZWdhdG9yID0gZnVuY3Rpb24gKHNjb3BlLCBldmVudERlbGVnYXRvcikge1xuICAgICAgICB2YXIgZGVsZWdhdG9ycyA9IHRoaXMuZXZlbnREZWxlZ2F0b3JzLmdldChzY29wZSk7XG4gICAgICAgIGlmICghZGVsZWdhdG9ycykge1xuICAgICAgICAgICAgZGVsZWdhdG9ycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5ldmVudERlbGVnYXRvcnMuc2V0KHNjb3BlLCBkZWxlZ2F0b3JzKTtcbiAgICAgICAgfVxuICAgICAgICBkZWxlZ2F0b3JzW2RlbGVnYXRvcnMubGVuZ3RoXSA9IGV2ZW50RGVsZWdhdG9yO1xuICAgIH07XG4gICAgSXNvbGF0ZU1vZHVsZS5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaXNvbGF0ZWRFbGVtZW50cy5jbGVhcigpO1xuICAgIH07XG4gICAgSXNvbGF0ZU1vZHVsZS5wcm90b3R5cGUuY3JlYXRlTW9kdWxlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjcmVhdGU6IGZ1bmN0aW9uIChvbGRWTm9kZSwgdk5vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgX2EgPSBvbGRWTm9kZS5kYXRhLCBvbGREYXRhID0gX2EgPT09IHZvaWQgMCA/IHt9IDogX2E7XG4gICAgICAgICAgICAgICAgdmFyIGVsbSA9IHZOb2RlLmVsbSwgX2IgPSB2Tm9kZS5kYXRhLCBkYXRhID0gX2IgPT09IHZvaWQgMCA/IHt9IDogX2I7XG4gICAgICAgICAgICAgICAgdmFyIG9sZFNjb3BlID0gb2xkRGF0YS5pc29sYXRlIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgdmFyIHNjb3BlID0gZGF0YS5pc29sYXRlIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvbGRTY29wZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZW1vdmVTY29wZShvbGRTY29wZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXRTY29wZShlbG0sIHNjb3BlKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlbGVnYXRvcnMgPSBzZWxmLmV2ZW50RGVsZWdhdG9ycy5nZXQoc2NvcGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVsZWdhdG9ycykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGRlbGVnYXRvcnMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0b3JzW2ldLnVwZGF0ZVRvcEVsZW1lbnQoZWxtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChkZWxlZ2F0b3JzID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuZXZlbnREZWxlZ2F0b3JzLnNldChzY29wZSwgW10pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChvbGRTY29wZSAmJiAhc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5yZW1vdmVTY29wZShzY29wZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKG9sZFZOb2RlLCB2Tm9kZSkge1xuICAgICAgICAgICAgICAgIHZhciBfYSA9IG9sZFZOb2RlLmRhdGEsIG9sZERhdGEgPSBfYSA9PT0gdm9pZCAwID8ge30gOiBfYTtcbiAgICAgICAgICAgICAgICB2YXIgZWxtID0gdk5vZGUuZWxtLCBfYiA9IHZOb2RlLmRhdGEsIGRhdGEgPSBfYiA9PT0gdm9pZCAwID8ge30gOiBfYjtcbiAgICAgICAgICAgICAgICB2YXIgb2xkU2NvcGUgPSBvbGREYXRhLmlzb2xhdGUgfHwgXCJcIjtcbiAgICAgICAgICAgICAgICB2YXIgc2NvcGUgPSBkYXRhLmlzb2xhdGUgfHwgXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAoc2NvcGUgJiYgc2NvcGUgIT09IG9sZFNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvbGRTY29wZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5yZW1vdmVTY29wZShvbGRTY29wZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXRTY29wZShlbG0sIHNjb3BlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG9sZFNjb3BlICYmICFzY29wZSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLnJlbW92ZVNjb3BlKHNjb3BlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmVtb3ZlOiBmdW5jdGlvbiAodk5vZGUsIGNiKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5jbGVhbnVwVk5vZGUodk5vZGUpO1xuICAgICAgICAgICAgICAgIGNiKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGVzdHJveTogZnVuY3Rpb24gKHZOb2RlKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5jbGVhbnVwVk5vZGUodk5vZGUpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9O1xuICAgIHJldHVybiBJc29sYXRlTW9kdWxlO1xufSgpKTtcbmV4cG9ydHMuSXNvbGF0ZU1vZHVsZSA9IElzb2xhdGVNb2R1bGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pc29sYXRlTW9kdWxlLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHNuYWJiZG9tXzEgPSByZXF1aXJlKCdzbmFiYmRvbScpO1xudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcbnZhciBNYWluRE9NU291cmNlXzEgPSByZXF1aXJlKCcuL01haW5ET01Tb3VyY2UnKTtcbnZhciBWTm9kZVdyYXBwZXJfMSA9IHJlcXVpcmUoJy4vVk5vZGVXcmFwcGVyJyk7XG52YXIgdXRpbHNfMSA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbnZhciBtb2R1bGVzXzEgPSByZXF1aXJlKCcuL21vZHVsZXMnKTtcbnZhciBpc29sYXRlTW9kdWxlXzEgPSByZXF1aXJlKCcuL2lzb2xhdGVNb2R1bGUnKTtcbnZhciB0cmFuc3Bvc2l0aW9uXzEgPSByZXF1aXJlKCcuL3RyYW5zcG9zaXRpb24nKTtcbnZhciB4c3RyZWFtX2FkYXB0ZXJfMSA9IHJlcXVpcmUoJ0BjeWNsZS94c3RyZWFtLWFkYXB0ZXInKTtcbnZhciBNYXBQb2x5ZmlsbCA9IHJlcXVpcmUoJ2VzNi1tYXAnKTtcbmZ1bmN0aW9uIG1ha2VET01Ecml2ZXJJbnB1dEd1YXJkKG1vZHVsZXMpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobW9kdWxlcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiT3B0aW9uYWwgbW9kdWxlcyBvcHRpb24gbXVzdCBiZSBcIiArXG4gICAgICAgICAgICBcImFuIGFycmF5IGZvciBzbmFiYmRvbSBtb2R1bGVzXCIpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGRvbURyaXZlcklucHV0R3VhcmQodmlldyQpIHtcbiAgICBpZiAoIXZpZXckXG4gICAgICAgIHx8IHR5cGVvZiB2aWV3JC5hZGRMaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiXG4gICAgICAgIHx8IHR5cGVvZiB2aWV3JC5mb2xkICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIERPTSBkcml2ZXIgZnVuY3Rpb24gZXhwZWN0cyBhcyBpbnB1dCBhIFN0cmVhbSBvZiBcIiArXG4gICAgICAgICAgICBcInZpcnR1YWwgRE9NIGVsZW1lbnRzXCIpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1ha2VET01Ecml2ZXIoY29udGFpbmVyLCBvcHRpb25zKSB7XG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG4gICAgdmFyIHRyYW5zcG9zaXRpb24gPSBvcHRpb25zLnRyYW5zcG9zaXRpb24gfHwgZmFsc2U7XG4gICAgdmFyIG1vZHVsZXMgPSBvcHRpb25zLm1vZHVsZXMgfHwgbW9kdWxlc18xLmRlZmF1bHQ7XG4gICAgdmFyIGlzb2xhdGVNb2R1bGUgPSBuZXcgaXNvbGF0ZU1vZHVsZV8xLklzb2xhdGVNb2R1bGUoKG5ldyBNYXBQb2x5ZmlsbCgpKSk7XG4gICAgdmFyIHBhdGNoID0gc25hYmJkb21fMS5pbml0KFtpc29sYXRlTW9kdWxlLmNyZWF0ZU1vZHVsZSgpXS5jb25jYXQobW9kdWxlcykpO1xuICAgIHZhciByb290RWxlbWVudCA9IHV0aWxzXzEuZ2V0RWxlbWVudChjb250YWluZXIpO1xuICAgIHZhciB2bm9kZVdyYXBwZXIgPSBuZXcgVk5vZGVXcmFwcGVyXzEuVk5vZGVXcmFwcGVyKHJvb3RFbGVtZW50KTtcbiAgICB2YXIgZGVsZWdhdG9ycyA9IG5ldyBNYXBQb2x5ZmlsbCgpO1xuICAgIG1ha2VET01Ecml2ZXJJbnB1dEd1YXJkKG1vZHVsZXMpO1xuICAgIGZ1bmN0aW9uIERPTURyaXZlcih2bm9kZSQsIHJ1blN0cmVhbUFkYXB0ZXIsIG5hbWUpIHtcbiAgICAgICAgZG9tRHJpdmVySW5wdXRHdWFyZCh2bm9kZSQpO1xuICAgICAgICB2YXIgdHJhbnNwb3NlVk5vZGUgPSB0cmFuc3Bvc2l0aW9uXzEubWFrZVRyYW5zcG9zZVZOb2RlKHJ1blN0cmVhbUFkYXB0ZXIpO1xuICAgICAgICB2YXIgcHJlcHJvY2Vzc2VkVk5vZGUkID0gKHRyYW5zcG9zaXRpb24gPyB2bm9kZSQubWFwKHRyYW5zcG9zZVZOb2RlKS5mbGF0dGVuKCkgOiB2bm9kZSQpO1xuICAgICAgICB2YXIgc2FuaXRhdGlvbiQgPSB4c3RyZWFtXzEuZGVmYXVsdC5jcmVhdGUoKTtcbiAgICAgICAgdmFyIHJvb3RFbGVtZW50JCA9IHhzdHJlYW1fMS5kZWZhdWx0Lm1lcmdlKHByZXByb2Nlc3NlZFZOb2RlJC5lbmRXaGVuKHNhbml0YXRpb24kKSwgc2FuaXRhdGlvbiQpXG4gICAgICAgICAgICAubWFwKGZ1bmN0aW9uICh2bm9kZSkgeyByZXR1cm4gdm5vZGVXcmFwcGVyLmNhbGwodm5vZGUpOyB9KVxuICAgICAgICAgICAgLmZvbGQocGF0Y2gsIHJvb3RFbGVtZW50KVxuICAgICAgICAgICAgLmRyb3AoMSlcbiAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24gdW53cmFwRWxlbWVudEZyb21WTm9kZSh2bm9kZSkgeyByZXR1cm4gdm5vZGUuZWxtOyB9KVxuICAgICAgICAgICAgLmNvbXBvc2UoZnVuY3Rpb24gKHN0cmVhbSkgeyByZXR1cm4geHN0cmVhbV8xLmRlZmF1bHQubWVyZ2Uoc3RyZWFtLCB4c3RyZWFtXzEuZGVmYXVsdC5uZXZlcigpKTsgfSkgLy8gZG9uJ3QgY29tcGxldGUgdGhpcyBzdHJlYW1cbiAgICAgICAgICAgIC5zdGFydFdpdGgocm9vdEVsZW1lbnQpO1xuICAgICAgICByb290RWxlbWVudCQuYWRkTGlzdGVuZXIoeyBuZXh0OiBmdW5jdGlvbiAoKSB7IH0sIGVycm9yOiBmdW5jdGlvbiAoKSB7IH0sIGNvbXBsZXRlOiBmdW5jdGlvbiAoKSB7IH0gfSk7XG4gICAgICAgIHJldHVybiBuZXcgTWFpbkRPTVNvdXJjZV8xLk1haW5ET01Tb3VyY2Uocm9vdEVsZW1lbnQkLCBzYW5pdGF0aW9uJCwgcnVuU3RyZWFtQWRhcHRlciwgW10sIGlzb2xhdGVNb2R1bGUsIGRlbGVnYXRvcnMsIG5hbWUpO1xuICAgIH1cbiAgICA7XG4gICAgRE9NRHJpdmVyLnN0cmVhbUFkYXB0ZXIgPSB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0O1xuICAgIHJldHVybiBET01Ecml2ZXI7XG59XG5leHBvcnRzLm1ha2VET01Ecml2ZXIgPSBtYWtlRE9NRHJpdmVyO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bWFrZURPTURyaXZlci5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbnZhciB4c3RyZWFtX2FkYXB0ZXJfMSA9IHJlcXVpcmUoJ0BjeWNsZS94c3RyZWFtLWFkYXB0ZXInKTtcbnZhciB0cmFuc3Bvc2l0aW9uXzEgPSByZXF1aXJlKCcuL3RyYW5zcG9zaXRpb24nKTtcbnZhciBIVE1MU291cmNlXzEgPSByZXF1aXJlKCcuL0hUTUxTb3VyY2UnKTtcbnZhciB0b0hUTUwgPSByZXF1aXJlKCdzbmFiYmRvbS10by1odG1sJyk7XG52YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHsgfTtcbmZ1bmN0aW9uIG1ha2VIVE1MRHJpdmVyKGVmZmVjdCwgb3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBvcHRpb25zID0ge307XG4gICAgfVxuICAgIHZhciB0cmFuc3Bvc2l0aW9uID0gb3B0aW9ucy50cmFuc3Bvc2l0aW9uIHx8IGZhbHNlO1xuICAgIGZ1bmN0aW9uIGh0bWxEcml2ZXIodm5vZGUkLCBydW5TdHJlYW1BZGFwdGVyLCBuYW1lKSB7XG4gICAgICAgIHZhciB0cmFuc3Bvc2VWTm9kZSA9IHRyYW5zcG9zaXRpb25fMS5tYWtlVHJhbnNwb3NlVk5vZGUocnVuU3RyZWFtQWRhcHRlcik7XG4gICAgICAgIHZhciBwcmVwcm9jZXNzZWRWTm9kZSQgPSAodHJhbnNwb3NpdGlvbiA/IHZub2RlJC5tYXAodHJhbnNwb3NlVk5vZGUpLmZsYXR0ZW4oKSA6IHZub2RlJCk7XG4gICAgICAgIHZhciBodG1sJCA9IHByZXByb2Nlc3NlZFZOb2RlJC5tYXAodG9IVE1MKTtcbiAgICAgICAgaHRtbCQuYWRkTGlzdGVuZXIoe1xuICAgICAgICAgICAgbmV4dDogZWZmZWN0IHx8IG5vb3AsXG4gICAgICAgICAgICBlcnJvcjogbm9vcCxcbiAgICAgICAgICAgIGNvbXBsZXRlOiBub29wLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG5ldyBIVE1MU291cmNlXzEuSFRNTFNvdXJjZShodG1sJCwgcnVuU3RyZWFtQWRhcHRlciwgbmFtZSk7XG4gICAgfVxuICAgIDtcbiAgICBodG1sRHJpdmVyLnN0cmVhbUFkYXB0ZXIgPSB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0O1xuICAgIHJldHVybiBodG1sRHJpdmVyO1xufVxuZXhwb3J0cy5tYWtlSFRNTERyaXZlciA9IG1ha2VIVE1MRHJpdmVyO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bWFrZUhUTUxEcml2ZXIuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgeHN0cmVhbV9hZGFwdGVyXzEgPSByZXF1aXJlKCdAY3ljbGUveHN0cmVhbS1hZGFwdGVyJyk7XG52YXIgeHN0cmVhbV8xID0gcmVxdWlyZSgneHN0cmVhbScpO1xudmFyIFNDT1BFX1BSRUZJWCA9ICdfX18nO1xudmFyIE1vY2tlZERPTVNvdXJjZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gTW9ja2VkRE9NU291cmNlKF9zdHJlYW1BZGFwdGVyLCBfbW9ja0NvbmZpZykge1xuICAgICAgICB0aGlzLl9zdHJlYW1BZGFwdGVyID0gX3N0cmVhbUFkYXB0ZXI7XG4gICAgICAgIHRoaXMuX21vY2tDb25maWcgPSBfbW9ja0NvbmZpZztcbiAgICAgICAgaWYgKF9tb2NrQ29uZmlnLmVsZW1lbnRzKSB7XG4gICAgICAgICAgICB0aGlzLl9lbGVtZW50cyA9IF9tb2NrQ29uZmlnLmVsZW1lbnRzO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMgPSBfc3RyZWFtQWRhcHRlci5hZGFwdCh4c3RyZWFtXzEuZGVmYXVsdC5lbXB0eSgpLCB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0LnN0cmVhbVN1YnNjcmliZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgTW9ja2VkRE9NU291cmNlLnByb3RvdHlwZS5lbGVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG91dCA9IHRoaXMuX2VsZW1lbnRzO1xuICAgICAgICBvdXQuX2lzQ3ljbGVTb3VyY2UgPSAnTW9ja2VkRE9NJztcbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9O1xuICAgIE1vY2tlZERPTVNvdXJjZS5wcm90b3R5cGUuZXZlbnRzID0gZnVuY3Rpb24gKGV2ZW50VHlwZSwgb3B0aW9ucykge1xuICAgICAgICB2YXIgbW9ja0NvbmZpZyA9IHRoaXMuX21vY2tDb25maWc7XG4gICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMobW9ja0NvbmZpZyk7XG4gICAgICAgIHZhciBrZXlzTGVuID0ga2V5cy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwga2V5c0xlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICAgIGlmIChrZXkgPT09IGV2ZW50VHlwZSkge1xuICAgICAgICAgICAgICAgIHZhciBvdXRfMSA9IG1vY2tDb25maWdba2V5XTtcbiAgICAgICAgICAgICAgICBvdXRfMS5faXNDeWNsZVNvdXJjZSA9ICdNb2NrZWRET00nO1xuICAgICAgICAgICAgICAgIHJldHVybiBvdXRfMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB2YXIgb3V0ID0gdGhpcy5fc3RyZWFtQWRhcHRlci5hZGFwdCh4c3RyZWFtXzEuZGVmYXVsdC5lbXB0eSgpLCB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0LnN0cmVhbVN1YnNjcmliZSk7XG4gICAgICAgIG91dC5faXNDeWNsZVNvdXJjZSA9ICdNb2NrZWRET00nO1xuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH07XG4gICAgTW9ja2VkRE9NU291cmNlLnByb3RvdHlwZS5zZWxlY3QgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgICAgICAgdmFyIG1vY2tDb25maWcgPSB0aGlzLl9tb2NrQ29uZmlnO1xuICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG1vY2tDb25maWcpO1xuICAgICAgICB2YXIga2V5c0xlbiA9IGtleXMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXNMZW47IGkrKykge1xuICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICAgICAgICBpZiAoa2V5ID09PSBzZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgTW9ja2VkRE9NU291cmNlKHRoaXMuX3N0cmVhbUFkYXB0ZXIsIG1vY2tDb25maWdba2V5XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb2NrZWRET01Tb3VyY2UodGhpcy5fc3RyZWFtQWRhcHRlciwge30pO1xuICAgIH07XG4gICAgTW9ja2VkRE9NU291cmNlLnByb3RvdHlwZS5pc29sYXRlU291cmNlID0gZnVuY3Rpb24gKHNvdXJjZSwgc2NvcGUpIHtcbiAgICAgICAgcmV0dXJuIHNvdXJjZS5zZWxlY3QoJy4nICsgU0NPUEVfUFJFRklYICsgc2NvcGUpO1xuICAgIH07XG4gICAgTW9ja2VkRE9NU291cmNlLnByb3RvdHlwZS5pc29sYXRlU2luayA9IGZ1bmN0aW9uIChzaW5rLCBzY29wZSkge1xuICAgICAgICByZXR1cm4gc2luay5tYXAoZnVuY3Rpb24gKHZub2RlKSB7XG4gICAgICAgICAgICBpZiAodm5vZGUuc2VsICYmIHZub2RlLnNlbC5pbmRleE9mKFNDT1BFX1BSRUZJWCArIHNjb3BlKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdm5vZGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2bm9kZS5zZWwgKz0gXCIuXCIgKyBTQ09QRV9QUkVGSVggKyBzY29wZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdm5vZGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgcmV0dXJuIE1vY2tlZERPTVNvdXJjZTtcbn0oKSk7XG5leHBvcnRzLk1vY2tlZERPTVNvdXJjZSA9IE1vY2tlZERPTVNvdXJjZTtcbmZ1bmN0aW9uIG1vY2tET01Tb3VyY2Uoc3RyZWFtQWRhcHRlciwgbW9ja0NvbmZpZykge1xuICAgIHJldHVybiBuZXcgTW9ja2VkRE9NU291cmNlKHN0cmVhbUFkYXB0ZXIsIG1vY2tDb25maWcpO1xufVxuZXhwb3J0cy5tb2NrRE9NU291cmNlID0gbW9ja0RPTVNvdXJjZTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPW1vY2tET01Tb3VyY2UuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgQ2xhc3NNb2R1bGUgPSByZXF1aXJlKCdzbmFiYmRvbS9tb2R1bGVzL2NsYXNzJyk7XG5leHBvcnRzLkNsYXNzTW9kdWxlID0gQ2xhc3NNb2R1bGU7XG52YXIgUHJvcHNNb2R1bGUgPSByZXF1aXJlKCdzbmFiYmRvbS9tb2R1bGVzL3Byb3BzJyk7XG5leHBvcnRzLlByb3BzTW9kdWxlID0gUHJvcHNNb2R1bGU7XG52YXIgQXR0cnNNb2R1bGUgPSByZXF1aXJlKCdzbmFiYmRvbS9tb2R1bGVzL2F0dHJpYnV0ZXMnKTtcbmV4cG9ydHMuQXR0cnNNb2R1bGUgPSBBdHRyc01vZHVsZTtcbnZhciBFdmVudHNNb2R1bGUgPSByZXF1aXJlKCdzbmFiYmRvbS9tb2R1bGVzL2V2ZW50bGlzdGVuZXJzJyk7XG5leHBvcnRzLkV2ZW50c01vZHVsZSA9IEV2ZW50c01vZHVsZTtcbnZhciBTdHlsZU1vZHVsZSA9IHJlcXVpcmUoJ3NuYWJiZG9tL21vZHVsZXMvc3R5bGUnKTtcbmV4cG9ydHMuU3R5bGVNb2R1bGUgPSBTdHlsZU1vZHVsZTtcbnZhciBIZXJvTW9kdWxlID0gcmVxdWlyZSgnc25hYmJkb20vbW9kdWxlcy9oZXJvJyk7XG5leHBvcnRzLkhlcm9Nb2R1bGUgPSBIZXJvTW9kdWxlO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gW1N0eWxlTW9kdWxlLCBDbGFzc01vZHVsZSwgUHJvcHNNb2R1bGUsIEF0dHJzTW9kdWxlXTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPW1vZHVsZXMuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgeHN0cmVhbV9hZGFwdGVyXzEgPSByZXF1aXJlKCdAY3ljbGUveHN0cmVhbS1hZGFwdGVyJyk7XG52YXIgeHN0cmVhbV8xID0gcmVxdWlyZSgneHN0cmVhbScpO1xuZnVuY3Rpb24gY3JlYXRlVlRyZWUodm5vZGUsIGNoaWxkcmVuKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2VsOiB2bm9kZS5zZWwsXG4gICAgICAgIGRhdGE6IHZub2RlLmRhdGEsXG4gICAgICAgIHRleHQ6IHZub2RlLnRleHQsXG4gICAgICAgIGVsbTogdm5vZGUuZWxtLFxuICAgICAgICBrZXk6IHZub2RlLmtleSxcbiAgICAgICAgY2hpbGRyZW46IGNoaWxkcmVuLFxuICAgIH07XG59XG5mdW5jdGlvbiBtYWtlVHJhbnNwb3NlVk5vZGUocnVuU3RyZWFtQWRhcHRlcikge1xuICAgIGZ1bmN0aW9uIGludGVybmFsVHJhbnNwb3NlVk5vZGUodm5vZGUpIHtcbiAgICAgICAgaWYgKCF2bm9kZSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodm5vZGUgJiYgdm5vZGUuZGF0YSAmJiB2bm9kZS5kYXRhLnN0YXRpYykge1xuICAgICAgICAgICAgcmV0dXJuIHhzdHJlYW1fMS5kZWZhdWx0Lm9mKHZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChydW5TdHJlYW1BZGFwdGVyLmlzVmFsaWRTdHJlYW0odm5vZGUpKSB7XG4gICAgICAgICAgICB2YXIgeHNTdHJlYW0gPSB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0LmFkYXB0KHZub2RlLCBydW5TdHJlYW1BZGFwdGVyLnN0cmVhbVN1YnNjcmliZSk7XG4gICAgICAgICAgICByZXR1cm4geHNTdHJlYW0ubWFwKGludGVybmFsVHJhbnNwb3NlVk5vZGUpLmZsYXR0ZW4oKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlb2Ygdm5vZGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmICghdm5vZGUuY2hpbGRyZW4gfHwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHhzdHJlYW1fMS5kZWZhdWx0Lm9mKHZub2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciB2bm9kZUNoaWxkcmVuID0gdm5vZGUuY2hpbGRyZW5cbiAgICAgICAgICAgICAgICAubWFwKGludGVybmFsVHJhbnNwb3NlVk5vZGUpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihmdW5jdGlvbiAoeCkgeyByZXR1cm4geCAhPT0gbnVsbDsgfSk7XG4gICAgICAgICAgICBpZiAodm5vZGVDaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geHN0cmVhbV8xLmRlZmF1bHQub2YoY3JlYXRlVlRyZWUodm5vZGUsIFtdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geHN0cmVhbV8xLmRlZmF1bHQuY29tYmluZS5hcHBseSh4c3RyZWFtXzEuZGVmYXVsdCwgdm5vZGVDaGlsZHJlbilcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmdW5jdGlvbiAoY2hpbGRyZW4pIHsgcmV0dXJuIGNyZWF0ZVZUcmVlKHZub2RlLCBjaGlsZHJlbi5zbGljZSgpKTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmhhbmRsZWQgdlRyZWUgVmFsdWVcIik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgO1xuICAgIHJldHVybiBmdW5jdGlvbiB0cmFuc3Bvc2VWTm9kZSh2bm9kZSkge1xuICAgICAgICByZXR1cm4gaW50ZXJuYWxUcmFuc3Bvc2VWTm9kZSh2bm9kZSk7XG4gICAgfTtcbn1cbmV4cG9ydHMubWFrZVRyYW5zcG9zZVZOb2RlID0gbWFrZVRyYW5zcG9zZVZOb2RlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9dHJhbnNwb3NpdGlvbi5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIGlzRWxlbWVudChvYmopIHtcbiAgICByZXR1cm4gdHlwZW9mIEhUTUxFbGVtZW50ID09PSBcIm9iamVjdFwiID9cbiAgICAgICAgb2JqIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgfHwgb2JqIGluc3RhbmNlb2YgRG9jdW1lbnRGcmFnbWVudCA6XG4gICAgICAgIG9iaiAmJiB0eXBlb2Ygb2JqID09PSBcIm9iamVjdFwiICYmIG9iaiAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgKG9iai5ub2RlVHlwZSA9PT0gMSB8fCBvYmoubm9kZVR5cGUgPT09IDExKSAmJlxuICAgICAgICAgICAgdHlwZW9mIG9iai5ub2RlTmFtZSA9PT0gXCJzdHJpbmdcIjtcbn1cbmV4cG9ydHMuU0NPUEVfUFJFRklYID0gXCIkJENZQ0xFRE9NJCQtXCI7XG5mdW5jdGlvbiBnZXRFbGVtZW50KHNlbGVjdG9ycykge1xuICAgIHZhciBkb21FbGVtZW50ID0gdHlwZW9mIHNlbGVjdG9ycyA9PT0gJ3N0cmluZycgP1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9ycykgOlxuICAgICAgICBzZWxlY3RvcnM7XG4gICAgaWYgKHR5cGVvZiBzZWxlY3RvcnMgPT09ICdzdHJpbmcnICYmIGRvbUVsZW1lbnQgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IHJlbmRlciBpbnRvIHVua25vd24gZWxlbWVudCBgXCIgKyBzZWxlY3RvcnMgKyBcImBcIik7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFpc0VsZW1lbnQoZG9tRWxlbWVudCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR2l2ZW4gY29udGFpbmVyIGlzIG5vdCBhIERPTSBlbGVtZW50IG5laXRoZXIgYSBcIiArXG4gICAgICAgICAgICBcInNlbGVjdG9yIHN0cmluZy5cIik7XG4gICAgfVxuICAgIHJldHVybiBkb21FbGVtZW50O1xufVxuZXhwb3J0cy5nZXRFbGVtZW50ID0gZ2V0RWxlbWVudDtcbmZ1bmN0aW9uIGdldFNjb3BlKG5hbWVzcGFjZSkge1xuICAgIHJldHVybiBuYW1lc3BhY2VcbiAgICAgICAgLmZpbHRlcihmdW5jdGlvbiAoYykgeyByZXR1cm4gYy5pbmRleE9mKGV4cG9ydHMuU0NPUEVfUFJFRklYKSA+IC0xOyB9KVxuICAgICAgICAubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiBjLnJlcGxhY2UoZXhwb3J0cy5TQ09QRV9QUkVGSVgsICcnKTsgfSlcbiAgICAgICAgLmpvaW4oXCItXCIpO1xufVxuZXhwb3J0cy5nZXRTY29wZSA9IGdldFNjb3BlO1xuZnVuY3Rpb24gZ2V0U2VsZWN0b3JzKG5hbWVzcGFjZSkge1xuICAgIHJldHVybiBuYW1lc3BhY2UuZmlsdGVyKGZ1bmN0aW9uIChjKSB7IHJldHVybiBjLmluZGV4T2YoZXhwb3J0cy5TQ09QRV9QUkVGSVgpID09PSAtMTsgfSkuam9pbihcIiBcIik7XG59XG5leHBvcnRzLmdldFNlbGVjdG9ycyA9IGdldFNlbGVjdG9ycztcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXV0aWxzLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xudmFyIHhzdHJlYW1fMSA9IHJlcXVpcmUoJ3hzdHJlYW0nKTtcbnZhciBYU3RyZWFtQWRhcHRlciA9IHtcbiAgICBhZGFwdDogZnVuY3Rpb24gKG9yaWdpblN0cmVhbSwgb3JpZ2luU3RyZWFtU3Vic2NyaWJlKSB7XG4gICAgICAgIGlmIChYU3RyZWFtQWRhcHRlci5pc1ZhbGlkU3RyZWFtKG9yaWdpblN0cmVhbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5TdHJlYW07XG4gICAgICAgIH1cbiAgICAgICAgO1xuICAgICAgICB2YXIgZGlzcG9zZSA9IG51bGw7XG4gICAgICAgIHJldHVybiB4c3RyZWFtXzEuZGVmYXVsdC5jcmVhdGUoe1xuICAgICAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgICAgICAgICB2YXIgb2JzZXJ2ZXIgPSBvdXQ7XG4gICAgICAgICAgICAgICAgZGlzcG9zZSA9IG9yaWdpblN0cmVhbVN1YnNjcmliZShvcmlnaW5TdHJlYW0sIG9ic2VydmVyKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkaXNwb3NlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9LFxuICAgIG1ha2VTdWJqZWN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzdHJlYW0gPSB4c3RyZWFtXzEuZGVmYXVsdC5jcmVhdGUoKTtcbiAgICAgICAgdmFyIG9ic2VydmVyID0ge1xuICAgICAgICAgICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgc3RyZWFtLnNoYW1lZnVsbHlTZW5kTmV4dCh4KTsgfSxcbiAgICAgICAgICAgIGVycm9yOiBmdW5jdGlvbiAoZXJyKSB7IHN0cmVhbS5zaGFtZWZ1bGx5U2VuZEVycm9yKGVycik7IH0sXG4gICAgICAgICAgICBjb21wbGV0ZTogZnVuY3Rpb24gKCkgeyBzdHJlYW0uc2hhbWVmdWxseVNlbmRDb21wbGV0ZSgpOyB9LFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4geyBvYnNlcnZlcjogb2JzZXJ2ZXIsIHN0cmVhbTogc3RyZWFtIH07XG4gICAgfSxcbiAgICByZW1lbWJlcjogZnVuY3Rpb24gKHN0cmVhbSkge1xuICAgICAgICByZXR1cm4gc3RyZWFtLnJlbWVtYmVyKCk7XG4gICAgfSxcbiAgICBpc1ZhbGlkU3RyZWFtOiBmdW5jdGlvbiAoc3RyZWFtKSB7XG4gICAgICAgIHJldHVybiAodHlwZW9mIHN0cmVhbS5hZGRMaXN0ZW5lciA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgdHlwZW9mIHN0cmVhbS5zaGFtZWZ1bGx5U2VuZE5leHQgPT09ICdmdW5jdGlvbicpO1xuICAgIH0sXG4gICAgc3RyZWFtU3Vic2NyaWJlOiBmdW5jdGlvbiAoc3RyZWFtLCBvYnNlcnZlcikge1xuICAgICAgICBzdHJlYW0uYWRkTGlzdGVuZXIob2JzZXJ2ZXIpO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkgeyByZXR1cm4gc3RyZWFtLnJlbW92ZUxpc3RlbmVyKG9ic2VydmVyKTsgfTtcbiAgICB9LFxufTtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZGVmYXVsdCA9IFhTdHJlYW1BZGFwdGVyO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgYmFzZV8xID0gcmVxdWlyZSgnQGN5Y2xlL2Jhc2UnKTtcbnZhciB4c3RyZWFtX2FkYXB0ZXJfMSA9IHJlcXVpcmUoJ0BjeWNsZS94c3RyZWFtLWFkYXB0ZXInKTtcbi8qKlxuICogVGFrZXMgYSBgbWFpbmAgZnVuY3Rpb24gYW5kIGNpcmN1bGFybHkgY29ubmVjdHMgaXQgdG8gdGhlIGdpdmVuIGNvbGxlY3Rpb25cbiAqIG9mIGRyaXZlciBmdW5jdGlvbnMuXG4gKlxuICogKipFeGFtcGxlOioqXG4gKiBgYGBqc1xuICogaW1wb3J0IHtydW59IGZyb20gJ0BjeWNsZS94c3RyZWFtLXJ1bic7XG4gKiBjb25zdCBkaXNwb3NlID0gcnVuKG1haW4sIGRyaXZlcnMpO1xuICogLy8gLi4uXG4gKiBkaXNwb3NlKCk7XG4gKiBgYGBcbiAqXG4gKiBUaGUgYG1haW5gIGZ1bmN0aW9uIGV4cGVjdHMgYSBjb2xsZWN0aW9uIG9mIFwic291cmNlXCIgc3RyZWFtcyAocmV0dXJuZWQgZnJvbVxuICogZHJpdmVycykgYXMgaW5wdXQsIGFuZCBzaG91bGQgcmV0dXJuIGEgY29sbGVjdGlvbiBvZiBcInNpbmtcIiBzdHJlYW1zICh0byBiZVxuICogZ2l2ZW4gdG8gZHJpdmVycykuIEEgXCJjb2xsZWN0aW9uIG9mIHN0cmVhbXNcIiBpcyBhIEphdmFTY3JpcHQgb2JqZWN0IHdoZXJlXG4gKiBrZXlzIG1hdGNoIHRoZSBkcml2ZXIgbmFtZXMgcmVnaXN0ZXJlZCBieSB0aGUgYGRyaXZlcnNgIG9iamVjdCwgYW5kIHZhbHVlc1xuICogYXJlIHRoZSBzdHJlYW1zLiBSZWZlciB0byB0aGUgZG9jdW1lbnRhdGlvbiBvZiBlYWNoIGRyaXZlciB0byBzZWUgbW9yZVxuICogZGV0YWlscyBvbiB3aGF0IHR5cGVzIG9mIHNvdXJjZXMgaXQgb3V0cHV0cyBhbmQgc2lua3MgaXQgcmVjZWl2ZXMuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gbWFpbiBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYHNvdXJjZXNgIGFzIGlucHV0IGFuZCBvdXRwdXRzXG4gKiBgc2lua3NgLlxuICogQHBhcmFtIHtPYmplY3R9IGRyaXZlcnMgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIGRyaXZlciBuYW1lcyBhbmQgdmFsdWVzXG4gKiBhcmUgZHJpdmVyIGZ1bmN0aW9ucy5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSBhIGRpc3Bvc2UgZnVuY3Rpb24sIHVzZWQgdG8gdGVybWluYXRlIHRoZSBleGVjdXRpb24gb2YgdGhlXG4gKiBDeWNsZS5qcyBwcm9ncmFtLCBjbGVhbmluZyB1cCByZXNvdXJjZXMgdXNlZC5cbiAqIEBmdW5jdGlvbiBydW5cbiAqL1xuZnVuY3Rpb24gcnVuKG1haW4sIGRyaXZlcnMpIHtcbiAgICB2YXIgX2EgPSBiYXNlXzEuZGVmYXVsdChtYWluLCBkcml2ZXJzLCB7IHN0cmVhbUFkYXB0ZXI6IHhzdHJlYW1fYWRhcHRlcl8xLmRlZmF1bHQgfSksIHJ1biA9IF9hLnJ1biwgc2lua3MgPSBfYS5zaW5rcztcbiAgICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93WydDeWNsZWpzRGV2VG9vbF9zdGFydEdyYXBoU2VyaWFsaXplciddKSB7XG4gICAgICAgIHdpbmRvd1snQ3ljbGVqc0RldlRvb2xfc3RhcnRHcmFwaFNlcmlhbGl6ZXInXShzaW5rcyk7XG4gICAgfVxuICAgIHJldHVybiBydW4oKTtcbn1cbmV4cG9ydHMucnVuID0gcnVuO1xuLyoqXG4gKiBBIGZ1bmN0aW9uIHRoYXQgcHJlcGFyZXMgdGhlIEN5Y2xlIGFwcGxpY2F0aW9uIHRvIGJlIGV4ZWN1dGVkLiBUYWtlcyBhIGBtYWluYFxuICogZnVuY3Rpb24gYW5kIHByZXBhcmVzIHRvIGNpcmN1bGFybHkgY29ubmVjdHMgaXQgdG8gdGhlIGdpdmVuIGNvbGxlY3Rpb24gb2ZcbiAqIGRyaXZlciBmdW5jdGlvbnMuIEFzIGFuIG91dHB1dCwgYEN5Y2xlKClgIHJldHVybnMgYW4gb2JqZWN0IHdpdGggdGhyZWVcbiAqIHByb3BlcnRpZXM6IGBzb3VyY2VzYCwgYHNpbmtzYCBhbmQgYHJ1bmAuIE9ubHkgd2hlbiBgcnVuKClgIGlzIGNhbGxlZCB3aWxsXG4gKiB0aGUgYXBwbGljYXRpb24gYWN0dWFsbHkgZXhlY3V0ZS4gUmVmZXIgdG8gdGhlIGRvY3VtZW50YXRpb24gb2YgYHJ1bigpYCBmb3JcbiAqIG1vcmUgZGV0YWlscy5cbiAqXG4gKiAqKkV4YW1wbGU6KipcbiAqIGBgYGpzXG4gKiBpbXBvcnQgQ3ljbGUgZnJvbSAnQGN5Y2xlL3hzdHJlYW0tcnVuJztcbiAqIGNvbnN0IHtzb3VyY2VzLCBzaW5rcywgcnVufSA9IEN5Y2xlKG1haW4sIGRyaXZlcnMpO1xuICogLy8gLi4uXG4gKiBjb25zdCBkaXNwb3NlID0gcnVuKCk7IC8vIEV4ZWN1dGVzIHRoZSBhcHBsaWNhdGlvblxuICogLy8gLi4uXG4gKiBkaXNwb3NlKCk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBtYWluIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBgc291cmNlc2AgYXMgaW5wdXQgYW5kIG91dHB1dHNcbiAqIGBzaW5rc2AuXG4gKiBAcGFyYW0ge09iamVjdH0gZHJpdmVycyBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgZHJpdmVyIG5hbWVzIGFuZCB2YWx1ZXNcbiAqIGFyZSBkcml2ZXIgZnVuY3Rpb25zLlxuICogQHJldHVybiB7T2JqZWN0fSBhbiBvYmplY3Qgd2l0aCB0aHJlZSBwcm9wZXJ0aWVzOiBgc291cmNlc2AsIGBzaW5rc2AgYW5kXG4gKiBgcnVuYC4gYHNvdXJjZXNgIGlzIHRoZSBjb2xsZWN0aW9uIG9mIGRyaXZlciBzb3VyY2VzLCBgc2lua3NgIGlzIHRoZVxuICogY29sbGVjdGlvbiBvZiBkcml2ZXIgc2lua3MsIHRoZXNlIGNhbiBiZSB1c2VkIGZvciBkZWJ1Z2dpbmcgb3IgdGVzdGluZy4gYHJ1bmBcbiAqIGlzIHRoZSBmdW5jdGlvbiB0aGF0IG9uY2UgY2FsbGVkIHdpbGwgZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24uXG4gKiBAZnVuY3Rpb24gQ3ljbGVcbiAqL1xudmFyIEN5Y2xlID0gZnVuY3Rpb24gKG1haW4sIGRyaXZlcnMpIHtcbiAgICB2YXIgb3V0ID0gYmFzZV8xLmRlZmF1bHQobWFpbiwgZHJpdmVycywgeyBzdHJlYW1BZGFwdGVyOiB4c3RyZWFtX2FkYXB0ZXJfMS5kZWZhdWx0IH0pO1xuICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3dbJ0N5Y2xlanNEZXZUb29sX3N0YXJ0R3JhcGhTZXJpYWxpemVyJ10pIHtcbiAgICAgICAgd2luZG93WydDeWNsZWpzRGV2VG9vbF9zdGFydEdyYXBoU2VyaWFsaXplciddKG91dC5zaW5rcyk7XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59O1xuQ3ljbGUucnVuID0gcnVuO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gQ3ljbGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXAiLCIvKiFcbiAqIENyb3NzLUJyb3dzZXIgU3BsaXQgMS4xLjFcbiAqIENvcHlyaWdodCAyMDA3LTIwMTIgU3RldmVuIExldml0aGFuIDxzdGV2ZW5sZXZpdGhhbi5jb20+XG4gKiBBdmFpbGFibGUgdW5kZXIgdGhlIE1JVCBMaWNlbnNlXG4gKiBFQ01BU2NyaXB0IGNvbXBsaWFudCwgdW5pZm9ybSBjcm9zcy1icm93c2VyIHNwbGl0IG1ldGhvZFxuICovXG5cbi8qKlxuICogU3BsaXRzIGEgc3RyaW5nIGludG8gYW4gYXJyYXkgb2Ygc3RyaW5ncyB1c2luZyBhIHJlZ2V4IG9yIHN0cmluZyBzZXBhcmF0b3IuIE1hdGNoZXMgb2YgdGhlXG4gKiBzZXBhcmF0b3IgYXJlIG5vdCBpbmNsdWRlZCBpbiB0aGUgcmVzdWx0IGFycmF5LiBIb3dldmVyLCBpZiBgc2VwYXJhdG9yYCBpcyBhIHJlZ2V4IHRoYXQgY29udGFpbnNcbiAqIGNhcHR1cmluZyBncm91cHMsIGJhY2tyZWZlcmVuY2VzIGFyZSBzcGxpY2VkIGludG8gdGhlIHJlc3VsdCBlYWNoIHRpbWUgYHNlcGFyYXRvcmAgaXMgbWF0Y2hlZC5cbiAqIEZpeGVzIGJyb3dzZXIgYnVncyBjb21wYXJlZCB0byB0aGUgbmF0aXZlIGBTdHJpbmcucHJvdG90eXBlLnNwbGl0YCBhbmQgY2FuIGJlIHVzZWQgcmVsaWFibHlcbiAqIGNyb3NzLWJyb3dzZXIuXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyIFN0cmluZyB0byBzcGxpdC5cbiAqIEBwYXJhbSB7UmVnRXhwfFN0cmluZ30gc2VwYXJhdG9yIFJlZ2V4IG9yIHN0cmluZyB0byB1c2UgZm9yIHNlcGFyYXRpbmcgdGhlIHN0cmluZy5cbiAqIEBwYXJhbSB7TnVtYmVyfSBbbGltaXRdIE1heGltdW0gbnVtYmVyIG9mIGl0ZW1zIHRvIGluY2x1ZGUgaW4gdGhlIHJlc3VsdCBhcnJheS5cbiAqIEByZXR1cm5zIHtBcnJheX0gQXJyYXkgb2Ygc3Vic3RyaW5ncy5cbiAqIEBleGFtcGxlXG4gKlxuICogLy8gQmFzaWMgdXNlXG4gKiBzcGxpdCgnYSBiIGMgZCcsICcgJyk7XG4gKiAvLyAtPiBbJ2EnLCAnYicsICdjJywgJ2QnXVxuICpcbiAqIC8vIFdpdGggbGltaXRcbiAqIHNwbGl0KCdhIGIgYyBkJywgJyAnLCAyKTtcbiAqIC8vIC0+IFsnYScsICdiJ11cbiAqXG4gKiAvLyBCYWNrcmVmZXJlbmNlcyBpbiByZXN1bHQgYXJyYXlcbiAqIHNwbGl0KCcuLndvcmQxIHdvcmQyLi4nLCAvKFthLXpdKykoXFxkKykvaSk7XG4gKiAvLyAtPiBbJy4uJywgJ3dvcmQnLCAnMScsICcgJywgJ3dvcmQnLCAnMicsICcuLiddXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uIHNwbGl0KHVuZGVmKSB7XG5cbiAgdmFyIG5hdGl2ZVNwbGl0ID0gU3RyaW5nLnByb3RvdHlwZS5zcGxpdCxcbiAgICBjb21wbGlhbnRFeGVjTnBjZyA9IC8oKT8/Ly5leGVjKFwiXCIpWzFdID09PSB1bmRlZixcbiAgICAvLyBOUENHOiBub25wYXJ0aWNpcGF0aW5nIGNhcHR1cmluZyBncm91cFxuICAgIHNlbGY7XG5cbiAgc2VsZiA9IGZ1bmN0aW9uKHN0ciwgc2VwYXJhdG9yLCBsaW1pdCkge1xuICAgIC8vIElmIGBzZXBhcmF0b3JgIGlzIG5vdCBhIHJlZ2V4LCB1c2UgYG5hdGl2ZVNwbGl0YFxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VwYXJhdG9yKSAhPT0gXCJbb2JqZWN0IFJlZ0V4cF1cIikge1xuICAgICAgcmV0dXJuIG5hdGl2ZVNwbGl0LmNhbGwoc3RyLCBzZXBhcmF0b3IsIGxpbWl0KTtcbiAgICB9XG4gICAgdmFyIG91dHB1dCA9IFtdLFxuICAgICAgZmxhZ3MgPSAoc2VwYXJhdG9yLmlnbm9yZUNhc2UgPyBcImlcIiA6IFwiXCIpICsgKHNlcGFyYXRvci5tdWx0aWxpbmUgPyBcIm1cIiA6IFwiXCIpICsgKHNlcGFyYXRvci5leHRlbmRlZCA/IFwieFwiIDogXCJcIikgKyAvLyBQcm9wb3NlZCBmb3IgRVM2XG4gICAgICAoc2VwYXJhdG9yLnN0aWNreSA/IFwieVwiIDogXCJcIiksXG4gICAgICAvLyBGaXJlZm94IDMrXG4gICAgICBsYXN0TGFzdEluZGV4ID0gMCxcbiAgICAgIC8vIE1ha2UgYGdsb2JhbGAgYW5kIGF2b2lkIGBsYXN0SW5kZXhgIGlzc3VlcyBieSB3b3JraW5nIHdpdGggYSBjb3B5XG4gICAgICBzZXBhcmF0b3IgPSBuZXcgUmVnRXhwKHNlcGFyYXRvci5zb3VyY2UsIGZsYWdzICsgXCJnXCIpLFxuICAgICAgc2VwYXJhdG9yMiwgbWF0Y2gsIGxhc3RJbmRleCwgbGFzdExlbmd0aDtcbiAgICBzdHIgKz0gXCJcIjsgLy8gVHlwZS1jb252ZXJ0XG4gICAgaWYgKCFjb21wbGlhbnRFeGVjTnBjZykge1xuICAgICAgLy8gRG9lc24ndCBuZWVkIGZsYWdzIGd5LCBidXQgdGhleSBkb24ndCBodXJ0XG4gICAgICBzZXBhcmF0b3IyID0gbmV3IFJlZ0V4cChcIl5cIiArIHNlcGFyYXRvci5zb3VyY2UgKyBcIiQoPyFcXFxccylcIiwgZmxhZ3MpO1xuICAgIH1cbiAgICAvKiBWYWx1ZXMgZm9yIGBsaW1pdGAsIHBlciB0aGUgc3BlYzpcbiAgICAgKiBJZiB1bmRlZmluZWQ6IDQyOTQ5NjcyOTUgLy8gTWF0aC5wb3coMiwgMzIpIC0gMVxuICAgICAqIElmIDAsIEluZmluaXR5LCBvciBOYU46IDBcbiAgICAgKiBJZiBwb3NpdGl2ZSBudW1iZXI6IGxpbWl0ID0gTWF0aC5mbG9vcihsaW1pdCk7IGlmIChsaW1pdCA+IDQyOTQ5NjcyOTUpIGxpbWl0IC09IDQyOTQ5NjcyOTY7XG4gICAgICogSWYgbmVnYXRpdmUgbnVtYmVyOiA0Mjk0OTY3Mjk2IC0gTWF0aC5mbG9vcihNYXRoLmFicyhsaW1pdCkpXG4gICAgICogSWYgb3RoZXI6IFR5cGUtY29udmVydCwgdGhlbiB1c2UgdGhlIGFib3ZlIHJ1bGVzXG4gICAgICovXG4gICAgbGltaXQgPSBsaW1pdCA9PT0gdW5kZWYgPyAtMSA+Pj4gMCA6IC8vIE1hdGgucG93KDIsIDMyKSAtIDFcbiAgICBsaW1pdCA+Pj4gMDsgLy8gVG9VaW50MzIobGltaXQpXG4gICAgd2hpbGUgKG1hdGNoID0gc2VwYXJhdG9yLmV4ZWMoc3RyKSkge1xuICAgICAgLy8gYHNlcGFyYXRvci5sYXN0SW5kZXhgIGlzIG5vdCByZWxpYWJsZSBjcm9zcy1icm93c2VyXG4gICAgICBsYXN0SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgIGlmIChsYXN0SW5kZXggPiBsYXN0TGFzdEluZGV4KSB7XG4gICAgICAgIG91dHB1dC5wdXNoKHN0ci5zbGljZShsYXN0TGFzdEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAvLyBGaXggYnJvd3NlcnMgd2hvc2UgYGV4ZWNgIG1ldGhvZHMgZG9uJ3QgY29uc2lzdGVudGx5IHJldHVybiBgdW5kZWZpbmVkYCBmb3JcbiAgICAgICAgLy8gbm9ucGFydGljaXBhdGluZyBjYXB0dXJpbmcgZ3JvdXBzXG4gICAgICAgIGlmICghY29tcGxpYW50RXhlY05wY2cgJiYgbWF0Y2gubGVuZ3RoID4gMSkge1xuICAgICAgICAgIG1hdGNoWzBdLnJlcGxhY2Uoc2VwYXJhdG9yMiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGggLSAyOyBpKyspIHtcbiAgICAgICAgICAgICAgaWYgKGFyZ3VtZW50c1tpXSA9PT0gdW5kZWYpIHtcbiAgICAgICAgICAgICAgICBtYXRjaFtpXSA9IHVuZGVmO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IDEgJiYgbWF0Y2guaW5kZXggPCBzdHIubGVuZ3RoKSB7XG4gICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkob3V0cHV0LCBtYXRjaC5zbGljZSgxKSk7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdExlbmd0aCA9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgbGFzdExhc3RJbmRleCA9IGxhc3RJbmRleDtcbiAgICAgICAgaWYgKG91dHB1dC5sZW5ndGggPj0gbGltaXQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHNlcGFyYXRvci5sYXN0SW5kZXggPT09IG1hdGNoLmluZGV4KSB7XG4gICAgICAgIHNlcGFyYXRvci5sYXN0SW5kZXgrKzsgLy8gQXZvaWQgYW4gaW5maW5pdGUgbG9vcFxuICAgICAgfVxuICAgIH1cbiAgICBpZiAobGFzdExhc3RJbmRleCA9PT0gc3RyLmxlbmd0aCkge1xuICAgICAgaWYgKGxhc3RMZW5ndGggfHwgIXNlcGFyYXRvci50ZXN0KFwiXCIpKSB7XG4gICAgICAgIG91dHB1dC5wdXNoKFwiXCIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaChzdHIuc2xpY2UobGFzdExhc3RJbmRleCkpO1xuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0Lmxlbmd0aCA+IGxpbWl0ID8gb3V0cHV0LnNsaWNlKDAsIGxpbWl0KSA6IG91dHB1dDtcbiAgfTtcblxuICByZXR1cm4gc2VsZjtcbn0pKCk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjb3B5ICAgICAgID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvY29weScpXG4gICwgbWFwICAgICAgICA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L21hcCcpXG4gICwgY2FsbGFibGUgICA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L3ZhbGlkLWNhbGxhYmxlJylcbiAgLCB2YWxpZFZhbHVlID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvdmFsaWQtdmFsdWUnKVxuXG4gICwgYmluZCA9IEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLCBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eVxuICAsIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuICAsIGRlZmluZTtcblxuZGVmaW5lID0gZnVuY3Rpb24gKG5hbWUsIGRlc2MsIGJpbmRUbykge1xuXHR2YXIgdmFsdWUgPSB2YWxpZFZhbHVlKGRlc2MpICYmIGNhbGxhYmxlKGRlc2MudmFsdWUpLCBkZ3M7XG5cdGRncyA9IGNvcHkoZGVzYyk7XG5cdGRlbGV0ZSBkZ3Mud3JpdGFibGU7XG5cdGRlbGV0ZSBkZ3MudmFsdWU7XG5cdGRncy5nZXQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKGhhc093blByb3BlcnR5LmNhbGwodGhpcywgbmFtZSkpIHJldHVybiB2YWx1ZTtcblx0XHRkZXNjLnZhbHVlID0gYmluZC5jYWxsKHZhbHVlLCAoYmluZFRvID09IG51bGwpID8gdGhpcyA6IHRoaXNbYmluZFRvXSk7XG5cdFx0ZGVmaW5lUHJvcGVydHkodGhpcywgbmFtZSwgZGVzYyk7XG5cdFx0cmV0dXJuIHRoaXNbbmFtZV07XG5cdH07XG5cdHJldHVybiBkZ3M7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwcm9wcy8qLCBiaW5kVG8qLykge1xuXHR2YXIgYmluZFRvID0gYXJndW1lbnRzWzFdO1xuXHRyZXR1cm4gbWFwKHByb3BzLCBmdW5jdGlvbiAoZGVzYywgbmFtZSkge1xuXHRcdHJldHVybiBkZWZpbmUobmFtZSwgZGVzYywgYmluZFRvKTtcblx0fSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXNzaWduICAgICAgICA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L2Fzc2lnbicpXG4gICwgbm9ybWFsaXplT3B0cyA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L25vcm1hbGl6ZS1vcHRpb25zJylcbiAgLCBpc0NhbGxhYmxlICAgID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvaXMtY2FsbGFibGUnKVxuICAsIGNvbnRhaW5zICAgICAgPSByZXF1aXJlKCdlczUtZXh0L3N0cmluZy8jL2NvbnRhaW5zJylcblxuICAsIGQ7XG5cbmQgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChkc2NyLCB2YWx1ZS8qLCBvcHRpb25zKi8pIHtcblx0dmFyIGMsIGUsIHcsIG9wdGlvbnMsIGRlc2M7XG5cdGlmICgoYXJndW1lbnRzLmxlbmd0aCA8IDIpIHx8ICh0eXBlb2YgZHNjciAhPT0gJ3N0cmluZycpKSB7XG5cdFx0b3B0aW9ucyA9IHZhbHVlO1xuXHRcdHZhbHVlID0gZHNjcjtcblx0XHRkc2NyID0gbnVsbDtcblx0fSBlbHNlIHtcblx0XHRvcHRpb25zID0gYXJndW1lbnRzWzJdO1xuXHR9XG5cdGlmIChkc2NyID09IG51bGwpIHtcblx0XHRjID0gdyA9IHRydWU7XG5cdFx0ZSA9IGZhbHNlO1xuXHR9IGVsc2Uge1xuXHRcdGMgPSBjb250YWlucy5jYWxsKGRzY3IsICdjJyk7XG5cdFx0ZSA9IGNvbnRhaW5zLmNhbGwoZHNjciwgJ2UnKTtcblx0XHR3ID0gY29udGFpbnMuY2FsbChkc2NyLCAndycpO1xuXHR9XG5cblx0ZGVzYyA9IHsgdmFsdWU6IHZhbHVlLCBjb25maWd1cmFibGU6IGMsIGVudW1lcmFibGU6IGUsIHdyaXRhYmxlOiB3IH07XG5cdHJldHVybiAhb3B0aW9ucyA/IGRlc2MgOiBhc3NpZ24obm9ybWFsaXplT3B0cyhvcHRpb25zKSwgZGVzYyk7XG59O1xuXG5kLmdzID0gZnVuY3Rpb24gKGRzY3IsIGdldCwgc2V0LyosIG9wdGlvbnMqLykge1xuXHR2YXIgYywgZSwgb3B0aW9ucywgZGVzYztcblx0aWYgKHR5cGVvZiBkc2NyICE9PSAnc3RyaW5nJykge1xuXHRcdG9wdGlvbnMgPSBzZXQ7XG5cdFx0c2V0ID0gZ2V0O1xuXHRcdGdldCA9IGRzY3I7XG5cdFx0ZHNjciA9IG51bGw7XG5cdH0gZWxzZSB7XG5cdFx0b3B0aW9ucyA9IGFyZ3VtZW50c1szXTtcblx0fVxuXHRpZiAoZ2V0ID09IG51bGwpIHtcblx0XHRnZXQgPSB1bmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAoIWlzQ2FsbGFibGUoZ2V0KSkge1xuXHRcdG9wdGlvbnMgPSBnZXQ7XG5cdFx0Z2V0ID0gc2V0ID0gdW5kZWZpbmVkO1xuXHR9IGVsc2UgaWYgKHNldCA9PSBudWxsKSB7XG5cdFx0c2V0ID0gdW5kZWZpbmVkO1xuXHR9IGVsc2UgaWYgKCFpc0NhbGxhYmxlKHNldCkpIHtcblx0XHRvcHRpb25zID0gc2V0O1xuXHRcdHNldCA9IHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoZHNjciA9PSBudWxsKSB7XG5cdFx0YyA9IHRydWU7XG5cdFx0ZSA9IGZhbHNlO1xuXHR9IGVsc2Uge1xuXHRcdGMgPSBjb250YWlucy5jYWxsKGRzY3IsICdjJyk7XG5cdFx0ZSA9IGNvbnRhaW5zLmNhbGwoZHNjciwgJ2UnKTtcblx0fVxuXG5cdGRlc2MgPSB7IGdldDogZ2V0LCBzZXQ6IHNldCwgY29uZmlndXJhYmxlOiBjLCBlbnVtZXJhYmxlOiBlIH07XG5cdHJldHVybiAhb3B0aW9ucyA/IGRlc2MgOiBhc3NpZ24obm9ybWFsaXplT3B0cyhvcHRpb25zKSwgZGVzYyk7XG59O1xuIiwidmFyIHBTbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBvYmplY3RLZXlzID0gcmVxdWlyZSgnLi9saWIva2V5cy5qcycpO1xudmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi9saWIvaXNfYXJndW1lbnRzLmpzJyk7XG5cbnZhciBkZWVwRXF1YWwgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhY3R1YWwsIGV4cGVjdGVkLCBvcHRzKSB7XG4gIGlmICghb3B0cykgb3B0cyA9IHt9O1xuICAvLyA3LjEuIEFsbCBpZGVudGljYWwgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2UgaWYgKGFjdHVhbCBpbnN0YW5jZW9mIERhdGUgJiYgZXhwZWN0ZWQgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5nZXRUaW1lKCkgPT09IGV4cGVjdGVkLmdldFRpbWUoKTtcblxuICAvLyA3LjMuIE90aGVyIHBhaXJzIHRoYXQgZG8gbm90IGJvdGggcGFzcyB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcsXG4gIC8vIGVxdWl2YWxlbmNlIGlzIGRldGVybWluZWQgYnkgPT0uXG4gIH0gZWxzZSBpZiAoIWFjdHVhbCB8fCAhZXhwZWN0ZWQgfHwgdHlwZW9mIGFjdHVhbCAhPSAnb2JqZWN0JyAmJiB0eXBlb2YgZXhwZWN0ZWQgIT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gb3B0cy5zdHJpY3QgPyBhY3R1YWwgPT09IGV4cGVjdGVkIDogYWN0dWFsID09IGV4cGVjdGVkO1xuXG4gIC8vIDcuNC4gRm9yIGFsbCBvdGhlciBPYmplY3QgcGFpcnMsIGluY2x1ZGluZyBBcnJheSBvYmplY3RzLCBlcXVpdmFsZW5jZSBpc1xuICAvLyBkZXRlcm1pbmVkIGJ5IGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoYXMgdmVyaWZpZWRcbiAgLy8gd2l0aCBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwpLCB0aGUgc2FtZSBzZXQgb2Yga2V5c1xuICAvLyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSwgZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5XG4gIC8vIGNvcnJlc3BvbmRpbmcga2V5LCBhbmQgYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LiBOb3RlOiB0aGlzXG4gIC8vIGFjY291bnRzIGZvciBib3RoIG5hbWVkIGFuZCBpbmRleGVkIHByb3BlcnRpZXMgb24gQXJyYXlzLlxuICB9IGVsc2Uge1xuICAgIHJldHVybiBvYmpFcXVpdihhY3R1YWwsIGV4cGVjdGVkLCBvcHRzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNCdWZmZXIgKHgpIHtcbiAgaWYgKCF4IHx8IHR5cGVvZiB4ICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgeC5sZW5ndGggIT09ICdudW1iZXInKSByZXR1cm4gZmFsc2U7XG4gIGlmICh0eXBlb2YgeC5jb3B5ICE9PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiB4LnNsaWNlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh4Lmxlbmd0aCA+IDAgJiYgdHlwZW9mIHhbMF0gIT09ICdudW1iZXInKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBvYmpFcXVpdihhLCBiLCBvcHRzKSB7XG4gIHZhciBpLCBrZXk7XG4gIGlmIChpc1VuZGVmaW5lZE9yTnVsbChhKSB8fCBpc1VuZGVmaW5lZE9yTnVsbChiKSlcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS5cbiAgaWYgKGEucHJvdG90eXBlICE9PSBiLnByb3RvdHlwZSkgcmV0dXJuIGZhbHNlO1xuICAvL35+fkkndmUgbWFuYWdlZCB0byBicmVhayBPYmplY3Qua2V5cyB0aHJvdWdoIHNjcmV3eSBhcmd1bWVudHMgcGFzc2luZy5cbiAgLy8gICBDb252ZXJ0aW5nIHRvIGFycmF5IHNvbHZlcyB0aGUgcHJvYmxlbS5cbiAgaWYgKGlzQXJndW1lbnRzKGEpKSB7XG4gICAgaWYgKCFpc0FyZ3VtZW50cyhiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBhID0gcFNsaWNlLmNhbGwoYSk7XG4gICAgYiA9IHBTbGljZS5jYWxsKGIpO1xuICAgIHJldHVybiBkZWVwRXF1YWwoYSwgYiwgb3B0cyk7XG4gIH1cbiAgaWYgKGlzQnVmZmVyKGEpKSB7XG4gICAgaWYgKCFpc0J1ZmZlcihiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhW2ldICE9PSBiW2ldKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHRyeSB7XG4gICAgdmFyIGthID0gb2JqZWN0S2V5cyhhKSxcbiAgICAgICAga2IgPSBvYmplY3RLZXlzKGIpO1xuICB9IGNhdGNoIChlKSB7Ly9oYXBwZW5zIHdoZW4gb25lIGlzIGEgc3RyaW5nIGxpdGVyYWwgYW5kIHRoZSBvdGhlciBpc24ndFxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBoYXZpbmcgdGhlIHNhbWUgbnVtYmVyIG9mIG93bmVkIHByb3BlcnRpZXMgKGtleXMgaW5jb3Jwb3JhdGVzXG4gIC8vIGhhc093blByb3BlcnR5KVxuICBpZiAoa2EubGVuZ3RoICE9IGtiLmxlbmd0aClcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vdGhlIHNhbWUgc2V0IG9mIGtleXMgKGFsdGhvdWdoIG5vdCBuZWNlc3NhcmlseSB0aGUgc2FtZSBvcmRlciksXG4gIGthLnNvcnQoKTtcbiAga2Iuc29ydCgpO1xuICAvL35+fmNoZWFwIGtleSB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgaWYgKGthW2ldICE9IGtiW2ldKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5IGNvcnJlc3BvbmRpbmcga2V5LCBhbmRcbiAgLy9+fn5wb3NzaWJseSBleHBlbnNpdmUgZGVlcCB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAga2V5ID0ga2FbaV07XG4gICAgaWYgKCFkZWVwRXF1YWwoYVtrZXldLCBiW2tleV0sIG9wdHMpKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHR5cGVvZiBhID09PSB0eXBlb2YgYjtcbn1cbiIsInZhciBzdXBwb3J0c0FyZ3VtZW50c0NsYXNzID0gKGZ1bmN0aW9uKCl7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJndW1lbnRzKVxufSkoKSA9PSAnW29iamVjdCBBcmd1bWVudHNdJztcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gc3VwcG9ydHNBcmd1bWVudHNDbGFzcyA/IHN1cHBvcnRlZCA6IHVuc3VwcG9ydGVkO1xuXG5leHBvcnRzLnN1cHBvcnRlZCA9IHN1cHBvcnRlZDtcbmZ1bmN0aW9uIHN1cHBvcnRlZChvYmplY3QpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmplY3QpID09ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xufTtcblxuZXhwb3J0cy51bnN1cHBvcnRlZCA9IHVuc3VwcG9ydGVkO1xuZnVuY3Rpb24gdW5zdXBwb3J0ZWQob2JqZWN0KXtcbiAgcmV0dXJuIG9iamVjdCAmJlxuICAgIHR5cGVvZiBvYmplY3QgPT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2Ygb2JqZWN0Lmxlbmd0aCA9PSAnbnVtYmVyJyAmJlxuICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdjYWxsZWUnKSAmJlxuICAgICFPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwob2JqZWN0LCAnY2FsbGVlJykgfHxcbiAgICBmYWxzZTtcbn07XG4iLCJleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB0eXBlb2YgT2JqZWN0LmtleXMgPT09ICdmdW5jdGlvbidcbiAgPyBPYmplY3Qua2V5cyA6IHNoaW07XG5cbmV4cG9ydHMuc2hpbSA9IHNoaW07XG5mdW5jdGlvbiBzaGltIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gIHJldHVybiBrZXlzO1xufVxuIiwiLy8gSW5zcGlyZWQgYnkgR29vZ2xlIENsb3N1cmU6XG4vLyBodHRwOi8vY2xvc3VyZS1saWJyYXJ5Lmdvb2dsZWNvZGUuY29tL3N2bi9kb2NzL1xuLy8gY2xvc3VyZV9nb29nX2FycmF5X2FycmF5LmpzLmh0bWwjZ29vZy5hcnJheS5jbGVhclxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciB2YWx1ZSA9IHJlcXVpcmUoJy4uLy4uL29iamVjdC92YWxpZC12YWx1ZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFsdWUodGhpcykubGVuZ3RoID0gMDtcblx0cmV0dXJuIHRoaXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdG9Qb3NJbnQgPSByZXF1aXJlKCcuLi8uLi9udW1iZXIvdG8tcG9zLWludGVnZXInKVxuICAsIHZhbHVlICAgID0gcmVxdWlyZSgnLi4vLi4vb2JqZWN0L3ZhbGlkLXZhbHVlJylcblxuICAsIGluZGV4T2YgPSBBcnJheS5wcm90b3R5cGUuaW5kZXhPZlxuICAsIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuICAsIGFicyA9IE1hdGguYWJzLCBmbG9vciA9IE1hdGguZmxvb3I7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHNlYXJjaEVsZW1lbnQvKiwgZnJvbUluZGV4Ki8pIHtcblx0dmFyIGksIGwsIGZyb21JbmRleCwgdmFsO1xuXHRpZiAoc2VhcmNoRWxlbWVudCA9PT0gc2VhcmNoRWxlbWVudCkgeyAvL2pzbGludDogaWdub3JlXG5cdFx0cmV0dXJuIGluZGV4T2YuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fVxuXG5cdGwgPSB0b1Bvc0ludCh2YWx1ZSh0aGlzKS5sZW5ndGgpO1xuXHRmcm9tSW5kZXggPSBhcmd1bWVudHNbMV07XG5cdGlmIChpc05hTihmcm9tSW5kZXgpKSBmcm9tSW5kZXggPSAwO1xuXHRlbHNlIGlmIChmcm9tSW5kZXggPj0gMCkgZnJvbUluZGV4ID0gZmxvb3IoZnJvbUluZGV4KTtcblx0ZWxzZSBmcm9tSW5kZXggPSB0b1Bvc0ludCh0aGlzLmxlbmd0aCkgLSBmbG9vcihhYnMoZnJvbUluZGV4KSk7XG5cblx0Zm9yIChpID0gZnJvbUluZGV4OyBpIDwgbDsgKytpKSB7XG5cdFx0aWYgKGhhc093blByb3BlcnR5LmNhbGwodGhpcywgaSkpIHtcblx0XHRcdHZhbCA9IHRoaXNbaV07XG5cdFx0XHRpZiAodmFsICE9PSB2YWwpIHJldHVybiBpOyAvL2pzbGludDogaWdub3JlXG5cdFx0fVxuXHR9XG5cdHJldHVybiAtMTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcblxuICAsIGlkID0gdG9TdHJpbmcuY2FsbCgoZnVuY3Rpb24gKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkgeyByZXR1cm4gKHRvU3RyaW5nLmNhbGwoeCkgPT09IGlkKTsgfTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2lzLWltcGxlbWVudGVkJykoKVxuXHQ/IE1hdGguc2lnblxuXHQ6IHJlcXVpcmUoJy4vc2hpbScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNpZ24gPSBNYXRoLnNpZ247XG5cdGlmICh0eXBlb2Ygc2lnbiAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gKChzaWduKDEwKSA9PT0gMSkgJiYgKHNpZ24oLTIwKSA9PT0gLTEpKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0aWYgKGlzTmFOKHZhbHVlKSB8fCAodmFsdWUgPT09IDApKSByZXR1cm4gdmFsdWU7XG5cdHJldHVybiAodmFsdWUgPiAwKSA/IDEgOiAtMTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzaWduID0gcmVxdWlyZSgnLi4vbWF0aC9zaWduJylcblxuICAsIGFicyA9IE1hdGguYWJzLCBmbG9vciA9IE1hdGguZmxvb3I7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmIChpc05hTih2YWx1ZSkpIHJldHVybiAwO1xuXHR2YWx1ZSA9IE51bWJlcih2YWx1ZSk7XG5cdGlmICgodmFsdWUgPT09IDApIHx8ICFpc0Zpbml0ZSh2YWx1ZSkpIHJldHVybiB2YWx1ZTtcblx0cmV0dXJuIHNpZ24odmFsdWUpICogZmxvb3IoYWJzKHZhbHVlKSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdG9JbnRlZ2VyID0gcmVxdWlyZSgnLi90by1pbnRlZ2VyJylcblxuICAsIG1heCA9IE1hdGgubWF4O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh2YWx1ZSkgeyByZXR1cm4gbWF4KDAsIHRvSW50ZWdlcih2YWx1ZSkpOyB9O1xuIiwiLy8gSW50ZXJuYWwgbWV0aG9kLCB1c2VkIGJ5IGl0ZXJhdGlvbiBmdW5jdGlvbnMuXG4vLyBDYWxscyBhIGZ1bmN0aW9uIGZvciBlYWNoIGtleS12YWx1ZSBwYWlyIGZvdW5kIGluIG9iamVjdFxuLy8gT3B0aW9uYWxseSB0YWtlcyBjb21wYXJlRm4gdG8gaXRlcmF0ZSBvYmplY3QgaW4gc3BlY2lmaWMgb3JkZXJcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FsbGFibGUgPSByZXF1aXJlKCcuL3ZhbGlkLWNhbGxhYmxlJylcbiAgLCB2YWx1ZSAgICA9IHJlcXVpcmUoJy4vdmFsaWQtdmFsdWUnKVxuXG4gICwgYmluZCA9IEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLCBjYWxsID0gRnVuY3Rpb24ucHJvdG90eXBlLmNhbGwsIGtleXMgPSBPYmplY3Qua2V5c1xuICAsIHByb3BlcnR5SXNFbnVtZXJhYmxlID0gT2JqZWN0LnByb3RvdHlwZS5wcm9wZXJ0eUlzRW51bWVyYWJsZTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobWV0aG9kLCBkZWZWYWwpIHtcblx0cmV0dXJuIGZ1bmN0aW9uIChvYmosIGNiLyosIHRoaXNBcmcsIGNvbXBhcmVGbiovKSB7XG5cdFx0dmFyIGxpc3QsIHRoaXNBcmcgPSBhcmd1bWVudHNbMl0sIGNvbXBhcmVGbiA9IGFyZ3VtZW50c1szXTtcblx0XHRvYmogPSBPYmplY3QodmFsdWUob2JqKSk7XG5cdFx0Y2FsbGFibGUoY2IpO1xuXG5cdFx0bGlzdCA9IGtleXMob2JqKTtcblx0XHRpZiAoY29tcGFyZUZuKSB7XG5cdFx0XHRsaXN0LnNvcnQoKHR5cGVvZiBjb21wYXJlRm4gPT09ICdmdW5jdGlvbicpID8gYmluZC5jYWxsKGNvbXBhcmVGbiwgb2JqKSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbWV0aG9kICE9PSAnZnVuY3Rpb24nKSBtZXRob2QgPSBsaXN0W21ldGhvZF07XG5cdFx0cmV0dXJuIGNhbGwuY2FsbChtZXRob2QsIGxpc3QsIGZ1bmN0aW9uIChrZXksIGluZGV4KSB7XG5cdFx0XHRpZiAoIXByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwob2JqLCBrZXkpKSByZXR1cm4gZGVmVmFsO1xuXHRcdFx0cmV0dXJuIGNhbGwuY2FsbChjYiwgdGhpc0FyZywgb2JqW2tleV0sIGtleSwgb2JqLCBpbmRleCk7XG5cdFx0fSk7XG5cdH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vaXMtaW1wbGVtZW50ZWQnKSgpXG5cdD8gT2JqZWN0LmFzc2lnblxuXHQ6IHJlcXVpcmUoJy4vc2hpbScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIGFzc2lnbiA9IE9iamVjdC5hc3NpZ24sIG9iajtcblx0aWYgKHR5cGVvZiBhc3NpZ24gIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblx0b2JqID0geyBmb286ICdyYXonIH07XG5cdGFzc2lnbihvYmosIHsgYmFyOiAnZHdhJyB9LCB7IHRyenk6ICd0cnp5JyB9KTtcblx0cmV0dXJuIChvYmouZm9vICsgb2JqLmJhciArIG9iai50cnp5KSA9PT0gJ3JhemR3YXRyenknO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGtleXMgID0gcmVxdWlyZSgnLi4va2V5cycpXG4gICwgdmFsdWUgPSByZXF1aXJlKCcuLi92YWxpZC12YWx1ZScpXG5cbiAgLCBtYXggPSBNYXRoLm1heDtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZGVzdCwgc3JjLyosIOKApnNyY24qLykge1xuXHR2YXIgZXJyb3IsIGksIGwgPSBtYXgoYXJndW1lbnRzLmxlbmd0aCwgMiksIGFzc2lnbjtcblx0ZGVzdCA9IE9iamVjdCh2YWx1ZShkZXN0KSk7XG5cdGFzc2lnbiA9IGZ1bmN0aW9uIChrZXkpIHtcblx0XHR0cnkgeyBkZXN0W2tleV0gPSBzcmNba2V5XTsgfSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKCFlcnJvcikgZXJyb3IgPSBlO1xuXHRcdH1cblx0fTtcblx0Zm9yIChpID0gMTsgaSA8IGw7ICsraSkge1xuXHRcdHNyYyA9IGFyZ3VtZW50c1tpXTtcblx0XHRrZXlzKHNyYykuZm9yRWFjaChhc3NpZ24pO1xuXHR9XG5cdGlmIChlcnJvciAhPT0gdW5kZWZpbmVkKSB0aHJvdyBlcnJvcjtcblx0cmV0dXJuIGRlc3Q7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXNzaWduID0gcmVxdWlyZSgnLi9hc3NpZ24nKVxuICAsIHZhbHVlICA9IHJlcXVpcmUoJy4vdmFsaWQtdmFsdWUnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG5cdHZhciBjb3B5ID0gT2JqZWN0KHZhbHVlKG9iaikpO1xuXHRpZiAoY29weSAhPT0gb2JqKSByZXR1cm4gY29weTtcblx0cmV0dXJuIGFzc2lnbih7fSwgb2JqKTtcbn07XG4iLCIvLyBXb3JrYXJvdW5kIGZvciBodHRwOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yODA0XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGUsIHNoaW07XG5cbmlmICghcmVxdWlyZSgnLi9zZXQtcHJvdG90eXBlLW9mL2lzLWltcGxlbWVudGVkJykoKSkge1xuXHRzaGltID0gcmVxdWlyZSgnLi9zZXQtcHJvdG90eXBlLW9mL3NoaW0nKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24gKCkge1xuXHR2YXIgbnVsbE9iamVjdCwgcHJvcHMsIGRlc2M7XG5cdGlmICghc2hpbSkgcmV0dXJuIGNyZWF0ZTtcblx0aWYgKHNoaW0ubGV2ZWwgIT09IDEpIHJldHVybiBjcmVhdGU7XG5cblx0bnVsbE9iamVjdCA9IHt9O1xuXHRwcm9wcyA9IHt9O1xuXHRkZXNjID0geyBjb25maWd1cmFibGU6IGZhbHNlLCBlbnVtZXJhYmxlOiBmYWxzZSwgd3JpdGFibGU6IHRydWUsXG5cdFx0dmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhPYmplY3QucHJvdG90eXBlKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG5cdFx0aWYgKG5hbWUgPT09ICdfX3Byb3RvX18nKSB7XG5cdFx0XHRwcm9wc1tuYW1lXSA9IHsgY29uZmlndXJhYmxlOiB0cnVlLCBlbnVtZXJhYmxlOiBmYWxzZSwgd3JpdGFibGU6IHRydWUsXG5cdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cHJvcHNbbmFtZV0gPSBkZXNjO1xuXHR9KTtcblx0T2JqZWN0LmRlZmluZVByb3BlcnRpZXMobnVsbE9iamVjdCwgcHJvcHMpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShzaGltLCAnbnVsbFBvbHlmaWxsJywgeyBjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLCB3cml0YWJsZTogZmFsc2UsIHZhbHVlOiBudWxsT2JqZWN0IH0pO1xuXG5cdHJldHVybiBmdW5jdGlvbiAocHJvdG90eXBlLCBwcm9wcykge1xuXHRcdHJldHVybiBjcmVhdGUoKHByb3RvdHlwZSA9PT0gbnVsbCkgPyBudWxsT2JqZWN0IDogcHJvdG90eXBlLCBwcm9wcyk7XG5cdH07XG59KCkpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vX2l0ZXJhdGUnKSgnZm9yRWFjaCcpO1xuIiwiLy8gRGVwcmVjYXRlZFxuXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikgeyByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJzsgfTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIG1hcCA9IHsgZnVuY3Rpb246IHRydWUsIG9iamVjdDogdHJ1ZSB9O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG5cdHJldHVybiAoKHggIT0gbnVsbCkgJiYgbWFwW3R5cGVvZiB4XSkgfHwgZmFsc2U7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vaXMtaW1wbGVtZW50ZWQnKSgpXG5cdD8gT2JqZWN0LmtleXNcblx0OiByZXF1aXJlKCcuL3NoaW0nKTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG5cdHRyeSB7XG5cdFx0T2JqZWN0LmtleXMoJ3ByaW1pdGl2ZScpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGNhdGNoIChlKSB7IHJldHVybiBmYWxzZTsgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGtleXMgPSBPYmplY3Qua2V5cztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG5cdHJldHVybiBrZXlzKG9iamVjdCA9PSBudWxsID8gb2JqZWN0IDogT2JqZWN0KG9iamVjdCkpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNhbGxhYmxlID0gcmVxdWlyZSgnLi92YWxpZC1jYWxsYWJsZScpXG4gICwgZm9yRWFjaCAgPSByZXF1aXJlKCcuL2Zvci1lYWNoJylcblxuICAsIGNhbGwgPSBGdW5jdGlvbi5wcm90b3R5cGUuY2FsbDtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqLCBjYi8qLCB0aGlzQXJnKi8pIHtcblx0dmFyIG8gPSB7fSwgdGhpc0FyZyA9IGFyZ3VtZW50c1syXTtcblx0Y2FsbGFibGUoY2IpO1xuXHRmb3JFYWNoKG9iaiwgZnVuY3Rpb24gKHZhbHVlLCBrZXksIG9iaiwgaW5kZXgpIHtcblx0XHRvW2tleV0gPSBjYWxsLmNhbGwoY2IsIHRoaXNBcmcsIHZhbHVlLCBrZXksIG9iaiwgaW5kZXgpO1xuXHR9KTtcblx0cmV0dXJuIG87XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZm9yRWFjaCA9IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLCBjcmVhdGUgPSBPYmplY3QuY3JlYXRlO1xuXG52YXIgcHJvY2VzcyA9IGZ1bmN0aW9uIChzcmMsIG9iaikge1xuXHR2YXIga2V5O1xuXHRmb3IgKGtleSBpbiBzcmMpIG9ialtrZXldID0gc3JjW2tleV07XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvcHRpb25zLyosIOKApm9wdGlvbnMqLykge1xuXHR2YXIgcmVzdWx0ID0gY3JlYXRlKG51bGwpO1xuXHRmb3JFYWNoLmNhbGwoYXJndW1lbnRzLCBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRcdGlmIChvcHRpb25zID09IG51bGwpIHJldHVybjtcblx0XHRwcm9jZXNzKE9iamVjdChvcHRpb25zKSwgcmVzdWx0KTtcblx0fSk7XG5cdHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZm9yRWFjaCA9IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLCBjcmVhdGUgPSBPYmplY3QuY3JlYXRlO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhcmcvKiwg4oCmYXJncyovKSB7XG5cdHZhciBzZXQgPSBjcmVhdGUobnVsbCk7XG5cdGZvckVhY2guY2FsbChhcmd1bWVudHMsIGZ1bmN0aW9uIChuYW1lKSB7IHNldFtuYW1lXSA9IHRydWU7IH0pO1xuXHRyZXR1cm4gc2V0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2lzLWltcGxlbWVudGVkJykoKVxuXHQ/IE9iamVjdC5zZXRQcm90b3R5cGVPZlxuXHQ6IHJlcXVpcmUoJy4vc2hpbScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSwgZ2V0UHJvdG90eXBlT2YgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2ZcbiAgLCB4ID0ge307XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKC8qY3VzdG9tQ3JlYXRlKi8pIHtcblx0dmFyIHNldFByb3RvdHlwZU9mID0gT2JqZWN0LnNldFByb3RvdHlwZU9mXG5cdCAgLCBjdXN0b21DcmVhdGUgPSBhcmd1bWVudHNbMF0gfHwgY3JlYXRlO1xuXHRpZiAodHlwZW9mIHNldFByb3RvdHlwZU9mICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gZmFsc2U7XG5cdHJldHVybiBnZXRQcm90b3R5cGVPZihzZXRQcm90b3R5cGVPZihjdXN0b21DcmVhdGUobnVsbCksIHgpKSA9PT0geDtcbn07XG4iLCIvLyBCaWcgdGhhbmtzIHRvIEBXZWJSZWZsZWN0aW9uIGZvciBzb3J0aW5nIHRoaXMgb3V0XG4vLyBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9XZWJSZWZsZWN0aW9uLzU1OTM1NTRcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgaXNPYmplY3QgICAgICA9IHJlcXVpcmUoJy4uL2lzLW9iamVjdCcpXG4gICwgdmFsdWUgICAgICAgICA9IHJlcXVpcmUoJy4uL3ZhbGlkLXZhbHVlJylcblxuICAsIGlzUHJvdG90eXBlT2YgPSBPYmplY3QucHJvdG90eXBlLmlzUHJvdG90eXBlT2ZcbiAgLCBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eVxuICAsIG51bGxEZXNjID0geyBjb25maWd1cmFibGU6IHRydWUsIGVudW1lcmFibGU6IGZhbHNlLCB3cml0YWJsZTogdHJ1ZSxcblx0XHR2YWx1ZTogdW5kZWZpbmVkIH1cbiAgLCB2YWxpZGF0ZTtcblxudmFsaWRhdGUgPSBmdW5jdGlvbiAob2JqLCBwcm90b3R5cGUpIHtcblx0dmFsdWUob2JqKTtcblx0aWYgKChwcm90b3R5cGUgPT09IG51bGwpIHx8IGlzT2JqZWN0KHByb3RvdHlwZSkpIHJldHVybiBvYmo7XG5cdHRocm93IG5ldyBUeXBlRXJyb3IoJ1Byb3RvdHlwZSBtdXN0IGJlIG51bGwgb3IgYW4gb2JqZWN0Jyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbiAoc3RhdHVzKSB7XG5cdHZhciBmbiwgc2V0O1xuXHRpZiAoIXN0YXR1cykgcmV0dXJuIG51bGw7XG5cdGlmIChzdGF0dXMubGV2ZWwgPT09IDIpIHtcblx0XHRpZiAoc3RhdHVzLnNldCkge1xuXHRcdFx0c2V0ID0gc3RhdHVzLnNldDtcblx0XHRcdGZuID0gZnVuY3Rpb24gKG9iaiwgcHJvdG90eXBlKSB7XG5cdFx0XHRcdHNldC5jYWxsKHZhbGlkYXRlKG9iaiwgcHJvdG90eXBlKSwgcHJvdG90eXBlKTtcblx0XHRcdFx0cmV0dXJuIG9iajtcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZuID0gZnVuY3Rpb24gKG9iaiwgcHJvdG90eXBlKSB7XG5cdFx0XHRcdHZhbGlkYXRlKG9iaiwgcHJvdG90eXBlKS5fX3Byb3RvX18gPSBwcm90b3R5cGU7XG5cdFx0XHRcdHJldHVybiBvYmo7XG5cdFx0XHR9O1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHNlbGYob2JqLCBwcm90b3R5cGUpIHtcblx0XHRcdHZhciBpc051bGxCYXNlO1xuXHRcdFx0dmFsaWRhdGUob2JqLCBwcm90b3R5cGUpO1xuXHRcdFx0aXNOdWxsQmFzZSA9IGlzUHJvdG90eXBlT2YuY2FsbChzZWxmLm51bGxQb2x5ZmlsbCwgb2JqKTtcblx0XHRcdGlmIChpc051bGxCYXNlKSBkZWxldGUgc2VsZi5udWxsUG9seWZpbGwuX19wcm90b19fO1xuXHRcdFx0aWYgKHByb3RvdHlwZSA9PT0gbnVsbCkgcHJvdG90eXBlID0gc2VsZi5udWxsUG9seWZpbGw7XG5cdFx0XHRvYmouX19wcm90b19fID0gcHJvdG90eXBlO1xuXHRcdFx0aWYgKGlzTnVsbEJhc2UpIGRlZmluZVByb3BlcnR5KHNlbGYubnVsbFBvbHlmaWxsLCAnX19wcm90b19fJywgbnVsbERlc2MpO1xuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9O1xuXHR9XG5cdHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydHkoZm4sICdsZXZlbCcsIHsgY29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSwgd3JpdGFibGU6IGZhbHNlLCB2YWx1ZTogc3RhdHVzLmxldmVsIH0pO1xufSgoZnVuY3Rpb24gKCkge1xuXHR2YXIgeCA9IE9iamVjdC5jcmVhdGUobnVsbCksIHkgPSB7fSwgc2V0XG5cdCAgLCBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihPYmplY3QucHJvdG90eXBlLCAnX19wcm90b19fJyk7XG5cblx0aWYgKGRlc2MpIHtcblx0XHR0cnkge1xuXHRcdFx0c2V0ID0gZGVzYy5zZXQ7IC8vIE9wZXJhIGNyYXNoZXMgYXQgdGhpcyBwb2ludFxuXHRcdFx0c2V0LmNhbGwoeCwgeSk7XG5cdFx0fSBjYXRjaCAoaWdub3JlKSB7IH1cblx0XHRpZiAoT2JqZWN0LmdldFByb3RvdHlwZU9mKHgpID09PSB5KSByZXR1cm4geyBzZXQ6IHNldCwgbGV2ZWw6IDIgfTtcblx0fVxuXG5cdHguX19wcm90b19fID0geTtcblx0aWYgKE9iamVjdC5nZXRQcm90b3R5cGVPZih4KSA9PT0geSkgcmV0dXJuIHsgbGV2ZWw6IDIgfTtcblxuXHR4ID0ge307XG5cdHguX19wcm90b19fID0geTtcblx0aWYgKE9iamVjdC5nZXRQcm90b3R5cGVPZih4KSA9PT0geSkgcmV0dXJuIHsgbGV2ZWw6IDEgfTtcblxuXHRyZXR1cm4gZmFsc2U7XG59KCkpKSk7XG5cbnJlcXVpcmUoJy4uL2NyZWF0ZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChmbikge1xuXHRpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB0aHJvdyBuZXcgVHlwZUVycm9yKGZuICsgXCIgaXMgbm90IGEgZnVuY3Rpb25cIik7XG5cdHJldHVybiBmbjtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmICh2YWx1ZSA9PSBudWxsKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHVzZSBudWxsIG9yIHVuZGVmaW5lZFwiKTtcblx0cmV0dXJuIHZhbHVlO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2lzLWltcGxlbWVudGVkJykoKVxuXHQ/IFN0cmluZy5wcm90b3R5cGUuY29udGFpbnNcblx0OiByZXF1aXJlKCcuL3NoaW0nKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0ciA9ICdyYXpkd2F0cnp5JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG5cdGlmICh0eXBlb2Ygc3RyLmNvbnRhaW5zICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gZmFsc2U7XG5cdHJldHVybiAoKHN0ci5jb250YWlucygnZHdhJykgPT09IHRydWUpICYmIChzdHIuY29udGFpbnMoJ2ZvbycpID09PSBmYWxzZSkpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGluZGV4T2YgPSBTdHJpbmcucHJvdG90eXBlLmluZGV4T2Y7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHNlYXJjaFN0cmluZy8qLCBwb3NpdGlvbiovKSB7XG5cdHJldHVybiBpbmRleE9mLmNhbGwodGhpcywgc2VhcmNoU3RyaW5nLCBhcmd1bWVudHNbMV0pID4gLTE7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbiAgLCBpZCA9IHRvU3RyaW5nLmNhbGwoJycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh4KSB7XG5cdHJldHVybiAodHlwZW9mIHggPT09ICdzdHJpbmcnKSB8fCAoeCAmJiAodHlwZW9mIHggPT09ICdvYmplY3QnKSAmJlxuXHRcdCgoeCBpbnN0YW5jZW9mIFN0cmluZykgfHwgKHRvU3RyaW5nLmNhbGwoeCkgPT09IGlkKSkpIHx8IGZhbHNlO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHNldFByb3RvdHlwZU9mID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3Qvc2V0LXByb3RvdHlwZS1vZicpXG4gICwgY29udGFpbnMgICAgICAgPSByZXF1aXJlKCdlczUtZXh0L3N0cmluZy8jL2NvbnRhaW5zJylcbiAgLCBkICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2QnKVxuICAsIEl0ZXJhdG9yICAgICAgID0gcmVxdWlyZSgnLi8nKVxuXG4gICwgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHlcbiAgLCBBcnJheUl0ZXJhdG9yO1xuXG5BcnJheUl0ZXJhdG9yID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJyLCBraW5kKSB7XG5cdGlmICghKHRoaXMgaW5zdGFuY2VvZiBBcnJheUl0ZXJhdG9yKSkgcmV0dXJuIG5ldyBBcnJheUl0ZXJhdG9yKGFyciwga2luZCk7XG5cdEl0ZXJhdG9yLmNhbGwodGhpcywgYXJyKTtcblx0aWYgKCFraW5kKSBraW5kID0gJ3ZhbHVlJztcblx0ZWxzZSBpZiAoY29udGFpbnMuY2FsbChraW5kLCAna2V5K3ZhbHVlJykpIGtpbmQgPSAna2V5K3ZhbHVlJztcblx0ZWxzZSBpZiAoY29udGFpbnMuY2FsbChraW5kLCAna2V5JykpIGtpbmQgPSAna2V5Jztcblx0ZWxzZSBraW5kID0gJ3ZhbHVlJztcblx0ZGVmaW5lUHJvcGVydHkodGhpcywgJ19fa2luZF9fJywgZCgnJywga2luZCkpO1xufTtcbmlmIChzZXRQcm90b3R5cGVPZikgc2V0UHJvdG90eXBlT2YoQXJyYXlJdGVyYXRvciwgSXRlcmF0b3IpO1xuXG5BcnJheUl0ZXJhdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoSXRlcmF0b3IucHJvdG90eXBlLCB7XG5cdGNvbnN0cnVjdG9yOiBkKEFycmF5SXRlcmF0b3IpLFxuXHRfcmVzb2x2ZTogZChmdW5jdGlvbiAoaSkge1xuXHRcdGlmICh0aGlzLl9fa2luZF9fID09PSAndmFsdWUnKSByZXR1cm4gdGhpcy5fX2xpc3RfX1tpXTtcblx0XHRpZiAodGhpcy5fX2tpbmRfXyA9PT0gJ2tleSt2YWx1ZScpIHJldHVybiBbaSwgdGhpcy5fX2xpc3RfX1tpXV07XG5cdFx0cmV0dXJuIGk7XG5cdH0pLFxuXHR0b1N0cmluZzogZChmdW5jdGlvbiAoKSB7IHJldHVybiAnW29iamVjdCBBcnJheSBJdGVyYXRvcl0nOyB9KVxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBpc0FyZ3VtZW50cyA9IHJlcXVpcmUoJ2VzNS1leHQvZnVuY3Rpb24vaXMtYXJndW1lbnRzJylcbiAgLCBjYWxsYWJsZSAgICA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L3ZhbGlkLWNhbGxhYmxlJylcbiAgLCBpc1N0cmluZyAgICA9IHJlcXVpcmUoJ2VzNS1leHQvc3RyaW5nL2lzLXN0cmluZycpXG4gICwgZ2V0ICAgICAgICAgPSByZXF1aXJlKCcuL2dldCcpXG5cbiAgLCBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSwgY2FsbCA9IEZ1bmN0aW9uLnByb3RvdHlwZS5jYWxsXG4gICwgc29tZSA9IEFycmF5LnByb3RvdHlwZS5zb21lO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChpdGVyYWJsZSwgY2IvKiwgdGhpc0FyZyovKSB7XG5cdHZhciBtb2RlLCB0aGlzQXJnID0gYXJndW1lbnRzWzJdLCByZXN1bHQsIGRvQnJlYWssIGJyb2tlbiwgaSwgbCwgY2hhciwgY29kZTtcblx0aWYgKGlzQXJyYXkoaXRlcmFibGUpIHx8IGlzQXJndW1lbnRzKGl0ZXJhYmxlKSkgbW9kZSA9ICdhcnJheSc7XG5cdGVsc2UgaWYgKGlzU3RyaW5nKGl0ZXJhYmxlKSkgbW9kZSA9ICdzdHJpbmcnO1xuXHRlbHNlIGl0ZXJhYmxlID0gZ2V0KGl0ZXJhYmxlKTtcblxuXHRjYWxsYWJsZShjYik7XG5cdGRvQnJlYWsgPSBmdW5jdGlvbiAoKSB7IGJyb2tlbiA9IHRydWU7IH07XG5cdGlmIChtb2RlID09PSAnYXJyYXknKSB7XG5cdFx0c29tZS5jYWxsKGl0ZXJhYmxlLCBmdW5jdGlvbiAodmFsdWUpIHtcblx0XHRcdGNhbGwuY2FsbChjYiwgdGhpc0FyZywgdmFsdWUsIGRvQnJlYWspO1xuXHRcdFx0aWYgKGJyb2tlbikgcmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChtb2RlID09PSAnc3RyaW5nJykge1xuXHRcdGwgPSBpdGVyYWJsZS5sZW5ndGg7XG5cdFx0Zm9yIChpID0gMDsgaSA8IGw7ICsraSkge1xuXHRcdFx0Y2hhciA9IGl0ZXJhYmxlW2ldO1xuXHRcdFx0aWYgKChpICsgMSkgPCBsKSB7XG5cdFx0XHRcdGNvZGUgPSBjaGFyLmNoYXJDb2RlQXQoMCk7XG5cdFx0XHRcdGlmICgoY29kZSA+PSAweEQ4MDApICYmIChjb2RlIDw9IDB4REJGRikpIGNoYXIgKz0gaXRlcmFibGVbKytpXTtcblx0XHRcdH1cblx0XHRcdGNhbGwuY2FsbChjYiwgdGhpc0FyZywgY2hhciwgZG9CcmVhayk7XG5cdFx0XHRpZiAoYnJva2VuKSBicmVhaztcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHJlc3VsdCA9IGl0ZXJhYmxlLm5leHQoKTtcblxuXHR3aGlsZSAoIXJlc3VsdC5kb25lKSB7XG5cdFx0Y2FsbC5jYWxsKGNiLCB0aGlzQXJnLCByZXN1bHQudmFsdWUsIGRvQnJlYWspO1xuXHRcdGlmIChicm9rZW4pIHJldHVybjtcblx0XHRyZXN1bHQgPSBpdGVyYWJsZS5uZXh0KCk7XG5cdH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBpc0FyZ3VtZW50cyAgICA9IHJlcXVpcmUoJ2VzNS1leHQvZnVuY3Rpb24vaXMtYXJndW1lbnRzJylcbiAgLCBpc1N0cmluZyAgICAgICA9IHJlcXVpcmUoJ2VzNS1leHQvc3RyaW5nL2lzLXN0cmluZycpXG4gICwgQXJyYXlJdGVyYXRvciAgPSByZXF1aXJlKCcuL2FycmF5JylcbiAgLCBTdHJpbmdJdGVyYXRvciA9IHJlcXVpcmUoJy4vc3RyaW5nJylcbiAgLCBpdGVyYWJsZSAgICAgICA9IHJlcXVpcmUoJy4vdmFsaWQtaXRlcmFibGUnKVxuICAsIGl0ZXJhdG9yU3ltYm9sID0gcmVxdWlyZSgnZXM2LXN5bWJvbCcpLml0ZXJhdG9yO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcblx0aWYgKHR5cGVvZiBpdGVyYWJsZShvYmopW2l0ZXJhdG9yU3ltYm9sXSA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIG9ialtpdGVyYXRvclN5bWJvbF0oKTtcblx0aWYgKGlzQXJndW1lbnRzKG9iaikpIHJldHVybiBuZXcgQXJyYXlJdGVyYXRvcihvYmopO1xuXHRpZiAoaXNTdHJpbmcob2JqKSkgcmV0dXJuIG5ldyBTdHJpbmdJdGVyYXRvcihvYmopO1xuXHRyZXR1cm4gbmV3IEFycmF5SXRlcmF0b3Iob2JqKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjbGVhciAgICA9IHJlcXVpcmUoJ2VzNS1leHQvYXJyYXkvIy9jbGVhcicpXG4gICwgYXNzaWduICAgPSByZXF1aXJlKCdlczUtZXh0L29iamVjdC9hc3NpZ24nKVxuICAsIGNhbGxhYmxlID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvdmFsaWQtY2FsbGFibGUnKVxuICAsIHZhbHVlICAgID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvdmFsaWQtdmFsdWUnKVxuICAsIGQgICAgICAgID0gcmVxdWlyZSgnZCcpXG4gICwgYXV0b0JpbmQgPSByZXF1aXJlKCdkL2F1dG8tYmluZCcpXG4gICwgU3ltYm9sICAgPSByZXF1aXJlKCdlczYtc3ltYm9sJylcblxuICAsIGRlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5XG4gICwgZGVmaW5lUHJvcGVydGllcyA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzXG4gICwgSXRlcmF0b3I7XG5cbm1vZHVsZS5leHBvcnRzID0gSXRlcmF0b3IgPSBmdW5jdGlvbiAobGlzdCwgY29udGV4dCkge1xuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgSXRlcmF0b3IpKSByZXR1cm4gbmV3IEl0ZXJhdG9yKGxpc3QsIGNvbnRleHQpO1xuXHRkZWZpbmVQcm9wZXJ0aWVzKHRoaXMsIHtcblx0XHRfX2xpc3RfXzogZCgndycsIHZhbHVlKGxpc3QpKSxcblx0XHRfX2NvbnRleHRfXzogZCgndycsIGNvbnRleHQpLFxuXHRcdF9fbmV4dEluZGV4X186IGQoJ3cnLCAwKVxuXHR9KTtcblx0aWYgKCFjb250ZXh0KSByZXR1cm47XG5cdGNhbGxhYmxlKGNvbnRleHQub24pO1xuXHRjb250ZXh0Lm9uKCdfYWRkJywgdGhpcy5fb25BZGQpO1xuXHRjb250ZXh0Lm9uKCdfZGVsZXRlJywgdGhpcy5fb25EZWxldGUpO1xuXHRjb250ZXh0Lm9uKCdfY2xlYXInLCB0aGlzLl9vbkNsZWFyKTtcbn07XG5cbmRlZmluZVByb3BlcnRpZXMoSXRlcmF0b3IucHJvdG90eXBlLCBhc3NpZ24oe1xuXHRjb25zdHJ1Y3RvcjogZChJdGVyYXRvciksXG5cdF9uZXh0OiBkKGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgaTtcblx0XHRpZiAoIXRoaXMuX19saXN0X18pIHJldHVybjtcblx0XHRpZiAodGhpcy5fX3JlZG9fXykge1xuXHRcdFx0aSA9IHRoaXMuX19yZWRvX18uc2hpZnQoKTtcblx0XHRcdGlmIChpICE9PSB1bmRlZmluZWQpIHJldHVybiBpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fX25leHRJbmRleF9fIDwgdGhpcy5fX2xpc3RfXy5sZW5ndGgpIHJldHVybiB0aGlzLl9fbmV4dEluZGV4X18rKztcblx0XHR0aGlzLl91bkJpbmQoKTtcblx0fSksXG5cdG5leHQ6IGQoZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5fY3JlYXRlUmVzdWx0KHRoaXMuX25leHQoKSk7IH0pLFxuXHRfY3JlYXRlUmVzdWx0OiBkKGZ1bmN0aW9uIChpKSB7XG5cdFx0aWYgKGkgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdHJldHVybiB7IGRvbmU6IGZhbHNlLCB2YWx1ZTogdGhpcy5fcmVzb2x2ZShpKSB9O1xuXHR9KSxcblx0X3Jlc29sdmU6IGQoZnVuY3Rpb24gKGkpIHsgcmV0dXJuIHRoaXMuX19saXN0X19baV07IH0pLFxuXHRfdW5CaW5kOiBkKGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLl9fbGlzdF9fID0gbnVsbDtcblx0XHRkZWxldGUgdGhpcy5fX3JlZG9fXztcblx0XHRpZiAoIXRoaXMuX19jb250ZXh0X18pIHJldHVybjtcblx0XHR0aGlzLl9fY29udGV4dF9fLm9mZignX2FkZCcsIHRoaXMuX29uQWRkKTtcblx0XHR0aGlzLl9fY29udGV4dF9fLm9mZignX2RlbGV0ZScsIHRoaXMuX29uRGVsZXRlKTtcblx0XHR0aGlzLl9fY29udGV4dF9fLm9mZignX2NsZWFyJywgdGhpcy5fb25DbGVhcik7XG5cdFx0dGhpcy5fX2NvbnRleHRfXyA9IG51bGw7XG5cdH0pLFxuXHR0b1N0cmluZzogZChmdW5jdGlvbiAoKSB7IHJldHVybiAnW29iamVjdCBJdGVyYXRvcl0nOyB9KVxufSwgYXV0b0JpbmQoe1xuXHRfb25BZGQ6IGQoZnVuY3Rpb24gKGluZGV4KSB7XG5cdFx0aWYgKGluZGV4ID49IHRoaXMuX19uZXh0SW5kZXhfXykgcmV0dXJuO1xuXHRcdCsrdGhpcy5fX25leHRJbmRleF9fO1xuXHRcdGlmICghdGhpcy5fX3JlZG9fXykge1xuXHRcdFx0ZGVmaW5lUHJvcGVydHkodGhpcywgJ19fcmVkb19fJywgZCgnYycsIFtpbmRleF0pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fX3JlZG9fXy5mb3JFYWNoKGZ1bmN0aW9uIChyZWRvLCBpKSB7XG5cdFx0XHRpZiAocmVkbyA+PSBpbmRleCkgdGhpcy5fX3JlZG9fX1tpXSA9ICsrcmVkbztcblx0XHR9LCB0aGlzKTtcblx0XHR0aGlzLl9fcmVkb19fLnB1c2goaW5kZXgpO1xuXHR9KSxcblx0X29uRGVsZXRlOiBkKGZ1bmN0aW9uIChpbmRleCkge1xuXHRcdHZhciBpO1xuXHRcdGlmIChpbmRleCA+PSB0aGlzLl9fbmV4dEluZGV4X18pIHJldHVybjtcblx0XHQtLXRoaXMuX19uZXh0SW5kZXhfXztcblx0XHRpZiAoIXRoaXMuX19yZWRvX18pIHJldHVybjtcblx0XHRpID0gdGhpcy5fX3JlZG9fXy5pbmRleE9mKGluZGV4KTtcblx0XHRpZiAoaSAhPT0gLTEpIHRoaXMuX19yZWRvX18uc3BsaWNlKGksIDEpO1xuXHRcdHRoaXMuX19yZWRvX18uZm9yRWFjaChmdW5jdGlvbiAocmVkbywgaSkge1xuXHRcdFx0aWYgKHJlZG8gPiBpbmRleCkgdGhpcy5fX3JlZG9fX1tpXSA9IC0tcmVkbztcblx0XHR9LCB0aGlzKTtcblx0fSksXG5cdF9vbkNsZWFyOiBkKGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5fX3JlZG9fXykgY2xlYXIuY2FsbCh0aGlzLl9fcmVkb19fKTtcblx0XHR0aGlzLl9fbmV4dEluZGV4X18gPSAwO1xuXHR9KVxufSkpKTtcblxuZGVmaW5lUHJvcGVydHkoSXRlcmF0b3IucHJvdG90eXBlLCBTeW1ib2wuaXRlcmF0b3IsIGQoZnVuY3Rpb24gKCkge1xuXHRyZXR1cm4gdGhpcztcbn0pKTtcbmRlZmluZVByb3BlcnR5KEl0ZXJhdG9yLnByb3RvdHlwZSwgU3ltYm9sLnRvU3RyaW5nVGFnLCBkKCcnLCAnSXRlcmF0b3InKSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBpc0FyZ3VtZW50cyAgICA9IHJlcXVpcmUoJ2VzNS1leHQvZnVuY3Rpb24vaXMtYXJndW1lbnRzJylcbiAgLCBpc1N0cmluZyAgICAgICA9IHJlcXVpcmUoJ2VzNS1leHQvc3RyaW5nL2lzLXN0cmluZycpXG4gICwgaXRlcmF0b3JTeW1ib2wgPSByZXF1aXJlKCdlczYtc3ltYm9sJykuaXRlcmF0b3JcblxuICAsIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuXHRpZiAoaXNBcnJheSh2YWx1ZSkpIHJldHVybiB0cnVlO1xuXHRpZiAoaXNTdHJpbmcodmFsdWUpKSByZXR1cm4gdHJ1ZTtcblx0aWYgKGlzQXJndW1lbnRzKHZhbHVlKSkgcmV0dXJuIHRydWU7XG5cdHJldHVybiAodHlwZW9mIHZhbHVlW2l0ZXJhdG9yU3ltYm9sXSA9PT0gJ2Z1bmN0aW9uJyk7XG59O1xuIiwiLy8gVGhhbmtzIEBtYXRoaWFzYnluZW5zXG4vLyBodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LXVuaWNvZGUjaXRlcmF0aW5nLW92ZXItc3ltYm9sc1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzZXRQcm90b3R5cGVPZiA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L3NldC1wcm90b3R5cGUtb2YnKVxuICAsIGQgICAgICAgICAgICAgID0gcmVxdWlyZSgnZCcpXG4gICwgSXRlcmF0b3IgICAgICAgPSByZXF1aXJlKCcuLycpXG5cbiAgLCBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eVxuICAsIFN0cmluZ0l0ZXJhdG9yO1xuXG5TdHJpbmdJdGVyYXRvciA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHN0cikge1xuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgU3RyaW5nSXRlcmF0b3IpKSByZXR1cm4gbmV3IFN0cmluZ0l0ZXJhdG9yKHN0cik7XG5cdHN0ciA9IFN0cmluZyhzdHIpO1xuXHRJdGVyYXRvci5jYWxsKHRoaXMsIHN0cik7XG5cdGRlZmluZVByb3BlcnR5KHRoaXMsICdfX2xlbmd0aF9fJywgZCgnJywgc3RyLmxlbmd0aCkpO1xuXG59O1xuaWYgKHNldFByb3RvdHlwZU9mKSBzZXRQcm90b3R5cGVPZihTdHJpbmdJdGVyYXRvciwgSXRlcmF0b3IpO1xuXG5TdHJpbmdJdGVyYXRvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEl0ZXJhdG9yLnByb3RvdHlwZSwge1xuXHRjb25zdHJ1Y3RvcjogZChTdHJpbmdJdGVyYXRvciksXG5cdF9uZXh0OiBkKGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXRoaXMuX19saXN0X18pIHJldHVybjtcblx0XHRpZiAodGhpcy5fX25leHRJbmRleF9fIDwgdGhpcy5fX2xlbmd0aF9fKSByZXR1cm4gdGhpcy5fX25leHRJbmRleF9fKys7XG5cdFx0dGhpcy5fdW5CaW5kKCk7XG5cdH0pLFxuXHRfcmVzb2x2ZTogZChmdW5jdGlvbiAoaSkge1xuXHRcdHZhciBjaGFyID0gdGhpcy5fX2xpc3RfX1tpXSwgY29kZTtcblx0XHRpZiAodGhpcy5fX25leHRJbmRleF9fID09PSB0aGlzLl9fbGVuZ3RoX18pIHJldHVybiBjaGFyO1xuXHRcdGNvZGUgPSBjaGFyLmNoYXJDb2RlQXQoMCk7XG5cdFx0aWYgKChjb2RlID49IDB4RDgwMCkgJiYgKGNvZGUgPD0gMHhEQkZGKSkgcmV0dXJuIGNoYXIgKyB0aGlzLl9fbGlzdF9fW3RoaXMuX19uZXh0SW5kZXhfXysrXTtcblx0XHRyZXR1cm4gY2hhcjtcblx0fSksXG5cdHRvU3RyaW5nOiBkKGZ1bmN0aW9uICgpIHsgcmV0dXJuICdbb2JqZWN0IFN0cmluZyBJdGVyYXRvcl0nOyB9KVxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBpc0l0ZXJhYmxlID0gcmVxdWlyZSgnLi9pcy1pdGVyYWJsZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRpZiAoIWlzSXRlcmFibGUodmFsdWUpKSB0aHJvdyBuZXcgVHlwZUVycm9yKHZhbHVlICsgXCIgaXMgbm90IGl0ZXJhYmxlXCIpO1xuXHRyZXR1cm4gdmFsdWU7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vaXMtaW1wbGVtZW50ZWQnKSgpID8gTWFwIDogcmVxdWlyZSgnLi9wb2x5ZmlsbCcpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIG1hcCwgaXRlcmF0b3IsIHJlc3VsdDtcblx0aWYgKHR5cGVvZiBNYXAgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblx0dHJ5IHtcblx0XHQvLyBXZWJLaXQgZG9lc24ndCBzdXBwb3J0IGFyZ3VtZW50cyBhbmQgY3Jhc2hlc1xuXHRcdG1hcCA9IG5ldyBNYXAoW1sncmF6JywgJ29uZSddLCBbJ2R3YScsICd0d28nXSwgWyd0cnp5JywgJ3RocmVlJ11dKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoU3RyaW5nKG1hcCkgIT09ICdbb2JqZWN0IE1hcF0nKSByZXR1cm4gZmFsc2U7XG5cdGlmIChtYXAuc2l6ZSAhPT0gMykgcmV0dXJuIGZhbHNlO1xuXHRpZiAodHlwZW9mIG1hcC5jbGVhciAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuXHRpZiAodHlwZW9mIG1hcC5kZWxldGUgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblx0aWYgKHR5cGVvZiBtYXAuZW50cmllcyAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuXHRpZiAodHlwZW9mIG1hcC5mb3JFYWNoICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gZmFsc2U7XG5cdGlmICh0eXBlb2YgbWFwLmdldCAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuXHRpZiAodHlwZW9mIG1hcC5oYXMgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblx0aWYgKHR5cGVvZiBtYXAua2V5cyAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuXHRpZiAodHlwZW9mIG1hcC5zZXQgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblx0aWYgKHR5cGVvZiBtYXAudmFsdWVzICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gZmFsc2U7XG5cblx0aXRlcmF0b3IgPSBtYXAuZW50cmllcygpO1xuXHRyZXN1bHQgPSBpdGVyYXRvci5uZXh0KCk7XG5cdGlmIChyZXN1bHQuZG9uZSAhPT0gZmFsc2UpIHJldHVybiBmYWxzZTtcblx0aWYgKCFyZXN1bHQudmFsdWUpIHJldHVybiBmYWxzZTtcblx0aWYgKHJlc3VsdC52YWx1ZVswXSAhPT0gJ3JheicpIHJldHVybiBmYWxzZTtcblx0aWYgKHJlc3VsdC52YWx1ZVsxXSAhPT0gJ29uZScpIHJldHVybiBmYWxzZTtcblxuXHRyZXR1cm4gdHJ1ZTtcbn07XG4iLCIvLyBFeHBvcnRzIHRydWUgaWYgZW52aXJvbm1lbnQgcHJvdmlkZXMgbmF0aXZlIGBNYXBgIGltcGxlbWVudGF0aW9uLFxuLy8gd2hhdGV2ZXIgdGhhdCBpcy5cblxuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbiAoKSB7XG5cdGlmICh0eXBlb2YgTWFwID09PSAndW5kZWZpbmVkJykgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChuZXcgTWFwKCkpID09PSAnW29iamVjdCBNYXBdJyk7XG59KCkpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L3ByaW1pdGl2ZS1zZXQnKSgna2V5Jyxcblx0J3ZhbHVlJywgJ2tleSt2YWx1ZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc2V0UHJvdG90eXBlT2YgICAgPSByZXF1aXJlKCdlczUtZXh0L29iamVjdC9zZXQtcHJvdG90eXBlLW9mJylcbiAgLCBkICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2QnKVxuICAsIEl0ZXJhdG9yICAgICAgICAgID0gcmVxdWlyZSgnZXM2LWl0ZXJhdG9yJylcbiAgLCB0b1N0cmluZ1RhZ1N5bWJvbCA9IHJlcXVpcmUoJ2VzNi1zeW1ib2wnKS50b1N0cmluZ1RhZ1xuICAsIGtpbmRzICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9pdGVyYXRvci1raW5kcycpXG5cbiAgLCBkZWZpbmVQcm9wZXJ0aWVzID0gT2JqZWN0LmRlZmluZVByb3BlcnRpZXNcbiAgLCB1bkJpbmQgPSBJdGVyYXRvci5wcm90b3R5cGUuX3VuQmluZFxuICAsIE1hcEl0ZXJhdG9yO1xuXG5NYXBJdGVyYXRvciA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1hcCwga2luZCkge1xuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgTWFwSXRlcmF0b3IpKSByZXR1cm4gbmV3IE1hcEl0ZXJhdG9yKG1hcCwga2luZCk7XG5cdEl0ZXJhdG9yLmNhbGwodGhpcywgbWFwLl9fbWFwS2V5c0RhdGFfXywgbWFwKTtcblx0aWYgKCFraW5kIHx8ICFraW5kc1traW5kXSkga2luZCA9ICdrZXkrdmFsdWUnO1xuXHRkZWZpbmVQcm9wZXJ0aWVzKHRoaXMsIHtcblx0XHRfX2tpbmRfXzogZCgnJywga2luZCksXG5cdFx0X192YWx1ZXNfXzogZCgndycsIG1hcC5fX21hcFZhbHVlc0RhdGFfXylcblx0fSk7XG59O1xuaWYgKHNldFByb3RvdHlwZU9mKSBzZXRQcm90b3R5cGVPZihNYXBJdGVyYXRvciwgSXRlcmF0b3IpO1xuXG5NYXBJdGVyYXRvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEl0ZXJhdG9yLnByb3RvdHlwZSwge1xuXHRjb25zdHJ1Y3RvcjogZChNYXBJdGVyYXRvciksXG5cdF9yZXNvbHZlOiBkKGZ1bmN0aW9uIChpKSB7XG5cdFx0aWYgKHRoaXMuX19raW5kX18gPT09ICd2YWx1ZScpIHJldHVybiB0aGlzLl9fdmFsdWVzX19baV07XG5cdFx0aWYgKHRoaXMuX19raW5kX18gPT09ICdrZXknKSByZXR1cm4gdGhpcy5fX2xpc3RfX1tpXTtcblx0XHRyZXR1cm4gW3RoaXMuX19saXN0X19baV0sIHRoaXMuX192YWx1ZXNfX1tpXV07XG5cdH0pLFxuXHRfdW5CaW5kOiBkKGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLl9fdmFsdWVzX18gPSBudWxsO1xuXHRcdHVuQmluZC5jYWxsKHRoaXMpO1xuXHR9KSxcblx0dG9TdHJpbmc6IGQoZnVuY3Rpb24gKCkgeyByZXR1cm4gJ1tvYmplY3QgTWFwIEl0ZXJhdG9yXSc7IH0pXG59KTtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShNYXBJdGVyYXRvci5wcm90b3R5cGUsIHRvU3RyaW5nVGFnU3ltYm9sLFxuXHRkKCdjJywgJ01hcCBJdGVyYXRvcicpKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNsZWFyICAgICAgICAgID0gcmVxdWlyZSgnZXM1LWV4dC9hcnJheS8jL2NsZWFyJylcbiAgLCBlSW5kZXhPZiAgICAgICA9IHJlcXVpcmUoJ2VzNS1leHQvYXJyYXkvIy9lLWluZGV4LW9mJylcbiAgLCBzZXRQcm90b3R5cGVPZiA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L3NldC1wcm90b3R5cGUtb2YnKVxuICAsIGNhbGxhYmxlICAgICAgID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvdmFsaWQtY2FsbGFibGUnKVxuICAsIHZhbGlkVmFsdWUgICAgID0gcmVxdWlyZSgnZXM1LWV4dC9vYmplY3QvdmFsaWQtdmFsdWUnKVxuICAsIGQgICAgICAgICAgICAgID0gcmVxdWlyZSgnZCcpXG4gICwgZWUgICAgICAgICAgICAgPSByZXF1aXJlKCdldmVudC1lbWl0dGVyJylcbiAgLCBTeW1ib2wgICAgICAgICA9IHJlcXVpcmUoJ2VzNi1zeW1ib2wnKVxuICAsIGl0ZXJhdG9yICAgICAgID0gcmVxdWlyZSgnZXM2LWl0ZXJhdG9yL3ZhbGlkLWl0ZXJhYmxlJylcbiAgLCBmb3JPZiAgICAgICAgICA9IHJlcXVpcmUoJ2VzNi1pdGVyYXRvci9mb3Itb2YnKVxuICAsIEl0ZXJhdG9yICAgICAgID0gcmVxdWlyZSgnLi9saWIvaXRlcmF0b3InKVxuICAsIGlzTmF0aXZlICAgICAgID0gcmVxdWlyZSgnLi9pcy1uYXRpdmUtaW1wbGVtZW50ZWQnKVxuXG4gICwgY2FsbCA9IEZ1bmN0aW9uLnByb3RvdHlwZS5jYWxsXG4gICwgZGVmaW5lUHJvcGVydGllcyA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzLCBnZXRQcm90b3R5cGVPZiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZlxuICAsIE1hcFBvbHk7XG5cbm1vZHVsZS5leHBvcnRzID0gTWFwUG9seSA9IGZ1bmN0aW9uICgvKml0ZXJhYmxlKi8pIHtcblx0dmFyIGl0ZXJhYmxlID0gYXJndW1lbnRzWzBdLCBrZXlzLCB2YWx1ZXMsIHNlbGY7XG5cdGlmICghKHRoaXMgaW5zdGFuY2VvZiBNYXBQb2x5KSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQ29uc3RydWN0b3IgcmVxdWlyZXMgXFwnbmV3XFwnJyk7XG5cdGlmIChpc05hdGl2ZSAmJiBzZXRQcm90b3R5cGVPZiAmJiAoTWFwICE9PSBNYXBQb2x5KSkge1xuXHRcdHNlbGYgPSBzZXRQcm90b3R5cGVPZihuZXcgTWFwKCksIGdldFByb3RvdHlwZU9mKHRoaXMpKTtcblx0fSBlbHNlIHtcblx0XHRzZWxmID0gdGhpcztcblx0fVxuXHRpZiAoaXRlcmFibGUgIT0gbnVsbCkgaXRlcmF0b3IoaXRlcmFibGUpO1xuXHRkZWZpbmVQcm9wZXJ0aWVzKHNlbGYsIHtcblx0XHRfX21hcEtleXNEYXRhX186IGQoJ2MnLCBrZXlzID0gW10pLFxuXHRcdF9fbWFwVmFsdWVzRGF0YV9fOiBkKCdjJywgdmFsdWVzID0gW10pXG5cdH0pO1xuXHRpZiAoIWl0ZXJhYmxlKSByZXR1cm4gc2VsZjtcblx0Zm9yT2YoaXRlcmFibGUsIGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRcdHZhciBrZXkgPSB2YWxpZFZhbHVlKHZhbHVlKVswXTtcblx0XHR2YWx1ZSA9IHZhbHVlWzFdO1xuXHRcdGlmIChlSW5kZXhPZi5jYWxsKGtleXMsIGtleSkgIT09IC0xKSByZXR1cm47XG5cdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0dmFsdWVzLnB1c2godmFsdWUpO1xuXHR9LCBzZWxmKTtcblx0cmV0dXJuIHNlbGY7XG59O1xuXG5pZiAoaXNOYXRpdmUpIHtcblx0aWYgKHNldFByb3RvdHlwZU9mKSBzZXRQcm90b3R5cGVPZihNYXBQb2x5LCBNYXApO1xuXHRNYXBQb2x5LnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoTWFwLnByb3RvdHlwZSwge1xuXHRcdGNvbnN0cnVjdG9yOiBkKE1hcFBvbHkpXG5cdH0pO1xufVxuXG5lZShkZWZpbmVQcm9wZXJ0aWVzKE1hcFBvbHkucHJvdG90eXBlLCB7XG5cdGNsZWFyOiBkKGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXRoaXMuX19tYXBLZXlzRGF0YV9fLmxlbmd0aCkgcmV0dXJuO1xuXHRcdGNsZWFyLmNhbGwodGhpcy5fX21hcEtleXNEYXRhX18pO1xuXHRcdGNsZWFyLmNhbGwodGhpcy5fX21hcFZhbHVlc0RhdGFfXyk7XG5cdFx0dGhpcy5lbWl0KCdfY2xlYXInKTtcblx0fSksXG5cdGRlbGV0ZTogZChmdW5jdGlvbiAoa2V5KSB7XG5cdFx0dmFyIGluZGV4ID0gZUluZGV4T2YuY2FsbCh0aGlzLl9fbWFwS2V5c0RhdGFfXywga2V5KTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSByZXR1cm4gZmFsc2U7XG5cdFx0dGhpcy5fX21hcEtleXNEYXRhX18uc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLl9fbWFwVmFsdWVzRGF0YV9fLnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5lbWl0KCdfZGVsZXRlJywgaW5kZXgsIGtleSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pLFxuXHRlbnRyaWVzOiBkKGZ1bmN0aW9uICgpIHsgcmV0dXJuIG5ldyBJdGVyYXRvcih0aGlzLCAna2V5K3ZhbHVlJyk7IH0pLFxuXHRmb3JFYWNoOiBkKGZ1bmN0aW9uIChjYi8qLCB0aGlzQXJnKi8pIHtcblx0XHR2YXIgdGhpc0FyZyA9IGFyZ3VtZW50c1sxXSwgaXRlcmF0b3IsIHJlc3VsdDtcblx0XHRjYWxsYWJsZShjYik7XG5cdFx0aXRlcmF0b3IgPSB0aGlzLmVudHJpZXMoKTtcblx0XHRyZXN1bHQgPSBpdGVyYXRvci5fbmV4dCgpO1xuXHRcdHdoaWxlIChyZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2FsbC5jYWxsKGNiLCB0aGlzQXJnLCB0aGlzLl9fbWFwVmFsdWVzRGF0YV9fW3Jlc3VsdF0sXG5cdFx0XHRcdHRoaXMuX19tYXBLZXlzRGF0YV9fW3Jlc3VsdF0sIHRoaXMpO1xuXHRcdFx0cmVzdWx0ID0gaXRlcmF0b3IuX25leHQoKTtcblx0XHR9XG5cdH0pLFxuXHRnZXQ6IGQoZnVuY3Rpb24gKGtleSkge1xuXHRcdHZhciBpbmRleCA9IGVJbmRleE9mLmNhbGwodGhpcy5fX21hcEtleXNEYXRhX18sIGtleSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkgcmV0dXJuO1xuXHRcdHJldHVybiB0aGlzLl9fbWFwVmFsdWVzRGF0YV9fW2luZGV4XTtcblx0fSksXG5cdGhhczogZChmdW5jdGlvbiAoa2V5KSB7XG5cdFx0cmV0dXJuIChlSW5kZXhPZi5jYWxsKHRoaXMuX19tYXBLZXlzRGF0YV9fLCBrZXkpICE9PSAtMSk7XG5cdH0pLFxuXHRrZXlzOiBkKGZ1bmN0aW9uICgpIHsgcmV0dXJuIG5ldyBJdGVyYXRvcih0aGlzLCAna2V5Jyk7IH0pLFxuXHRzZXQ6IGQoZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcblx0XHR2YXIgaW5kZXggPSBlSW5kZXhPZi5jYWxsKHRoaXMuX19tYXBLZXlzRGF0YV9fLCBrZXkpLCBlbWl0O1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdGluZGV4ID0gdGhpcy5fX21hcEtleXNEYXRhX18ucHVzaChrZXkpIC0gMTtcblx0XHRcdGVtaXQgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLl9fbWFwVmFsdWVzRGF0YV9fW2luZGV4XSA9IHZhbHVlO1xuXHRcdGlmIChlbWl0KSB0aGlzLmVtaXQoJ19hZGQnLCBpbmRleCwga2V5KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSksXG5cdHNpemU6IGQuZ3MoZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5fX21hcEtleXNEYXRhX18ubGVuZ3RoOyB9KSxcblx0dmFsdWVzOiBkKGZ1bmN0aW9uICgpIHsgcmV0dXJuIG5ldyBJdGVyYXRvcih0aGlzLCAndmFsdWUnKTsgfSksXG5cdHRvU3RyaW5nOiBkKGZ1bmN0aW9uICgpIHsgcmV0dXJuICdbb2JqZWN0IE1hcF0nOyB9KVxufSkpO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KE1hcFBvbHkucHJvdG90eXBlLCBTeW1ib2wuaXRlcmF0b3IsIGQoZnVuY3Rpb24gKCkge1xuXHRyZXR1cm4gdGhpcy5lbnRyaWVzKCk7XG59KSk7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWFwUG9seS5wcm90b3R5cGUsIFN5bWJvbC50b1N0cmluZ1RhZywgZCgnYycsICdNYXAnKSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9pcy1pbXBsZW1lbnRlZCcpKCkgPyBTeW1ib2wgOiByZXF1aXJlKCcuL3BvbHlmaWxsJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB2YWxpZFR5cGVzID0geyBvYmplY3Q6IHRydWUsIHN5bWJvbDogdHJ1ZSB9O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHN5bWJvbDtcblx0aWYgKHR5cGVvZiBTeW1ib2wgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcblx0c3ltYm9sID0gU3ltYm9sKCd0ZXN0IHN5bWJvbCcpO1xuXHR0cnkgeyBTdHJpbmcoc3ltYm9sKTsgfSBjYXRjaCAoZSkgeyByZXR1cm4gZmFsc2U7IH1cblxuXHQvLyBSZXR1cm4gJ3RydWUnIGFsc28gZm9yIHBvbHlmaWxsc1xuXHRpZiAoIXZhbGlkVHlwZXNbdHlwZW9mIFN5bWJvbC5pdGVyYXRvcl0pIHJldHVybiBmYWxzZTtcblx0aWYgKCF2YWxpZFR5cGVzW3R5cGVvZiBTeW1ib2wudG9QcmltaXRpdmVdKSByZXR1cm4gZmFsc2U7XG5cdGlmICghdmFsaWRUeXBlc1t0eXBlb2YgU3ltYm9sLnRvU3RyaW5nVGFnXSkgcmV0dXJuIGZhbHNlO1xuXG5cdHJldHVybiB0cnVlO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoeCkge1xuXHRpZiAoIXgpIHJldHVybiBmYWxzZTtcblx0aWYgKHR5cGVvZiB4ID09PSAnc3ltYm9sJykgcmV0dXJuIHRydWU7XG5cdGlmICgheC5jb25zdHJ1Y3RvcikgcmV0dXJuIGZhbHNlO1xuXHRpZiAoeC5jb25zdHJ1Y3Rvci5uYW1lICE9PSAnU3ltYm9sJykgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gKHhbeC5jb25zdHJ1Y3Rvci50b1N0cmluZ1RhZ10gPT09ICdTeW1ib2wnKTtcbn07XG4iLCIvLyBFUzIwMTUgU3ltYm9sIHBvbHlmaWxsIGZvciBlbnZpcm9ubWVudHMgdGhhdCBkbyBub3Qgc3VwcG9ydCBpdCAob3IgcGFydGlhbGx5IHN1cHBvcnQgaXQpXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGQgICAgICAgICAgICAgID0gcmVxdWlyZSgnZCcpXG4gICwgdmFsaWRhdGVTeW1ib2wgPSByZXF1aXJlKCcuL3ZhbGlkYXRlLXN5bWJvbCcpXG5cbiAgLCBjcmVhdGUgPSBPYmplY3QuY3JlYXRlLCBkZWZpbmVQcm9wZXJ0aWVzID0gT2JqZWN0LmRlZmluZVByb3BlcnRpZXNcbiAgLCBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eSwgb2JqUHJvdG90eXBlID0gT2JqZWN0LnByb3RvdHlwZVxuICAsIE5hdGl2ZVN5bWJvbCwgU3ltYm9sUG9seWZpbGwsIEhpZGRlblN5bWJvbCwgZ2xvYmFsU3ltYm9scyA9IGNyZWF0ZShudWxsKVxuICAsIGlzTmF0aXZlU2FmZTtcblxuaWYgKHR5cGVvZiBTeW1ib2wgPT09ICdmdW5jdGlvbicpIHtcblx0TmF0aXZlU3ltYm9sID0gU3ltYm9sO1xuXHR0cnkge1xuXHRcdFN0cmluZyhOYXRpdmVTeW1ib2woKSk7XG5cdFx0aXNOYXRpdmVTYWZlID0gdHJ1ZTtcblx0fSBjYXRjaCAoaWdub3JlKSB7fVxufVxuXG52YXIgZ2VuZXJhdGVOYW1lID0gKGZ1bmN0aW9uICgpIHtcblx0dmFyIGNyZWF0ZWQgPSBjcmVhdGUobnVsbCk7XG5cdHJldHVybiBmdW5jdGlvbiAoZGVzYykge1xuXHRcdHZhciBwb3N0Zml4ID0gMCwgbmFtZSwgaWUxMUJ1Z1dvcmthcm91bmQ7XG5cdFx0d2hpbGUgKGNyZWF0ZWRbZGVzYyArIChwb3N0Zml4IHx8ICcnKV0pICsrcG9zdGZpeDtcblx0XHRkZXNjICs9IChwb3N0Zml4IHx8ICcnKTtcblx0XHRjcmVhdGVkW2Rlc2NdID0gdHJ1ZTtcblx0XHRuYW1lID0gJ0BAJyArIGRlc2M7XG5cdFx0ZGVmaW5lUHJvcGVydHkob2JqUHJvdG90eXBlLCBuYW1lLCBkLmdzKG51bGwsIGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRcdFx0Ly8gRm9yIElFMTEgaXNzdWUgc2VlOlxuXHRcdFx0Ly8gaHR0cHM6Ly9jb25uZWN0Lm1pY3Jvc29mdC5jb20vSUUvZmVlZGJhY2tkZXRhaWwvdmlldy8xOTI4NTA4L1xuXHRcdFx0Ly8gICAgaWUxMS1icm9rZW4tZ2V0dGVycy1vbi1kb20tb2JqZWN0c1xuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21lZGlrb28vZXM2LXN5bWJvbC9pc3N1ZXMvMTJcblx0XHRcdGlmIChpZTExQnVnV29ya2Fyb3VuZCkgcmV0dXJuO1xuXHRcdFx0aWUxMUJ1Z1dvcmthcm91bmQgPSB0cnVlO1xuXHRcdFx0ZGVmaW5lUHJvcGVydHkodGhpcywgbmFtZSwgZCh2YWx1ZSkpO1xuXHRcdFx0aWUxMUJ1Z1dvcmthcm91bmQgPSBmYWxzZTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIG5hbWU7XG5cdH07XG59KCkpO1xuXG4vLyBJbnRlcm5hbCBjb25zdHJ1Y3RvciAobm90IG9uZSBleHBvc2VkKSBmb3IgY3JlYXRpbmcgU3ltYm9sIGluc3RhbmNlcy5cbi8vIFRoaXMgb25lIGlzIHVzZWQgdG8gZW5zdXJlIHRoYXQgYHNvbWVTeW1ib2wgaW5zdGFuY2VvZiBTeW1ib2xgIGFsd2F5cyByZXR1cm4gZmFsc2VcbkhpZGRlblN5bWJvbCA9IGZ1bmN0aW9uIFN5bWJvbChkZXNjcmlwdGlvbikge1xuXHRpZiAodGhpcyBpbnN0YW5jZW9mIEhpZGRlblN5bWJvbCkgdGhyb3cgbmV3IFR5cGVFcnJvcignVHlwZUVycm9yOiBTeW1ib2wgaXMgbm90IGEgY29uc3RydWN0b3InKTtcblx0cmV0dXJuIFN5bWJvbFBvbHlmaWxsKGRlc2NyaXB0aW9uKTtcbn07XG5cbi8vIEV4cG9zZWQgYFN5bWJvbGAgY29uc3RydWN0b3Jcbi8vIChyZXR1cm5zIGluc3RhbmNlcyBvZiBIaWRkZW5TeW1ib2wpXG5tb2R1bGUuZXhwb3J0cyA9IFN5bWJvbFBvbHlmaWxsID0gZnVuY3Rpb24gU3ltYm9sKGRlc2NyaXB0aW9uKSB7XG5cdHZhciBzeW1ib2w7XG5cdGlmICh0aGlzIGluc3RhbmNlb2YgU3ltYm9sKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdUeXBlRXJyb3I6IFN5bWJvbCBpcyBub3QgYSBjb25zdHJ1Y3RvcicpO1xuXHRpZiAoaXNOYXRpdmVTYWZlKSByZXR1cm4gTmF0aXZlU3ltYm9sKGRlc2NyaXB0aW9uKTtcblx0c3ltYm9sID0gY3JlYXRlKEhpZGRlblN5bWJvbC5wcm90b3R5cGUpO1xuXHRkZXNjcmlwdGlvbiA9IChkZXNjcmlwdGlvbiA9PT0gdW5kZWZpbmVkID8gJycgOiBTdHJpbmcoZGVzY3JpcHRpb24pKTtcblx0cmV0dXJuIGRlZmluZVByb3BlcnRpZXMoc3ltYm9sLCB7XG5cdFx0X19kZXNjcmlwdGlvbl9fOiBkKCcnLCBkZXNjcmlwdGlvbiksXG5cdFx0X19uYW1lX186IGQoJycsIGdlbmVyYXRlTmFtZShkZXNjcmlwdGlvbikpXG5cdH0pO1xufTtcbmRlZmluZVByb3BlcnRpZXMoU3ltYm9sUG9seWZpbGwsIHtcblx0Zm9yOiBkKGZ1bmN0aW9uIChrZXkpIHtcblx0XHRpZiAoZ2xvYmFsU3ltYm9sc1trZXldKSByZXR1cm4gZ2xvYmFsU3ltYm9sc1trZXldO1xuXHRcdHJldHVybiAoZ2xvYmFsU3ltYm9sc1trZXldID0gU3ltYm9sUG9seWZpbGwoU3RyaW5nKGtleSkpKTtcblx0fSksXG5cdGtleUZvcjogZChmdW5jdGlvbiAocykge1xuXHRcdHZhciBrZXk7XG5cdFx0dmFsaWRhdGVTeW1ib2wocyk7XG5cdFx0Zm9yIChrZXkgaW4gZ2xvYmFsU3ltYm9scykgaWYgKGdsb2JhbFN5bWJvbHNba2V5XSA9PT0gcykgcmV0dXJuIGtleTtcblx0fSksXG5cblx0Ly8gSWYgdGhlcmUncyBuYXRpdmUgaW1wbGVtZW50YXRpb24gb2YgZ2l2ZW4gc3ltYm9sLCBsZXQncyBmYWxsYmFjayB0byBpdFxuXHQvLyB0byBlbnN1cmUgcHJvcGVyIGludGVyb3BlcmFiaWxpdHkgd2l0aCBvdGhlciBuYXRpdmUgZnVuY3Rpb25zIGUuZy4gQXJyYXkuZnJvbVxuXHRoYXNJbnN0YW5jZTogZCgnJywgKE5hdGl2ZVN5bWJvbCAmJiBOYXRpdmVTeW1ib2wuaGFzSW5zdGFuY2UpIHx8IFN5bWJvbFBvbHlmaWxsKCdoYXNJbnN0YW5jZScpKSxcblx0aXNDb25jYXRTcHJlYWRhYmxlOiBkKCcnLCAoTmF0aXZlU3ltYm9sICYmIE5hdGl2ZVN5bWJvbC5pc0NvbmNhdFNwcmVhZGFibGUpIHx8XG5cdFx0U3ltYm9sUG9seWZpbGwoJ2lzQ29uY2F0U3ByZWFkYWJsZScpKSxcblx0aXRlcmF0b3I6IGQoJycsIChOYXRpdmVTeW1ib2wgJiYgTmF0aXZlU3ltYm9sLml0ZXJhdG9yKSB8fCBTeW1ib2xQb2x5ZmlsbCgnaXRlcmF0b3InKSksXG5cdG1hdGNoOiBkKCcnLCAoTmF0aXZlU3ltYm9sICYmIE5hdGl2ZVN5bWJvbC5tYXRjaCkgfHwgU3ltYm9sUG9seWZpbGwoJ21hdGNoJykpLFxuXHRyZXBsYWNlOiBkKCcnLCAoTmF0aXZlU3ltYm9sICYmIE5hdGl2ZVN5bWJvbC5yZXBsYWNlKSB8fCBTeW1ib2xQb2x5ZmlsbCgncmVwbGFjZScpKSxcblx0c2VhcmNoOiBkKCcnLCAoTmF0aXZlU3ltYm9sICYmIE5hdGl2ZVN5bWJvbC5zZWFyY2gpIHx8IFN5bWJvbFBvbHlmaWxsKCdzZWFyY2gnKSksXG5cdHNwZWNpZXM6IGQoJycsIChOYXRpdmVTeW1ib2wgJiYgTmF0aXZlU3ltYm9sLnNwZWNpZXMpIHx8IFN5bWJvbFBvbHlmaWxsKCdzcGVjaWVzJykpLFxuXHRzcGxpdDogZCgnJywgKE5hdGl2ZVN5bWJvbCAmJiBOYXRpdmVTeW1ib2wuc3BsaXQpIHx8IFN5bWJvbFBvbHlmaWxsKCdzcGxpdCcpKSxcblx0dG9QcmltaXRpdmU6IGQoJycsIChOYXRpdmVTeW1ib2wgJiYgTmF0aXZlU3ltYm9sLnRvUHJpbWl0aXZlKSB8fCBTeW1ib2xQb2x5ZmlsbCgndG9QcmltaXRpdmUnKSksXG5cdHRvU3RyaW5nVGFnOiBkKCcnLCAoTmF0aXZlU3ltYm9sICYmIE5hdGl2ZVN5bWJvbC50b1N0cmluZ1RhZykgfHwgU3ltYm9sUG9seWZpbGwoJ3RvU3RyaW5nVGFnJykpLFxuXHR1bnNjb3BhYmxlczogZCgnJywgKE5hdGl2ZVN5bWJvbCAmJiBOYXRpdmVTeW1ib2wudW5zY29wYWJsZXMpIHx8IFN5bWJvbFBvbHlmaWxsKCd1bnNjb3BhYmxlcycpKVxufSk7XG5cbi8vIEludGVybmFsIHR3ZWFrcyBmb3IgcmVhbCBzeW1ib2wgcHJvZHVjZXJcbmRlZmluZVByb3BlcnRpZXMoSGlkZGVuU3ltYm9sLnByb3RvdHlwZSwge1xuXHRjb25zdHJ1Y3RvcjogZChTeW1ib2xQb2x5ZmlsbCksXG5cdHRvU3RyaW5nOiBkKCcnLCBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLl9fbmFtZV9fOyB9KVxufSk7XG5cbi8vIFByb3BlciBpbXBsZW1lbnRhdGlvbiBvZiBtZXRob2RzIGV4cG9zZWQgb24gU3ltYm9sLnByb3RvdHlwZVxuLy8gVGhleSB3b24ndCBiZSBhY2Nlc3NpYmxlIG9uIHByb2R1Y2VkIHN5bWJvbCBpbnN0YW5jZXMgYXMgdGhleSBkZXJpdmUgZnJvbSBIaWRkZW5TeW1ib2wucHJvdG90eXBlXG5kZWZpbmVQcm9wZXJ0aWVzKFN5bWJvbFBvbHlmaWxsLnByb3RvdHlwZSwge1xuXHR0b1N0cmluZzogZChmdW5jdGlvbiAoKSB7IHJldHVybiAnU3ltYm9sICgnICsgdmFsaWRhdGVTeW1ib2wodGhpcykuX19kZXNjcmlwdGlvbl9fICsgJyknOyB9KSxcblx0dmFsdWVPZjogZChmdW5jdGlvbiAoKSB7IHJldHVybiB2YWxpZGF0ZVN5bWJvbCh0aGlzKTsgfSlcbn0pO1xuZGVmaW5lUHJvcGVydHkoU3ltYm9sUG9seWZpbGwucHJvdG90eXBlLCBTeW1ib2xQb2x5ZmlsbC50b1ByaW1pdGl2ZSwgZCgnJywgZnVuY3Rpb24gKCkge1xuXHR2YXIgc3ltYm9sID0gdmFsaWRhdGVTeW1ib2wodGhpcyk7XG5cdGlmICh0eXBlb2Ygc3ltYm9sID09PSAnc3ltYm9sJykgcmV0dXJuIHN5bWJvbDtcblx0cmV0dXJuIHN5bWJvbC50b1N0cmluZygpO1xufSkpO1xuZGVmaW5lUHJvcGVydHkoU3ltYm9sUG9seWZpbGwucHJvdG90eXBlLCBTeW1ib2xQb2x5ZmlsbC50b1N0cmluZ1RhZywgZCgnYycsICdTeW1ib2wnKSk7XG5cbi8vIFByb3BlciBpbXBsZW1lbnRhdG9uIG9mIHRvUHJpbWl0aXZlIGFuZCB0b1N0cmluZ1RhZyBmb3IgcmV0dXJuZWQgc3ltYm9sIGluc3RhbmNlc1xuZGVmaW5lUHJvcGVydHkoSGlkZGVuU3ltYm9sLnByb3RvdHlwZSwgU3ltYm9sUG9seWZpbGwudG9TdHJpbmdUYWcsXG5cdGQoJ2MnLCBTeW1ib2xQb2x5ZmlsbC5wcm90b3R5cGVbU3ltYm9sUG9seWZpbGwudG9TdHJpbmdUYWddKSk7XG5cbi8vIE5vdGU6IEl0J3MgaW1wb3J0YW50IHRvIGRlZmluZSBgdG9QcmltaXRpdmVgIGFzIGxhc3Qgb25lLCBhcyBzb21lIGltcGxlbWVudGF0aW9uc1xuLy8gaW1wbGVtZW50IGB0b1ByaW1pdGl2ZWAgbmF0aXZlbHkgd2l0aG91dCBpbXBsZW1lbnRpbmcgYHRvU3RyaW5nVGFnYCAob3Igb3RoZXIgc3BlY2lmaWVkIHN5bWJvbHMpXG4vLyBBbmQgdGhhdCBtYXkgaW52b2tlIGVycm9yIGluIGRlZmluaXRpb24gZmxvdzpcbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL21lZGlrb28vZXM2LXN5bWJvbC9pc3N1ZXMvMTMjaXNzdWVjb21tZW50LTE2NDE0NjE0OVxuZGVmaW5lUHJvcGVydHkoSGlkZGVuU3ltYm9sLnByb3RvdHlwZSwgU3ltYm9sUG9seWZpbGwudG9QcmltaXRpdmUsXG5cdGQoJ2MnLCBTeW1ib2xQb2x5ZmlsbC5wcm90b3R5cGVbU3ltYm9sUG9seWZpbGwudG9QcmltaXRpdmVdKSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBpc1N5bWJvbCA9IHJlcXVpcmUoJy4vaXMtc3ltYm9sJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmICghaXNTeW1ib2wodmFsdWUpKSB0aHJvdyBuZXcgVHlwZUVycm9yKHZhbHVlICsgXCIgaXMgbm90IGEgc3ltYm9sXCIpO1xuXHRyZXR1cm4gdmFsdWU7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZCAgICAgICAgPSByZXF1aXJlKCdkJylcbiAgLCBjYWxsYWJsZSA9IHJlcXVpcmUoJ2VzNS1leHQvb2JqZWN0L3ZhbGlkLWNhbGxhYmxlJylcblxuICAsIGFwcGx5ID0gRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LCBjYWxsID0gRnVuY3Rpb24ucHJvdG90eXBlLmNhbGxcbiAgLCBjcmVhdGUgPSBPYmplY3QuY3JlYXRlLCBkZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eVxuICAsIGRlZmluZVByb3BlcnRpZXMgPSBPYmplY3QuZGVmaW5lUHJvcGVydGllc1xuICAsIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuICAsIGRlc2NyaXB0b3IgPSB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgZW51bWVyYWJsZTogZmFsc2UsIHdyaXRhYmxlOiB0cnVlIH1cblxuICAsIG9uLCBvbmNlLCBvZmYsIGVtaXQsIG1ldGhvZHMsIGRlc2NyaXB0b3JzLCBiYXNlO1xuXG5vbiA9IGZ1bmN0aW9uICh0eXBlLCBsaXN0ZW5lcikge1xuXHR2YXIgZGF0YTtcblxuXHRjYWxsYWJsZShsaXN0ZW5lcik7XG5cblx0aWYgKCFoYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMsICdfX2VlX18nKSkge1xuXHRcdGRhdGEgPSBkZXNjcmlwdG9yLnZhbHVlID0gY3JlYXRlKG51bGwpO1xuXHRcdGRlZmluZVByb3BlcnR5KHRoaXMsICdfX2VlX18nLCBkZXNjcmlwdG9yKTtcblx0XHRkZXNjcmlwdG9yLnZhbHVlID0gbnVsbDtcblx0fSBlbHNlIHtcblx0XHRkYXRhID0gdGhpcy5fX2VlX187XG5cdH1cblx0aWYgKCFkYXRhW3R5cGVdKSBkYXRhW3R5cGVdID0gbGlzdGVuZXI7XG5cdGVsc2UgaWYgKHR5cGVvZiBkYXRhW3R5cGVdID09PSAnb2JqZWN0JykgZGF0YVt0eXBlXS5wdXNoKGxpc3RlbmVyKTtcblx0ZWxzZSBkYXRhW3R5cGVdID0gW2RhdGFbdHlwZV0sIGxpc3RlbmVyXTtcblxuXHRyZXR1cm4gdGhpcztcbn07XG5cbm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgbGlzdGVuZXIpIHtcblx0dmFyIG9uY2UsIHNlbGY7XG5cblx0Y2FsbGFibGUobGlzdGVuZXIpO1xuXHRzZWxmID0gdGhpcztcblx0b24uY2FsbCh0aGlzLCB0eXBlLCBvbmNlID0gZnVuY3Rpb24gKCkge1xuXHRcdG9mZi5jYWxsKHNlbGYsIHR5cGUsIG9uY2UpO1xuXHRcdGFwcGx5LmNhbGwobGlzdGVuZXIsIHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0pO1xuXG5cdG9uY2UuX19lZU9uY2VMaXN0ZW5lcl9fID0gbGlzdGVuZXI7XG5cdHJldHVybiB0aGlzO1xufTtcblxub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGxpc3RlbmVyKSB7XG5cdHZhciBkYXRhLCBsaXN0ZW5lcnMsIGNhbmRpZGF0ZSwgaTtcblxuXHRjYWxsYWJsZShsaXN0ZW5lcik7XG5cblx0aWYgKCFoYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMsICdfX2VlX18nKSkgcmV0dXJuIHRoaXM7XG5cdGRhdGEgPSB0aGlzLl9fZWVfXztcblx0aWYgKCFkYXRhW3R5cGVdKSByZXR1cm4gdGhpcztcblx0bGlzdGVuZXJzID0gZGF0YVt0eXBlXTtcblxuXHRpZiAodHlwZW9mIGxpc3RlbmVycyA9PT0gJ29iamVjdCcpIHtcblx0XHRmb3IgKGkgPSAwOyAoY2FuZGlkYXRlID0gbGlzdGVuZXJzW2ldKTsgKytpKSB7XG5cdFx0XHRpZiAoKGNhbmRpZGF0ZSA9PT0gbGlzdGVuZXIpIHx8XG5cdFx0XHRcdFx0KGNhbmRpZGF0ZS5fX2VlT25jZUxpc3RlbmVyX18gPT09IGxpc3RlbmVyKSkge1xuXHRcdFx0XHRpZiAobGlzdGVuZXJzLmxlbmd0aCA9PT0gMikgZGF0YVt0eXBlXSA9IGxpc3RlbmVyc1tpID8gMCA6IDFdO1xuXHRcdFx0XHRlbHNlIGxpc3RlbmVycy5zcGxpY2UoaSwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGlmICgobGlzdGVuZXJzID09PSBsaXN0ZW5lcikgfHxcblx0XHRcdFx0KGxpc3RlbmVycy5fX2VlT25jZUxpc3RlbmVyX18gPT09IGxpc3RlbmVyKSkge1xuXHRcdFx0ZGVsZXRlIGRhdGFbdHlwZV07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRoaXM7XG59O1xuXG5lbWl0ID0gZnVuY3Rpb24gKHR5cGUpIHtcblx0dmFyIGksIGwsIGxpc3RlbmVyLCBsaXN0ZW5lcnMsIGFyZ3M7XG5cblx0aWYgKCFoYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMsICdfX2VlX18nKSkgcmV0dXJuO1xuXHRsaXN0ZW5lcnMgPSB0aGlzLl9fZWVfX1t0eXBlXTtcblx0aWYgKCFsaXN0ZW5lcnMpIHJldHVybjtcblxuXHRpZiAodHlwZW9mIGxpc3RlbmVycyA9PT0gJ29iamVjdCcpIHtcblx0XHRsID0gYXJndW1lbnRzLmxlbmd0aDtcblx0XHRhcmdzID0gbmV3IEFycmF5KGwgLSAxKTtcblx0XHRmb3IgKGkgPSAxOyBpIDwgbDsgKytpKSBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuXHRcdGxpc3RlbmVycyA9IGxpc3RlbmVycy5zbGljZSgpO1xuXHRcdGZvciAoaSA9IDA7IChsaXN0ZW5lciA9IGxpc3RlbmVyc1tpXSk7ICsraSkge1xuXHRcdFx0YXBwbHkuY2FsbChsaXN0ZW5lciwgdGhpcywgYXJncyk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdGNhc2UgMTpcblx0XHRcdGNhbGwuY2FsbChsaXN0ZW5lcnMsIHRoaXMpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAyOlxuXHRcdFx0Y2FsbC5jYWxsKGxpc3RlbmVycywgdGhpcywgYXJndW1lbnRzWzFdKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgMzpcblx0XHRcdGNhbGwuY2FsbChsaXN0ZW5lcnMsIHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcblx0XHRcdGJyZWFrO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRsID0gYXJndW1lbnRzLmxlbmd0aDtcblx0XHRcdGFyZ3MgPSBuZXcgQXJyYXkobCAtIDEpO1xuXHRcdFx0Zm9yIChpID0gMTsgaSA8IGw7ICsraSkge1xuXHRcdFx0XHRhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblx0XHRcdH1cblx0XHRcdGFwcGx5LmNhbGwobGlzdGVuZXJzLCB0aGlzLCBhcmdzKTtcblx0XHR9XG5cdH1cbn07XG5cbm1ldGhvZHMgPSB7XG5cdG9uOiBvbixcblx0b25jZTogb25jZSxcblx0b2ZmOiBvZmYsXG5cdGVtaXQ6IGVtaXRcbn07XG5cbmRlc2NyaXB0b3JzID0ge1xuXHRvbjogZChvbiksXG5cdG9uY2U6IGQob25jZSksXG5cdG9mZjogZChvZmYpLFxuXHRlbWl0OiBkKGVtaXQpXG59O1xuXG5iYXNlID0gZGVmaW5lUHJvcGVydGllcyh7fSwgZGVzY3JpcHRvcnMpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSBmdW5jdGlvbiAobykge1xuXHRyZXR1cm4gKG8gPT0gbnVsbCkgPyBjcmVhdGUoYmFzZSkgOiBkZWZpbmVQcm9wZXJ0aWVzKE9iamVjdChvKSwgZGVzY3JpcHRvcnMpO1xufTtcbmV4cG9ydHMubWV0aG9kcyA9IG1ldGhvZHM7XG4iLCI7KGZ1bmN0aW9uKCl7XG5cblx0ZnVuY3Rpb24gR3VuKG8pe1xuXHRcdHZhciBndW4gPSB0aGlzO1xuXHRcdGlmKCFHdW4uaXMoZ3VuKSl7IHJldHVybiBuZXcgR3VuKG8pIH1cblx0XHRpZihHdW4uaXMobykpeyByZXR1cm4gZ3VuIH1cblx0XHRyZXR1cm4gZ3VuLm9wdChvKTtcblx0fVxuXG5cdDsoZnVuY3Rpb24oVXRpbCl7IC8vIEdlbmVyaWMgamF2YXNjcmlwdCB1dGlsaXRpZXMuXG5cdFx0OyhmdW5jdGlvbihUeXBlKXtcblx0XHRcdFR5cGUuZm5zID0ge2lzOiBmdW5jdGlvbihmbil7IHJldHVybiAoZm4gaW5zdGFuY2VvZiBGdW5jdGlvbik/IHRydWUgOiBmYWxzZSB9fTtcblx0XHRcdFR5cGUuYmkgPSB7aXM6IGZ1bmN0aW9uKGIpeyByZXR1cm4gKGIgaW5zdGFuY2VvZiBCb29sZWFuIHx8IHR5cGVvZiBiID09ICdib29sZWFuJyk/IHRydWUgOiBmYWxzZSB9fVxuXHRcdFx0VHlwZS5udW0gPSB7aXM6IGZ1bmN0aW9uKG4peyByZXR1cm4gIVR5cGUubGlzdC5pcyhuKSAmJiAoSW5maW5pdHkgPT09IG4gfHwgbiAtIHBhcnNlRmxvYXQobikgKyAxID49IDApIH19XG5cdFx0XHRUeXBlLnRleHQgPSB7aXM6IGZ1bmN0aW9uKHQpeyByZXR1cm4gdHlwZW9mIHQgPT0gJ3N0cmluZyc/IHRydWUgOiBmYWxzZSB9fVxuXHRcdFx0VHlwZS50ZXh0LmlmeSA9IGZ1bmN0aW9uKHQpe1xuXHRcdFx0XHRpZihUeXBlLnRleHQuaXModCkpeyByZXR1cm4gdCB9XG5cdFx0XHRcdGlmKHR5cGVvZiBKU09OICE9PSBcInVuZGVmaW5lZFwiKXsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHQpIH1cblx0XHRcdFx0cmV0dXJuICh0ICYmIHQudG9TdHJpbmcpPyB0LnRvU3RyaW5nKCkgOiB0O1xuXHRcdFx0fVxuXHRcdFx0VHlwZS50ZXh0LnJhbmRvbSA9IGZ1bmN0aW9uKGwsIGMpe1xuXHRcdFx0XHR2YXIgcyA9ICcnO1xuXHRcdFx0XHRsID0gbCB8fCAyNDsgLy8geW91IGFyZSBub3QgZ29pbmcgdG8gbWFrZSBhIDAgbGVuZ3RoIHJhbmRvbSBudW1iZXIsIHNvIG5vIG5lZWQgdG8gY2hlY2sgdHlwZVxuXHRcdFx0XHRjID0gYyB8fCAnMDEyMzQ1Njc4OUFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eic7XG5cdFx0XHRcdHdoaWxlKGwgPiAwKXsgcyArPSBjLmNoYXJBdChNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjLmxlbmd0aCkpOyBsLS0gfVxuXHRcdFx0XHRyZXR1cm4gcztcblx0XHRcdH1cblx0XHRcdFR5cGUudGV4dC5tYXRjaCA9IGZ1bmN0aW9uKHQsIG8peyB2YXIgciA9IGZhbHNlO1xuXHRcdFx0XHR0ID0gdCB8fCAnJztcblx0XHRcdFx0byA9IEd1bi50ZXh0LmlzKG8pPyB7Jz0nOiBvfSA6IG8gfHwge307IC8vIHsnficsICc9JywgJyonLCAnPCcsICc+JywgJysnLCAnLScsICc/JywgJyEnfSAvLyBpZ25vcmUgdXBwZXJjYXNlLCBleGFjdGx5IGVxdWFsLCBhbnl0aGluZyBhZnRlciwgbGV4aWNhbGx5IGxhcmdlciwgbGV4aWNhbGx5IGxlc3NlciwgYWRkZWQgaW4sIHN1YnRhY3RlZCBmcm9tLCBxdWVzdGlvbmFibGUgZnV6enkgbWF0Y2gsIGFuZCBlbmRzIHdpdGguXG5cdFx0XHRcdGlmKFR5cGUub2JqLmhhcyhvLCd+JykpeyB0ID0gdC50b0xvd2VyQ2FzZSgpIH1cblx0XHRcdFx0aWYoVHlwZS5vYmouaGFzKG8sJz0nKSl7IHJldHVybiB0ID09PSBvWyc9J10gfVxuXHRcdFx0XHRpZihUeXBlLm9iai5oYXMobywnKicpKXsgaWYodC5zbGljZSgwLCBvWycqJ10ubGVuZ3RoKSA9PT0gb1snKiddKXsgciA9IHRydWU7IHQgPSB0LnNsaWNlKG9bJyonXS5sZW5ndGgpIH0gZWxzZSB7IHJldHVybiBmYWxzZSB9fVxuXHRcdFx0XHRpZihUeXBlLm9iai5oYXMobywnIScpKXsgaWYodC5zbGljZSgtb1snISddLmxlbmd0aCkgPT09IG9bJyEnXSl7IHIgPSB0cnVlIH0gZWxzZSB7IHJldHVybiBmYWxzZSB9fVxuXHRcdFx0XHRpZihUeXBlLm9iai5oYXMobywnKycpKXtcblx0XHRcdFx0XHRpZihUeXBlLmxpc3QubWFwKFR5cGUubGlzdC5pcyhvWycrJ10pPyBvWycrJ10gOiBbb1snKyddXSwgZnVuY3Rpb24obSl7XG5cdFx0XHRcdFx0XHRpZih0LmluZGV4T2YobSkgPj0gMCl7IHIgPSB0cnVlIH0gZWxzZSB7IHJldHVybiB0cnVlIH1cblx0XHRcdFx0XHR9KSl7IHJldHVybiBmYWxzZSB9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYoVHlwZS5vYmouaGFzKG8sJy0nKSl7XG5cdFx0XHRcdFx0aWYoVHlwZS5saXN0Lm1hcChUeXBlLmxpc3QuaXMob1snLSddKT8gb1snLSddIDogW29bJy0nXV0sIGZ1bmN0aW9uKG0pe1xuXHRcdFx0XHRcdFx0aWYodC5pbmRleE9mKG0pIDwgMCl7IHIgPSB0cnVlIH0gZWxzZSB7IHJldHVybiB0cnVlIH1cblx0XHRcdFx0XHR9KSl7IHJldHVybiBmYWxzZSB9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYoVHlwZS5vYmouaGFzKG8sJz4nKSl7IGlmKHQgPiBvWyc+J10peyByID0gdHJ1ZSB9IGVsc2UgeyByZXR1cm4gZmFsc2UgfX1cblx0XHRcdFx0aWYoVHlwZS5vYmouaGFzKG8sJzwnKSl7IGlmKHQgPCBvWyc8J10peyByID0gdHJ1ZSB9IGVsc2UgeyByZXR1cm4gZmFsc2UgfX1cblx0XHRcdFx0ZnVuY3Rpb24gZnV6enkodCxmKXsgdmFyIG4gPSAtMSwgaSA9IDAsIGM7IGZvcig7YyA9IGZbaSsrXTspeyBpZighfihuID0gdC5pbmRleE9mKGMsIG4rMSkpKXsgcmV0dXJuIGZhbHNlIH19IHJldHVybiB0cnVlIH0gLy8gdmlhIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvOTIwNjAxMy9qYXZhc2NyaXB0LWZ1enp5LXNlYXJjaFxuXHRcdFx0XHRpZihUeXBlLm9iai5oYXMobywnPycpKXsgaWYoZnV6enkodCwgb1snPyddKSl7IHIgPSB0cnVlIH0gZWxzZSB7IHJldHVybiBmYWxzZSB9fSAvLyBjaGFuZ2UgbmFtZSFcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0XHRUeXBlLmxpc3QgPSB7aXM6IGZ1bmN0aW9uKGwpeyByZXR1cm4gKGwgaW5zdGFuY2VvZiBBcnJheSk/IHRydWUgOiBmYWxzZSB9fVxuXHRcdFx0VHlwZS5saXN0LnNsaXQgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG5cdFx0XHRUeXBlLmxpc3Quc29ydCA9IGZ1bmN0aW9uKGspeyAvLyBjcmVhdGVzIGEgbmV3IHNvcnQgZnVuY3Rpb24gYmFzZWQgb2ZmIHNvbWUgZmllbGRcblx0XHRcdFx0cmV0dXJuIGZ1bmN0aW9uKEEsQil7XG5cdFx0XHRcdFx0aWYoIUEgfHwgIUIpeyByZXR1cm4gMCB9IEEgPSBBW2tdOyBCID0gQltrXTtcblx0XHRcdFx0XHRpZihBIDwgQil7IHJldHVybiAtMSB9ZWxzZSBpZihBID4gQil7IHJldHVybiAxIH1cblx0XHRcdFx0XHRlbHNlIHsgcmV0dXJuIDAgfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRUeXBlLmxpc3QubWFwID0gZnVuY3Rpb24obCwgYywgXyl7IHJldHVybiBUeXBlLm9iai5tYXAobCwgYywgXykgfVxuXHRcdFx0VHlwZS5saXN0LmluZGV4ID0gMTsgLy8gY2hhbmdlIHRoaXMgdG8gMCBpZiB5b3Ugd2FudCBub24tbG9naWNhbCwgbm9uLW1hdGhlbWF0aWNhbCwgbm9uLW1hdHJpeCwgbm9uLWNvbnZlbmllbnQgYXJyYXkgbm90YXRpb25cblx0XHRcdFR5cGUub2JqID0ge2lzOiBmdW5jdGlvbihvKSB7IHJldHVybiAhbyB8fCAhby5jb25zdHJ1Y3Rvcj8gZmFsc2UgOiBvLmNvbnN0cnVjdG9yID09PSBPYmplY3Q/IHRydWUgOiAhby5jb25zdHJ1Y3Rvci5jYWxsIHx8IG8uY29uc3RydWN0b3IudG9TdHJpbmcoKS5tYXRjaCgvXFxbbmF0aXZlXFwgY29kZVxcXS8pPyBmYWxzZSA6IHRydWUgfX1cblx0XHRcdFR5cGUub2JqLnB1dCA9IGZ1bmN0aW9uKG8sIGYsIHYpeyByZXR1cm4gKG98fHt9KVtmXSA9IHYsIG8gfVxuXHRcdFx0VHlwZS5vYmouZGVsID0gZnVuY3Rpb24obywgayl7XG5cdFx0XHRcdGlmKCFvKXsgcmV0dXJuIH1cblx0XHRcdFx0b1trXSA9IG51bGw7XG5cdFx0XHRcdGRlbGV0ZSBvW2tdO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdFR5cGUub2JqLmlmeSA9IGZ1bmN0aW9uKG8pe1xuXHRcdFx0XHRpZihUeXBlLm9iai5pcyhvKSl7IHJldHVybiBvIH1cblx0XHRcdFx0dHJ5e28gPSBKU09OLnBhcnNlKG8pO1xuXHRcdFx0XHR9Y2F0Y2goZSl7bz17fX07XG5cdFx0XHRcdHJldHVybiBvO1xuXHRcdFx0fVxuXHRcdFx0VHlwZS5vYmouY29weSA9IGZ1bmN0aW9uKG8peyAvLyBiZWNhdXNlIGh0dHA6Ly93ZWIuYXJjaGl2ZS5vcmcvd2ViLzIwMTQwMzI4MjI0MDI1L2h0dHA6Ly9qc3BlcmYuY29tL2Nsb25pbmctYW4tb2JqZWN0LzJcblx0XHRcdFx0cmV0dXJuICFvPyBvIDogSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvKSk7IC8vIGlzIHNob2NraW5nbHkgZmFzdGVyIHRoYW4gYW55dGhpbmcgZWxzZSwgYW5kIG91ciBkYXRhIGhhcyB0byBiZSBhIHN1YnNldCBvZiBKU09OIGFueXdheXMhXG5cdFx0XHR9XG5cdFx0XHRUeXBlLm9iai5hcyA9IGZ1bmN0aW9uKGIsIGYsIGQpeyByZXR1cm4gYltmXSA9IGJbZl0gfHwgKGFyZ3VtZW50cy5sZW5ndGggPj0gMz8gZCA6IHt9KSB9XG5cdFx0XHRUeXBlLm9iai5oYXMgPSBmdW5jdGlvbihvLCB0KXsgcmV0dXJuIG8gJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG8sIHQpIH1cblx0XHRcdFR5cGUub2JqLmVtcHR5ID0gZnVuY3Rpb24obywgbil7XG5cdFx0XHRcdGlmKCFvKXsgcmV0dXJuIHRydWUgfVxuXHRcdFx0XHRyZXR1cm4gVHlwZS5vYmoubWFwKG8sZnVuY3Rpb24odixpKXtcblx0XHRcdFx0XHRpZihuICYmIChpID09PSBuIHx8IChUeXBlLm9iai5pcyhuKSAmJiBUeXBlLm9iai5oYXMobiwgaSkpKSl7IHJldHVybiB9XG5cdFx0XHRcdFx0aWYoaSl7IHJldHVybiB0cnVlIH1cblx0XHRcdFx0fSk/IGZhbHNlIDogdHJ1ZTtcblx0XHRcdH1cblx0XHRcdFR5cGUub2JqLm1hcCA9IGZ1bmN0aW9uKGwsIGMsIF8pe1xuXHRcdFx0XHR2YXIgdSwgaSA9IDAsIGlpID0gMCwgeCwgciwgcnIsIGxsLCBsbGUsIGYgPSBUeXBlLmZucy5pcyhjKSxcblx0XHRcdFx0dCA9IGZ1bmN0aW9uKGssdil7XG5cdFx0XHRcdFx0aWYoMiA9PT0gYXJndW1lbnRzLmxlbmd0aCl7XG5cdFx0XHRcdFx0XHRyciA9IHJyIHx8IHt9O1xuXHRcdFx0XHRcdFx0cnJba10gPSB2O1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gcnIgPSByciB8fCBbXTtcblx0XHRcdFx0XHRyci5wdXNoKGspO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZihPYmplY3Qua2V5cyAmJiBUeXBlLm9iai5pcyhsKSl7XG5cdFx0XHRcdFx0bGwgPSBPYmplY3Qua2V5cyhsKTsgbGxlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihUeXBlLmxpc3QuaXMobCkgfHwgbGwpe1xuXHRcdFx0XHRcdHggPSAobGwgfHwgbCkubGVuZ3RoO1xuXHRcdFx0XHRcdGZvcig7aSA8IHg7IGkrKyl7XG5cdFx0XHRcdFx0XHRpaSA9IChpICsgVHlwZS5saXN0LmluZGV4KTtcblx0XHRcdFx0XHRcdGlmKGYpe1xuXHRcdFx0XHRcdFx0XHRyID0gbGxlPyBjLmNhbGwoXyB8fCB0aGlzLCBsW2xsW2ldXSwgbGxbaV0sIHQpIDogYy5jYWxsKF8gfHwgdGhpcywgbFtpXSwgaWksIHQpO1xuXHRcdFx0XHRcdFx0XHRpZihyICE9PSB1KXsgcmV0dXJuIHIgfVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly9pZihUeXBlLnRlc3QuaXMoYyxsW2ldKSl7IHJldHVybiBpaSB9IC8vIHNob3VsZCBpbXBsZW1lbnQgZGVlcCBlcXVhbGl0eSB0ZXN0aW5nIVxuXHRcdFx0XHRcdFx0XHRpZihjID09PSBsW2xsZT8gbGxbaV0gOiBpXSl7IHJldHVybiBsbD8gbGxbaV0gOiBpaSB9IC8vIHVzZSB0aGlzIGZvciBub3dcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9yKGkgaW4gbCl7XG5cdFx0XHRcdFx0XHRpZihmKXtcblx0XHRcdFx0XHRcdFx0aWYoVHlwZS5vYmouaGFzKGwsaSkpe1xuXHRcdFx0XHRcdFx0XHRcdHIgPSBfPyBjLmNhbGwoXywgbFtpXSwgaSwgdCkgOiBjKGxbaV0sIGksIHQpO1xuXHRcdFx0XHRcdFx0XHRcdGlmKHIgIT09IHUpeyByZXR1cm4gciB9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vaWYoYS50ZXN0LmlzKGMsbFtpXSkpeyByZXR1cm4gaSB9IC8vIHNob3VsZCBpbXBsZW1lbnQgZGVlcCBlcXVhbGl0eSB0ZXN0aW5nIVxuXHRcdFx0XHRcdFx0XHRpZihjID09PSBsW2ldKXsgcmV0dXJuIGkgfSAvLyB1c2UgdGhpcyBmb3Igbm93XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmPyByciA6IFR5cGUubGlzdC5pbmRleD8gMCA6IC0xO1xuXHRcdFx0fVxuXHRcdFx0VHlwZS50aW1lID0ge307XG5cdFx0XHRUeXBlLnRpbWUuaXMgPSBmdW5jdGlvbih0KXsgcmV0dXJuIHQ/IHQgaW5zdGFuY2VvZiBEYXRlIDogKCtuZXcgRGF0ZSgpLmdldFRpbWUoKSkgfVxuXHRcdFx0VHlwZS50aW1lLm5vdyA9IChmdW5jdGlvbigpe1xuXHRcdFx0ICAgIHZhciB0aW1lID0gVHlwZS50aW1lLmlzLCBsYXN0ID0gLUluZmluaXR5LCBuID0gMCwgZCA9IDEwMDA7XG5cdFx0XHQgICAgcmV0dXJuIGZ1bmN0aW9uKCl7XG5cdFx0XHQgICAgICAgIHZhciB0ID0gdGltZSgpO1xuXHRcdFx0ICAgICAgICBpZihsYXN0IDwgdCl7XG5cdFx0XHQgICAgICAgICAgICBuID0gMDtcblx0XHRcdCAgICAgICAgICAgIHJldHVybiBsYXN0ID0gdDtcblx0XHRcdCAgICAgICAgfVxuXHRcdFx0ICAgICAgICByZXR1cm4gbGFzdCA9IHQgKyAoKG4gKz0gMSkgLyBkKTtcblx0XHRcdCAgICB9XG5cdFx0XHR9KCkpO1xuXHRcdH0oVXRpbCkpO1xuXHRcdDsoZnVuY3Rpb24oZXhwb3J0cyl7IC8vIE9uIGV2ZW50IGVtaXR0ZXIgZ2VuZXJpYyBqYXZhc2NyaXB0IHV0aWxpdHkuXG5cdFx0XHRmdW5jdGlvbiBPbigpe307XG5cdFx0XHRPbi5jcmVhdGUgPSBmdW5jdGlvbigpe1xuXHRcdFx0XHR2YXIgb24gPSBmdW5jdGlvbihlKXtcblx0XHRcdFx0XHRvbi5ldmVudC5lID0gZTtcblx0XHRcdFx0XHRvbi5ldmVudC5zW2VdID0gb24uZXZlbnQuc1tlXSB8fCBbXTtcblx0XHRcdFx0XHRyZXR1cm4gb247XG5cdFx0XHRcdH07XG5cdFx0XHRcdG9uLmVtaXQgPSBmdW5jdGlvbihhKXtcblx0XHRcdFx0XHR2YXIgZSA9IG9uLmV2ZW50LmUsIHMgPSBvbi5ldmVudC5zW2VdLCBhcmdzID0gYXJndW1lbnRzLCBsID0gYXJncy5sZW5ndGg7XG5cdFx0XHRcdFx0ZXhwb3J0cy5saXN0Lm1hcChzLCBmdW5jdGlvbihoZWFyLCBpKXtcblx0XHRcdFx0XHRcdGlmKCFoZWFyLmZuKXsgcy5zcGxpY2UoaS0xLCAwKTsgcmV0dXJuOyB9XG5cdFx0XHRcdFx0XHRpZigxID09PSBsKXsgaGVhci5mbihhKTsgcmV0dXJuOyB9XG5cdFx0XHRcdFx0XHRoZWFyLmZuLmFwcGx5KGhlYXIsIGFyZ3MpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmKCFzLmxlbmd0aCl7IGRlbGV0ZSBvbi5ldmVudC5zW2VdIH1cblx0XHRcdFx0fVxuXHRcdFx0XHRvbi5ldmVudCA9IGZ1bmN0aW9uKGZuLCBpKXtcblx0XHRcdFx0XHR2YXIgcyA9IG9uLmV2ZW50LnNbb24uZXZlbnQuZV07IGlmKCFzKXsgcmV0dXJuIH1cblx0XHRcdFx0XHR2YXIgZSA9IHtmbjogZm4sIGk6IGkgfHwgMCwgb2ZmOiBmdW5jdGlvbigpeyByZXR1cm4gIShlLmZuID0gZmFsc2UpIH19O1xuXHRcdFx0XHRcdHJldHVybiBzLnB1c2goZSksIGk/IHMuc29ydChzb3J0KSA6IGksIGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0b24uZXZlbnQucyA9IHt9O1xuXHRcdFx0XHRyZXR1cm4gb247XG5cdFx0XHR9XG5cdFx0XHR2YXIgc29ydCA9IGV4cG9ydHMubGlzdC5zb3J0KCdpJyk7XG5cdFx0XHRleHBvcnRzLm9uID0gT24uY3JlYXRlKCk7XG5cdFx0XHRleHBvcnRzLm9uLmNyZWF0ZSA9IE9uLmNyZWF0ZTtcblx0XHR9KFV0aWwpKTtcblx0XHQ7KGZ1bmN0aW9uKGV4cG9ydHMpeyAvLyBHZW5lcmljIGphdmFzY3JpcHQgc2NoZWR1bGVyIHV0aWxpdHkuXG5cdFx0XHR2YXIgc2NoZWR1bGUgPSBmdW5jdGlvbihzdGF0ZSwgY2IpeyAvLyBtYXliZSB1c2UgbHJ1LWNhY2hlP1xuXHRcdFx0XHRzY2hlZHVsZS53YWl0aW5nLnB1c2goe3doZW46IHN0YXRlLCBldmVudDogY2IgfHwgZnVuY3Rpb24oKXt9fSk7XG5cdFx0XHRcdGlmKHNjaGVkdWxlLnNvb25lc3QgPCBzdGF0ZSl7IHJldHVybiB9XG5cdFx0XHRcdHNjaGVkdWxlLnNldChzdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRzY2hlZHVsZS53YWl0aW5nID0gW107XG5cdFx0XHRzY2hlZHVsZS5zb29uZXN0ID0gSW5maW5pdHk7XG5cdFx0XHRzY2hlZHVsZS5zb3J0ID0gZXhwb3J0cy5saXN0LnNvcnQoJ3doZW4nKTtcblx0XHRcdHNjaGVkdWxlLnNldCA9IGZ1bmN0aW9uKGZ1dHVyZSl7XG5cdFx0XHRcdGlmKEluZmluaXR5IDw9IChzY2hlZHVsZS5zb29uZXN0ID0gZnV0dXJlKSl7IHJldHVybiB9XG5cdFx0XHRcdHZhciBub3cgPSBleHBvcnRzLnRpbWUubm93KCk7IC8vIFdBUyB0aW1lLmlzKCkgVE9ETzogSG1tbSwgdGhpcyB3b3VsZCBtYWtlIGl0IGhhcmQgZm9yIGV2ZXJ5IGd1biBpbnN0YW5jZSB0byBoYXZlIHRoZWlyIG93biB2ZXJzaW9uIG9mIHRpbWUuXG5cdFx0XHRcdGZ1dHVyZSA9IChmdXR1cmUgPD0gbm93KT8gMCA6IChmdXR1cmUgLSBub3cpO1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoc2NoZWR1bGUuaWQpO1xuXHRcdFx0XHRzY2hlZHVsZS5pZCA9IHNldFRpbWVvdXQoc2NoZWR1bGUuY2hlY2ssIGZ1dHVyZSk7XG5cdFx0XHR9XG5cdFx0XHRzY2hlZHVsZS5jaGVjayA9IGZ1bmN0aW9uKCl7XG5cdFx0XHRcdHZhciBub3cgPSBleHBvcnRzLnRpbWUubm93KCksIHNvb25lc3QgPSBJbmZpbml0eTsgLy8gV0FTIHRpbWUuaXMoKSBUT0RPOiBTYW1lIGFzIGFib3ZlIGFib3V0IHRpbWUuIEhtbW0uXG5cdFx0XHRcdHNjaGVkdWxlLndhaXRpbmcuc29ydChzY2hlZHVsZS5zb3J0KTtcblx0XHRcdFx0c2NoZWR1bGUud2FpdGluZyA9IGV4cG9ydHMubGlzdC5tYXAoc2NoZWR1bGUud2FpdGluZywgZnVuY3Rpb24od2FpdCwgaSwgbWFwKXtcblx0XHRcdFx0XHRpZighd2FpdCl7IHJldHVybiB9XG5cdFx0XHRcdFx0aWYod2FpdC53aGVuIDw9IG5vdyl7XG5cdFx0XHRcdFx0XHRpZihleHBvcnRzLmZucy5pcyh3YWl0LmV2ZW50KSl7XG5cdFx0XHRcdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKXsgd2FpdC5ldmVudCgpIH0sMCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNvb25lc3QgPSAoc29vbmVzdCA8IHdhaXQud2hlbik/IHNvb25lc3QgOiB3YWl0LndoZW47XG5cdFx0XHRcdFx0XHRtYXAod2FpdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSB8fCBbXTtcblx0XHRcdFx0c2NoZWR1bGUuc2V0KHNvb25lc3QpO1xuXHRcdFx0fVxuXHRcdFx0ZXhwb3J0cy5zY2hlZHVsZSA9IHNjaGVkdWxlO1xuXHRcdH0oVXRpbCkpO1xuXHR9KEd1bikpO1xuXG5cdDsoZnVuY3Rpb24oR3VuKXsgLy8gR3VuIHNwZWNpZmljIHV0aWxpdGllcy5cblxuXHRcdEd1bi52ZXJzaW9uID0gMC4zO1xuXG5cdFx0R3VuLl8gPSB7IC8vIHNvbWUgcmVzZXJ2ZWQga2V5IHdvcmRzLCB0aGVzZSBhcmUgbm90IHRoZSBvbmx5IG9uZXMuXG5cdFx0XHRtZXRhOiAnXycgLy8gYWxsIG1ldGFkYXRhIG9mIHRoZSBub2RlIGlzIHN0b3JlZCBpbiB0aGUgbWV0YSBwcm9wZXJ0eSBvbiB0aGUgbm9kZS5cblx0XHRcdCxzb3VsOiAnIycgLy8gYSBzb3VsIGlzIGEgVVVJRCBvZiBhIG5vZGUgYnV0IGl0IGFsd2F5cyBwb2ludHMgdG8gdGhlIFwibGF0ZXN0XCIgZGF0YSBrbm93bi5cblx0XHRcdCxmaWVsZDogJy4nIC8vIGEgZmllbGQgaXMgYSBwcm9wZXJ0eSBvbiBhIG5vZGUgd2hpY2ggcG9pbnRzIHRvIGEgdmFsdWUuXG5cdFx0XHQsc3RhdGU6ICc+JyAvLyBvdGhlciB0aGFuIHRoZSBzb3VsLCB3ZSBzdG9yZSBIQU0gbWV0YWRhdGEuXG5cdFx0XHQsJyMnOidzb3VsJ1xuXHRcdFx0LCcuJzonZmllbGQnXG5cdFx0XHQsJz0nOid2YWx1ZSdcblx0XHRcdCwnPic6J3N0YXRlJ1xuXHRcdH1cblxuXHRcdEd1bi5pcyA9IGZ1bmN0aW9uKGd1bil7IHJldHVybiAoZ3VuIGluc3RhbmNlb2YgR3VuKT8gdHJ1ZSA6IGZhbHNlIH0gLy8gY2hlY2sgdG8gc2VlIGlmIGl0IGlzIGEgR1VOIGluc3RhbmNlLlxuXG5cdFx0R3VuLmlzLnZhbCA9IGZ1bmN0aW9uKHYpeyAvLyBWYWxpZCB2YWx1ZXMgYXJlIGEgc3Vic2V0IG9mIEpTT046IG51bGwsIGJpbmFyeSwgbnVtYmVyICghSW5maW5pdHkpLCB0ZXh0LCBvciBhIHNvdWwgcmVsYXRpb24uIEFycmF5cyBuZWVkIHNwZWNpYWwgYWxnb3JpdGhtcyB0byBoYW5kbGUgY29uY3VycmVuY3ksIHNvIHRoZXkgYXJlIG5vdCBzdXBwb3J0ZWQgZGlyZWN0bHkuIFVzZSBhbiBleHRlbnNpb24gdGhhdCBzdXBwb3J0cyB0aGVtIGlmIG5lZWRlZCBidXQgcmVzZWFyY2ggdGhlaXIgcHJvYmxlbXMgZmlyc3QuXG5cdFx0XHRpZih2ID09PSBudWxsKXsgcmV0dXJuIHRydWUgfSAvLyBcImRlbGV0ZXNcIiwgbnVsbGluZyBvdXQgZmllbGRzLlxuXHRcdFx0aWYodiA9PT0gSW5maW5pdHkpeyByZXR1cm4gZmFsc2UgfSAvLyB3ZSB3YW50IHRoaXMgdG8gYmUsIGJ1dCBKU09OIGRvZXMgbm90IHN1cHBvcnQgaXQsIHNhZCBmYWNlLlxuXHRcdFx0aWYoR3VuLmJpLmlzKHYpIC8vIGJ5IFwiYmluYXJ5XCIgd2UgbWVhbiBib29sZWFuLlxuXHRcdFx0fHwgR3VuLm51bS5pcyh2KVxuXHRcdFx0fHwgR3VuLnRleHQuaXModikpeyAvLyBieSBcInRleHRcIiB3ZSBtZWFuIHN0cmluZ3MuXG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBzaW1wbGUgdmFsdWVzIGFyZSB2YWxpZC5cblx0XHRcdH1cblx0XHRcdHJldHVybiBHdW4uaXMucmVsKHYpIHx8IGZhbHNlOyAvLyBpcyB0aGUgdmFsdWUgYSBzb3VsIHJlbGF0aW9uPyBUaGVuIGl0IGlzIHZhbGlkIGFuZCByZXR1cm4gaXQuIElmIG5vdCwgZXZlcnl0aGluZyBlbHNlIHJlbWFpbmluZyBpcyBhbiBpbnZhbGlkIGRhdGEgdHlwZS4gQ3VzdG9tIGV4dGVuc2lvbnMgY2FuIGJlIGJ1aWx0IG9uIHRvcCBvZiB0aGVzZSBwcmltaXRpdmVzIHRvIHN1cHBvcnQgb3RoZXIgdHlwZXMuXG5cdFx0fVxuXG5cdFx0R3VuLmlzLnJlbCA9IGZ1bmN0aW9uKHYpeyAvLyB0aGlzIGRlZmluZXMgd2hldGhlciBhbiBvYmplY3QgaXMgYSBzb3VsIHJlbGF0aW9uIG9yIG5vdCwgdGhleSBsb29rIGxpa2UgdGhpczogeycjJzogJ1VVSUQnfVxuXHRcdFx0aWYoR3VuLm9iai5pcyh2KSl7IC8vIG11c3QgYmUgYW4gb2JqZWN0LlxuXHRcdFx0XHR2YXIgaWQ7XG5cdFx0XHRcdEd1bi5vYmoubWFwKHYsIGZ1bmN0aW9uKHMsIGYpeyAvLyBtYXAgb3ZlciB0aGUgb2JqZWN0Li4uXG5cdFx0XHRcdFx0aWYoaWQpeyByZXR1cm4gaWQgPSBmYWxzZSB9IC8vIGlmIElEIGlzIGFscmVhZHkgZGVmaW5lZCBBTkQgd2UncmUgc3RpbGwgbG9vcGluZyB0aHJvdWdoIHRoZSBvYmplY3QsIGl0IGlzIGNvbnNpZGVyZWQgaW52YWxpZC5cblx0XHRcdFx0XHRpZihmID09IEd1bi5fLnNvdWwgJiYgR3VuLnRleHQuaXMocykpeyAvLyB0aGUgZmllbGQgc2hvdWxkIGJlICcjJyBhbmQgaGF2ZSBhIHRleHQgdmFsdWUuXG5cdFx0XHRcdFx0XHRpZCA9IHM7IC8vIHdlIGZvdW5kIHRoZSBzb3VsIVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaWQgPSBmYWxzZTsgLy8gaWYgdGhlcmUgZXhpc3RzIGFueXRoaW5nIGVsc2Ugb24gdGhlIG9iamVjdCB0aGF0IGlzbid0IHRoZSBzb3VsLCB0aGVuIGl0IGlzIGNvbnNpZGVyZWQgaW52YWxpZC5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZihpZCl7IC8vIGEgdmFsaWQgaWQgd2FzIGZvdW5kLlxuXHRcdFx0XHRcdHJldHVybiBpZDsgLy8geWF5ISBSZXR1cm4gaXQuXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTsgLy8gdGhlIHZhbHVlIHdhcyBub3QgYSB2YWxpZCBzb3VsIHJlbGF0aW9uLlxuXHRcdH1cblxuXHRcdEd1bi5pcy5yZWwuaWZ5ID0gZnVuY3Rpb24ocyl7IHZhciByID0ge307IHJldHVybiBHdW4ub2JqLnB1dChyLCBHdW4uXy5zb3VsLCBzKSwgciB9IC8vIGNvbnZlcnQgYSBzb3VsIGludG8gYSByZWxhdGlvbiBhbmQgcmV0dXJuIGl0LlxuXG5cdFx0R3VuLmlzLmxleCA9IGZ1bmN0aW9uKGwpeyB2YXIgciA9IHRydWU7XG5cdFx0XHRpZighR3VuLm9iai5pcyhsKSl7IHJldHVybiBmYWxzZSB9XG5cdFx0XHRHdW4ub2JqLm1hcChsLCBmdW5jdGlvbih2LGYpe1xuXHRcdFx0XHRpZighR3VuLm9iai5oYXMoR3VuLl8sZikgfHwgIShHdW4udGV4dC5pcyh2KSB8fCBHdW4ub2JqLmlzKHYpKSl7IHJldHVybiByID0gZmFsc2UgfVxuXHRcdFx0fSk7IC8vIFRPRE86IFdoYXQgaWYgdGhlIGxleCBjdXJzb3IgaGFzIGEgZG9jdW1lbnQgb24gdGhlIG1hdGNoLCB0aGF0IHNob3VsZG4ndCBiZSBhbGxvd2VkIVxuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fVxuXG5cdFx0R3VuLmlzLm5vZGUgPSBmdW5jdGlvbihuLCBjYiwgdCl7IHZhciBzOyAvLyBjaGVja3MgdG8gc2VlIGlmIGFuIG9iamVjdCBpcyBhIHZhbGlkIG5vZGUuXG5cdFx0XHRpZighR3VuLm9iai5pcyhuKSl7IHJldHVybiBmYWxzZSB9IC8vIG11c3QgYmUgYW4gb2JqZWN0LlxuXHRcdFx0aWYocyA9IEd1bi5pcy5ub2RlLnNvdWwobikpeyAvLyBtdXN0IGhhdmUgYSBzb3VsIG9uIGl0LlxuXHRcdFx0XHRyZXR1cm4gIUd1bi5vYmoubWFwKG4sIGZ1bmN0aW9uKHYsIGYpeyAvLyB3ZSBpbnZlcnQgdGhpcyBiZWNhdXNlIHRoZSB3YXkgd2UgY2hlY2sgZm9yIHRoaXMgaXMgdmlhIGEgbmVnYXRpb24uXG5cdFx0XHRcdFx0aWYoZiA9PSBHdW4uXy5tZXRhKXsgcmV0dXJuIH0gLy8gc2tpcCBvdmVyIHRoZSBtZXRhZGF0YS5cblx0XHRcdFx0XHRpZighR3VuLmlzLnZhbCh2KSl7IHJldHVybiB0cnVlIH0gLy8gaXQgaXMgdHJ1ZSB0aGF0IHRoaXMgaXMgYW4gaW52YWxpZCBub2RlLlxuXHRcdFx0XHRcdGlmKGNiKXsgY2IuY2FsbCh0LCB2LCBmLCBuKSB9IC8vIG9wdGlvbmFsbHkgY2FsbGJhY2sgZWFjaCBmaWVsZC92YWx1ZS5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vcGUhIFRoaXMgd2FzIG5vdCBhIHZhbGlkIG5vZGUuXG5cdFx0fVxuXG5cdFx0R3VuLmlzLm5vZGUuaWZ5ID0gZnVuY3Rpb24obiwgcywgbyl7IC8vIGNvbnZlcnQgYSBzaGFsbG93IG9iamVjdCBpbnRvIGEgbm9kZS5cblx0XHRcdG8gPSBHdW4uYmkuaXMobyk/IHtmb3JjZTogb30gOiBvIHx8IHt9OyAvLyBkZXRlY3Qgb3B0aW9ucy5cblx0XHRcdG4gPSBHdW4uaXMubm9kZS5zb3VsLmlmeShuLCBzLCBvLmZvcmNlKTsgLy8gcHV0IGEgc291bCBvbiBpdC5cblx0XHRcdEd1bi5vYmoubWFwKG4sIGZ1bmN0aW9uKHYsIGYpeyAvLyBpdGVyYXRlIG92ZXIgZWFjaCBmaWVsZC92YWx1ZS5cblx0XHRcdFx0aWYoR3VuLl8ubWV0YSA9PT0gZil7IHJldHVybiB9IC8vIGlnbm9yZSBtZXRhLlxuXHRcdFx0XHRHdW4uaXMubm9kZS5zdGF0ZS5pZnkoW25dLCBmLCB2LCBvLnN0YXRlID0gby5zdGF0ZSB8fCBHdW4udGltZS5ub3coKSk7IC8vIGFuZCBzZXQgdGhlIHN0YXRlIGZvciB0aGlzIGZpZWxkIGFuZCB2YWx1ZSBvbiB0aGlzIG5vZGUuXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBuOyAvLyBUaGlzIHdpbGwgb25seSBiZSBhIHZhbGlkIG5vZGUgaWYgdGhlIG9iamVjdCB3YXNuJ3QgYWxyZWFkeSBkZWVwIVxuXHRcdH1cblxuXHRcdEd1bi5pcy5ub2RlLnNvdWwgPSBmdW5jdGlvbihuLCBzKXsgcmV0dXJuIChuICYmIG4uXyAmJiBuLl9bcyB8fCBHdW4uXy5zb3VsXSkgfHwgZmFsc2UgfSAvLyBjb252ZW5pZW5jZSBmdW5jdGlvbiB0byBjaGVjayB0byBzZWUgaWYgdGhlcmUgaXMgYSBzb3VsIG9uIGEgbm9kZSBhbmQgcmV0dXJuIGl0LlxuXG5cdFx0R3VuLmlzLm5vZGUuc291bC5pZnkgPSBmdW5jdGlvbihuLCBzLCBvKXsgLy8gcHV0IGEgc291bCBvbiBhbiBvYmplY3QuXG5cdFx0XHRuID0gbiB8fCB7fTsgLy8gbWFrZSBzdXJlIGl0IGV4aXN0cy5cblx0XHRcdG4uXyA9IG4uXyB8fCB7fTsgLy8gbWFrZSBzdXJlIG1ldGEgZXhpc3RzLlxuXHRcdFx0bi5fW0d1bi5fLnNvdWxdID0gbz8gcyA6IG4uX1tHdW4uXy5zb3VsXSB8fCBzIHx8IEd1bi50ZXh0LnJhbmRvbSgpOyAvLyBpZiBpdCBhbHJlYWR5IGhhcyBhIHNvdWwgdGhlbiB1c2UgdGhhdCBpbnN0ZWFkIC0gdW5sZXNzIHlvdSBmb3JjZSB0aGUgc291bCB5b3Ugd2FudCB3aXRoIGFuIG9wdGlvbi5cblx0XHRcdHJldHVybiBuO1xuXHRcdH1cblxuXHRcdEd1bi5pcy5ub2RlLnN0YXRlID0gZnVuY3Rpb24obiwgZil7IHJldHVybiAoZiAmJiBuICYmIG4uXyAmJiBuLl9bR3VuLl8uc3RhdGVdICYmIEd1bi5udW0uaXMobi5fW0d1bi5fLnN0YXRlXVtmXSkpPyBuLl9bR3VuLl8uc3RhdGVdW2ZdIDogZmFsc2UgfSAvLyBjb252ZW5pZW5jZSBmdW5jdGlvbiB0byBnZXQgdGhlIHN0YXRlIG9uIGEgZmllbGQgb24gYSBub2RlIGFuZCByZXR1cm4gaXQuXG5cblx0XHRHdW4uaXMubm9kZS5zdGF0ZS5pZnkgPSBmdW5jdGlvbihsLCBmLCB2LCBzdGF0ZSl7IC8vIHB1dCBhIGZpZWxkJ3Mgc3RhdGUgYW5kIHZhbHVlIG9uIHNvbWUgbm9kZXMuXG5cdFx0XHRsID0gR3VuLmxpc3QuaXMobCk/IGwgOiBbbF07IC8vIGhhbmRsZSBhIGxpc3Qgb2Ygbm9kZXMgb3IganVzdCBvbmUgbm9kZS5cblx0XHRcdHZhciBsID0gbC5yZXZlcnNlKCksIGQgPSBsWzBdOyAvLyB3ZSBtaWdodCB3YW50IHRvIGluaGVyaXQgdGhlIHN0YXRlIGZyb20gdGhlIGxhc3Qgbm9kZSBpbiB0aGUgbGlzdC5cblx0XHRcdEd1bi5saXN0Lm1hcChsLCBmdW5jdGlvbihuLCBpKXsgLy8gaXRlcmF0ZSBvdmVyIGVhY2ggbm9kZS5cblx0XHRcdFx0biA9IG4gfHwge307IC8vIG1ha2Ugc3VyZSBpdCBleGlzdHMuXG5cdFx0XHRcdGlmKEd1bi5pcy52YWwodikpeyBuW2ZdID0gdiB9IC8vIGlmIHdlIGhhdmUgYSB2YWx1ZSwgdGhlbiBwdXQgaXQuXG5cdFx0XHRcdG4uXyA9IG4uXyB8fCB7fTsgLy8gbWFrZSBzdXJlIG1ldGEgZXhpc3RzLlxuXHRcdFx0XHRuID0gbi5fW0d1bi5fLnN0YXRlXSA9IG4uX1tHdW4uXy5zdGF0ZV0gfHwge307IC8vIG1ha2Ugc3VyZSBIQU0gc3RhdGUgZXhpc3RzLlxuXHRcdFx0XHRpZihpID0gZC5fW0d1bi5fLnN0YXRlXVtmXSl7IG5bZl0gPSBpIH0gLy8gaW5oZXJpdCB0aGUgc3RhdGUhXG5cdFx0XHRcdGlmKEd1bi5udW0uaXMoc3RhdGUpKXsgbltmXSA9IHN0YXRlIH0gLy8gb3IgbWFudWFsbHkgc2V0IHRoZSBzdGF0ZS5cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdEd1bi5pcy5ncmFwaCA9IGZ1bmN0aW9uKGcsIGNiLCBmbiwgdCl7IC8vIGNoZWNrcyB0byBzZWUgaWYgYW4gb2JqZWN0IGlzIGEgdmFsaWQgZ3JhcGguXG5cdFx0XHR2YXIgZXhpc3QgPSBmYWxzZTtcblx0XHRcdGlmKCFHdW4ub2JqLmlzKGcpKXsgcmV0dXJuIGZhbHNlIH0gLy8gbXVzdCBiZSBhbiBvYmplY3QuXG5cdFx0XHRyZXR1cm4gIUd1bi5vYmoubWFwKGcsIGZ1bmN0aW9uKG4sIHMpeyAvLyB3ZSBpbnZlcnQgdGhpcyBiZWNhdXNlIHRoZSB3YXkgd2UgY2hlY2sgZm9yIHRoaXMgaXMgdmlhIGEgbmVnYXRpb24uXG5cdFx0XHRcdGlmKCFuIHx8IHMgIT09IEd1bi5pcy5ub2RlLnNvdWwobikgfHwgIUd1bi5pcy5ub2RlKG4sIGZuKSl7IHJldHVybiB0cnVlIH0gLy8gaXQgaXMgdHJ1ZSB0aGF0IHRoaXMgaXMgYW4gaW52YWxpZCBncmFwaC5cblx0XHRcdFx0KGNiIHx8IGZ1bmN0aW9uKCl7fSkuY2FsbCh0LCBuLCBzLCBmdW5jdGlvbihmbil7IC8vIG9wdGlvbmFsIGNhbGxiYWNrIGZvciBlYWNoIG5vZGUuXG5cdFx0XHRcdFx0aWYoZm4peyBHdW4uaXMubm9kZShuLCBmbiwgdCkgfSAvLyB3aGVyZSB3ZSB0aGVuIGhhdmUgYW4gb3B0aW9uYWwgY2FsbGJhY2sgZm9yIGVhY2ggZmllbGQvdmFsdWUuXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRleGlzdCA9IHRydWU7XG5cdFx0XHR9KSAmJiBleGlzdDsgLy8gbWFrZXMgc3VyZSBpdCB3YXNuJ3QgYW4gZW1wdHkgb2JqZWN0LlxuXHRcdH1cblxuXHRcdEd1bi5pcy5ncmFwaC5pZnkgPSBmdW5jdGlvbihuKXsgdmFyIHM7IC8vIHdyYXAgYSBub2RlIGludG8gYSBncmFwaC5cblx0XHRcdGlmKHMgPSBHdW4uaXMubm9kZS5zb3VsKG4pKXsgLy8gZ3JhYiB0aGUgc291bCBmcm9tIHRoZSBub2RlLCBpZiBpdCBpcyBhIG5vZGUuXG5cdFx0XHRcdHJldHVybiBHdW4ub2JqLnB1dCh7fSwgcywgbik7IC8vIHRoZW4gY3JlYXRlIGFuZCByZXR1cm4gYSBncmFwaCB3aGljaCBoYXMgYSBub2RlIG9uIHRoZSBtYXRjaGluZyBzb3VsIHByb3BlcnR5LlxuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0R3VuLkhBTSA9IGZ1bmN0aW9uKG1hY2hpbmVTdGF0ZSwgaW5jb21pbmdTdGF0ZSwgY3VycmVudFN0YXRlLCBpbmNvbWluZ1ZhbHVlLCBjdXJyZW50VmFsdWUpeyAvLyBUT0RPOiBMZXN0ZXIncyBjb21tZW50cyBvbiByb2xsIGJhY2tzIGNvdWxkIGJlIHZ1bG5lcmFibGUgdG8gZGl2ZXJnZW5jZSwgaW52ZXN0aWdhdGUhXG5cdFx0XHRpZihtYWNoaW5lU3RhdGUgPCBpbmNvbWluZ1N0YXRlKXtcblx0XHRcdFx0Ly8gdGhlIGluY29taW5nIHZhbHVlIGlzIG91dHNpZGUgdGhlIGJvdW5kYXJ5IG9mIHRoZSBtYWNoaW5lJ3Mgc3RhdGUsIGl0IG11c3QgYmUgcmVwcm9jZXNzZWQgaW4gYW5vdGhlciBzdGF0ZS5cblx0XHRcdFx0cmV0dXJuIHtkZWZlcjogdHJ1ZX07XG5cdFx0XHR9XG5cdFx0XHRpZihpbmNvbWluZ1N0YXRlIDwgY3VycmVudFN0YXRlKXtcblx0XHRcdFx0Ly8gdGhlIGluY29taW5nIHZhbHVlIGlzIHdpdGhpbiB0aGUgYm91bmRhcnkgb2YgdGhlIG1hY2hpbmUncyBzdGF0ZSwgYnV0IG5vdCB3aXRoaW4gdGhlIHJhbmdlLlxuXHRcdFx0XHRyZXR1cm4ge2hpc3RvcmljYWw6IHRydWV9O1xuXHRcdFx0fVxuXHRcdFx0aWYoY3VycmVudFN0YXRlIDwgaW5jb21pbmdTdGF0ZSl7XG5cdFx0XHRcdC8vIHRoZSBpbmNvbWluZyB2YWx1ZSBpcyB3aXRoaW4gYm90aCB0aGUgYm91bmRhcnkgYW5kIHRoZSByYW5nZSBvZiB0aGUgbWFjaGluZSdzIHN0YXRlLlxuXHRcdFx0XHRyZXR1cm4ge2NvbnZlcmdlOiB0cnVlLCBpbmNvbWluZzogdHJ1ZX07XG5cdFx0XHR9XG5cdFx0XHRpZihpbmNvbWluZ1N0YXRlID09PSBjdXJyZW50U3RhdGUpe1xuXHRcdFx0XHRpZihpbmNvbWluZ1ZhbHVlID09PSBjdXJyZW50VmFsdWUpeyAvLyBOb3RlOiB3aGlsZSB0aGVzZSBhcmUgcHJhY3RpY2FsbHkgdGhlIHNhbWUsIHRoZSBkZWx0YXMgY291bGQgYmUgdGVjaG5pY2FsbHkgZGlmZmVyZW50XG5cdFx0XHRcdFx0cmV0dXJuIHtzdGF0ZTogdHJ1ZX07XG5cdFx0XHRcdH1cblx0XHRcdFx0Lypcblx0XHRcdFx0XHRUaGUgZm9sbG93aW5nIGlzIGEgbmFpdmUgaW1wbGVtZW50YXRpb24sIGJ1dCB3aWxsIGFsd2F5cyB3b3JrLlxuXHRcdFx0XHRcdE5ldmVyIGNoYW5nZSBpdCB1bmxlc3MgeW91IGhhdmUgc3BlY2lmaWMgbmVlZHMgdGhhdCBhYnNvbHV0ZWx5IHJlcXVpcmUgaXQuXG5cdFx0XHRcdFx0SWYgY2hhbmdlZCwgeW91ciBkYXRhIHdpbGwgZGl2ZXJnZSB1bmxlc3MgeW91IGd1YXJhbnRlZSBldmVyeSBwZWVyJ3MgYWxnb3JpdGhtIGhhcyBhbHNvIGJlZW4gY2hhbmdlZCB0byBiZSB0aGUgc2FtZS5cblx0XHRcdFx0XHRBcyBhIHJlc3VsdCwgaXQgaXMgaGlnaGx5IGRpc2NvdXJhZ2VkIHRvIG1vZGlmeSBkZXNwaXRlIHRoZSBmYWN0IHRoYXQgaXQgaXMgbmFpdmUsXG5cdFx0XHRcdFx0YmVjYXVzZSBjb252ZXJnZW5jZSAoZGF0YSBpbnRlZ3JpdHkpIGlzIGdlbmVyYWxseSBtb3JlIGltcG9ydGFudC5cblx0XHRcdFx0XHRBbnkgZGlmZmVyZW5jZSBpbiB0aGlzIGFsZ29yaXRobSBtdXN0IGJlIGdpdmVuIGEgbmV3IGFuZCBkaWZmZXJlbnQgbmFtZS5cblx0XHRcdFx0Ki9cblx0XHRcdFx0aWYoU3RyaW5nKGluY29taW5nVmFsdWUpIDwgU3RyaW5nKGN1cnJlbnRWYWx1ZSkpeyAvLyBTdHJpbmcgb25seSB3b3JrcyBvbiBwcmltaXRpdmUgdmFsdWVzIVxuXHRcdFx0XHRcdHJldHVybiB7Y29udmVyZ2U6IHRydWUsIGN1cnJlbnQ6IHRydWV9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmKFN0cmluZyhjdXJyZW50VmFsdWUpIDwgU3RyaW5nKGluY29taW5nVmFsdWUpKXsgLy8gU3RyaW5nIG9ubHkgd29ya3Mgb24gcHJpbWl0aXZlIHZhbHVlcyFcblx0XHRcdFx0XHRyZXR1cm4ge2NvbnZlcmdlOiB0cnVlLCBpbmNvbWluZzogdHJ1ZX07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7ZXJyOiBcInlvdSBoYXZlIG5vdCBwcm9wZXJseSBoYW5kbGVkIHJlY3Vyc2lvbiB0aHJvdWdoIHlvdXIgZGF0YSBvciBmaWx0ZXJlZCBpdCBhcyBKU09OXCJ9O1xuXHRcdH1cblxuXHRcdEd1bi51bmlvbiA9IGZ1bmN0aW9uKGd1biwgcHJpbWUsIGNiLCBvcHQpeyAvLyBtZXJnZSB0d28gZ3JhcGhzIGludG8gdGhlIGZpcnN0LlxuXHRcdFx0dmFyIG9wdCA9IG9wdCB8fCBHdW4ub2JqLmlzKGNiKT8gY2IgOiB7fTtcblx0XHRcdHZhciBjdHggPSB7Z3JhcGg6IGd1bi5fXy5ncmFwaCwgY291bnQ6IDB9O1xuXHRcdFx0Y3R4LmNiID0gZnVuY3Rpb24oKXtcblx0XHRcdFx0Y2IgPSBHdW4uZm5zLmlzKGNiKT8gY2IoKSAmJiBudWxsIDogbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmKCFjdHguZ3JhcGgpeyBjdHguZXJyID0ge2VycjogR3VuLmxvZyhcIk5vIGdyYXBoIVwiKSB9IH1cblx0XHRcdGlmKCFwcmltZSl7IGN0eC5lcnIgPSB7ZXJyOiBHdW4ubG9nKFwiTm8gZGF0YSB0byBtZXJnZSFcIikgfSB9XG5cdFx0XHRpZihjdHguc291bCA9IEd1bi5pcy5ub2RlLnNvdWwocHJpbWUpKXsgcHJpbWUgPSBHdW4uaXMuZ3JhcGguaWZ5KHByaW1lKSB9XG5cdFx0XHRpZighR3VuLmlzLmdyYXBoKHByaW1lLCBudWxsLCBmdW5jdGlvbih2YWwsIGZpZWxkLCBub2RlKXsgdmFyIG1ldGE7XG5cdFx0XHRcdGlmKCFHdW4ubnVtLmlzKEd1bi5pcy5ub2RlLnN0YXRlKG5vZGUsIGZpZWxkKSkpe1xuXHRcdFx0XHRcdHJldHVybiBjdHguZXJyID0ge2VycjogR3VuLmxvZyhcIk5vIHN0YXRlIG9uICdcIiArIGZpZWxkICsgXCInIVwiKSB9XG5cdFx0XHRcdH1cblx0XHRcdH0pIHx8IGN0eC5lcnIpeyByZXR1cm4gY3R4LmVyciA9IGN0eC5lcnIgfHwge2VycjogR3VuLmxvZyhcIkludmFsaWQgZ3JhcGghXCIsIHByaW1lKX0sIGN0eCB9XG5cdFx0XHRmdW5jdGlvbiBlbWl0KGF0KXtcblx0XHRcdFx0R3VuLm9uKCdvcGVyYXRpbmcnKS5lbWl0KGd1biwgYXQpO1xuXHRcdFx0fVxuXHRcdFx0KGZ1bmN0aW9uIHVuaW9uKGdyYXBoLCBwcmltZSl7XG5cdFx0XHRcdHZhciBwcmltZSA9IEd1bi5vYmoubWFwKHByaW1lLCBmdW5jdGlvbihuLHMsdCl7dChuKX0pLnNvcnQoZnVuY3Rpb24oQSxCKXtcblx0XHRcdFx0XHR2YXIgcyA9IEd1bi5pcy5ub2RlLnNvdWwoQSk7XG5cdFx0XHRcdFx0aWYoZ3JhcGhbc10peyByZXR1cm4gMSB9XG5cdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjdHguY291bnQgKz0gMTtcblx0XHRcdFx0Y3R4LmVyciA9IEd1bi5saXN0Lm1hcChwcmltZSwgZnVuY3Rpb24obm9kZSwgc291bCl7XG5cdFx0XHRcdFx0c291bCA9IEd1bi5pcy5ub2RlLnNvdWwobm9kZSk7XG5cdFx0XHRcdFx0aWYoIXNvdWwpeyByZXR1cm4ge2VycjogR3VuLmxvZyhcIlNvdWwgbWlzc2luZyBvciBtaXNtYXRjaGluZyFcIil9IH1cblx0XHRcdFx0XHRjdHguY291bnQgKz0gMTtcblx0XHRcdFx0XHR2YXIgdmVydGV4ID0gZ3JhcGhbc291bF07XG5cdFx0XHRcdFx0aWYoIXZlcnRleCl7IGdyYXBoW3NvdWxdID0gdmVydGV4ID0gR3VuLmlzLm5vZGUuaWZ5KHt9LCBzb3VsKSB9XG5cdFx0XHRcdFx0R3VuLnVuaW9uLkhBTSh2ZXJ0ZXgsIG5vZGUsIGZ1bmN0aW9uKHZlcnRleCwgZmllbGQsIHZhbCwgc3RhdGUpe1xuXHRcdFx0XHRcdFx0R3VuLm9uKCdoaXN0b3JpY2FsJykuZW1pdChndW4sIHtzb3VsOiBzb3VsLCBmaWVsZDogZmllbGQsIHZhbHVlOiB2YWwsIHN0YXRlOiBzdGF0ZSwgY2hhbmdlOiBub2RlfSk7XG5cdFx0XHRcdFx0XHRndW4uX18ub24oJ2hpc3RvcmljYWwnKS5lbWl0KHtzb3VsOiBzb3VsLCBmaWVsZDogZmllbGQsIGNoYW5nZTogbm9kZX0pO1xuXHRcdFx0XHRcdH0sIGZ1bmN0aW9uKHZlcnRleCwgZmllbGQsIHZhbCwgc3RhdGUpe1xuXHRcdFx0XHRcdFx0aWYoIXZlcnRleCl7IHJldHVybiB9XG5cdFx0XHRcdFx0XHR2YXIgY2hhbmdlID0gR3VuLmlzLm5vZGUuc291bC5pZnkoe30sIHNvdWwpO1xuXHRcdFx0XHRcdFx0aWYoZmllbGQpe1xuXHRcdFx0XHRcdFx0XHRHdW4uaXMubm9kZS5zdGF0ZS5pZnkoW3ZlcnRleCwgY2hhbmdlLCBub2RlXSwgZmllbGQsIHZhbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbWl0KHtzb3VsOiBzb3VsLCBmaWVsZDogZmllbGQsIHZhbHVlOiB2YWwsIHN0YXRlOiBzdGF0ZSwgY2hhbmdlOiBjaGFuZ2V9KTtcblx0XHRcdFx0XHR9LCBmdW5jdGlvbih2ZXJ0ZXgsIGZpZWxkLCB2YWwsIHN0YXRlKXtcblx0XHRcdFx0XHRcdEd1bi5vbignZGVmZXJyZWQnKS5lbWl0KGd1biwge3NvdWw6IHNvdWwsIGZpZWxkOiBmaWVsZCwgdmFsdWU6IHZhbCwgc3RhdGU6IHN0YXRlLCBjaGFuZ2U6IG5vZGV9KTtcblx0XHRcdFx0XHR9KShmdW5jdGlvbigpe1xuXHRcdFx0XHRcdFx0ZW1pdCh7c291bDogc291bCwgY2hhbmdlOiBub2RlfSk7XG5cdFx0XHRcdFx0XHRpZihvcHQuc291bCl7IG9wdC5zb3VsKHNvdWwpIH1cblx0XHRcdFx0XHRcdGlmKCEoY3R4LmNvdW50IC09IDEpKXsgY3R4LmNiKCkgfVxuXHRcdFx0XHRcdH0pOyAvLyBUT0RPOiBCVUc/IEhhbmRsZSBlcnJvciFcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGN0eC5jb3VudCAtPSAxO1xuXHRcdFx0fSkoY3R4LmdyYXBoLCBwcmltZSk7XG5cdFx0XHRpZighY3R4LmNvdW50KXsgY3R4LmNiKCkgfVxuXHRcdFx0cmV0dXJuIGN0eDtcblx0XHR9XG5cblx0XHRHdW4udW5pb24uaWZ5ID0gZnVuY3Rpb24oZ3VuLCBwcmltZSwgY2IsIG9wdCl7XG5cdFx0XHRpZihndW4peyBndW4gPSAoZ3VuLl9fICYmIGd1bi5fXy5ncmFwaCk/IGd1bi5fXy5ncmFwaCA6IGd1biB9XG5cdFx0XHRpZihHdW4udGV4dC5pcyhwcmltZSkpe1xuXHRcdFx0XHRpZihndW4gJiYgZ3VuW3ByaW1lXSl7XG5cdFx0XHRcdFx0cHJpbWUgPSBndW5bcHJpbWVdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBHdW4uaXMubm9kZS5pZnkoe30sIHByaW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dmFyIHZlcnRleCA9IEd1bi5pcy5ub2RlLnNvdWwuaWZ5KHt9LCBHdW4uaXMubm9kZS5zb3VsKHByaW1lKSksIHByaW1lID0gR3VuLmlzLmdyYXBoLmlmeShwcmltZSkgfHwgcHJpbWU7XG5cdFx0XHRpZihHdW4uaXMuZ3JhcGgocHJpbWUsIG51bGwsIGZ1bmN0aW9uKHZhbCwgZmllbGQpeyB2YXIgbm9kZTtcblx0XHRcdFx0ZnVuY3Rpb24gbWVyZ2UoYSwgZiwgdil7IEd1bi5pcy5ub2RlLnN0YXRlLmlmeShhLCBmLCB2KSB9XG5cdFx0XHRcdGlmKEd1bi5pcy5yZWwodmFsKSl7IG5vZGUgPSBndW4/IGd1bltmaWVsZF0gfHwgcHJpbWVbZmllbGRdIDogcHJpbWVbZmllbGRdIH1cblx0XHRcdFx0R3VuLnVuaW9uLkhBTSh2ZXJ0ZXgsIG5vZGUsIGZ1bmN0aW9uKCl7fSwgZnVuY3Rpb24odmVydCwgZiwgdil7XG5cdFx0XHRcdFx0bWVyZ2UoW3ZlcnRleCwgbm9kZV0sIGYsIHYpO1xuXHRcdFx0XHR9LCBmdW5jdGlvbigpe30pKGZ1bmN0aW9uKGVycil7XG5cdFx0XHRcdFx0aWYoZXJyKXsgbWVyZ2UoW3ZlcnRleF0sIGZpZWxkLCB2YWwpIH1cblx0XHRcdFx0fSlcblx0XHRcdH0pKXsgcmV0dXJuIHZlcnRleCB9XG5cdFx0fVxuXG5cdFx0R3VuLnVuaW9uLkhBTSA9IGZ1bmN0aW9uKHZlcnRleCwgZGVsdGEsIGxvd2VyLCBub3csIHVwcGVyKXtcblx0XHRcdHVwcGVyLm1heCA9IC1JbmZpbml0eTtcblx0XHRcdG5vdy5lbmQgPSB0cnVlO1xuXHRcdFx0ZGVsdGEgPSBkZWx0YSB8fCB7fTtcblx0XHRcdHZlcnRleCA9IHZlcnRleCB8fCB7fTtcblx0XHRcdEd1bi5vYmoubWFwKGRlbHRhLl8sIGZ1bmN0aW9uKHYsZil7XG5cdFx0XHRcdGlmKEd1bi5fLnN0YXRlID09PSBmIHx8IEd1bi5fLnNvdWwgPT09IGYpeyByZXR1cm4gfVxuXHRcdFx0XHR2ZXJ0ZXguX1tmXSA9IHY7XG5cdFx0XHR9KTtcblx0XHRcdGlmKCFHdW4uaXMubm9kZShkZWx0YSwgZnVuY3Rpb24gdXBkYXRlKGluY29taW5nLCBmaWVsZCl7XG5cdFx0XHRcdG5vdy5lbmQgPSBmYWxzZTtcblx0XHRcdFx0dmFyIGN0eCA9IHtpbmNvbWluZzoge30sIGN1cnJlbnQ6IHt9fSwgc3RhdGU7XG5cdFx0XHRcdGN0eC5kcmlmdCA9IEd1bi50aW1lLm5vdygpOyAvLyBEQU5HRVJPVVMhXG5cdFx0XHRcdGN0eC5pbmNvbWluZy52YWx1ZSA9IEd1bi5pcy5yZWwoaW5jb21pbmcpIHx8IGluY29taW5nO1xuXHRcdFx0XHRjdHguY3VycmVudC52YWx1ZSA9IEd1bi5pcy5yZWwodmVydGV4W2ZpZWxkXSkgfHwgdmVydGV4W2ZpZWxkXTtcblx0XHRcdFx0Y3R4LmluY29taW5nLnN0YXRlID0gR3VuLm51bS5pcyhjdHgudG1wID0gKChkZWx0YS5ffHx7fSlbR3VuLl8uc3RhdGVdfHx7fSlbZmllbGRdKT8gY3R4LnRtcCA6IC1JbmZpbml0eTtcblx0XHRcdFx0Y3R4LmN1cnJlbnQuc3RhdGUgPSBHdW4ubnVtLmlzKGN0eC50bXAgPSAoKHZlcnRleC5ffHx7fSlbR3VuLl8uc3RhdGVdfHx7fSlbZmllbGRdKT8gY3R4LnRtcCA6IC1JbmZpbml0eTtcblx0XHRcdFx0dXBwZXIubWF4ID0gY3R4LmluY29taW5nLnN0YXRlID4gdXBwZXIubWF4PyBjdHguaW5jb21pbmcuc3RhdGUgOiB1cHBlci5tYXg7XG5cdFx0XHRcdHN0YXRlID0gR3VuLkhBTShjdHguZHJpZnQsIGN0eC5pbmNvbWluZy5zdGF0ZSwgY3R4LmN1cnJlbnQuc3RhdGUsIGN0eC5pbmNvbWluZy52YWx1ZSwgY3R4LmN1cnJlbnQudmFsdWUpO1xuXHRcdFx0XHRpZihzdGF0ZS5lcnIpe1xuXHRcdFx0XHRcdHJvb3QuY29uc29sZS5sb2coXCIuIUhZUE9USEVUSUNBTCBBTU5FU0lBIE1BQ0hJTkUgRVJSIS5cIiwgc3RhdGUuZXJyKTsgLy8gdGhpcyBlcnJvciBzaG91bGQgbmV2ZXIgaGFwcGVuLlxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihzdGF0ZS5zdGF0ZSB8fCBzdGF0ZS5oaXN0b3JpY2FsIHx8IHN0YXRlLmN1cnJlbnQpe1xuXHRcdFx0XHRcdGxvd2VyLmNhbGwoc3RhdGUsIHZlcnRleCwgZmllbGQsIGluY29taW5nLCBjdHguaW5jb21pbmcuc3RhdGUpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihzdGF0ZS5pbmNvbWluZyl7XG5cdFx0XHRcdFx0bm93LmNhbGwoc3RhdGUsIHZlcnRleCwgZmllbGQsIGluY29taW5nLCBjdHguaW5jb21pbmcuc3RhdGUpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihzdGF0ZS5kZWZlcil7XG5cdFx0XHRcdFx0dXBwZXIud2FpdCA9IHRydWU7XG5cdFx0XHRcdFx0dXBwZXIuY2FsbChzdGF0ZSwgdmVydGV4LCBmaWVsZCwgaW5jb21pbmcsIGN0eC5pbmNvbWluZy5zdGF0ZSk7IC8vIHNpZ25hbHMgdGhhdCB0aGVyZSBhcmUgc3RpbGwgZnV0dXJlIG1vZGlmaWNhdGlvbnMuXG5cdFx0XHRcdFx0R3VuLnNjaGVkdWxlKGN0eC5pbmNvbWluZy5zdGF0ZSwgZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRcdHVwZGF0ZShpbmNvbWluZywgZmllbGQpO1xuXHRcdFx0XHRcdFx0aWYoY3R4LmluY29taW5nLnN0YXRlID09PSB1cHBlci5tYXgpeyAodXBwZXIubGFzdCB8fCBmdW5jdGlvbigpe30pKCkgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSl7IHJldHVybiBmdW5jdGlvbihmbil7IGlmKGZuKXsgZm4oe2VycjogJ05vdCBhIG5vZGUhJ30pIH0gfSB9XG5cdFx0XHRpZihub3cuZW5kKXsgbm93LmNhbGwoe30sIHZlcnRleCkgfSAvLyBUT0RPOiBTaG91bGQgSEFNIGhhbmRsZSBlbXB0eSB1cGRhdGVzPyBZRVMuXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24oZm4pe1xuXHRcdFx0XHR1cHBlci5sYXN0ID0gZm4gfHwgZnVuY3Rpb24oKXt9O1xuXHRcdFx0XHRpZighdXBwZXIud2FpdCl7IHVwcGVyLmxhc3QoKSB9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0R3VuLm9uLmF0ID0gZnVuY3Rpb24ob24peyAvLyBPbiBldmVudCBlbWl0dGVyIGN1c3RvbWl6ZWQgZm9yIGd1bi5cblx0XHRcdHZhciBwcm94eSA9IGZ1bmN0aW9uKGUpeyByZXR1cm4gcHJveHkuZSA9IGUsIHByb3h5IH1cblx0XHRcdHByb3h5LmVtaXQgPSBmdW5jdGlvbihhdCl7XG5cdFx0XHRcdGlmKGF0LnNvdWwpe1xuXHRcdFx0XHRcdGF0Lmhhc2ggPSBHdW4ub24uYXQuaGFzaChhdCk7XG5cdFx0XHRcdFx0Ly9HdW4ub2JqLmFzKHByb3h5Lm1lbSwgcHJveHkuZSlbYXQuc291bF0gPSBhdDtcblx0XHRcdFx0XHRHdW4ub2JqLmFzKHByb3h5Lm1lbSwgcHJveHkuZSlbYXQuaGFzaF0gPSBhdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihwcm94eS5hbGwuY2IpeyBwcm94eS5hbGwuY2IoYXQsIHByb3h5LmUpIH1cblx0XHRcdFx0b24ocHJveHkuZSkuZW1pdChhdCk7XG5cdFx0XHRcdHJldHVybiB7Y2hhaW46IGZ1bmN0aW9uKGMpe1xuXHRcdFx0XHRcdGlmKCFjIHx8ICFjLl8gfHwgIWMuXy5hdCl7IHJldHVybiB9XG5cdFx0XHRcdFx0cmV0dXJuIGMuXy5hdChwcm94eS5lKS5lbWl0KGF0KVxuXHRcdFx0XHR9fTtcblx0XHRcdH1cblx0XHRcdHByb3h5Lm9ubHkgPSBmdW5jdGlvbihjYil7XG5cdFx0XHRcdGlmKHByb3h5Lm9ubHkuY2IpeyByZXR1cm4gfVxuXHRcdFx0XHRyZXR1cm4gcHJveHkuZXZlbnQocHJveHkub25seS5jYiA9IGNiKTtcblx0XHRcdH1cblx0XHRcdHByb3h5LmFsbCA9IGZ1bmN0aW9uKGNiKXtcblx0XHRcdFx0cHJveHkuYWxsLmNiID0gY2I7XG5cdFx0XHRcdEd1bi5vYmoubWFwKHByb3h5Lm1lbSwgZnVuY3Rpb24obWVtLCBlKXtcblx0XHRcdFx0XHRHdW4ub2JqLm1hcChtZW0sIGZ1bmN0aW9uKGF0LCBpKXtcblx0XHRcdFx0XHRcdGNiKGF0LCBlKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRwcm94eS5ldmVudCA9IGZ1bmN0aW9uKGNiLCBpKXtcblx0XHRcdFx0aSA9IG9uKHByb3h5LmUpLmV2ZW50KGNiLCBpKTtcblx0XHRcdFx0cmV0dXJuIEd1bi5vYmoubWFwKHByb3h5Lm1lbVtwcm94eS5lXSwgZnVuY3Rpb24oYXQpe1xuXHRcdFx0XHRcdGkuc3RhdCA9IHtmaXJzdDogdHJ1ZX07XG5cdFx0XHRcdFx0Y2IuY2FsbChpLCBhdCk7XG5cdFx0XHRcdH0pLCBpLnN0YXQgPSB7fSwgaTtcblx0XHRcdH1cblx0XHRcdHByb3h5Lm1hcCA9IGZ1bmN0aW9uKGNiLCBpKXtcblx0XHRcdFx0cmV0dXJuIHByb3h5LmV2ZW50KGNiLCBpKTtcblx0XHRcdH07XG5cdFx0XHRwcm94eS5tZW0gPSB7fTtcblx0XHRcdHJldHVybiBwcm94eTtcblx0XHR9XG5cblx0XHRHdW4ub24uYXQuaGFzaCA9IGZ1bmN0aW9uKGF0KXsgcmV0dXJuIChhdC5hdCAmJiBhdC5hdC5zb3VsKT8gYXQuYXQuc291bCArIChhdC5hdC5maWVsZCB8fCAnJykgOiBhdC5zb3VsICsgKGF0LmZpZWxkIHx8ICcnKSB9XG5cblx0XHRHdW4ub24uYXQuY29weSA9IGZ1bmN0aW9uKGF0KXsgcmV0dXJuIEd1bi5vYmouZGVsKGF0LCAnaGFzaCcpLCBHdW4ub2JqLm1hcChhdCwgZnVuY3Rpb24odixmLHQpe3QoZix2KX0pIH1cblxuXHRcdEd1bi5yb290ID0gZnVuY3Rpb24oZ3VuKSB7XG5cdFx0XHRpZiAoIUd1bi5pcyhndW4pKSByZXR1cm4gbnVsbDtcblx0XHRcdGlmIChndW4uYmFjayA9PT0gZ3VuKSByZXR1cm4gZ3VuO1xuXHRcdFx0cmV0dXJuIEd1bi5yb290KGd1bi5iYWNrKTtcblx0XHR9O1xuXG5cdH0oR3VuKSk7XG5cblx0OyhmdW5jdGlvbihHdW4peyAvLyBHdW4gcHJvdG90eXBlIGNoYWluIG1ldGhvZHMuXG5cblx0XHRHdW4uY2hhaW4gPSBHdW4ucHJvdG90eXBlO1xuXG5cdFx0R3VuLmNoYWluLm9wdCA9IGZ1bmN0aW9uKG9wdCwgc3R1bil7XG5cdFx0XHRvcHQgPSBvcHQgfHwge307XG5cdFx0XHR2YXIgZ3VuID0gdGhpcywgcm9vdCA9IChndW4uX18gJiYgZ3VuLl9fLmd1bik/IGd1bi5fXy5ndW4gOiAoZ3VuLl8gPSBndW4uX18gPSB7Z3VuOiBndW59KS5ndW4uY2hhaW4oKTsgLy8gaWYgcm9vdCBkb2VzIG5vdCBleGlzdCwgdGhlbiBjcmVhdGUgYSByb290IGNoYWluLlxuXHRcdFx0cm9vdC5fXy5ieSA9IHJvb3QuX18uYnkgfHwgZnVuY3Rpb24oZil7IHJldHVybiBndW4uX18uYnlbZl0gPSBndW4uX18uYnlbZl0gfHwge30gfTtcblx0XHRcdHJvb3QuX18uZ3JhcGggPSByb290Ll9fLmdyYXBoIHx8IHt9O1xuXHRcdFx0cm9vdC5fXy5vcHQgPSByb290Ll9fLm9wdCB8fCB7cGVlcnM6IHt9fTtcblx0XHRcdHJvb3QuX18ub3B0LndpcmUgPSByb290Ll9fLm9wdC53aXJlIHx8IHt9O1xuXHRcdFx0aWYoR3VuLnRleHQuaXMob3B0KSl7IG9wdCA9IHtwZWVyczogb3B0fSB9XG5cdFx0XHRpZihHdW4ubGlzdC5pcyhvcHQpKXsgb3B0ID0ge3BlZXJzOiBvcHR9IH1cblx0XHRcdGlmKEd1bi50ZXh0LmlzKG9wdC5wZWVycykpeyBvcHQucGVlcnMgPSBbb3B0LnBlZXJzXSB9XG5cdFx0XHRpZihHdW4ubGlzdC5pcyhvcHQucGVlcnMpKXsgb3B0LnBlZXJzID0gR3VuLm9iai5tYXAob3B0LnBlZXJzLCBmdW5jdGlvbihuLGYsbSl7IG0obix7fSkgfSkgfVxuXHRcdFx0R3VuLm9iai5tYXAob3B0LnBlZXJzLCBmdW5jdGlvbih2LCBmKXtcblx0XHRcdFx0cm9vdC5fXy5vcHQucGVlcnNbZl0gPSB2O1xuXHRcdFx0fSk7XG5cdFx0XHRHdW4ub2JqLm1hcChvcHQud2lyZSwgZnVuY3Rpb24oaCwgZil7XG5cdFx0XHRcdGlmKCFHdW4uZm5zLmlzKGgpKXsgcmV0dXJuIH1cblx0XHRcdFx0cm9vdC5fXy5vcHQud2lyZVtmXSA9IGg7XG5cdFx0XHR9KTtcblx0XHRcdEd1bi5vYmoubWFwKFsna2V5JywgJ29uJywgJ3BhdGgnLCAnbWFwJywgJ25vdCcsICdpbml0J10sIGZ1bmN0aW9uKGYpe1xuXHRcdFx0XHRpZighb3B0W2ZdKXsgcmV0dXJuIH1cblx0XHRcdFx0cm9vdC5fXy5vcHRbZl0gPSBvcHRbZl0gfHwgcm9vdC5fXy5vcHRbZl07XG5cdFx0XHR9KTtcblx0XHRcdGlmKCFzdHVuKXsgR3VuLm9uKCdvcHQnKS5lbWl0KHJvb3QsIG9wdCkgfVxuXHRcdFx0cmV0dXJuIGd1bjtcblx0XHR9XG5cblx0XHRHdW4uY2hhaW4uY2hhaW4gPSBmdW5jdGlvbihzKXtcblx0XHRcdHZhciBmcm9tID0gdGhpcywgZ3VuID0gIWZyb20uYmFjaz8gZnJvbSA6IG5ldyB0aGlzLmNvbnN0cnVjdG9yKGZyb20pOy8vR3VuKGZyb20pO1xuXHRcdFx0Z3VuLl8gPSBndW4uXyB8fCB7fTtcblx0XHRcdGd1bi5fLmJhY2sgPSBndW4uYmFjayB8fCBmcm9tO1xuXHRcdFx0Z3VuLmJhY2sgPSBndW4uYmFjayB8fCBmcm9tO1xuXHRcdFx0Z3VuLl9fID0gZ3VuLl9fIHx8IGZyb20uX187XG5cdFx0XHRndW4uXy5vbiA9IGd1bi5fLm9uIHx8IEd1bi5vbi5jcmVhdGUoKTtcblx0XHRcdGd1bi5fLmF0ID0gZ3VuLl8uYXQgfHwgR3VuLm9uLmF0KGd1bi5fLm9uKTtcblx0XHRcdHJldHVybiBndW47XG5cdFx0fVxuXG5cdFx0R3VuLmNoYWluLnB1dCA9IGZ1bmN0aW9uKHZhbCwgY2IsIG9wdCl7XG5cdFx0XHRvcHQgPSBvcHQgfHwge307XG5cdFx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCl7fTsgY2IuaGFzaCA9IHt9O1xuXHRcdFx0dmFyIGd1biA9IHRoaXMsIGNoYWluID0gZ3VuLmNoYWluKCksIHRtcCA9IHt2YWw6IHZhbH0sIGRyaWZ0ID0gR3VuLnRpbWUubm93KCk7XG5cdFx0XHRmdW5jdGlvbiBwdXQoYXQpe1xuXHRcdFx0XHR2YXIgdmFsID0gdG1wLnZhbDtcblx0XHRcdFx0dmFyIGN0eCA9IHtvYmo6IHZhbH07IC8vIHByZXAgdGhlIHZhbHVlIGZvciBzZXJpYWxpemF0aW9uXG5cdFx0XHRcdGN0eC5zb3VsID0gYXQuZmllbGQ/IGF0LnNvdWwgOiAoYXQuYXQgJiYgYXQuYXQuc291bCkgfHwgYXQuc291bDsgLy8gZmlndXJlIG91dCB3aGVyZSB3ZSBhcmVcblx0XHRcdFx0Y3R4LmZpZWxkID0gYXQuZmllbGQ/IGF0LmZpZWxkIDogKGF0LmF0ICYmIGF0LmF0LmZpZWxkKSB8fCBhdC5maWVsZDsgLy8gZGlkIHdlIGNvbWUgZnJvbSBzb21lIHdoZXJlP1xuXHRcdFx0XHRpZihHdW4uaXModmFsKSl7XG5cdFx0XHRcdFx0aWYoIWN0eC5maWVsZCl7IHJldHVybiBjYi5jYWxsKGNoYWluLCB7ZXJyOiBjdHguZXJyID0gR3VuLmxvZygnTm8gZmllbGQgdG8gbGluayBub2RlIHRvIScpfSksIGNoYWluLl8uYXQoJ2VycicpLmVtaXQoY3R4LmVycikgfVxuXHRcdFx0XHRcdHJldHVybiB2YWwudmFsKGZ1bmN0aW9uKG5vZGUpe1xuXHRcdFx0XHRcdFx0dmFyIHNvdWwgPSBHdW4uaXMubm9kZS5zb3VsKG5vZGUpO1xuXHRcdFx0XHRcdFx0aWYoIXNvdWwpeyByZXR1cm4gY2IuY2FsbChjaGFpbiwge2VycjogY3R4LmVyciA9IEd1bi5sb2coJ09ubHkgYSBub2RlIGNhbiBiZSBsaW5rZWQhIE5vdCBcIicgKyBub2RlICsgJ1wiIScpfSksIGNoYWluLl8uYXQoJ2VycicpLmVtaXQoY3R4LmVycikgfVxuXHRcdFx0XHRcdFx0dG1wLnZhbCA9IEd1bi5pcy5yZWwuaWZ5KHNvdWwpO1xuXHRcdFx0XHRcdFx0cHV0KGF0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihjYi5oYXNoW2F0Lmhhc2ggPSBhdC5oYXNoIHx8IEd1bi5vbi5hdC5oYXNoKGF0KV0peyByZXR1cm4gfSAvLyBpZiB3ZSBoYXZlIGFscmVhZHkgc2VlbiB0aGlzIGhhc2guLi5cblx0XHRcdFx0Y2IuaGFzaFthdC5oYXNoXSA9IHRydWU7IC8vIGVsc2UgbWFyayB0aGF0IHdlJ3JlIHByb2Nlc3NpbmcgdGhlIGRhdGEgKGZhaWx1cmUgdG8gd3JpdGUgY291bGQgc3RpbGwgb2NjdXIpLlxuXHRcdFx0XHRjdHguYnkgPSBjaGFpbi5fXy5ieShjdHguc291bCk7XG5cdFx0XHRcdGN0eC5ub3QgPSBhdC5ub3QgfHwgKGF0LmF0ICYmIGF0LmF0Lm5vdCk7XG5cdFx0XHRcdEd1bi5vYmouZGVsKGF0LCAnbm90Jyk7IEd1bi5vYmouZGVsKGF0LmF0IHx8IGF0LCAnbm90Jyk7IC8vIHRoZSBkYXRhIGlzIG5vIGxvbmdlciBub3Qga25vd24hIC8vIFRPRE86IEJVRyEgSXQgY291bGQgaGF2ZSBiZWVuIGFzeW5jaHJvbm91cyBieSB0aGUgdGltZSB3ZSBub3cgZGVsZXRlIHRoZXNlIHByb3BlcnRpZXMuIERvbid0IG90aGVyIHBhcnRzIG9mIHRoZSBjb2RlIGFzc3VtZSB0aGVpciBkZWxldGlvbiBpcyBzeW5jaHJvbm91cz9cblx0XHRcdFx0aWYoY3R4LmZpZWxkKXsgR3VuLm9iai5hcyhjdHgub2JqID0ge30sIGN0eC5maWVsZCwgdmFsKSB9IC8vIGlmIHRoZXJlIGlzIGEgZmllbGQsIHRoZW4gZGF0YSBpcyBhY3R1YWxseSBnZXR0aW5nIHB1dCBvbiB0aGUgcGFyZW50LlxuXHRcdFx0XHRlbHNlIGlmKCFHdW4ub2JqLmlzKHZhbCkpeyByZXR1cm4gY2IuY2FsbChjaGFpbiwgY3R4LmVyciA9IHtlcnI6IEd1bi5sb2coXCJObyBub2RlIGV4aXN0cyB0byBwdXQgXCIgKyAodHlwZW9mIHZhbCkgKyAnIFwiJyArIHZhbCArICdcIiBpbiEnKX0pLCBjaGFpbi5fLmF0KCdlcnInKS5lbWl0KGN0eC5lcnIpIH0gLy8gaWYgdGhlIGRhdGEgaXMgYSBwcmltaXRpdmUgYW5kIHRoZXJlIGlzIG5vIGNvbnRleHQgZm9yIGl0IHlldCwgdGhlbiB3ZSBoYXZlIGFuIGVycm9yLlxuXHRcdFx0XHQvLyBUT0RPOiBCVUc/IGd1bi5nZXQoa2V5KS5wYXRoKGZpZWxkKS5wdXQoKSBpc24ndCBkb2luZyBpdCBhcyBwc2V1ZG8uXG5cdFx0XHRcdGZ1bmN0aW9uIHNvdWwoZW52LCBjYiwgbWFwKXsgdmFyIGVhdDtcblx0XHRcdFx0XHRpZighZW52IHx8ICEoZWF0ID0gZW52LmF0KSB8fCAhZW52LmF0Lm5vZGUpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGlmKCFlYXQubm9kZS5fKXsgZWF0Lm5vZGUuXyA9IHt9IH1cblx0XHRcdFx0XHRpZighZWF0Lm5vZGUuX1tHdW4uXy5zdGF0ZV0peyBlYXQubm9kZS5fW0d1bi5fLnN0YXRlXSA9IHt9IH1cblx0XHRcdFx0XHRpZighR3VuLmlzLm5vZGUuc291bChlYXQubm9kZSkpe1xuXHRcdFx0XHRcdFx0aWYoY3R4Lm9iaiA9PT0gZWF0Lm9iail7XG5cdFx0XHRcdFx0XHRcdEd1bi5vYmouYXMoZW52LmdyYXBoLCBlYXQuc291bCA9IEd1bi5vYmouYXMoZWF0Lm5vZGUuXywgR3VuLl8uc291bCwgR3VuLmlzLm5vZGUuc291bChlYXQub2JqKSB8fCBjdHguc291bCksIGVhdC5ub2RlKTtcblx0XHRcdFx0XHRcdFx0Y2IoZWF0LCBlYXQuc291bCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR2YXIgcGF0aCA9IGZ1bmN0aW9uKGVyciwgbm9kZSl7XG5cdFx0XHRcdFx0XHRcdFx0aWYocGF0aC5vcHQgJiYgcGF0aC5vcHQub24gJiYgcGF0aC5vcHQub24ub2ZmKXsgcGF0aC5vcHQub24ub2ZmKCkgfVxuXHRcdFx0XHRcdFx0XHRcdGlmKHBhdGgub3B0LmRvbmUpeyByZXR1cm4gfVxuXHRcdFx0XHRcdFx0XHRcdHBhdGgub3B0LmRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdGlmKGVycil7IGVudi5lcnIgPSBlcnIgfVxuXHRcdFx0XHRcdFx0XHRcdGVhdC5zb3VsID0gR3VuLmlzLm5vZGUuc291bChub2RlKSB8fCBHdW4uaXMubm9kZS5zb3VsKGVhdC5vYmopIHx8IEd1bi5pcy5ub2RlLnNvdWwoZWF0Lm5vZGUpIHx8IEd1bi50ZXh0LnJhbmRvbSgpO1xuXHRcdFx0XHRcdFx0XHRcdEd1bi5vYmouYXMoZW52LmdyYXBoLCBHdW4ub2JqLmFzKGVhdC5ub2RlLl8sIEd1bi5fLnNvdWwsIGVhdC5zb3VsKSwgZWF0Lm5vZGUpO1xuXHRcdFx0XHRcdFx0XHRcdGNiKGVhdCwgZWF0LnNvdWwpO1xuXHRcdFx0XHRcdFx0XHR9OyBwYXRoLm9wdCA9IHtwdXQ6IHRydWV9O1xuXHRcdFx0XHRcdFx0XHQoY3R4Lm5vdCk/IHBhdGgoKSA6ICgoYXQuZmllbGQgfHwgYXQuYXQpPyBndW4uXy5iYWNrIDogZ3VuKS5wYXRoKGVhdC5wYXRoIHx8IFtdLCBwYXRoLCBwYXRoLm9wdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmKCFlYXQuZmllbGQpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGVhdC5ub2RlLl9bR3VuLl8uc3RhdGVdW2VhdC5maWVsZF0gPSBkcmlmdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRmdW5jdGlvbiBlbmQoZXJyLCBpZnkpe1xuXHRcdFx0XHRcdGN0eC5pZnkgPSBpZnk7XG5cdFx0XHRcdFx0R3VuLm9uKCdwdXQnKS5lbWl0KGNoYWluLCBhdCwgY3R4LCBvcHQsIGNiLCB2YWwpO1xuXHRcdFx0XHRcdGlmKGVyciB8fCBpZnkuZXJyKXsgcmV0dXJuIGNiLmNhbGwoY2hhaW4sIGVyciB8fCBpZnkuZXJyKSwgY2hhaW4uXy5hdCgnZXJyJykuZW1pdChlcnIgfHwgaWZ5LmVycikgfSAvLyBjaGVjayBmb3Igc2VyaWFsaXphdGlvbiBlcnJvciwgZW1pdCBpZiBzby5cblx0XHRcdFx0XHRpZihlcnIgPSBHdW4udW5pb24oY2hhaW4sIGlmeS5ncmFwaCwge2VuZDogZmFsc2UsIHNvdWw6IGZ1bmN0aW9uKHNvdWwpe1xuXHRcdFx0XHRcdFx0aWYoY2hhaW4uX18uYnkoc291bCkuZW5kKXsgcmV0dXJuIH1cblx0XHRcdFx0XHRcdEd1bi51bmlvbihjaGFpbiwgR3VuLmlzLm5vZGUuc291bC5pZnkoe30sIHNvdWwpKTsgLy8gZmlyZSBvZmYgYW4gZW5kIG5vZGUgaWYgdGhlcmUgaGFzbid0IGFscmVhZHkgYmVlbiBvbmUsIHRvIGNvbXBseSB3aXRoIHRoZSB3aXJlIHNwZWMuXG5cdFx0XHRcdFx0fX0pLmVycil7IHJldHVybiBjYi5jYWxsKGNoYWluLCBlcnIpLCBjaGFpbi5fLmF0KCdlcnInKS5lbWl0KGVycikgfSAvLyBub3cgYWN0dWFsbHkgdW5pb24gdGhlIHNlcmlhbGl6ZWQgZGF0YSwgZW1pdCBlcnJvciBpZiBhbnkgb2NjdXIuXG5cdFx0XHRcdFx0aWYoR3VuLmZucy5pcyhlbmQud2lyZSA9IGNoYWluLl9fLm9wdC53aXJlLnB1dCkpe1xuXHRcdFx0XHRcdFx0dmFyIHdjYiA9IGZ1bmN0aW9uKGVyciwgb2ssIGluZm8pe1xuXHRcdFx0XHRcdFx0XHRpZihlcnIpeyByZXR1cm4gR3VuLmxvZyhlcnIuZXJyIHx8IGVyciksIGNiLmNhbGwoY2hhaW4sIGVyciksIGNoYWluLl8uYXQoJ2VycicpLmVtaXQoZXJyKSB9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjYi5jYWxsKGNoYWluLCBlcnIsIG9rKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVuZC53aXJlKGlmeS5ncmFwaCwgd2NiLCBvcHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZighR3VuLmxvZy5jb3VudCgnbm8td2lyZS1wdXQnKSl7IEd1bi5sb2coXCJXYXJuaW5nISBZb3UgaGF2ZSBubyBwZXJzaXN0ZW5jZSBsYXllciB0byBzYXZlIHRvIVwiKSB9XG5cdFx0XHRcdFx0XHRjYi5jYWxsKGNoYWluLCBudWxsKTsgLy8gVGhpcyBpcyBpbiBtZW1vcnkgc3VjY2VzcywgaGFyZGx5IFwic3VjY2Vzc1wiIGF0IGFsbC5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYoY3R4LmZpZWxkKXtcblx0XHRcdFx0XHRcdHJldHVybiBndW4uXy5iYWNrLnBhdGgoY3R4LmZpZWxkLCBudWxsLCB7Y2hhaW46IG9wdC5jaGFpbiB8fCBjaGFpbn0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZihjdHgubm90KXtcblx0XHRcdFx0XHRcdHJldHVybiBndW4uX18uZ3VuLmdldChjdHguc291bCwgbnVsbCwge2NoYWluOiBvcHQuY2hhaW4gfHwgY2hhaW59KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hhaW4uZ2V0KGN0eC5zb3VsLCBudWxsLCB7Y2hhaW46IG9wdC5jaGFpbiB8fCBjaGFpbiwgYXQ6IGd1bi5fLmF0IH0pXG5cdFx0XHRcdH1cblx0XHRcdFx0R3VuLmlmeShjdHgub2JqLCBzb3VsLCB7cHVyZTogdHJ1ZX0pKGVuZCk7IC8vIHNlcmlhbGl6ZSB0aGUgZGF0YSFcblx0XHRcdH1cblx0XHRcdGlmKGd1biA9PT0gZ3VuLmJhY2speyAvLyBpZiB3ZSBhcmUgdGhlIHJvb3QgY2hhaW4uLi5cblx0XHRcdFx0cHV0KHtzb3VsOiBHdW4uaXMubm9kZS5zb3VsKHZhbCkgfHwgR3VuLnRleHQucmFuZG9tKCksIG5vdDogdHJ1ZX0pOyAvLyB0aGVuIGNhdXNlIHRoZSBuZXcgY2hhaW4gdG8gc2F2ZSBkYXRhIVxuXHRcdFx0fSBlbHNlIHsgLy8gZWxzZSBpZiB3ZSBhcmUgb24gYW4gZXhpc3RpbmcgY2hhaW4gdGhlbi4uLlxuXHRcdFx0XHRndW4uXy5hdCgnc291bCcpLm1hcChwdXQpOyAvLyBwdXQgZGF0YSBvbiBldmVyeSBzb3VsIHRoYXQgZmxvd3MgdGhyb3VnaCB0aGlzIGNoYWluLlxuXHRcdFx0XHR2YXIgYmFjayA9IGZ1bmN0aW9uKGd1bil7XG5cdFx0XHRcdFx0aWYoYmFjay5nZXQgfHwgZ3VuLl8uYmFjayA9PT0gZ3VuIHx8IGd1bi5fLm5vdCl7IHJldHVybiB9IC8vIFRPRE86IENMRUFOIFVQISBXb3VsZCBiZSBpZGVhbCB0byBhY2NvbXBsaXNoIHRoaXMgaW4gYSBtb3JlIGlkZWFsIHdheS5cblx0XHRcdFx0XHRpZihndW4uXy5nZXQpeyBiYWNrLmdldCA9IHRydWUgfVxuXHRcdFx0XHRcdGd1bi5fLmF0KCdudWxsJykuZXZlbnQoZnVuY3Rpb24oYXQpeyB0aGlzLm9mZigpO1xuXHRcdFx0XHRcdFx0aWYob3B0LmluaXQgfHwgZ3VuLl9fLm9wdC5pbml0KXsgcmV0dXJuIEd1bi5sb2coXCJXYXJuaW5nISBZb3UgaGF2ZSBubyBjb250ZXh0IHRvIGAucHV0YFwiLCB2YWwsIFwiIVwiKSB9XG5cdFx0XHRcdFx0XHRndW4uaW5pdCgpO1xuXHRcdFx0XHRcdH0sIC05OTkpO1xuXHRcdFx0XHRcdHJldHVybiBiYWNrKGd1bi5fLmJhY2spO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZighb3B0LmluaXQgJiYgIWd1bi5fXy5vcHQuaW5pdCl7IGJhY2soZ3VuKSB9XG5cdFx0XHR9XG5cdFx0XHRjaGFpbi5iYWNrID0gZ3VuLmJhY2s7XG5cdFx0XHRyZXR1cm4gY2hhaW47XG5cdFx0fVxuXG5cdFx0R3VuLmNoYWluLmdldCA9IChmdW5jdGlvbigpe1xuXHRcdFx0R3VuLm9uKCdvcGVyYXRpbmcnKS5ldmVudChmdW5jdGlvbihndW4sIGF0KXtcblx0XHRcdFx0aWYoIWd1bi5fXy5ieShhdC5zb3VsKS5ub2RlKXsgZ3VuLl9fLmJ5KGF0LnNvdWwpLm5vZGUgPSBndW4uX18uZ3JhcGhbYXQuc291bF0gIH1cblx0XHRcdFx0aWYoYXQuZmllbGQpeyByZXR1cm4gfSAvLyBUT0RPOiBJdCB3b3VsZCBiZSBpZGVhbCB0byByZXVzZSBIQU0ncyBmaWVsZCBlbWl0LlxuXHRcdFx0XHRndW4uX18ub24oYXQuc291bCkuZW1pdChhdCk7XG5cdFx0XHR9KTtcblx0XHRcdEd1bi5vbignZ2V0JykuZXZlbnQoZnVuY3Rpb24oZ3VuLCBhdCwgY3R4LCBvcHQsIGNiKXtcblx0XHRcdFx0aWYoY3R4LmhhbHQpeyByZXR1cm4gfSAvLyBUT0RPOiBDTEVBTiBVUCB3aXRoIGV2ZW50IGVtaXR0ZXIgb3B0aW9uP1xuXHRcdFx0XHRhdC5jaGFuZ2UgPSBhdC5jaGFuZ2UgfHwgZ3VuLl9fLmJ5KGF0LnNvdWwpLm5vZGU7XG5cdFx0XHRcdGlmKG9wdC5yYXcpeyByZXR1cm4gY2IuY2FsbChvcHQub24sIGF0KSB9XG5cdFx0XHRcdGlmKCFjdHguY2Iubm8peyBjYi5jYWxsKGN0eC5ieS5jaGFpbiwgbnVsbCwgR3VuLm9iai5jb3B5KGN0eC5ub2RlIHx8IGd1bi5fXy5ieShhdC5zb3VsKS5ub2RlKSkgfVxuXHRcdFx0XHRndW4uXy5hdCgnc291bCcpLmVtaXQoYXQpLmNoYWluKG9wdC5jaGFpbik7XG5cdFx0XHR9LDApO1xuXHRcdFx0R3VuLm9uKCdnZXQnKS5ldmVudChmdW5jdGlvbihndW4sIGF0LCBjdHgpe1xuXHRcdFx0XHRpZihjdHguaGFsdCl7IGN0eC5oYWx0ID0gZmFsc2U7IHJldHVybiB9IC8vIFRPRE86IENMRUFOIFVQIHdpdGggZXZlbnQgZW1pdHRlciBvcHRpb24/XG5cdFx0XHR9LCBJbmZpbml0eSk7XG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24obGV4LCBjYiwgb3B0KXsgLy8gZ2V0IG9wZW5zIHVwIGEgcmVmZXJlbmNlIHRvIGEgbm9kZSBhbmQgbG9hZHMgaXQuXG5cdFx0XHRcdHZhciBndW4gPSB0aGlzLCBjdHggPSB7XG5cdFx0XHRcdFx0b3B0OiBvcHQgfHwge30sXG5cdFx0XHRcdFx0Y2I6IGNiIHx8IGZ1bmN0aW9uKCl7fSxcblx0XHRcdFx0XHRsZXg6IChHdW4udGV4dC5pcyhsZXgpIHx8IEd1bi5udW0uaXMobGV4KSk/IEd1bi5pcy5yZWwuaWZ5KGxleCkgOiBsZXgsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGN0eC5mb3JjZSA9IGN0eC5vcHQuZm9yY2U7XG5cdFx0XHRcdGlmKGNiICE9PSBjdHguY2IpeyBjdHguY2Iubm8gPSB0cnVlIH1cblx0XHRcdFx0aWYoIUd1bi5vYmouaXMoY3R4LmxleCkpeyByZXR1cm4gY3R4LmNiLmNhbGwoZ3VuID0gZ3VuLmNoYWluKCksIHtlcnI6IEd1bi5sb2coJ0ludmFsaWQgZ2V0IHJlcXVlc3QhJywgbGV4KX0pLCBndW4gfVxuXHRcdFx0XHRpZighKGN0eC5zb3VsID0gY3R4LmxleFtHdW4uXy5zb3VsXSkpeyByZXR1cm4gY3R4LmNiLmNhbGwoZ3VuID0gdGhpcy5jaGFpbigpLCB7ZXJyOiBHdW4ubG9nKCdObyBzb3VsIHRvIGdldCEnKX0pLCBndW4gfSAvLyBUT0RPOiBXaXRoIGAuYWxsYCBpdCdsbCBiZSBva2F5IHRvIG5vdCBoYXZlIGFuIGV4YWN0IG1hdGNoIVxuXHRcdFx0XHRjdHguYnkgPSBndW4uX18uYnkoY3R4LnNvdWwpO1xuXHRcdFx0XHRjdHguYnkuY2hhaW4gPSBjdHguYnkuY2hhaW4gfHwgZ3VuLmNoYWluKCk7XG5cdFx0XHRcdGZ1bmN0aW9uIGxvYWQobGV4KXtcblx0XHRcdFx0XHR2YXIgc291bCA9IGxleFtHdW4uXy5zb3VsXTtcblx0XHRcdFx0XHR2YXIgY2FjaGVkID0gZ3VuLl9fLmJ5KHNvdWwpLm5vZGUgfHwgZ3VuLl9fLmdyYXBoW3NvdWxdO1xuXHRcdFx0XHRcdGlmKGN0eC5mb3JjZSl7IGN0eC5mb3JjZSA9IGZhbHNlIH1cblx0XHRcdFx0XHRlbHNlIGlmKGNhY2hlZCl7IHJldHVybiBmYWxzZSB9XG5cdFx0XHRcdFx0d2lyZShsZXgsIHN0cmVhbSwgY3R4Lm9wdCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZnVuY3Rpb24gc3RyZWFtKGVyciwgZGF0YSwgaW5mbyl7XG5cdFx0XHRcdFx0Ly9jb25zb2xlLmxvZyhcIndpcmUuZ2V0IDwtLVwiLCBlcnIsIGRhdGEpO1xuXHRcdFx0XHRcdEd1bi5vbignd2lyZS5nZXQnKS5lbWl0KGN0eC5ieS5jaGFpbiwgY3R4LCBlcnIsIGRhdGEsIGluZm8pO1xuXHRcdFx0XHRcdGlmKGVycil7XG5cdFx0XHRcdFx0XHRHdW4ubG9nKGVyci5lcnIgfHwgZXJyKTtcblx0XHRcdFx0XHRcdGN0eC5jYi5jYWxsKGN0eC5ieS5jaGFpbiwgZXJyKTtcblx0XHRcdFx0XHRcdHJldHVybiBjdHguYnkuY2hhaW4uXy5hdCgnZXJyJykuZW1pdCh7c291bDogY3R4LnNvdWwsIGVycjogZXJyLmVyciB8fCBlcnJ9KS5jaGFpbihjdHgub3B0LmNoYWluKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYoIWRhdGEpe1xuXHRcdFx0XHRcdFx0Y3R4LmNiLmNhbGwoY3R4LmJ5LmNoYWluLCBudWxsKTtcblx0XHRcdFx0XHRcdHJldHVybiBjdHguYnkuY2hhaW4uXy5hdCgnbnVsbCcpLmVtaXQoe3NvdWw6IGN0eC5zb3VsLCBub3Q6IHRydWV9KS5jaGFpbihjdHgub3B0LmNoYWluKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYoR3VuLm9iai5lbXB0eShkYXRhKSl7IHJldHVybiB9XG5cdFx0XHRcdFx0aWYoZXJyID0gR3VuLnVuaW9uKGN0eC5ieS5jaGFpbiwgZGF0YSkuZXJyKXtcblx0XHRcdFx0XHRcdGN0eC5jYi5jYWxsKGN0eC5ieS5jaGFpbiwgZXJyKTtcblx0XHRcdFx0XHRcdHJldHVybiBjdHguYnkuY2hhaW4uXy5hdCgnZXJyJykuZW1pdCh7c291bDogR3VuLmlzLm5vZGUuc291bChkYXRhKSB8fCBjdHguc291bCwgZXJyOiBlcnIuZXJyIHx8IGVycn0pLmNoYWluKGN0eC5vcHQuY2hhaW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmdW5jdGlvbiB3aXJlKGxleCwgY2IsIG9wdCl7XG5cdFx0XHRcdFx0R3VuLm9uKCdnZXQud2lyZScpLmVtaXQoY3R4LmJ5LmNoYWluLCBjdHgsIGxleCwgY2IsIG9wdCk7XG5cdFx0XHRcdFx0aWYoR3VuLmZucy5pcyhndW4uX18ub3B0LndpcmUuZ2V0KSl7IHJldHVybiBndW4uX18ub3B0LndpcmUuZ2V0KGxleCwgY2IsIG9wdCkgfVxuXHRcdFx0XHRcdGlmKCFHdW4ubG9nLmNvdW50KCduby13aXJlLWdldCcpKXsgR3VuLmxvZyhcIldhcm5pbmchIFlvdSBoYXZlIG5vIHBlcnNpc3RlbmNlIGxheWVyIHRvIGdldCBmcm9tIVwiKSB9XG5cdFx0XHRcdFx0Y2IobnVsbCk7IC8vIFRoaXMgaXMgaW4gbWVtb3J5IHN1Y2Nlc3MsIGhhcmRseSBcInN1Y2Nlc3NcIiBhdCBhbGwuXG5cdFx0XHRcdH1cblx0XHRcdFx0ZnVuY3Rpb24gb24oYXQpe1xuXHRcdFx0XHRcdGlmKG9uLnJhbiA9IHRydWUpeyBjdHgub3B0Lm9uID0gdGhpcyB9XG5cdFx0XHRcdFx0aWYobG9hZChjdHgubGV4KSl7IHJldHVybiB9XG5cdFx0XHRcdFx0R3VuLm9uKCdnZXQnKS5lbWl0KGN0eC5ieS5jaGFpbiwgYXQsIGN0eCwgY3R4Lm9wdCwgY3R4LmNiLCBjdHgubGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdHgub3B0Lm9uID0gKGN0eC5vcHQuYXQgfHwgZ3VuLl9fLmF0KShjdHguc291bCkuZXZlbnQob24pO1xuXHRcdFx0XHRjdHguYnkuY2hhaW4uXy5nZXQgPSBjdHgubGV4O1xuXHRcdFx0XHRpZighY3R4Lm9wdC5yYW4gJiYgIW9uLnJhbil7IG9uLmNhbGwoY3R4Lm9wdC5vbiwge3NvdWw6IGN0eC5zb3VsfSkgfVxuXHRcdFx0XHRyZXR1cm4gY3R4LmJ5LmNoYWluO1xuXHRcdFx0fVxuXHRcdH0oKSk7XG5cblx0XHRHdW4uY2hhaW4ua2V5ID0gKGZ1bmN0aW9uKCl7XG5cdFx0XHRHdW4ub24oJ3B1dCcpLmV2ZW50KGZ1bmN0aW9uKGd1biwgYXQsIGN0eCwgb3B0LCBjYil7XG5cdFx0XHRcdGlmKG9wdC5rZXkpeyByZXR1cm4gfVxuXHRcdFx0XHRHdW4uaXMuZ3JhcGgoY3R4LmlmeS5ncmFwaCwgZnVuY3Rpb24obm9kZSwgc291bCl7XG5cdFx0XHRcdFx0dmFyIGtleSA9IHtub2RlOiBndW4uX18uZ3JhcGhbc291bF19O1xuXHRcdFx0XHRcdGlmKCFHdW4uaXMubm9kZS5zb3VsKGtleS5ub2RlLCAna2V5JykpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGlmKCFndW4uX18uYnkoc291bCkuZW5kKXsgZ3VuLl9fLmJ5KHNvdWwpLmVuZCA9IDEgfVxuXHRcdFx0XHRcdEd1bi5pcy5ub2RlKGtleS5ub2RlLCBmdW5jdGlvbiBlYWNoKHJlbCwgcyl7XG5cdFx0XHRcdFx0XHR2YXIgbiA9IGd1bi5fXy5ncmFwaFtzXTtcblx0XHRcdFx0XHRcdGlmKG4gJiYgR3VuLmlzLm5vZGUuc291bChuLCAna2V5Jykpe1xuXHRcdFx0XHRcdFx0XHRHdW4uaXMubm9kZShuLCBlYWNoKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmVsID0gY3R4LmlmeS5ncmFwaFtzXSA9IGN0eC5pZnkuZ3JhcGhbc10gfHwgR3VuLmlzLm5vZGUuc291bC5pZnkoe30sIHMpO1xuXHRcdFx0XHRcdFx0R3VuLmlzLm5vZGUobm9kZSwgZnVuY3Rpb24odixmKXsgR3VuLmlzLm5vZGUuc3RhdGUuaWZ5KFtyZWwsIG5vZGVdLCBmLCB2KSB9KTtcblx0XHRcdFx0XHRcdEd1bi5vYmouZGVsKGN0eC5pZnkuZ3JhcGgsIHNvdWwpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRHdW4ub24oJ2dldCcpLmV2ZW50KGZ1bmN0aW9uKGd1biwgYXQsIGN0eCwgb3B0LCBjYil7XG5cdFx0XHRcdGlmKGN0eC5oYWx0KXsgcmV0dXJuIH0gLy8gVE9ETzogQ0xFQU4gVVAgd2l0aCBldmVudCBlbWl0dGVyIG9wdGlvbj9cblx0XHRcdFx0aWYob3B0LmtleSAmJiBvcHQua2V5LnNvdWwpe1xuXHRcdFx0XHRcdGF0LnNvdWwgPSBvcHQua2V5LnNvdWw7XG5cdFx0XHRcdFx0Z3VuLl9fLmJ5KG9wdC5rZXkuc291bCkubm9kZSA9IEd1bi51bmlvbi5pZnkoZ3VuLCBvcHQua2V5LnNvdWwpOyAvLyBUT0RPOiBDaGVjayBwZXJmb3JtYW5jZT9cblx0XHRcdFx0XHRndW4uX18uYnkob3B0LmtleS5zb3VsKS5ub2RlLl9bJ2tleSddID0gJ3BzZXVkbyc7XG5cdFx0XHRcdFx0YXQuY2hhbmdlID0gR3VuLmlzLm5vZGUuc291bC5pZnkoR3VuLm9iai5jb3B5KGF0LmNoYW5nZSB8fCBndW4uX18uYnkoYXQuc291bCkubm9kZSksIGF0LnNvdWwsIHRydWUpOyAvLyBUT0RPOiBDaGVjayBwZXJmb3JtYW5jZT9cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYoIShHdW4uaXMubm9kZS5zb3VsKGd1bi5fXy5ncmFwaFthdC5zb3VsXSwgJ2tleScpID09PSAxKSl7IHJldHVybiB9XG5cdFx0XHRcdHZhciBub2RlID0gYXQuY2hhbmdlIHx8IGd1bi5fXy5ncmFwaFthdC5zb3VsXTtcblx0XHRcdFx0ZnVuY3Rpb24gbWFwKHJlbCwgc291bCl7IGd1bi5fXy5ndW4uZ2V0KHJlbCwgY2IsIHtrZXk6IGN0eCwgY2hhaW46IG9wdC5jaGFpbiB8fCBndW4sIGZvcmNlOiBvcHQuZm9yY2V9KSB9XG5cdFx0XHRcdGN0eC5oYWx0ID0gdHJ1ZTtcblx0XHRcdFx0R3VuLmlzLm5vZGUobm9kZSwgbWFwKTtcblx0XHRcdH0sLTk5OSk7XG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24oa2V5LCBjYiwgb3B0KXtcblx0XHRcdFx0dmFyIGd1biA9IHRoaXM7XG5cdFx0XHRcdG9wdCA9IEd1bi50ZXh0LmlzKG9wdCk/IHtzb3VsOiBvcHR9IDogb3B0IHx8IHt9O1xuXHRcdFx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCl7fTsgY2IuaGFzaCA9IHt9O1xuXHRcdFx0XHRpZighR3VuLnRleHQuaXMoa2V5KSB8fCAha2V5KXsgcmV0dXJuIGNiLmNhbGwoZ3VuLCB7ZXJyOiBHdW4ubG9nKCdObyBrZXkhJyl9KSwgZ3VuIH1cblx0XHRcdFx0ZnVuY3Rpb24gaW5kZXgoYXQpe1xuXHRcdFx0XHRcdHZhciBjdHggPSB7bm9kZTogZ3VuLl9fLmdyYXBoW2F0LnNvdWxdfTtcblx0XHRcdFx0XHRpZihhdC5zb3VsID09PSBrZXkgfHwgYXQua2V5ID09PSBrZXkpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGlmKGNiLmhhc2hbYXQuaGFzaCA9IGF0Lmhhc2ggfHwgR3VuLm9uLmF0Lmhhc2goYXQpXSl7IHJldHVybiB9IGNiLmhhc2hbYXQuaGFzaF0gPSB0cnVlO1xuXHRcdFx0XHRcdGN0eC5vYmogPSAoMSA9PT0gR3VuLmlzLm5vZGUuc291bChjdHgubm9kZSwgJ2tleScpKT8gR3VuLm9iai5jb3B5KGN0eC5ub2RlKSA6IEd1bi5vYmoucHV0KHt9LCBhdC5zb3VsLCBHdW4uaXMucmVsLmlmeShhdC5zb3VsKSk7XG5cdFx0XHRcdFx0R3VuLm9iai5hcygoY3R4LnB1dCA9IEd1bi5pcy5ub2RlLmlmeShjdHgub2JqLCBrZXksIHRydWUpKS5fLCAna2V5JywgMSk7XG5cdFx0XHRcdFx0Z3VuLl9fLmd1bi5wdXQoY3R4LnB1dCwgZnVuY3Rpb24oZXJyLCBvayl7Y2IuY2FsbCh0aGlzLCBlcnIsIG9rKX0sIHtjaGFpbjogb3B0LmNoYWluLCBrZXk6IHRydWUsIGluaXQ6IHRydWV9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihvcHQuc291bCl7XG5cdFx0XHRcdFx0aW5kZXgoe3NvdWw6IG9wdC5zb3VsfSk7XG5cdFx0XHRcdFx0cmV0dXJuIGd1bjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihndW4gPT09IGd1bi5iYWNrKXtcblx0XHRcdFx0XHRjYi5jYWxsKGd1biwge2VycjogR3VuLmxvZygnWW91IGhhdmUgbm8gY29udGV4dCB0byBgLmtleWAnLCBrZXksICchJyl9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRndW4uXy5hdCgnc291bCcpLm1hcChpbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGd1bjtcblx0XHRcdH1cblx0XHR9KCkpO1xuXG5cdFx0R3VuLmNoYWluLm9uID0gZnVuY3Rpb24oY2IsIG9wdCl7IC8vIG9uIHN1YnNjcmliZXMgdG8gYW55IGNoYW5nZXMgb24gdGhlIHNvdWxzLlxuXHRcdFx0dmFyIGd1biA9IHRoaXMsIHUsIG9sZG9mZiA9IHRoaXMub2ZmO1xuXHRcdFx0b3B0ID0gR3VuLm9iai5pcyhvcHQpPyBvcHQgOiB7Y2hhbmdlOiBvcHR9O1xuXHRcdFx0Y2IgPSBjYiB8fCBmdW5jdGlvbigpe307XG5cdFx0XHRmdW5jdGlvbiBtYXAoYXQpe1xuXHRcdFx0XHRvcHQub24gPSBvcHQub24gfHwgdGhpcztcblx0XHRcdFx0dmFyIGN0eCA9IHtieTogZ3VuLl9fLmJ5KGF0LnNvdWwpfSwgY2hhbmdlID0gY3R4LmJ5Lm5vZGU7XG5cdFx0XHRcdGlmKG9wdC5vbi5zdGF0ICYmIG9wdC5vbi5zdGF0LmZpcnN0KXsgKGF0ID0gR3VuLm9uLmF0LmNvcHkoYXQpKS5jaGFuZ2UgPSBjdHguYnkubm9kZSB9XG5cdFx0XHRcdGlmKG9wdC5yYXcpeyByZXR1cm4gY2IuY2FsbChvcHQub24sIGF0KSB9XG5cdFx0XHRcdGlmKG9wdC5vbmNlKXsgdGhpcy5vZmYoKSB9XG5cdFx0XHRcdGlmKG9wdC5jaGFuZ2UpeyBjaGFuZ2UgPSBhdC5jaGFuZ2UgfVxuXHRcdFx0XHRpZighb3B0LmVtcHR5ICYmIEd1bi5vYmouZW1wdHkoY2hhbmdlLCBHdW4uXy5tZXRhKSl7IHJldHVybiB9XG5cdFx0XHRcdGNiLmNhbGwoY3R4LmJ5LmNoYWluIHx8IGd1biwgR3VuLm9iai5jb3B5KGF0LmZpZWxkPyBjaGFuZ2VbYXQuZmllbGRdIDogY2hhbmdlKSwgYXQuZmllbGQgfHwgKGF0LmF0ICYmIGF0LmF0LmZpZWxkKSk7XG5cdFx0XHR9O1xuXHRcdFx0b3B0Lm9uID0gZ3VuLl8uYXQoJ3NvdWwnKS5tYXAobWFwKTtcblx0XHRcdGlmKGd1biA9PT0gZ3VuLmJhY2speyBHdW4ubG9nKCdZb3UgaGF2ZSBubyBjb250ZXh0IHRvIGAub25gIScpIH1cblx0XHRcdGd1bi5vZmYgPSBvbGRvZmYgPyBmdW5jdGlvbigpIHsgb2xkb2ZmKCk7IG9wdC5vbi5vZmYoKTsgfSA6IG9wdC5vbi5vZmYgLy8gQ2hhaW4gb2Zmc1xuXHRcdFx0cmV0dXJuIGd1bjtcblx0XHR9XG5cblx0XHRHdW4uY2hhaW4ucGF0aCA9IChmdW5jdGlvbigpe1xuXHRcdFx0R3VuLm9uKCdnZXQnKS5ldmVudChmdW5jdGlvbihndW4sIGF0LCBjdHgsIG9wdCwgY2IsIGxleCl7XG5cdFx0XHRcdGlmKGN0eC5oYWx0KXsgcmV0dXJuIH0gLy8gVE9ETzogQ0xFQU4gVVAgd2l0aCBldmVudCBlbWl0dGVyIG9wdGlvbj9cblx0XHRcdFx0aWYob3B0LnBhdGgpeyBhdC5hdCA9IG9wdC5wYXRoIH1cblx0XHRcdFx0dmFyIHh0YyA9IHtzb3VsOiBsZXhbR3VuLl8uc291bF0sIGZpZWxkOiBsZXhbR3VuLl8uZmllbGRdfTtcblx0XHRcdFx0eHRjLmNoYW5nZSA9IGF0LmNoYW5nZSB8fCBndW4uX18uYnkoYXQuc291bCkubm9kZTtcblx0XHRcdFx0aWYoeHRjLmZpZWxkKXsgLy8gVE9ETzogZnV0dXJlIGZlYXR1cmUhXG5cdFx0XHRcdFx0aWYoIUd1bi5vYmouaGFzKHh0Yy5jaGFuZ2UsIHh0Yy5maWVsZCkpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGN0eC5ub2RlID0gR3VuLmlzLm5vZGUuc291bC5pZnkoe30sIGF0LnNvdWwpOyAvLyBUT0RPOiBDTEVBTiBVUCEgY3R4Lm5vZGUgdXNhZ2UuXG5cdFx0XHRcdFx0R3VuLmlzLm5vZGUuc3RhdGUuaWZ5KFtjdHgubm9kZSwgeHRjLmNoYW5nZV0sIHh0Yy5maWVsZCwgeHRjLmNoYW5nZVt4dGMuZmllbGRdKTtcblx0XHRcdFx0XHRhdC5jaGFuZ2UgPSBjdHgubm9kZTsgYXQuZmllbGQgPSB4dGMuZmllbGQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sLTk5KTtcblx0XHRcdEd1bi5vbignZ2V0JykuZXZlbnQoZnVuY3Rpb24oZ3VuLCBhdCwgY3R4LCBvcHQsIGNiLCBsZXgpe1xuXHRcdFx0XHRpZihjdHguaGFsdCl7IHJldHVybiB9IC8vIFRPRE86IENMRUFOIFVQIHdpdGggZXZlbnQgZW1pdHRlciBvcHRpb24/XG5cdFx0XHRcdHZhciB4dGMgPSB7fTsgeHRjLmNoYW5nZSA9IGF0LmNoYW5nZSB8fCBndW4uX18uYnkoYXQuc291bCkubm9kZTtcblx0XHRcdFx0aWYoIW9wdC5wdXQpeyAvLyBUT0RPOiBDTEVBTiBVUCBiZSBuaWNlIGlmIHBhdGggZGlkbid0IGhhdmUgdG8gd29ycnkgYWJvdXQgdGhpcy5cblx0XHRcdFx0XHRHdW4uaXMubm9kZSh4dGMuY2hhbmdlLCBmdW5jdGlvbih2LGYpe1xuXHRcdFx0XHRcdFx0dmFyIGZhdCA9IEd1bi5vbi5hdC5jb3B5KGF0KTsgZmF0LmZpZWxkID0gZjsgZmF0LnZhbHVlID0gdjtcblx0XHRcdFx0XHRcdEd1bi5vYmouZGVsKGZhdCwgJ2F0Jyk7IC8vIFRPRE86IENMRUFOIFRISVMgVVAhIEl0IHdvdWxkIGJlIG5pY2UgaW4gZXZlcnkgb3RoZXIgZnVuY3Rpb24gZXZlcnkgd2hlcmUgZWxzZSBpdCBkaWRuJ3QgbWF0dGVyIHdoZXRoZXIgdGhlcmUgd2FzIGEgY2FzY2FkaW5nIGF0LmF0LmF0LmF0IG9yIG5vdCwganVzdCBhbmQgb25seSB3aGV0aGVyIHRoZSBjdXJyZW50IGNvbnRleHQgYXMgYSBmaWVsZCBvciBzaG91bGQgcmVseSBvbiBhIHByZXZpb3VzIGZpZWxkLiBCdXQgbWF5YmUgdGhhdCBpcyB0aGUgZ290Y2hhIHJpZ2h0IHRoZXJlP1xuXHRcdFx0XHRcdFx0ZmF0LmNoYW5nZSA9IGZhdC5jaGFuZ2UgfHwgeHRjLmNoYW5nZTtcblx0XHRcdFx0XHRcdGlmKHYgPSBHdW4uaXMucmVsKGZhdC52YWx1ZSkpeyBmYXQgPSB7c291bDogdiwgYXQ6IGZhdH0gfVxuXHRcdFx0XHRcdFx0Z3VuLl8uYXQoJ3BhdGg6JyArIGYpLmVtaXQoZmF0KS5jaGFpbihvcHQuY2hhaW4pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmKCFjdHguZW5kKXtcblx0XHRcdFx0XHRjdHguZW5kID0gZ3VuLl8uYXQoJ2VuZCcpLmVtaXQoYXQpLmNoYWluKG9wdC5jaGFpbik7XG5cdFx0XHRcdH1cblx0XHRcdH0sOTkpO1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uKHBhdGgsIGNiLCBvcHQpe1xuXHRcdFx0XHRvcHQgPSBvcHQgfHwge307XG5cdFx0XHRcdGNiID0gY2IgfHwgKGZ1bmN0aW9uKCl7IHZhciBjYiA9IGZ1bmN0aW9uKCl7fTsgY2Iubm8gPSB0cnVlOyByZXR1cm4gY2IgfSgpKTsgY2IuaGFzaCA9IHt9O1xuXHRcdFx0XHR2YXIgZ3VuID0gdGhpcywgY2hhaW4gPSBndW4uY2hhaW4oKSwgb25zID0gW10sIGYsIGMsIHU7XG5cdFx0XHRcdGlmKCFHdW4ubGlzdC5pcyhwYXRoKSl7IGlmKCFHdW4udGV4dC5pcyhwYXRoKSl7IGlmKCFHdW4ubnVtLmlzKHBhdGgpKXsgLy8gaWYgbm90IGEgbGlzdCwgdGV4dCwgb3IgbnVtYmVyXG5cdFx0XHRcdFx0cmV0dXJuIGNiLmNhbGwoY2hhaW4sIHtlcnI6IEd1bi5sb2coXCJJbnZhbGlkIHBhdGggJ1wiICsgcGF0aCArIFwiJyFcIil9KSwgY2hhaW47IC8vIHRoZW4gY29tcGxhaW5cblx0XHRcdFx0fSBlbHNlIHsgcmV0dXJuIHRoaXMucGF0aChwYXRoICsgJycsIGNiLCBvcHQpICB9IH0gZWxzZSB7IHJldHVybiB0aGlzLnBhdGgocGF0aC5zcGxpdCgnLicpLCBjYiwgb3B0KSB9IH0gLy8gZWxzZSBjb2VyY2UgdXB3YXJkIHRvIGEgbGlzdC5cblx0XHRcdFx0aWYoZ3VuID09PSBndW4uYmFjayl7XG5cdFx0XHRcdFx0Y2IuY2FsbChjaGFpbiwgb3B0LnB1dD8gbnVsbCA6IHtlcnI6IEd1bi5sb2coJ1lvdSBoYXZlIG5vIGNvbnRleHQgdG8gYC5wYXRoYCcsIHBhdGgsICchJyl9LCBvcHQucHV0PyBndW4uX18uZ3JhcGhbKHBhdGh8fFtdKVswXV0gOiB1KTtcblx0XHRcdFx0XHRyZXR1cm4gY2hhaW47XG5cdFx0XHRcdH1cblx0XHRcdFx0b25zLnB1c2goZ3VuLl8uYXQoJ3BhdGg6JyArIHBhdGhbMF0pLmV2ZW50KGZ1bmN0aW9uKGF0KXtcblx0XHRcdFx0XHRpZihvcHQuZG9uZSl7IHRoaXMub2ZmKCk7IHJldHVybiB9IC8vIFRPRE86IEJVRyAtIFRISVMgSVMgQSBGSVggRk9SIEEgQlVHISBURVNUICNcImNvbnRleHQgbm8gZG91YmxlIGVtaXRcIiwgQ09NTUVOVCBUSElTIExJTkUgT1VUIEFORCBTRUUgSVQgRkFJTCFcblx0XHRcdFx0XHR2YXIgY3R4ID0ge3NvdWw6IGF0LnNvdWwsIGZpZWxkOiBhdC5maWVsZCwgYnk6IGd1bi5fXy5ieShhdC5zb3VsKX0sIGZpZWxkID0gcGF0aFswXTtcblx0XHRcdFx0XHR2YXIgb24gPSBHdW4ub2JqLmFzKGNiLmhhc2gsIGF0Lmhhc2gsIHtvZmY6IGZ1bmN0aW9uKCl7fX0pO1xuXHRcdFx0XHRcdGlmKGF0LnNvdWwgPT09IG9uLnNvdWwpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGVsc2UgeyBvbi5vZmYoKSB9XG5cdFx0XHRcdFx0aWYoY3R4LnJlbCA9IChHdW4uaXMucmVsKGF0LnZhbHVlKSB8fCBHdW4uaXMucmVsKGF0LmF0ICYmIGF0LmF0LnZhbHVlKSkpe1xuXHRcdFx0XHRcdFx0aWYob3B0LnB1dCAmJiAxID09PSBwYXRoLmxlbmd0aCl7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjYi5jYWxsKGN0eC5ieS5jaGFpbiB8fCBjaGFpbiwgbnVsbCwgR3VuLmlzLm5vZGUuc291bC5pZnkoe30sIGN0eC5yZWwpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHZhciBnZXQgPSBmdW5jdGlvbihlcnIsIG5vZGUpe1xuXHRcdFx0XHRcdFx0XHRpZighZXJyICYmIDEgIT09IHBhdGgubGVuZ3RoKXsgcmV0dXJuIH1cblx0XHRcdFx0XHRcdFx0Y2IuY2FsbCh0aGlzLCBlcnIsIG5vZGUsIGZpZWxkKTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRjdHgub3B0ID0ge2NoYWluOiBvcHQuY2hhaW4gfHwgY2hhaW4sIHB1dDogb3B0LnB1dCwgcGF0aDoge3NvdWw6IChhdC5hdCAmJiBhdC5hdC5zb3VsKSB8fCBhdC5zb3VsLCBmaWVsZDogZmllbGQgfX07XG5cdFx0XHRcdFx0XHRndW4uX18uZ3VuLmdldChjdHgucmVsIHx8IGF0LnNvdWwsIGNiLm5vPyBudWxsIDogZ2V0LCBjdHgub3B0KTtcblx0XHRcdFx0XHRcdChvcHQub24gPSBjYi5oYXNoW2F0Lmhhc2hdID0gb24gPSBjdHgub3B0Lm9uKS5zb3VsID0gYXQuc291bDsgLy8gVE9ETzogQlVHISBDQiBnZXR0aW5nIHJldXNlZCBhcyB0aGUgaGFzaCBwb2ludCBmb3IgbXVsdGlwbGUgcGF0aHMgcG90ZW50aWFsbHkhIENvdWxkIGNhdXNlIHByb2JsZW1zIVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZigxID09PSBwYXRoLmxlbmd0aCl7IGNiLmNhbGwoY3R4LmJ5LmNoYWluIHx8IGNoYWluLCBudWxsLCBhdC52YWx1ZSwgY3R4LmZpZWxkKSB9XG5cdFx0XHRcdFx0Y2hhaW4uXy5hdCgnc291bCcpLmVtaXQoYXQpLmNoYWluKG9wdC5jaGFpbik7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0b25zLnB1c2goZ3VuLl8uYXQoJ251bGwnKS5vbmx5KGZ1bmN0aW9uKGF0KXtcblx0XHRcdFx0XHRpZighYXQuZmllbGQpeyByZXR1cm4gfVxuXHRcdFx0XHRcdGlmKGF0Lm5vdCl7XG5cdFx0XHRcdFx0XHRndW4ucHV0KHt9LCBudWxsLCB7aW5pdDogdHJ1ZX0pO1xuXHRcdFx0XHRcdFx0aWYob3B0LmluaXQgfHwgZ3VuLl9fLm9wdC5pbml0KXsgcmV0dXJuIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KGF0ID0gR3VuLm9uLmF0LmNvcHkoYXQpKS5maWVsZCA9IHBhdGhbMF07XG5cdFx0XHRcdFx0YXQubm90ID0gdHJ1ZTtcblx0XHRcdFx0XHRjaGFpbi5fLmF0KCdudWxsJykuZW1pdChhdCkuY2hhaW4ob3B0LmNoYWluKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRvbnMucHVzaChndW4uXy5hdCgnZW5kJykuZXZlbnQoZnVuY3Rpb24oYXQpe1xuXHRcdFx0XHRcdHRoaXMub2ZmKCk7XG5cdFx0XHRcdFx0aWYoYXQuYXQgJiYgYXQuYXQuZmllbGQgPT09IHBhdGhbMF0peyByZXR1cm4gfSAvLyBUT0RPOiBCVUchIFRISVMgRklYRVMgU08gTUFOWSBQUk9CTEVNUyBCVVQgRE9FUyBJVCBDQVRDSCBWQVJZSU5HIFNPVUxTIEVER0UgQ0FTRT9cblx0XHRcdFx0XHR2YXIgY3R4ID0ge2J5OiBndW4uX18uYnkoYXQuc291bCl9O1xuXHRcdFx0XHRcdGlmKEd1bi5vYmouaGFzKGN0eC5ieS5ub2RlLCBwYXRoWzBdKSl7IHJldHVybiB9XG5cdFx0XHRcdFx0KGF0ID0gR3VuLm9uLmF0LmNvcHkoYXQpKS5maWVsZCA9IHBhdGhbMF07XG5cdFx0XHRcdFx0YXQubm90ID0gdHJ1ZTtcblx0XHRcdFx0XHRjYi5jYWxsKGN0eC5ieS5jaGFpbiB8fCBjaGFpbiwgbnVsbCk7XG5cdFx0XHRcdFx0Y2hhaW4uXy5hdCgnbnVsbCcpLmVtaXQoYXQpLmNoYWluKG9wdC5jaGFpbik7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0aWYocGF0aC5sZW5ndGggPiAxKXtcblx0XHRcdFx0XHQoYyA9IGNoYWluLnBhdGgocGF0aC5zbGljZSgxKSwgY2IsIG9wdCkpLmJhY2sgPSBndW47XG5cdFx0XHRcdH1cblx0XHRcdFx0KGMgfHwgY2hhaW4pLm9mZiA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdG9ucy5mb3JFYWNoKGZ1bmN0aW9uKG9uKSB7XG5cdFx0XHRcdFx0XHRvbi5vZmYoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4gYyB8fCBjaGFpbjtcblx0XHRcdH1cblx0XHR9KCkpO1xuXG5cdFx0R3VuLmNoYWluLm1hcCA9IGZ1bmN0aW9uKGNiLCBvcHQpe1xuXHRcdFx0dmFyIHUsIGd1biA9IHRoaXMsIGNoYWluID0gZ3VuLmNoYWluKCk7XG5cdFx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCl7fTsgY2IuaGFzaCA9IHt9O1xuXHRcdFx0b3B0ID0gR3VuLmJpLmlzKG9wdCk/IHtjaGFuZ2U6IG9wdH0gOiBvcHQgfHwge307XG5cdFx0XHRvcHQuY2hhbmdlID0gR3VuLmJpLmlzKG9wdC5jaGFuZ2UpPyBvcHQuY2hhbmdlIDogdHJ1ZTtcblx0XHRcdGZ1bmN0aW9uIHBhdGgoZXJyLCB2YWwsIGZpZWxkKXtcblx0XHRcdFx0aWYoZXJyIHx8ICh2YWwgPT09IHUpKXsgcmV0dXJuIH1cblx0XHRcdFx0Y2IuY2FsbCh0aGlzLCB2YWwsIGZpZWxkKTtcblx0XHRcdH1cblx0XHRcdGZ1bmN0aW9uIGVhY2godmFsLCBmaWVsZCl7XG5cdFx0XHRcdC8vaWYoIUd1bi5pcy5yZWwodmFsKSl7IHBhdGguY2FsbCh0aGlzLmd1biwgbnVsbCwgdmFsLCBmaWVsZCk7cmV0dXJuO31cblx0XHRcdFx0aWYob3B0Lm5vZGUpe1xuXHRcdFx0XHRcdGlmKCFHdW4uaXMucmVsKHZhbCkpe1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjYi5oYXNoW3RoaXMuc291bCArIGZpZWxkXSA9IGNiLmhhc2hbdGhpcy5zb3VsICsgZmllbGRdIHx8IChwYXRob24gPSB0aGlzLmd1bi5wYXRoKGZpZWxkLCBwYXRoLCB7Y2hhaW46IGNoYWluLCB2aWE6ICdtYXAnfSkpOyAvLyBUT0RPOiBwYXRoIHNob3VsZCByZXVzZSBpdHNlbGYhIFdlIHNob3VsZG4ndCBoYXZlIHRvIGRvIGl0IG91cnNlbHZlcy5cblx0XHRcdFx0Ly8gVE9ETzpcblx0XHRcdFx0Ly8gMS4gQWJpbGl0eSB0byB0dXJuIG9mZiBhbiBldmVudC4gLy8gYXV0b21hdGljYWxseSBoYXBwZW5zIHdpdGhpbiBwYXRoIHNpbmNlIHJldXNpbmcgaXMgbWFudWFsP1xuXHRcdFx0XHQvLyAyLiBBYmlsaXR5IHRvIHBhc3MgY2hhaW4gY29udGV4dCB0byBmaXJlIG9uLiAvLyBET05FXG5cdFx0XHRcdC8vIDMuIFBzZXVkb25lc3MgaGFuZGxlZCBmb3IgdXMuIC8vIERPTkVcblx0XHRcdFx0Ly8gNC4gUmV1c2UuIC8vIE1BTlVBTExZIERPTkVcblx0XHRcdH1cblx0XHRcdGZ1bmN0aW9uIG1hcChhdCl7XG5cdFx0XHRcdHZhciByZWYgPSBndW4uX18uYnkoYXQuc291bCkuY2hhaW4gfHwgZ3VuO1xuXHRcdFx0XHRHdW4uaXMubm9kZShhdC5jaGFuZ2UsIGVhY2gsIHtndW46IHJlZiwgc291bDogYXQuc291bH0pO1xuXHRcdFx0fVxuXHRcdFx0b24gPSBndW4ub24obWFwLCB7cmF3OiB0cnVlLCBjaGFuZ2U6IHRydWV9KTsgLy8gVE9ETzogQUxMT1cgVVNFUiBUTyBETyBtYXAgY2hhbmdlIGZhbHNlIVxuXHRcdFx0Y2hhaW4ub2ZmID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGlmIChwYXRob24pIHBhdGhvbi5vZmYoKTtcblx0XHRcdFx0b24ub2ZmKCk7XG5cdFx0XHR9XG5cdFx0XHRpZihndW4gPT09IGd1bi5iYWNrKXsgR3VuLmxvZygnWW91IGhhdmUgbm8gY29udGV4dCB0byBgLm1hcGAhJykgfVxuXHRcdFx0cmV0dXJuIGNoYWluO1xuXHRcdH1cblxuXHRcdEd1bi5jaGFpbi52YWwgPSAoZnVuY3Rpb24oKXtcblx0XHRcdEd1bi5vbignZ2V0LndpcmUnKS5ldmVudChmdW5jdGlvbihndW4sIGN0eCl7XG5cdFx0XHRcdGlmKCFjdHguc291bCl7IHJldHVybiB9IHZhciBlbmQ7XG5cdFx0XHRcdChlbmQgPSBndW4uX18uYnkoY3R4LnNvdWwpKS5lbmQgPSAoZW5kLmVuZCB8fCAtMSk7IC8vIFRPRE86IENMRUFOIFVQISBUaGlzIHNob3VsZCBiZSBwZXIgcGVlciFcblx0XHRcdH0sLTk5OSk7XG5cdFx0XHRHdW4ub24oJ3dpcmUuZ2V0JykuZXZlbnQoZnVuY3Rpb24oZ3VuLCBjdHgsIGVyciwgZGF0YSl7XG5cdFx0XHRcdGlmKGVyciB8fCAhY3R4LnNvdWwpeyByZXR1cm4gfVxuXHRcdFx0XHRpZihkYXRhICYmICFHdW4ub2JqLmVtcHR5KGRhdGEsIEd1bi5fLm1ldGEpKXsgcmV0dXJuIH1cblx0XHRcdFx0dmFyIGVuZCA9IGd1bi5fXy5ieShjdHguc291bCk7XG5cdFx0XHRcdGVuZC5lbmQgPSAoIWVuZC5lbmQgfHwgZW5kLmVuZCA8IDApPyAxIDogZW5kLmVuZCArIDE7XG5cdFx0XHR9LC05OTkpO1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uKGNiLCBvcHQpe1xuXHRcdFx0XHR2YXIgZ3VuID0gdGhpcywgYXJncyA9IEd1bi5saXN0LnNsaXQuY2FsbChhcmd1bWVudHMpO1xuXHRcdFx0XHRjYiA9IEd1bi5mbnMuaXMoY2IpPyBjYiA6IGZ1bmN0aW9uKHZhbCwgZmllbGQpeyByb290LmNvbnNvbGUubG9nLmFwcGx5KHJvb3QuY29uc29sZSwgYXJncy5jb25jYXQoW2ZpZWxkICYmIChmaWVsZCArPSAnOicpLCB2YWxdKSkgfTsgY2IuaGFzaCA9IHt9O1xuXHRcdFx0XHRvcHQgPSBvcHQgfHwge307XG5cdFx0XHRcdGZ1bmN0aW9uIHZhbChhdCl7XG5cdFx0XHRcdFx0dmFyIGN0eCA9IHtieTogZ3VuLl9fLmJ5KGF0LnNvdWwpLCBhdDogYXQuYXQgfHwgYXR9LCBub2RlID0gY3R4LmJ5Lm5vZGUsIGZpZWxkID0gY3R4LmF0LmZpZWxkLCBoYXNoID0gR3VuLm9uLmF0Lmhhc2goe3NvdWw6IGN0eC5hdC5rZXkgfHwgY3R4LmF0LnNvdWwsIGZpZWxkOiBmaWVsZH0pO1xuXHRcdFx0XHRcdGlmKGNiLmhhc2hbaGFzaF0peyByZXR1cm4gfVxuXHRcdFx0XHRcdGlmKGF0LmZpZWxkICYmIEd1bi5vYmouaGFzKG5vZGUsIGF0LmZpZWxkKSl7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2IuaGFzaFtoYXNoXSA9IHRydWUsIGNiLmNhbGwoY3R4LmJ5LmNoYWluIHx8IGd1biwgR3VuLm9iai5jb3B5KG5vZGVbYXQuZmllbGRdKSwgYXQuZmllbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZighb3B0LmVtcHR5ICYmIEd1bi5vYmouZW1wdHkobm9kZSwgR3VuLl8ubWV0YSkpeyByZXR1cm4gfSAvLyBUT0RPOiBDTEVBTiBVUCEgLm9uIGFscmVhZHkgZG9lcyB0aGlzIHdpdGhvdXQgdGhlIC5yYXchXG5cdFx0XHRcdFx0aWYoY3R4LmJ5LmVuZCA8IDApeyByZXR1cm4gfVxuXHRcdFx0XHRcdHJldHVybiBjYi5oYXNoW2hhc2hdID0gdHJ1ZSwgY2IuY2FsbChjdHguYnkuY2hhaW4gfHwgZ3VuLCBHdW4ub2JqLmNvcHkobm9kZSksIGZpZWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRndW4ub24odmFsLCB7cmF3OiB0cnVlfSk7XG5cdFx0XHRcdGlmKGd1biA9PT0gZ3VuLmJhY2speyBHdW4ubG9nKCdZb3UgaGF2ZSBubyBjb250ZXh0IHRvIGAudmFsYCEnKSB9XG5cdFx0XHRcdHJldHVybiBndW47XG5cdFx0XHR9XG5cdFx0fSgpKTtcblxuXHRcdEd1bi5jaGFpbi5ub3QgPSBmdW5jdGlvbihjYiwgb3B0KXtcblx0XHRcdHZhciBndW4gPSB0aGlzLCBjaGFpbiA9IGd1bi5jaGFpbigpO1xuXHRcdFx0Y2IgPSBjYiB8fCBmdW5jdGlvbigpe307XG5cdFx0XHRvcHQgPSBvcHQgfHwge307XG5cdFx0XHRmdW5jdGlvbiBub3QoYXQsZSl7XG5cdFx0XHRcdGlmKGF0LmZpZWxkKXtcblx0XHRcdFx0XHRpZihHdW4ub2JqLmhhcyhndW4uX18uYnkoYXQuc291bCkubm9kZSwgYXQuZmllbGQpKXsgcmV0dXJuIEd1bi5vYmouZGVsKGF0LCAnbm90JyksIGNoYWluLl8uYXQoZSkuZW1pdChhdCkgfVxuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0aWYoYXQuc291bCAmJiBndW4uX18uYnkoYXQuc291bCkubm9kZSl7IHJldHVybiBHdW4ub2JqLmRlbChhdCwgJ25vdCcpLCBjaGFpbi5fLmF0KGUpLmVtaXQoYXQpIH1cblx0XHRcdFx0aWYoIWF0Lm5vdCl7IHJldHVybiB9XG5cdFx0XHRcdHZhciBraWNrID0gZnVuY3Rpb24obmV4dCl7XG5cdFx0XHRcdFx0aWYoKytraWNrLmMpeyByZXR1cm4gR3VuLmxvZyhcIldhcm5pbmchIE11bHRpcGxlIGBub3RgIHJlc3VtZXMhXCIpOyB9XG5cdFx0XHRcdFx0bmV4dC5fLmF0LmFsbChmdW5jdGlvbihvbiAsZSl7IC8vIFRPRE86IEJVRz8gU3dpdGNoIGJhY2sgdG8gLmF0PyBJIHRoaW5rIC5vbiBpcyBhY3R1YWxseSBjb3JyZWN0IHNvIGl0IGRvZXNuJ3QgbWVtb3JpemUuIC8vIFRPRE86IEJVRyEgV2hhdCBhYm91dCBvdGhlciBldmVudHM/XG5cdFx0XHRcdFx0XHRjaGFpbi5fLmF0KGUpLmVtaXQob24pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRraWNrLmMgPSAtMVxuXHRcdFx0XHRraWNrLmNoYWluID0gZ3VuLmNoYWluKCk7XG5cdFx0XHRcdGtpY2submV4dCA9IGNiLmNhbGwoa2ljay5jaGFpbiwgb3B0LnJhdz8gYXQgOiAoYXQuZmllbGQgfHwgYXQuc291bCB8fCBhdC5ub3QpLCBraWNrKTtcblx0XHRcdFx0a2ljay5zb3VsID0gR3VuLnRleHQucmFuZG9tKCk7XG5cdFx0XHRcdGlmKEd1bi5pcyhraWNrLm5leHQpKXsga2ljayhraWNrLm5leHQpIH1cblx0XHRcdFx0a2ljay5jaGFpbi5fLmF0KCdzb3VsJykuZW1pdCh7c291bDoga2ljay5zb3VsLCBmaWVsZDogYXQuZmllbGQsIG5vdDogdHJ1ZSwgdmlhOiAnbm90J30pO1xuXHRcdFx0fVxuXHRcdFx0Z3VuLl8uYXQuYWxsKG5vdCk7XG5cdFx0XHRpZihndW4gPT09IGd1bi5iYWNrKXsgR3VuLmxvZygnWW91IGhhdmUgbm8gY29udGV4dCB0byBgLm5vdGAhJykgfVxuXHRcdFx0Y2hhaW4uXy5ub3QgPSB0cnVlOyAvLyBUT0RPOiBDTEVBTiBVUCEgV291bGQgYmUgaWRlYWwgaWYgd2UgY291bGQgYWNjb21wbGlzaCB0aGlzIGluIGEgbW9yZSBlbGVnYW50IHdheS5cblx0XHRcdHJldHVybiBjaGFpbjtcblx0XHR9XG5cblx0XHRHdW4uY2hhaW4uc2V0ID0gZnVuY3Rpb24oaXRlbSwgY2IsIG9wdCl7XG5cdFx0XHR2YXIgZ3VuID0gdGhpcywgY3R4ID0ge30sIGNoYWluLCByZWw7XG5cdFx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCl7fTtcblx0XHRcdGlmKEd1bi5pcy5ub2RlKGl0ZW0pICYmIChyZWw9R3VuLmlzLnJlbChpdGVtLl8pKSl7XG5cdFx0XHRcdC8vIFJlc29sdmUgc2V0IHdpdGggYSBub2RlXG5cdFx0XHRcdHJldHVybiBndW4uc2V0KGd1bi5nZXQocmVsKSwgY2IsIG9wdCk7XG5cdFx0XHR9XG5cdFx0XHRpZih0eXBlb2YoaXRlbSk9PSdvYmplY3QnJiYhR3VuLmlzKGl0ZW0pJiYhR3VuLmlzLnJlbChpdGVtKSYmIUd1bi5pcy5sZXgoaXRlbSkmJiFHdW4uaXMubm9kZShpdGVtKSYmIUd1bi5pcy5ncmFwaChpdGVtKSl7XG5cdFx0XHRcdC8vIFJlc29sdmUgc2V0IHdpdGggYSBuZXcgc291bFxuXHRcdFx0XHRyZXR1cm4gZ3VuLnNldChHdW4ucm9vdChndW4pLnB1dChpdGVtKSwgY2IsIG9wdCk7XG5cdFx0XHR9XG5cdFx0XHRpZighR3VuLmlzKGl0ZW0pKXsgcmV0dXJuIGNiLmNhbGwoZ3VuLCB7ZXJyOiBHdW4ubG9nKCdTZXQgb25seSBzdXBwb3J0cyBub2RlIHJlZmVyZW5jZXMgY3VycmVudGx5IScpfSksIGd1biB9IC8vIFRPRE86IEJ1Zz8gU2hvdWxkIHdlIHJldHVybiBub3QgZ3VuIG9uIGVycm9yP1xuXHRcdFx0KGN0eC5jaGFpbiA9IGl0ZW0uY2hhaW4oKSkuYmFjayA9IGd1bjtcblx0XHRcdGN0eC5jaGFpbi5fID0gaXRlbS5fO1xuXHRcdFx0aXRlbS52YWwoZnVuY3Rpb24obm9kZSl7IC8vIFRPRE86IEJVRyEgUmV0dXJuIHByb3h5IGNoYWluIHdpdGggYmFjayA9IGxpc3QuXG5cdFx0XHRcdGlmKGN0eC5kb25lKXsgcmV0dXJuIH0gY3R4LmRvbmUgPSB0cnVlO1xuXHRcdFx0XHR2YXIgcHV0ID0ge30sIHNvdWwgPSBHdW4uaXMubm9kZS5zb3VsKG5vZGUpO1xuXHRcdFx0XHRpZighc291bCl7IHJldHVybiBjYi5jYWxsKGd1biwge2VycjogR3VuLmxvZygnT25seSBhIG5vZGUgY2FuIGJlIGxpbmtlZCEgTm90IFwiJyArIG5vZGUgKyAnXCIhJyl9KSB9XG5cdFx0XHRcdGd1bi5wdXQoR3VuLm9iai5wdXQocHV0LCBzb3VsLCBHdW4uaXMucmVsLmlmeShzb3VsKSksIGNiLCBvcHQpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gY3R4LmNoYWluO1xuXHRcdH1cblxuXHRcdEd1bi5jaGFpbi5pbml0ID0gZnVuY3Rpb24oY2IsIG9wdCl7XG5cdFx0XHR2YXIgZ3VuID0gdGhpcztcblx0XHRcdGd1bi5fLmF0KCdudWxsJykuZXZlbnQoZnVuY3Rpb24oYXQpe1xuXHRcdFx0XHRpZighYXQubm90KXsgcmV0dXJuIH0gLy8gVE9ETzogQlVHISBUaGlzIGNoZWNrIGlzIHN5bmNocm9ub3VzIGJ1dCBpdCBjb3VsZCBiZSBhc3luY2hyb25vdXMhXG5cdFx0XHRcdHZhciBjdHggPSB7Ynk6IGd1bi5fXy5ieShhdC5zb3VsKX07XG5cdFx0XHRcdHRoaXMub2ZmKCk7XG5cdFx0XHRcdGlmKGF0LmZpZWxkKXtcblx0XHRcdFx0XHRpZihHdW4ub2JqLmhhcyhjdHguYnkubm9kZSwgYXQuZmllbGQpKXsgcmV0dXJuIH1cblx0XHRcdFx0XHRndW4uXy5hdCgnc291bCcpLmVtaXQoe3NvdWw6IGF0LnNvdWwsIGZpZWxkOiBhdC5maWVsZCwgbm90OiB0cnVlfSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmKGF0LnNvdWwpe1xuXHRcdFx0XHRcdGlmKGN0eC5ieS5ub2RlKXsgcmV0dXJuIH1cblx0XHRcdFx0XHR2YXIgc291bCA9IEd1bi50ZXh0LnJhbmRvbSgpO1xuXHRcdFx0XHRcdGd1bi5fXy5ndW4ucHV0KEd1bi5pcy5ub2RlLnNvdWwuaWZ5KHt9LCBzb3VsKSwgbnVsbCwge2luaXQ6IHRydWV9KTtcblx0XHRcdFx0XHRndW4uX18uZ3VuLmtleShhdC5zb3VsLCBudWxsLCBzb3VsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwge3JhdzogdHJ1ZX0pO1xuXHRcdFx0cmV0dXJuIGd1bjtcblx0XHR9XG5cblx0fShHdW4pKTtcblxuXHQ7KGZ1bmN0aW9uKEd1bil7IC8vIEphdmFzY3JpcHQgdG8gR3VuIFNlcmlhbGl6ZXIuXG5cdFx0ZnVuY3Rpb24gaWZ5KGRhdGEsIGNiLCBvcHQpe1xuXHRcdFx0b3B0ID0gb3B0IHx8IHt9O1xuXHRcdFx0Y2IgPSBjYiB8fCBmdW5jdGlvbihlbnYsIGNiKXsgY2IoZW52LmF0LCBHdW4uaXMubm9kZS5zb3VsKGVudi5hdC5vYmopIHx8IEd1bi5pcy5ub2RlLnNvdWwoZW52LmF0Lm5vZGUpIHx8IEd1bi50ZXh0LnJhbmRvbSgpKSB9O1xuXHRcdFx0dmFyIGVuZCA9IGZ1bmN0aW9uKGZuKXtcblx0XHRcdFx0Y3R4LmVuZCA9IGZuIHx8IGZ1bmN0aW9uKCl7fTtcblx0XHRcdFx0dW5pcXVlKGN0eCk7XG5cdFx0XHR9LCBjdHggPSB7YXQ6IHtwYXRoOiBbXSwgb2JqOiBkYXRhfSwgcm9vdDoge30sIGdyYXBoOiB7fSwgcXVldWU6IFtdLCBzZWVuOiBbXSwgb3B0OiBvcHQsIGxvb3A6IHRydWV9O1xuXHRcdFx0aWYoIWRhdGEpeyByZXR1cm4gY3R4LmVyciA9IHtlcnI6IEd1bi5sb2coJ1NlcmlhbGl6ZXIgZG9lcyBub3QgaGF2ZSBjb3JyZWN0IHBhcmFtZXRlcnMuJyl9LCBlbmQgfVxuXHRcdFx0aWYoY3R4Lm9wdC5zdGFydCl7IEd1bi5pcy5ub2RlLnNvdWwuaWZ5KGN0eC5yb290LCBjdHgub3B0LnN0YXJ0KSB9XG5cdFx0XHRjdHguYXQubm9kZSA9IGN0eC5yb290O1xuXHRcdFx0d2hpbGUoY3R4Lmxvb3AgJiYgIWN0eC5lcnIpe1xuXHRcdFx0XHRzZWVuKGN0eCwgY3R4LmF0KTtcblx0XHRcdFx0bWFwKGN0eCwgY2IpO1xuXHRcdFx0XHRpZihjdHgucXVldWUubGVuZ3RoKXtcblx0XHRcdFx0XHRjdHguYXQgPSBjdHgucXVldWUuc2hpZnQoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdHgubG9vcCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZW5kO1xuXHRcdH1cblx0XHRmdW5jdGlvbiBtYXAoY3R4LCBjYil7XG5cdFx0XHR2YXIgdSwgcmVsID0gZnVuY3Rpb24oYXQsIHNvdWwpe1xuXHRcdFx0XHRhdC5zb3VsID0gYXQuc291bCB8fCBzb3VsIHx8IEd1bi5pcy5ub2RlLnNvdWwoYXQub2JqKSB8fCBHdW4uaXMubm9kZS5zb3VsKGF0Lm5vZGUpO1xuXHRcdFx0XHRpZighY3R4Lm9wdC5wdXJlKXtcblx0XHRcdFx0XHRjdHguZ3JhcGhbYXQuc291bF0gPSBHdW4uaXMubm9kZS5zb3VsLmlmeShhdC5ub2RlLCBhdC5zb3VsKTtcblx0XHRcdFx0XHRpZihjdHguYXQuZmllbGQpe1xuXHRcdFx0XHRcdFx0R3VuLmlzLm5vZGUuc3RhdGUuaWZ5KFthdC5ub2RlXSwgYXQuZmllbGQsIHUsIGN0eC5vcHQuc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRHdW4ubGlzdC5tYXAoYXQuYmFjaywgZnVuY3Rpb24ocmVsKXtcblx0XHRcdFx0XHRyZWxbR3VuLl8uc291bF0gPSBhdC5zb3VsO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dW5pcXVlKGN0eCk7XG5cdFx0XHR9LCBpdDtcblx0XHRcdEd1bi5vYmoubWFwKGN0eC5hdC5vYmosIGZ1bmN0aW9uKHZhbCwgZmllbGQpe1xuXHRcdFx0XHRjdHguYXQudmFsID0gdmFsO1xuXHRcdFx0XHRjdHguYXQuZmllbGQgPSBmaWVsZDtcblx0XHRcdFx0aXQgPSBjYihjdHgsIHJlbCwgbWFwKSB8fCB0cnVlO1xuXHRcdFx0XHRpZihmaWVsZCA9PT0gR3VuLl8ubWV0YSl7XG5cdFx0XHRcdFx0Y3R4LmF0Lm5vZGVbZmllbGRdID0gR3VuLm9iai5jb3B5KHZhbCk7IC8vIFRPRE86IEJVRyEgSXMgdGhpcyBjb3JyZWN0P1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZihTdHJpbmcoZmllbGQpLmluZGV4T2YoJy4nKSAhPSAtMSB8fCAoZmFsc2UgJiYgbm90VmFsaWRGaWVsZChmaWVsZCkpKXsgLy8gVE9ETzogQlVHISBEbyBsYXRlciBmb3IgQUNJRCBcImNvbnNpc3RlbmN5XCIgZ3VhcmFudGVlLlxuXHRcdFx0XHRcdHJldHVybiBjdHguZXJyID0ge2VycjogR3VuLmxvZyhcIkludmFsaWQgZmllbGQgbmFtZSBvbiAnXCIgKyBjdHguYXQucGF0aC5qb2luKCcuJykgKyBcIichXCIpfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZighR3VuLmlzLnZhbCh2YWwpKXtcblx0XHRcdFx0XHR2YXIgYXQgPSB7b2JqOiB2YWwsIG5vZGU6IHt9LCBiYWNrOiBbXSwgcGF0aDogW2ZpZWxkXX0sIHRtcCA9IHt9LCB3YXM7XG5cdFx0XHRcdFx0YXQucGF0aCA9IChjdHguYXQucGF0aHx8W10pLmNvbmNhdChhdC5wYXRoIHx8IFtdKTtcblx0XHRcdFx0XHRpZighR3VuLm9iai5pcyh2YWwpKXtcblx0XHRcdFx0XHRcdHJldHVybiBjdHguZXJyID0ge2VycjogR3VuLmxvZyhcIkludmFsaWQgdmFsdWUgYXQgJ1wiICsgYXQucGF0aC5qb2luKCcuJykgKyBcIichXCIgKX07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmKHdhcyA9IHNlZW4oY3R4LCBhdCkpe1xuXHRcdFx0XHRcdFx0dG1wW0d1bi5fLnNvdWxdID0gR3VuLmlzLm5vZGUuc291bCh3YXMubm9kZSkgfHwgbnVsbDtcblx0XHRcdFx0XHRcdCh3YXMuYmFjayA9IHdhcy5iYWNrIHx8IFtdKS5wdXNoKGN0eC5hdC5ub2RlW2ZpZWxkXSA9IHRtcCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGN0eC5xdWV1ZS5wdXNoKGF0KTtcblx0XHRcdFx0XHRcdHRtcFtHdW4uXy5zb3VsXSA9IG51bGw7XG5cdFx0XHRcdFx0XHRhdC5iYWNrLnB1c2goY3R4LmF0Lm5vZGVbZmllbGRdID0gdG1wKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3R4LmF0Lm5vZGVbZmllbGRdID0gR3VuLm9iai5jb3B5KHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYoIWl0KXsgY2IoY3R4LCByZWwpIH1cblx0XHR9XG5cdFx0ZnVuY3Rpb24gdW5pcXVlKGN0eCl7XG5cdFx0XHRpZihjdHguZXJyIHx8ICghR3VuLmxpc3QubWFwKGN0eC5zZWVuLCBmdW5jdGlvbihhdCl7XG5cdFx0XHRcdGlmKCFhdC5zb3VsKXsgcmV0dXJuIHRydWUgfVxuXHRcdFx0fSkgJiYgIWN0eC5sb29wKSl7IHJldHVybiBjdHguZW5kKGN0eC5lcnIsIGN0eCksIGN0eC5lbmQgPSBmdW5jdGlvbigpe307IH1cblx0XHR9XG5cdFx0ZnVuY3Rpb24gc2VlbihjdHgsIGF0KXtcblx0XHRcdHJldHVybiBHdW4ubGlzdC5tYXAoY3R4LnNlZW4sIGZ1bmN0aW9uKGhhcyl7XG5cdFx0XHRcdGlmKGF0Lm9iaiA9PT0gaGFzLm9iail7IHJldHVybiBoYXMgfVxuXHRcdFx0fSkgfHwgKGN0eC5zZWVuLnB1c2goYXQpICYmIGZhbHNlKTtcblx0XHR9XG5cdFx0aWZ5LndpcmUgPSBmdW5jdGlvbihuLCBjYiwgb3B0KXsgcmV0dXJuIEd1bi50ZXh0LmlzKG4pPyBpZnkud2lyZS5mcm9tKG4sIGNiLCBvcHQpIDogaWZ5LndpcmUudG8obiwgY2IsIG9wdCkgfVxuXHRcdGlmeS53aXJlLnRvID0gZnVuY3Rpb24obiwgY2IsIG9wdCl7IHZhciB0LCBiO1xuXHRcdFx0aWYoIW4gfHwgISh0ID0gR3VuLmlzLm5vZGUuc291bChuKSkpeyByZXR1cm4gbnVsbCB9XG5cdFx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCl7fTtcblx0XHRcdHQgPSAoYiA9IFwiIydcIiArIEpTT04uc3RyaW5naWZ5KHQpICsgXCInXCIpO1xuXHRcdFx0R3VuLm9iai5tYXAobiwgZnVuY3Rpb24odixmKXtcblx0XHRcdFx0aWYoR3VuLl8ubWV0YSA9PT0gZil7IHJldHVybiB9XG5cdFx0XHRcdHZhciB3ID0gJycsIHMgPSBHdW4uaXMubm9kZS5zdGF0ZShuLGYpO1xuXHRcdFx0XHRpZighcyl7IHJldHVybiB9XG5cdFx0XHRcdHcgKz0gXCIuJ1wiICsgSlNPTi5zdHJpbmdpZnkoZikgKyBcIidcIjtcblx0XHRcdFx0dyArPSBcIj0nXCIgKyBKU09OLnN0cmluZ2lmeSh2KSArIFwiJ1wiO1xuXHRcdFx0XHR3ICs9IFwiPidcIiArIEpTT04uc3RyaW5naWZ5KHMpICsgXCInXCI7XG5cdFx0XHRcdHQgKz0gdztcblx0XHRcdFx0dyA9IGIgKyB3O1xuXHRcdFx0XHRjYihudWxsLCB3KTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHQ7XG5cdFx0fVxuXHRcdGlmeS53aXJlLmZyb20gPSBmdW5jdGlvbihuLCBjYiwgb3B0KXtcblx0XHRcdGlmKCFuKXsgcmV0dXJuIG51bGwgfVxuXHRcdFx0dmFyIGEgPSBbXSwgcyA9IC0xLCBlID0gMCwgZW5kID0gMTtcblx0XHRcdHdoaWxlKChlID0gbi5pbmRleE9mKFwiJ1wiLCBzICsgMSkpID49IDApe1xuXHRcdFx0XHRpZihzID09PSBlIHx8ICdcXFxcJyA9PT0gbi5jaGFyQXQoZS0xKSl7fWVsc2V7XG5cdFx0XHRcdFx0YS5wdXNoKG4uc2xpY2UocyArIDEsZSkpO1xuXHRcdFx0XHRcdHMgPSBlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYTtcblx0XHR9XG5cdFx0R3VuLmlmeSA9IGlmeTtcblx0fShHdW4pKTtcblxuXHR2YXIgcm9vdCA9IHRoaXMgfHwge307IC8vIHNhZmUgZm9yIHdpbmRvdywgZ2xvYmFsLCByb290LCBhbmQgJ3VzZSBzdHJpY3QnLlxuXHRpZih0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKXsgKHJvb3QgPSB3aW5kb3cpLkd1biA9IEd1biB9XG5cdGlmKHR5cGVvZiBtb2R1bGUgIT09IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMpeyBtb2R1bGUuZXhwb3J0cyA9IEd1biB9XG5cdGlmKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpeyByb290ID0gZ2xvYmFsOyB9XG5cdHJvb3QuY29uc29sZSA9IHJvb3QuY29uc29sZSB8fCB7bG9nOiBmdW5jdGlvbihzKXsgcmV0dXJuIHMgfX07IC8vIHNhZmUgZm9yIG9sZCBicm93c2Vyc1xuXHR2YXIgY29uc29sZSA9IHtcblx0XHRsb2c6IGZ1bmN0aW9uKHMpe3JldHVybiByb290LmNvbnNvbGUubG9nLmFwcGx5KHJvb3QuY29uc29sZSwgYXJndW1lbnRzKSwgc30sXG5cdFx0TG9nOiBHdW4ubG9nID0gZnVuY3Rpb24ocyl7IHJldHVybiAoIUd1bi5sb2cuc3F1ZWxjaCAmJiByb290LmNvbnNvbGUubG9nLmFwcGx5KHJvb3QuY29uc29sZSwgYXJndW1lbnRzKSksIHMgfVxuXHR9O1xuXHRjb25zb2xlLmRlYnVnID0gZnVuY3Rpb24oaSwgcyl7IHJldHVybiAoR3VuLmxvZy5kZWJ1ZyAmJiBpID09PSBHdW4ubG9nLmRlYnVnICYmIEd1bi5sb2cuZGVidWcrKykgJiYgcm9vdC5jb25zb2xlLmxvZy5hcHBseShyb290LmNvbnNvbGUsIGFyZ3VtZW50cyksIHMgfTtcblx0R3VuLmxvZy5jb3VudCA9IGZ1bmN0aW9uKHMpeyByZXR1cm4gR3VuLmxvZy5jb3VudFtzXSA9IEd1bi5sb2cuY291bnRbc10gfHwgMCwgR3VuLmxvZy5jb3VudFtzXSsrIH1cbn0uYmluZCh0aGlzIHx8IG1vZHVsZSkoKSk7XG5cblxuOyhmdW5jdGlvbihUYWIpe1xuXG5cdGlmKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIpeyByZXR1cm47IH1cblx0aWYoIXdpbmRvdy5HdW4peyByZXR1cm4gfVxuXHRpZighd2luZG93LkpTT04peyB0aHJvdyBuZXcgRXJyb3IoXCJJbmNsdWRlIEpTT04gZmlyc3Q6IGFqYXguY2RuanMuY29tL2FqYXgvbGlicy9qc29uMi8yMDExMDIyMy9qc29uMi5qc1wiKSB9IC8vIGZvciBvbGQgSUUgdXNlXG5cblx0OyhmdW5jdGlvbihleHBvcnRzKXtcblx0XHRmdW5jdGlvbiBzKCl7fVxuXHRcdHMucHV0ID0gZnVuY3Rpb24oa2V5LCB2YWwsIGNiKXsgdHJ5eyBzdG9yZS5zZXRJdGVtKGtleSwgR3VuLnRleHQuaWZ5KHZhbCkpIH1jYXRjaChlKXtpZihjYiljYihlKX0gfVxuXHRcdHMuZ2V0ID0gZnVuY3Rpb24oa2V5LCBjYil7IC8qc2V0VGltZW91dChmdW5jdGlvbigpeyovIHRyeXsgY2IobnVsbCwgR3VuLm9iai5pZnkoc3RvcmUuZ2V0SXRlbShrZXkpIHx8IG51bGwpKSB9Y2F0Y2goZSl7Y2IoZSl9IC8qfSwxKSovfVxuXHRcdHMuZGVsID0gZnVuY3Rpb24oa2V5KXsgcmV0dXJuIHN0b3JlLnJlbW92ZUl0ZW0oa2V5KSB9XG5cdFx0Ly8gRmVhdHVyZSBkZXRlY3QgKyBsb2NhbCByZWZlcmVuY2Vcblx0XHR2YXIgc3RvcmFnZTtcblx0XHR2YXIgZmFpbDtcblx0XHR2YXIgdWlkO1xuXHRcdHRyeSB7XG5cdFx0XHR1aWQgPSBuZXcgRGF0ZTtcblx0XHRcdChzdG9yYWdlID0gd2luZG93LmxvY2FsU3RvcmFnZSkuc2V0SXRlbSh1aWQsIHVpZCk7XG5cdFx0XHRmYWlsID0gc3RvcmFnZS5nZXRJdGVtKHVpZCkgIT0gdWlkO1xuXHRcdFx0c3RvcmFnZS5yZW1vdmVJdGVtKHVpZCk7XG5cdFx0XHRmYWlsICYmIChzdG9yYWdlID0gZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGV4Y2VwdGlvbikge31cblx0XHR2YXIgc3RvcmUgPSAoc3RvcmFnZSAmJiB3aW5kb3cubG9jYWxTdG9yYWdlKSB8fCB7c2V0SXRlbTogZnVuY3Rpb24oKXt9LCByZW1vdmVJdGVtOiBmdW5jdGlvbigpe30sIGdldEl0ZW06IGZ1bmN0aW9uKCl7fX07XG5cdFx0ZXhwb3J0cy5zdG9yZSA9IHM7XG5cdH0uYmluZCh0aGlzIHx8IG1vZHVsZSkoVGFiKSk7XG5cblx0R3VuLm9uKCdvcHQnKS5ldmVudChmdW5jdGlvbihndW4sIG9wdCl7XG5cdFx0b3B0ID0gb3B0IHx8IHt9O1xuXHRcdHZhciB0YWIgPSBndW4udGFiID0gZ3VuLnRhYiB8fCB7fTtcblx0XHR0YWIuc3RvcmUgPSB0YWIuc3RvcmUgfHwgVGFiLnN0b3JlO1xuXHRcdHRhYi5yZXF1ZXN0ID0gdGFiLnJlcXVlc3QgfHwgR3VuLnJlcXVlc3Q7XG5cdFx0aWYoIXRhYi5yZXF1ZXN0KXsgdGhyb3cgbmV3IEVycm9yKFwiRGVmYXVsdCBHVU4gZHJpdmVyIGNvdWxkIG5vdCBmaW5kIGRlZmF1bHQgbmV0d29yayBhYnN0cmFjdGlvbi5cIikgfVxuXHRcdHRhYi5yZXF1ZXN0LnMgPSB0YWIucmVxdWVzdC5zIHx8IHt9O1xuXHRcdHRhYi5oZWFkZXJzID0gb3B0LmhlYWRlcnMgfHwge307XG5cdFx0dGFiLmhlYWRlcnNbJ2d1bi1zaWQnXSA9IHRhYi5oZWFkZXJzWydndW4tc2lkJ10gfHwgR3VuLnRleHQucmFuZG9tKCk7IC8vIHN0cmVhbSBpZFxuXHRcdHRhYi5wcmVmaXggPSB0YWIucHJlZml4IHx8IG9wdC5wcmVmaXggfHwgJ2d1bi8nO1xuXHRcdHRhYi5nZXQgPSB0YWIuZ2V0IHx8IGZ1bmN0aW9uKGxleCwgY2IsIG9wdCl7XG5cdFx0XHRpZighbGV4KXsgcmV0dXJuIH1cblx0XHRcdHZhciBzb3VsID0gbGV4W0d1bi5fLnNvdWxdO1xuXHRcdFx0aWYoIXNvdWwpeyByZXR1cm4gfVxuXHRcdFx0Y2IgPSBjYiB8fCBmdW5jdGlvbigpe307XG5cdFx0XHR2YXIgcm9wdCA9IHt9O1xuXHRcdFx0KHJvcHQuaGVhZGVycyA9IEd1bi5vYmouY29weSh0YWIuaGVhZGVycykpLmlkID0gdGFiLm1zZygpO1xuXHRcdFx0KGZ1bmN0aW9uIGxvY2FsKHNvdWwsIGNiKXtcblx0XHRcdFx0dGFiLnN0b3JlLmdldCh0YWIucHJlZml4ICsgc291bCwgZnVuY3Rpb24oZXJyLCBkYXRhKXtcblx0XHRcdFx0XHRpZighZGF0YSl7IHJldHVybiB9IC8vIGxldCB0aGUgcGVlcnMgaGFuZGxlIG5vIGRhdGEuXG5cdFx0XHRcdFx0aWYoZXJyKXsgcmV0dXJuIGNiKGVycikgfVxuXHRcdFx0XHRcdGNiKGVyciwgY2Iubm9kZSA9IGRhdGEpOyAvLyBub2RlXG5cdFx0XHRcdFx0Y2IoZXJyLCBHdW4uaXMubm9kZS5zb3VsLmlmeSh7fSwgR3VuLmlzLm5vZGUuc291bChkYXRhKSkpOyAvLyBlbmRcblx0XHRcdFx0XHRjYihlcnIsIHt9KTsgLy8gdGVybWluYXRlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fShzb3VsLCBjYikpO1xuXHRcdFx0aWYoIShjYi5sb2NhbCA9IG9wdC5sb2NhbCkpe1xuXHRcdFx0XHR0YWIucmVxdWVzdC5zW3JvcHQuaGVhZGVycy5pZF0gPSB0YWIuZXJyb3IoY2IsIFwiRXJyb3I6IEdldCBmYWlsZWQhXCIsIGZ1bmN0aW9uKHJlcGx5KXtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7IHRhYi5wdXQoR3VuLmlzLmdyYXBoLmlmeShyZXBseS5ib2R5KSwgZnVuY3Rpb24oKXt9LCB7bG9jYWw6IHRydWUsIHBlZXJzOiB7fX0pIH0sMSk7IC8vIGFuZCBmbHVzaCB0aGUgaW4gbWVtb3J5IG5vZGVzIG9mIHRoaXMgZ3JhcGggdG8gbG9jYWxTdG9yYWdlIGFmdGVyIHdlJ3ZlIGhhZCBhIGNoYW5jZSB0byB1bmlvbiBvbiBpdC5cblx0XHRcdFx0fSk7XG5cdFx0XHRcdEd1bi5vYmoubWFwKG9wdC5wZWVycyB8fCBndW4uX18ub3B0LnBlZXJzLCBmdW5jdGlvbihwZWVyLCB1cmwpeyB2YXIgcCA9IHt9O1xuXHRcdFx0XHRcdHRhYi5yZXF1ZXN0KHVybCwgbGV4LCB0YWIucmVxdWVzdC5zW3JvcHQuaGVhZGVycy5pZF0sIHJvcHQpO1xuXHRcdFx0XHRcdGNiLnBlZXJzID0gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHZhciBub2RlID0gZ3VuLl9fLmdyYXBoW3NvdWxdO1xuXHRcdFx0XHRpZihub2RlKXtcblx0XHRcdFx0XHR0YWIucHV0KEd1bi5pcy5ncmFwaC5pZnkobm9kZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHRhYi5wZWVycyhjYik7XG5cdFx0fVxuXHRcdHRhYi5wdXQgPSB0YWIucHV0IHx8IGZ1bmN0aW9uKGdyYXBoLCBjYiwgb3B0KXtcblx0XHRcdGNiID0gY2IgfHwgZnVuY3Rpb24oKXt9O1xuXHRcdFx0b3B0ID0gb3B0IHx8IHt9O1xuXHRcdFx0dmFyIHJvcHQgPSB7fTtcblx0XHRcdChyb3B0LmhlYWRlcnMgPSBHdW4ub2JqLmNvcHkodGFiLmhlYWRlcnMpKS5pZCA9IHRhYi5tc2coKTtcblx0XHRcdEd1bi5pcy5ncmFwaChncmFwaCwgZnVuY3Rpb24obm9kZSwgc291bCl7XG5cdFx0XHRcdGlmKCFndW4uX18uZ3JhcGhbc291bF0peyByZXR1cm4gfVxuXHRcdFx0XHR0YWIuc3RvcmUucHV0KHRhYi5wcmVmaXggKyBzb3VsLCBndW4uX18uZ3JhcGhbc291bF0sIGZ1bmN0aW9uKGVycil7aWYoZXJyKXsgY2Ioe2VycjogZXJyfSkgfX0pO1xuXHRcdFx0fSk7XG5cdFx0XHRpZighKGNiLmxvY2FsID0gb3B0LmxvY2FsKSl7XG5cdFx0XHRcdHRhYi5yZXF1ZXN0LnNbcm9wdC5oZWFkZXJzLmlkXSA9IHRhYi5lcnJvcihjYiwgXCJFcnJvcjogUHV0IGZhaWxlZCFcIik7XG5cdFx0XHRcdEd1bi5vYmoubWFwKG9wdC5wZWVycyB8fCBndW4uX18ub3B0LnBlZXJzLCBmdW5jdGlvbihwZWVyLCB1cmwpe1xuXHRcdFx0XHRcdHRhYi5yZXF1ZXN0KHVybCwgZ3JhcGgsIHRhYi5yZXF1ZXN0LnNbcm9wdC5oZWFkZXJzLmlkXSwgcm9wdCk7XG5cdFx0XHRcdFx0Y2IucGVlcnMgPSB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gdGFiLnBlZXJzKGNiKTtcblx0XHR9XG5cdFx0dGFiLmVycm9yID0gZnVuY3Rpb24oY2IsIGVycm9yLCBmbil7XG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24oZXJyLCByZXBseSl7XG5cdFx0XHRcdHJlcGx5LmJvZHkgPSByZXBseS5ib2R5IHx8IHJlcGx5LmNodW5rIHx8IHJlcGx5LmVuZCB8fCByZXBseS53cml0ZTtcblx0XHRcdFx0aWYoZXJyIHx8ICFyZXBseSB8fCAoZXJyID0gcmVwbHkuYm9keSAmJiByZXBseS5ib2R5LmVycikpe1xuXHRcdFx0XHRcdHJldHVybiBjYih7ZXJyOiBHdW4ubG9nKGVyciB8fCBlcnJvcikgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYoZm4peyBmbihyZXBseSkgfVxuXHRcdFx0XHRjYihudWxsLCByZXBseS5ib2R5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGFiLnBlZXJzID0gZnVuY3Rpb24oY2IsIG8pe1xuXHRcdFx0aWYoR3VuLnRleHQuaXMoY2IpKXsgcmV0dXJuIChvID0ge30pW2NiXSA9IHt9LCBvIH1cblx0XHRcdGlmKGNiICYmICFjYi5wZWVycyl7IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0aWYoIWNiLmxvY2FsKXsgaWYoIUd1bi5sb2cuY291bnQoJ25vLXBlZXJzJykpeyBHdW4ubG9nKFwiV2FybmluZyEgWW91IGhhdmUgbm8gcGVlcnMgdG8gY29ubmVjdCB0byFcIikgfSB9XG5cdFx0XHRcdGlmKCEoY2IuZ3JhcGggfHwgY2Iubm9kZSkpeyBjYihudWxsKSB9XG5cdFx0XHR9LDEpfVxuXHRcdH1cblx0XHR0YWIubXNnID0gdGFiLm1zZyB8fCBmdW5jdGlvbihpZCl7XG5cdFx0XHRpZighaWQpe1xuXHRcdFx0XHRyZXR1cm4gdGFiLm1zZy5kZWJvdW5jZVtpZCA9IEd1bi50ZXh0LnJhbmRvbSg5KV0gPSBHdW4udGltZS5pcygpLCBpZDtcblx0XHRcdH1cblx0XHRcdGNsZWFyVGltZW91dCh0YWIubXNnLmNsZWFyKTtcblx0XHRcdHRhYi5tc2cuY2xlYXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdHZhciBub3cgPSBHdW4udGltZS5pcygpO1xuXHRcdFx0XHRHdW4ub2JqLm1hcCh0YWIubXNnLmRlYm91bmNlLCBmdW5jdGlvbih0LGlkKXtcblx0XHRcdFx0XHRpZihub3cgLSB0IDwgMTAwMCAqIDYwICogNSl7IHJldHVybiB9XG5cdFx0XHRcdFx0R3VuLm9iai5kZWwodGFiLm1zZy5kZWJvdW5jZSwgaWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sNTAwKTtcblx0XHRcdGlmKGlkID0gdGFiLm1zZy5kZWJvdW5jZVtpZF0pe1xuXHRcdFx0XHRyZXR1cm4gdGFiLm1zZy5kZWJvdW5jZVtpZF0gPSBHdW4udGltZS5pcygpLCBpZDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRhYi5tc2cuZGVib3VuY2UgPSB0YWIubXNnLmRlYm91bmNlIHx8IHt9O1xuXHRcdHRhYi5zZXJ2ZXIgPSB0YWIuc2VydmVyIHx8IGZ1bmN0aW9uKHJlcSwgcmVzKXtcblx0XHRcdGlmKCFyZXEgfHwgIXJlcyB8fCAhcmVxLmJvZHkgfHwgIXJlcS5oZWFkZXJzIHx8ICFyZXEuaGVhZGVycy5pZCl7IHJldHVybiB9XG5cdFx0XHRpZih0YWIucmVxdWVzdC5zW3JlcS5oZWFkZXJzLnJpZF0peyByZXR1cm4gdGFiLnJlcXVlc3Quc1tyZXEuaGVhZGVycy5yaWRdKG51bGwsIHJlcSkgfVxuXHRcdFx0aWYodGFiLm1zZyhyZXEuaGVhZGVycy5pZCkpeyByZXR1cm4gfVxuXHRcdFx0Ly8gVE9ETzogUmUtZW1pdCBtZXNzYWdlIHRvIG90aGVyIHBlZXJzIGlmIHdlIGhhdmUgYW55IG5vbi1vdmVybGFwaW5nIG9uZXMuXG5cdFx0XHRpZihyZXEuaGVhZGVycy5yaWQpeyByZXR1cm4gfSAvLyBubyBuZWVkIHRvIHByb2Nlc3Ncblx0XHRcdGlmKEd1bi5pcy5sZXgocmVxLmJvZHkpKXsgcmV0dXJuIHRhYi5zZXJ2ZXIuZ2V0KHJlcSwgcmVzKSB9XG5cdFx0XHRlbHNlIHsgcmV0dXJuIHRhYi5zZXJ2ZXIucHV0KHJlcSwgcmVzKSB9XG5cdFx0fVxuXHRcdHRhYi5zZXJ2ZXIuanNvbiA9ICdhcHBsaWNhdGlvbi9qc29uJztcblx0XHR0YWIuc2VydmVyLnJlZ2V4ID0gZ3VuLl9fLm9wdC5yb3V0ZSA9IGd1bi5fXy5vcHQucm91dGUgfHwgb3B0LnJvdXRlIHx8IC9eXFwvZ3VuL2k7XG5cdFx0dGFiLnNlcnZlci5nZXQgPSBmdW5jdGlvbihyZXEsIGNiKXtcblx0XHRcdHZhciBzb3VsID0gcmVxLmJvZHlbR3VuLl8uc291bF0sIG5vZGU7XG5cdFx0XHRpZighKG5vZGUgPSBndW4uX18uZ3JhcGhbc291bF0pKXsgcmV0dXJuIH1cblx0XHRcdHZhciByZXBseSA9IHtoZWFkZXJzOiB7J0NvbnRlbnQtVHlwZSc6IHRhYi5zZXJ2ZXIuanNvbiwgcmlkOiByZXEuaGVhZGVycy5pZCwgaWQ6IHRhYi5tc2coKX19O1xuXHRcdFx0Y2Ioe2hlYWRlcnM6IHJlcGx5LmhlYWRlcnMsIGJvZHk6IG5vZGV9KTtcblx0XHR9XG5cdFx0dGFiLnNlcnZlci5wdXQgPSBmdW5jdGlvbihyZXEsIGNiKXtcblx0XHRcdHZhciByZXBseSA9IHtoZWFkZXJzOiB7J0NvbnRlbnQtVHlwZSc6IHRhYi5zZXJ2ZXIuanNvbiwgcmlkOiByZXEuaGVhZGVycy5pZCwgaWQ6IHRhYi5tc2coKX19LCBrZWVwO1xuXHRcdFx0aWYoIXJlcS5ib2R5KXsgcmV0dXJuIGNiKHtoZWFkZXJzOiByZXBseS5oZWFkZXJzLCBib2R5OiB7ZXJyOiBcIk5vIGJvZHlcIn19KSB9XG5cdFx0XHRpZighR3VuLm9iai5pcyhyZXEuYm9keSwgZnVuY3Rpb24obm9kZSwgc291bCl7XG5cdFx0XHRcdGlmKGd1bi5fXy5ncmFwaFtzb3VsXSl7IHJldHVybiB0cnVlIH1cblx0XHRcdH0pKXsgcmV0dXJuIH1cblx0XHRcdGlmKHJlcS5lcnIgPSBHdW4udW5pb24oZ3VuLCByZXEuYm9keSwgZnVuY3Rpb24oZXJyLCBjdHgpe1xuXHRcdFx0XHRpZihlcnIpeyByZXR1cm4gY2Ioe2hlYWRlcnM6IHJlcGx5LmhlYWRlcnMsIGJvZHk6IHtlcnI6IGVyciB8fCBcIlVuaW9uIGZhaWxlZC5cIn19KSB9XG5cdFx0XHRcdHZhciBjdHggPSBjdHggfHwge307IGN0eC5ncmFwaCA9IHt9O1xuXHRcdFx0XHRHdW4uaXMuZ3JhcGgocmVxLmJvZHksIGZ1bmN0aW9uKG5vZGUsIHNvdWwpeyBjdHguZ3JhcGhbc291bF0gPSBndW4uX18uZ3JhcGhbc291bF0gfSk7XG5cdFx0XHRcdGd1bi5fXy5vcHQud2lyZS5wdXQoY3R4LmdyYXBoLCBmdW5jdGlvbihlcnIsIG9rKXtcblx0XHRcdFx0XHRpZihlcnIpeyByZXR1cm4gY2Ioe2hlYWRlcnM6IHJlcGx5LmhlYWRlcnMsIGJvZHk6IHtlcnI6IGVyciB8fCBcIkZhaWxlZC5cIn19KSB9XG5cdFx0XHRcdFx0Y2Ioe2hlYWRlcnM6IHJlcGx5LmhlYWRlcnMsIGJvZHk6IHtvazogb2sgfHwgXCJQZXJzaXN0ZWQuXCJ9fSk7XG5cdFx0XHRcdH0sIHtsb2NhbDogdHJ1ZSwgcGVlcnM6IHt9fSk7XG5cdFx0XHR9KS5lcnIpeyBjYih7aGVhZGVyczogcmVwbHkuaGVhZGVycywgYm9keToge2VycjogcmVxLmVyciB8fCBcIlVuaW9uIGZhaWxlZC5cIn19KSB9XG5cdFx0fVxuXHRcdEd1bi5vYmoubWFwKGd1bi5fXy5vcHQucGVlcnMsIGZ1bmN0aW9uKCl7IC8vIG9ubHkgY3JlYXRlIHNlcnZlciBpZiBwZWVycyBhbmQgZG8gaXQgb25jZSBieSByZXR1cm5pbmcgaW1tZWRpYXRlbHkuXG5cdFx0XHRyZXR1cm4gKHRhYi5zZXJ2ZXIuYWJsZSA9IHRhYi5zZXJ2ZXIuYWJsZSB8fCB0YWIucmVxdWVzdC5jcmVhdGVTZXJ2ZXIodGFiLnNlcnZlcikgfHwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0Z3VuLl9fLm9wdC53aXJlLmdldCA9IGd1bi5fXy5vcHQud2lyZS5nZXQgfHwgdGFiLmdldDtcblx0XHRndW4uX18ub3B0LndpcmUucHV0ID0gZ3VuLl9fLm9wdC53aXJlLnB1dCB8fCB0YWIucHV0O1xuXHRcdGd1bi5fXy5vcHQud2lyZS5rZXkgPSBndW4uX18ub3B0LndpcmUua2V5IHx8IHRhYi5rZXk7XG5cblx0XHRUYWIucmVxdWVzdCA9IHRhYi5yZXF1ZXN0O1xuXHRcdEd1bi5UYWIgPSBUYWI7XG5cdH0pO1xuXG59LmJpbmQodGhpcyB8fCBtb2R1bGUpKHt9KSk7XG5cblxuOyhmdW5jdGlvbihUYWIpe1xuXHR2YXIgcmVxdWVzdCA9IChmdW5jdGlvbigpe1xuXHRcdGZ1bmN0aW9uIHIoYmFzZSwgYm9keSwgY2IsIG9wdCl7IG9wdCA9IG9wdCB8fCB7fTtcblx0XHRcdHZhciBvID0gYmFzZS5sZW5ndGg/IHtiYXNlOiBiYXNlfSA6IHt9O1xuXHRcdFx0by5iYXNlID0gb3B0LmJhc2UgfHwgYmFzZTtcblx0XHRcdG8uYm9keSA9IG9wdC5ib2R5IHx8IGJvZHk7XG5cdFx0XHRvLmhlYWRlcnMgPSBvcHQuaGVhZGVycztcblx0XHRcdG8udXJsID0gb3B0LnVybDtcblx0XHRcdGNiID0gY2IgfHwgZnVuY3Rpb24oKXt9O1xuXHRcdFx0aWYoIW8uYmFzZSl7IHJldHVybiB9XG5cdFx0XHRyLnRyYW5zcG9ydChvLCBjYik7XG5cdFx0fVxuXHRcdHIuY3JlYXRlU2VydmVyID0gZnVuY3Rpb24oZm4peyByLmNyZWF0ZVNlcnZlci5zLnB1c2goZm4pIH1cblx0XHRyLmNyZWF0ZVNlcnZlci5pbmcgPSBmdW5jdGlvbihyZXEsIGNiKXtcblx0XHRcdHZhciBpID0gci5jcmVhdGVTZXJ2ZXIucy5sZW5ndGg7XG5cdFx0XHR3aGlsZShpLS0peyAoci5jcmVhdGVTZXJ2ZXIuc1tpXSB8fCBmdW5jdGlvbigpe30pKHJlcSwgY2IpIH1cblx0XHR9XG5cdFx0ci5jcmVhdGVTZXJ2ZXIucyA9IFtdO1xuXHRcdHIuYmFjayA9IDI7IHIuYmFja29mZiA9IDI7IHIuYmFja21heCA9IDIwMDA7XG5cdFx0ci50cmFuc3BvcnQgPSBmdW5jdGlvbihvcHQsIGNiKXtcblx0XHRcdC8vR3VuLmxvZyhcIlRSQU5TUE9SVDpcIiwgb3B0KTtcblx0XHRcdGlmKHIud3Mob3B0LCBjYikpeyByZXR1cm4gfVxuXHRcdFx0ci5qc29ucChvcHQsIGNiKTtcblx0XHR9XG5cblx0XHR2YXIgcXVldWVzID0gci5xdWV1ZXMgPSB7fTtcblxuXHRcdHIud3MgPSBmdW5jdGlvbihvcHQsIGNiKXtcblx0XHRcdHZhciB3cywgV1MgPSByLldlYlNvY2tldCB8fCB3aW5kb3cuV2ViU29ja2V0IHx8IHdpbmRvdy5tb3pXZWJTb2NrZXQgfHwgd2luZG93LndlYmtpdFdlYlNvY2tldDtcblx0XHRcdGlmKCFXUyl7IHJldHVybiB9XG5cblx0XHRcdC8vIFF1ZXVlZCBvZmZsaW5lIHVwZGF0ZXMuXG5cdFx0XHR2YXIgcXVldWUgPSBxdWV1ZXNbb3B0LmJhc2VdO1xuXG5cdFx0XHQvLyBDcmVhdGUgdGhlIHF1ZXVlIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXG5cdFx0XHRpZiAoIXF1ZXVlKSB7XG5cdFx0XHRcdHF1ZXVlID0gcXVldWVzW29wdC5iYXNlXSA9IHt9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgdG8gZGUtZHVwbGljYXRlIHF1ZXVlZCBtZXNzYWdlcy5cblx0XHRcdHZhciByZXFJRCA9ICgob3B0IHx8IHt9KS5oZWFkZXJzIHx8IHt9KS5pZCB8fCBHdW4udGV4dC5yYW5kb20oOSk7XG5cblx0XHRcdHdzID0gci53cy5wZWVyc1tvcHQuYmFzZV07XG5cdFx0XHRpZih3cyAmJiAod3MucmVhZHlTdGF0ZSA8PSB3cy5PUEVOKSl7XG5cdFx0XHRcdGlmKHdzLnJlYWR5U3RhdGUgPT09IHdzLkNPTk5FQ1RJTkcpe1xuXHRcdFx0XHRcdHF1ZXVlW3JlcUlEXSA9IFtvcHQsIGNiXTtcblxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmFyIHJlcSA9IHt9O1xuXHRcdFx0XHRpZihvcHQuaGVhZGVycyl7IHJlcS5oZWFkZXJzID0gb3B0LmhlYWRlcnMgfVxuXHRcdFx0XHRpZihvcHQuYm9keSl7IHJlcS5ib2R5ID0gb3B0LmJvZHkgfVxuXHRcdFx0XHRpZihvcHQudXJsKXsgcmVxLnVybCA9IG9wdC51cmwgfVxuXHRcdFx0XHRyZXEuaGVhZGVycyA9IHJlcS5oZWFkZXJzIHx8IHt9O1xuXHRcdFx0XHRyLndzLmNic1tyZXEuaGVhZGVyc1snd3MtcmlkJ10gPSAnV1MnICsgKCsgbmV3IERhdGUoKSkgKyAnLicgKyBNYXRoLmZsb29yKChNYXRoLnJhbmRvbSgpKjY1NTM1KSsxKV0gPSBmdW5jdGlvbihlcnIscmVzKXtcblx0XHRcdFx0XHRpZihyZXMuYm9keSB8fCByZXMuZW5kKXsgZGVsZXRlIHIud3MuY2JzW3JlcS5oZWFkZXJzWyd3cy1yaWQnXV0gfVxuXHRcdFx0XHRcdGNiKGVycixyZXMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0d3Muc2VuZChKU09OLnN0cmluZ2lmeShyZXEpLGZ1bmN0aW9uKGVycil7fSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZih3cyA9PT0gZmFsc2UpeyByZXR1cm4gfVxuXG5cdFx0XHQvLyBJZiB3ZSd2ZSBtYWRlIGl0IHRoaXMgZmFyLCB0aGUgc29ja2V0IGlzbid0IG9wZW4uXG5cdFx0XHRxdWV1ZVtyZXFJRF0gPSBbb3B0LCBjYl07XG5cblx0XHRcdHRyeXt3cyA9IHIud3MucGVlcnNbb3B0LmJhc2VdID0gbmV3IFdTKG9wdC5iYXNlLnJlcGxhY2UoJ2h0dHAnLCd3cycpKTtcblx0XHRcdH1jYXRjaChlKXt9XG5cblx0XHRcdHdzLm9ub3BlbiA9IGZ1bmN0aW9uKG8pe1xuXG5cdFx0XHRcdC8vIFNlbmQgdGhlIHF1ZXVlZCBtZXNzYWdlcy5cblx0XHRcdFx0ci5lYWNoKHF1ZXVlLCBmdW5jdGlvbiAoZGVmZXJyZWQpIHtcblx0XHRcdFx0XHRyLndzLmFwcGx5KG51bGwsIGRlZmVycmVkKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gQ2xlYXIgdGhlIHF1ZXVlLlxuXHRcdFx0XHRxdWV1ZSA9IHF1ZXVlc1tvcHQuYmFzZV0gPSB7fTtcblxuXHRcdFx0XHQvLyBSZXNldCB0aGUgcmVjb25uZWN0IGJhY2tvZmYuXG5cdFx0XHRcdHIuYmFjayA9IDI7XG5cdFx0XHR9O1xuXG5cdFx0XHR3cy5vbmNsb3NlID0gZnVuY3Rpb24oYyl7XG5cdFx0XHRcdGlmKCFjKXsgcmV0dXJuIH1cblx0XHRcdFx0aWYod3MgJiYgd3MuY2xvc2UgaW5zdGFuY2VvZiBGdW5jdGlvbil7IHdzLmNsb3NlKCkgfVxuXHRcdFx0XHRpZigxMDA2ID09PSBjLmNvZGUpeyAvLyB3ZWJzb2NrZXRzIGNhbm5vdCBiZSB1c2VkXG5cdFx0XHRcdFx0Lyp3cyA9IHIud3MucGVlcnNbb3B0LmJhc2VdID0gZmFsc2U7IC8vIDEwMDYgaGFzIG1peGVkIG1lYW5pbmdzLCB0aGVyZWZvcmUgd2UgY2FuIG5vIGxvbmdlciByZXNwZWN0IGl0LlxuXHRcdFx0XHRcdHIudHJhbnNwb3J0KG9wdCwgY2IpO1xuXHRcdFx0XHRcdHJldHVybjsqL1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdzID0gci53cy5wZWVyc1tvcHQuYmFzZV0gPSBudWxsOyAvLyB0aGlzIHdpbGwgbWFrZSB0aGUgbmV4dCByZXF1ZXN0IHRyeSB0byByZWNvbm5lY3Rcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHIud3Mob3B0LCBmdW5jdGlvbigpe30pOyAvLyBvcHQgaGVyZSBpcyBhIHJhY2UgY29uZGl0aW9uLCBpcyBpdCBub3Q/IERvZXMgdGhpcyBtYXR0ZXI/XG5cdFx0XHRcdH0sIChyLmJhY2sgKj0gci5iYWNrb2ZmKSA+IHIuYmFja21heCA/IChyLmJhY2sgPSByLmJhY2ttYXgpIDogci5iYWNrKTtcblx0XHRcdH07XG5cdFx0XHRpZih0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKXsgd2luZG93Lm9uYmVmb3JldW5sb2FkID0gd3Mub25jbG9zZTsgfVxuXHRcdFx0d3Mub25tZXNzYWdlID0gZnVuY3Rpb24obSl7XG5cdFx0XHRcdGlmKCFtIHx8ICFtLmRhdGEpeyByZXR1cm4gfVxuXHRcdFx0XHR2YXIgcmVzO1xuXHRcdFx0XHR0cnl7cmVzID0gSlNPTi5wYXJzZShtLmRhdGEpO1xuXHRcdFx0XHR9Y2F0Y2goZSl7IHJldHVybiB9XG5cdFx0XHRcdGlmKCFyZXMpeyByZXR1cm4gfVxuXHRcdFx0XHRyZXMuaGVhZGVycyA9IHJlcy5oZWFkZXJzIHx8IHt9O1xuXHRcdFx0XHRpZihyZXMuaGVhZGVyc1snd3MtcmlkJ10peyByZXR1cm4gKHIud3MuY2JzW3Jlcy5oZWFkZXJzWyd3cy1yaWQnXV18fGZ1bmN0aW9uKCl7fSkobnVsbCwgcmVzKSB9XG5cdFx0XHRcdGlmKHJlcy5ib2R5KXsgci5jcmVhdGVTZXJ2ZXIuaW5nKHJlcywgZnVuY3Rpb24ocmVzKXsgcihvcHQuYmFzZSwgbnVsbCwgbnVsbCwgcmVzKX0pIH0gLy8gZW1pdCBleHRyYSBldmVudHMuXG5cdFx0XHR9O1xuXHRcdFx0d3Mub25lcnJvciA9IGZ1bmN0aW9uKGUpeyBjb25zb2xlLmxvZyhlKTsgfTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyLndzLnBlZXJzID0ge307XG5cdFx0ci53cy5jYnMgPSB7fTtcblx0XHRyLmpzb25wID0gZnVuY3Rpb24ob3B0LCBjYil7XG5cdFx0XHRpZih0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiKXtcblx0XHRcdFx0cmV0dXJuIGNiKFwiSlNPTlAgaXMgY3VycmVudGx5IGJyb3dzZXIgb25seS5cIik7XG5cdFx0XHR9XG5cdFx0XHQvL0d1bi5sb2coXCJqc29ucCBzZW5kXCIsIG9wdCk7XG5cdFx0XHRyLmpzb25wLmlmeShvcHQsIGZ1bmN0aW9uKHVybCl7XG5cdFx0XHRcdC8vR3VuLmxvZyh1cmwpO1xuXHRcdFx0XHRpZighdXJsKXsgcmV0dXJuIH1cblx0XHRcdFx0ci5qc29ucC5zZW5kKHVybCwgZnVuY3Rpb24ocmVwbHkpe1xuXHRcdFx0XHRcdC8vR3VuLmxvZyhcImpzb25wIHJlcGx5XCIsIHJlcGx5KTtcblx0XHRcdFx0XHRjYihudWxsLCByZXBseSk7XG5cdFx0XHRcdFx0ci5qc29ucC5wb2xsKG9wdCwgcmVwbHkpO1xuXHRcdFx0XHR9LCBvcHQuanNvbnApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHIuanNvbnAuc2VuZCA9IGZ1bmN0aW9uKHVybCwgY2IsIGlkKXtcblx0XHRcdHZhciBqcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXHRcdFx0anMuc3JjID0gdXJsO1xuXHRcdFx0d2luZG93W2pzLmlkID0gaWRdID0gZnVuY3Rpb24ocmVzKXtcblx0XHRcdFx0Y2IocmVzKTtcblx0XHRcdFx0Y2IuaWQgPSBqcy5pZDtcblx0XHRcdFx0anMucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChqcyk7XG5cdFx0XHRcdHdpbmRvd1tjYi5pZF0gPSBudWxsOyAvLyBUT0RPOiBCVUc6IFRoaXMgbmVlZHMgdG8gaGFuZGxlIGNodW5raW5nIVxuXHRcdFx0XHR0cnl7ZGVsZXRlIHdpbmRvd1tjYi5pZF07XG5cdFx0XHRcdH1jYXRjaChlKXt9XG5cdFx0XHR9XG5cdFx0XHRqcy5hc3luYyA9IHRydWU7XG5cdFx0XHRkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdLmFwcGVuZENoaWxkKGpzKTtcblx0XHRcdHJldHVybiBqcztcblx0XHR9XG5cdFx0ci5qc29ucC5wb2xsID0gZnVuY3Rpb24ob3B0LCByZXMpe1xuXHRcdFx0aWYoIW9wdCB8fCAhb3B0LmJhc2UgfHwgIXJlcyB8fCAhcmVzLmhlYWRlcnMgfHwgIXJlcy5oZWFkZXJzLnBvbGwpeyByZXR1cm4gfVxuXHRcdFx0KHIuanNvbnAucG9sbC5zID0gci5qc29ucC5wb2xsLnMgfHwge30pW29wdC5iYXNlXSA9IHIuanNvbnAucG9sbC5zW29wdC5iYXNlXSB8fCBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7IC8vIFRPRE86IE5lZWQgdG8gb3B0aW1pemUgZm9yIENocm9tZSdzIDYgcmVxIGxpbWl0P1xuXHRcdFx0XHQvL0d1bi5sb2coXCJwb2xsaW5nIGFnYWluXCIpO1xuXHRcdFx0XHR2YXIgbyA9IHtiYXNlOiBvcHQuYmFzZSwgaGVhZGVyczoge3B1bGw6IDF9fTtcblx0XHRcdFx0ci5lYWNoKG9wdC5oZWFkZXJzLCBmdW5jdGlvbih2LGkpeyBvLmhlYWRlcnNbaV0gPSB2IH0pXG5cdFx0XHRcdHIuanNvbnAobywgZnVuY3Rpb24oZXJyLCByZXBseSl7XG5cdFx0XHRcdFx0ZGVsZXRlIHIuanNvbnAucG9sbC5zW29wdC5iYXNlXTtcblx0XHRcdFx0XHR3aGlsZShyZXBseS5ib2R5ICYmIHJlcGx5LmJvZHkubGVuZ3RoICYmIHJlcGx5LmJvZHkuc2hpZnQpeyAvLyB3ZSdyZSBhc3N1bWluZyBhbiBhcnJheSByYXRoZXIgdGhhbiBjaHVuayBlbmNvZGluZy4gOihcblx0XHRcdFx0XHRcdHZhciByZXMgPSByZXBseS5ib2R5LnNoaWZ0KCk7XG5cdFx0XHRcdFx0XHQvL0d1bi5sb2coXCItLSBnbyBnbyBnb1wiLCByZXMpO1xuXHRcdFx0XHRcdFx0aWYocmVzICYmIHJlcy5ib2R5KXsgci5jcmVhdGVTZXJ2ZXIuaW5nKHJlcywgZnVuY3Rpb24oKXsgcihvcHQuYmFzZSwgbnVsbCwgbnVsbCwgcmVzKSB9KSB9IC8vIGVtaXQgZXh0cmEgZXZlbnRzLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LCByZXMuaGVhZGVycy5wb2xsKTtcblx0XHR9XG5cdFx0ci5qc29ucC5pZnkgPSBmdW5jdGlvbihvcHQsIGNiKXtcblx0XHRcdHZhciB1cmkgPSBlbmNvZGVVUklDb21wb25lbnQsIHEgPSAnPyc7XG5cdFx0XHRpZihvcHQudXJsICYmIG9wdC51cmwucGF0aG5hbWUpeyBxID0gb3B0LnVybC5wYXRobmFtZSArIHE7IH1cblx0XHRcdHEgPSBvcHQuYmFzZSArIHE7XG5cdFx0XHRyLmVhY2goKG9wdC51cmx8fHt9KS5xdWVyeSwgZnVuY3Rpb24odiwgaSl7IHEgKz0gdXJpKGkpICsgJz0nICsgdXJpKHYpICsgJyYnIH0pO1xuXHRcdFx0aWYob3B0LmhlYWRlcnMpeyBxICs9IHVyaSgnYCcpICsgJz0nICsgdXJpKEpTT04uc3RyaW5naWZ5KG9wdC5oZWFkZXJzKSkgKyAnJicgfVxuXHRcdFx0aWYoci5qc29ucC5tYXggPCBxLmxlbmd0aCl7IHJldHVybiBjYigpIH1cblx0XHRcdHEgKz0gdXJpKCdqc29ucCcpICsgJz0nICsgdXJpKG9wdC5qc29ucCA9ICdQJytNYXRoLmZsb29yKChNYXRoLnJhbmRvbSgpKjY1NTM1KSsxKSk7XG5cdFx0XHRpZihvcHQuYm9keSl7XG5cdFx0XHRcdHEgKz0gJyYnO1xuXHRcdFx0XHR2YXIgdyA9IG9wdC5ib2R5LCB3bHMgPSBmdW5jdGlvbih3LGwscyl7XG5cdFx0XHRcdFx0cmV0dXJuIHVyaSgnJScpICsgJz0nICsgdXJpKHcrJy0nKyhsfHx3KSsnLycrKHN8fHcpKSAgKyAnJicgKyB1cmkoJyQnKSArICc9Jztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZih0eXBlb2YgdyAhPSAnc3RyaW5nJyl7XG5cdFx0XHRcdFx0dyA9IEpTT04uc3RyaW5naWZ5KHcpO1xuXHRcdFx0XHRcdHEgKz0gdXJpKCdeJykgKyAnPScgKyB1cmkoJ2pzb24nKSArICcmJztcblx0XHRcdFx0fVxuXHRcdFx0XHR3ID0gdXJpKHcpO1xuXHRcdFx0XHR2YXIgaSA9IDAsIGwgPSB3Lmxlbmd0aFxuXHRcdFx0XHQsIHMgPSByLmpzb25wLm1heCAtIChxLmxlbmd0aCArIHdscyhsLnRvU3RyaW5nKCkpLmxlbmd0aCk7XG5cdFx0XHRcdGlmKHMgPCAwKXsgcmV0dXJuIGNiKCkgfVxuXHRcdFx0XHR3aGlsZSh3KXtcblx0XHRcdFx0XHRjYihxICsgd2xzKGksIChpID0gaSArIHMpLCBsKSArIHcuc2xpY2UoMCwgaSkpO1xuXHRcdFx0XHRcdHcgPSB3LnNsaWNlKGkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjYihxKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ci5qc29ucC5tYXggPSAyMDAwO1xuXHRcdHIuZWFjaCA9IGZ1bmN0aW9uKG9iaiwgY2Ipe1xuXHRcdFx0aWYoIW9iaiB8fCAhY2IpeyByZXR1cm4gfVxuXHRcdFx0Zm9yKHZhciBpIGluIG9iail7XG5cdFx0XHRcdGlmKG9iai5oYXNPd25Qcm9wZXJ0eShpKSl7XG5cdFx0XHRcdFx0Y2Iob2JqW2ldLCBpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcjtcblx0fSgpKTtcblx0aWYodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIil7IEd1bi5yZXF1ZXN0ID0gcmVxdWVzdCB9XG5cdGlmKHR5cGVvZiBtb2R1bGUgIT09IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMpeyBtb2R1bGUuZXhwb3J0cy5yZXF1ZXN0ID0gcmVxdWVzdCB9XG59LmJpbmQodGhpcyB8fCBtb2R1bGUpKHt9KSk7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjEuNCAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnbG9kYXNoLmlzYXJndW1lbnRzJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC5pc2FycmF5Jyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxuLyoqXG4gKiBVc2VkIGFzIHRoZSBbbWF4aW11bSBsZW5ndGhdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW51bWJlci5tYXhfc2FmZV9pbnRlZ2VyKVxuICogb2YgYW4gYXJyYXktbGlrZSB2YWx1ZS5cbiAqL1xudmFyIE1BWF9TQUZFX0lOVEVHRVIgPSA5MDA3MTk5MjU0NzQwOTkxO1xuXG4vKipcbiAqIEFwcGVuZHMgdGhlIGVsZW1lbnRzIG9mIGB2YWx1ZXNgIHRvIGBhcnJheWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBtb2RpZnkuXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXMgVGhlIHZhbHVlcyB0byBhcHBlbmQuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYGFycmF5YC5cbiAqL1xuZnVuY3Rpb24gYXJyYXlQdXNoKGFycmF5LCB2YWx1ZXMpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoLFxuICAgICAgb2Zmc2V0ID0gYXJyYXkubGVuZ3RoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgYXJyYXlbb2Zmc2V0ICsgaW5kZXhdID0gdmFsdWVzW2luZGV4XTtcbiAgfVxuICByZXR1cm4gYXJyYXk7XG59XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uZmxhdHRlbmAgd2l0aCBhZGRlZCBzdXBwb3J0IGZvciByZXN0cmljdGluZ1xuICogZmxhdHRlbmluZyBhbmQgc3BlY2lmeWluZyB0aGUgc3RhcnQgaW5kZXguXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBmbGF0dGVuLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNEZWVwXSBTcGVjaWZ5IGEgZGVlcCBmbGF0dGVuLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNTdHJpY3RdIFJlc3RyaWN0IGZsYXR0ZW5pbmcgdG8gYXJyYXlzLWxpa2Ugb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtyZXN1bHQ9W11dIFRoZSBpbml0aWFsIHJlc3VsdCB2YWx1ZS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGZsYXR0ZW5lZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYmFzZUZsYXR0ZW4oYXJyYXksIGlzRGVlcCwgaXNTdHJpY3QsIHJlc3VsdCkge1xuICByZXN1bHQgfHwgKHJlc3VsdCA9IFtdKTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciB2YWx1ZSA9IGFycmF5W2luZGV4XTtcbiAgICBpZiAoaXNPYmplY3RMaWtlKHZhbHVlKSAmJiBpc0FycmF5TGlrZSh2YWx1ZSkgJiZcbiAgICAgICAgKGlzU3RyaWN0IHx8IGlzQXJyYXkodmFsdWUpIHx8IGlzQXJndW1lbnRzKHZhbHVlKSkpIHtcbiAgICAgIGlmIChpc0RlZXApIHtcbiAgICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBhcnJheXMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKS5cbiAgICAgICAgYmFzZUZsYXR0ZW4odmFsdWUsIGlzRGVlcCwgaXNTdHJpY3QsIHJlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhcnJheVB1c2gocmVzdWx0LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaXNTdHJpY3QpIHtcbiAgICAgIHJlc3VsdFtyZXN1bHQubGVuZ3RoXSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLnByb3BlcnR5YCB3aXRob3V0IHN1cHBvcnQgZm9yIGRlZXAgcGF0aHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIGtleSBvZiB0aGUgcHJvcGVydHkgdG8gZ2V0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGJhc2VQcm9wZXJ0eShrZXkpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgPT0gbnVsbCA/IHVuZGVmaW5lZCA6IG9iamVjdFtrZXldO1xuICB9O1xufVxuXG4vKipcbiAqIEdldHMgdGhlIFwibGVuZ3RoXCIgcHJvcGVydHkgdmFsdWUgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIFRoaXMgZnVuY3Rpb24gaXMgdXNlZCB0byBhdm9pZCBhIFtKSVQgYnVnXShodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9MTQyNzkyKVxuICogdGhhdCBhZmZlY3RzIFNhZmFyaSBvbiBhdCBsZWFzdCBpT1MgOC4xLTguMyBBUk02NC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIFwibGVuZ3RoXCIgdmFsdWUuXG4gKi9cbnZhciBnZXRMZW5ndGggPSBiYXNlUHJvcGVydHkoJ2xlbmd0aCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGFycmF5LWxpa2UuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYXJyYXktbGlrZSwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBpc0FycmF5TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiBpc0xlbmd0aChnZXRMZW5ndGgodmFsdWUpKTtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGFycmF5LWxpa2UgbGVuZ3RoLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIGlzIGJhc2VkIG9uIFtgVG9MZW5ndGhgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy10b2xlbmd0aCkuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBsZW5ndGgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyAmJiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDw9IE1BWF9TQUZFX0lOVEVHRVI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZsYXR0ZW47XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuMyAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNiBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE2IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYGJhc2VGb3JJbmAgYW5kIGBiYXNlRm9yT3duYCB3aGljaCBpdGVyYXRlc1xuICogb3ZlciBgb2JqZWN0YCBwcm9wZXJ0aWVzIHJldHVybmVkIGJ5IGBrZXlzRnVuY2AgaW52b2tpbmcgYGl0ZXJhdGVlYCBmb3JcbiAqIGVhY2ggcHJvcGVydHkuIEl0ZXJhdGVlIGZ1bmN0aW9ucyBtYXkgZXhpdCBpdGVyYXRpb24gZWFybHkgYnkgZXhwbGljaXRseVxuICogcmV0dXJuaW5nIGBmYWxzZWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHtGdW5jdGlvbn0ga2V5c0Z1bmMgVGhlIGZ1bmN0aW9uIHRvIGdldCB0aGUga2V5cyBvZiBgb2JqZWN0YC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKi9cbnZhciBiYXNlRm9yID0gY3JlYXRlQmFzZUZvcigpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBiYXNlIGZ1bmN0aW9uIGZvciBtZXRob2RzIGxpa2UgYF8uZm9ySW5gLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtmcm9tUmlnaHRdIFNwZWNpZnkgaXRlcmF0aW5nIGZyb20gcmlnaHQgdG8gbGVmdC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGJhc2UgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUJhc2VGb3IoZnJvbVJpZ2h0KSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QsIGl0ZXJhdGVlLCBrZXlzRnVuYykge1xuICAgIHZhciBpbmRleCA9IC0xLFxuICAgICAgICBpdGVyYWJsZSA9IE9iamVjdChvYmplY3QpLFxuICAgICAgICBwcm9wcyA9IGtleXNGdW5jKG9iamVjdCksXG4gICAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aDtcblxuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgdmFyIGtleSA9IHByb3BzW2Zyb21SaWdodCA/IGxlbmd0aCA6ICsraW5kZXhdO1xuICAgICAgaWYgKGl0ZXJhdGVlKGl0ZXJhYmxlW2tleV0sIGtleSwgaXRlcmFibGUpID09PSBmYWxzZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlRm9yO1xuIiwiLyoqXG4gKiBsb2Rhc2ggMy4xLjAgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE1IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pbmRleE9mYCB3aXRob3V0IHN1cHBvcnQgZm9yIGJpbmFyeSBzZWFyY2hlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHNlYXJjaC5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0ge251bWJlcn0gZnJvbUluZGV4IFRoZSBpbmRleCB0byBzZWFyY2ggZnJvbS5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXRjaGVkIHZhbHVlLCBlbHNlIGAtMWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJbmRleE9mKGFycmF5LCB2YWx1ZSwgZnJvbUluZGV4KSB7XG4gIGlmICh2YWx1ZSAhPT0gdmFsdWUpIHtcbiAgICByZXR1cm4gaW5kZXhPZk5hTihhcnJheSwgZnJvbUluZGV4KTtcbiAgfVxuICB2YXIgaW5kZXggPSBmcm9tSW5kZXggLSAxLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgaWYgKGFycmF5W2luZGV4XSA9PT0gdmFsdWUpIHtcbiAgICAgIHJldHVybiBpbmRleDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufVxuXG4vKipcbiAqIEdldHMgdGhlIGluZGV4IGF0IHdoaWNoIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGBOYU5gIGlzIGZvdW5kIGluIGBhcnJheWAuXG4gKiBJZiBgZnJvbVJpZ2h0YCBpcyBwcm92aWRlZCBlbGVtZW50cyBvZiBgYXJyYXlgIGFyZSBpdGVyYXRlZCBmcm9tIHJpZ2h0IHRvIGxlZnQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBzZWFyY2guXG4gKiBAcGFyYW0ge251bWJlcn0gZnJvbUluZGV4IFRoZSBpbmRleCB0byBzZWFyY2ggZnJvbS5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2Zyb21SaWdodF0gU3BlY2lmeSBpdGVyYXRpbmcgZnJvbSByaWdodCB0byBsZWZ0LlxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1hdGNoZWQgYE5hTmAsIGVsc2UgYC0xYC5cbiAqL1xuZnVuY3Rpb24gaW5kZXhPZk5hTihhcnJheSwgZnJvbUluZGV4LCBmcm9tUmlnaHQpIHtcbiAgdmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIGluZGV4ID0gZnJvbUluZGV4ICsgKGZyb21SaWdodCA/IDAgOiAtMSk7XG5cbiAgd2hpbGUgKChmcm9tUmlnaHQgPyBpbmRleC0tIDogKytpbmRleCA8IGxlbmd0aCkpIHtcbiAgICB2YXIgb3RoZXIgPSBhcnJheVtpbmRleF07XG4gICAgaWYgKG90aGVyICE9PSBvdGhlcikge1xuICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUluZGV4T2Y7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuMyAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VJbmRleE9mID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlaW5kZXhvZicpLFxuICAgIGNhY2hlSW5kZXhPZiA9IHJlcXVpcmUoJ2xvZGFzaC5fY2FjaGVpbmRleG9mJyksXG4gICAgY3JlYXRlQ2FjaGUgPSByZXF1aXJlKCdsb2Rhc2guX2NyZWF0ZWNhY2hlJyk7XG5cbi8qKiBVc2VkIGFzIHRoZSBzaXplIHRvIGVuYWJsZSBsYXJnZSBhcnJheSBvcHRpbWl6YXRpb25zLiAqL1xudmFyIExBUkdFX0FSUkFZX1NJWkUgPSAyMDA7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8udW5pcWAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzXG4gKiBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpbnNwZWN0LlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2l0ZXJhdGVlXSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBuZXcgZHVwbGljYXRlLXZhbHVlLWZyZWUgYXJyYXkuXG4gKi9cbmZ1bmN0aW9uIGJhc2VVbmlxKGFycmF5LCBpdGVyYXRlZSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGluZGV4T2YgPSBiYXNlSW5kZXhPZixcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIGlzQ29tbW9uID0gdHJ1ZSxcbiAgICAgIGlzTGFyZ2UgPSBpc0NvbW1vbiAmJiBsZW5ndGggPj0gTEFSR0VfQVJSQVlfU0laRSxcbiAgICAgIHNlZW4gPSBpc0xhcmdlID8gY3JlYXRlQ2FjaGUoKSA6IG51bGwsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICBpZiAoc2Vlbikge1xuICAgIGluZGV4T2YgPSBjYWNoZUluZGV4T2Y7XG4gICAgaXNDb21tb24gPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICBpc0xhcmdlID0gZmFsc2U7XG4gICAgc2VlbiA9IGl0ZXJhdGVlID8gW10gOiByZXN1bHQ7XG4gIH1cbiAgb3V0ZXI6XG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdLFxuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlID8gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBhcnJheSkgOiB2YWx1ZTtcblxuICAgIGlmIChpc0NvbW1vbiAmJiB2YWx1ZSA9PT0gdmFsdWUpIHtcbiAgICAgIHZhciBzZWVuSW5kZXggPSBzZWVuLmxlbmd0aDtcbiAgICAgIHdoaWxlIChzZWVuSW5kZXgtLSkge1xuICAgICAgICBpZiAoc2VlbltzZWVuSW5kZXhdID09PSBjb21wdXRlZCkge1xuICAgICAgICAgIGNvbnRpbnVlIG91dGVyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaXRlcmF0ZWUpIHtcbiAgICAgICAgc2Vlbi5wdXNoKGNvbXB1dGVkKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoaW5kZXhPZihzZWVuLCBjb21wdXRlZCwgMCkgPCAwKSB7XG4gICAgICBpZiAoaXRlcmF0ZWUgfHwgaXNMYXJnZSkge1xuICAgICAgICBzZWVuLnB1c2goY29tcHV0ZWQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VVbmlxO1xuIiwiLyoqXG4gKiBsb2Rhc2ggMy4wLjEgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE1IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VDYWxsYmFja2Agd2hpY2ggb25seSBzdXBwb3J0cyBgdGhpc2AgYmluZGluZ1xuICogYW5kIHNwZWNpZnlpbmcgdGhlIG51bWJlciBvZiBhcmd1bWVudHMgdG8gcHJvdmlkZSB0byBgZnVuY2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGJpbmQuXG4gKiBAcGFyYW0geyp9IHRoaXNBcmcgVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBmdW5jYC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbYXJnQ291bnRdIFRoZSBudW1iZXIgb2YgYXJndW1lbnRzIHRvIHByb3ZpZGUgdG8gYGZ1bmNgLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBjYWxsYmFjay5cbiAqL1xuZnVuY3Rpb24gYmluZENhbGxiYWNrKGZ1bmMsIHRoaXNBcmcsIGFyZ0NvdW50KSB7XG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGlkZW50aXR5O1xuICB9XG4gIGlmICh0aGlzQXJnID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZnVuYztcbiAgfVxuICBzd2l0Y2ggKGFyZ0NvdW50KSB7XG4gICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgdmFsdWUpO1xuICAgIH07XG4gICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfTtcbiAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH07XG4gICAgY2FzZSA1OiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyLCBrZXksIG9iamVjdCwgc291cmNlKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBvdGhlciwga2V5LCBvYmplY3QsIHNvdXJjZSk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpc0FyZywgYXJndW1lbnRzKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBUaGlzIG1ldGhvZCByZXR1cm5zIHRoZSBmaXJzdCBhcmd1bWVudCBwcm92aWRlZCB0byBpdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdHlcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgQW55IHZhbHVlLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgYHZhbHVlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIG9iamVjdCA9IHsgJ3VzZXInOiAnZnJlZCcgfTtcbiAqXG4gKiBfLmlkZW50aXR5KG9iamVjdCkgPT09IG9iamVjdDtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaWRlbnRpdHkodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJpbmRDYWxsYmFjaztcbiIsIi8qKlxuICogbG9kYXNoIDMuMC4yIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kZXJuIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgaW4gYGNhY2hlYCBtaW1pY2tpbmcgdGhlIHJldHVybiBzaWduYXR1cmUgb2ZcbiAqIGBfLmluZGV4T2ZgIGJ5IHJldHVybmluZyBgMGAgaWYgdGhlIHZhbHVlIGlzIGZvdW5kLCBlbHNlIGAtMWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBjYWNoZSBUaGUgY2FjaGUgdG8gc2VhcmNoLlxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gc2VhcmNoIGZvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgYDBgIGlmIGB2YWx1ZWAgaXMgZm91bmQsIGVsc2UgYC0xYC5cbiAqL1xuZnVuY3Rpb24gY2FjaGVJbmRleE9mKGNhY2hlLCB2YWx1ZSkge1xuICB2YXIgZGF0YSA9IGNhY2hlLmRhdGEsXG4gICAgICByZXN1bHQgPSAodHlwZW9mIHZhbHVlID09ICdzdHJpbmcnIHx8IGlzT2JqZWN0KHZhbHVlKSkgPyBkYXRhLnNldC5oYXModmFsdWUpIDogZGF0YS5oYXNoW3ZhbHVlXTtcblxuICByZXR1cm4gcmVzdWx0ID8gMCA6IC0xO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBbbGFuZ3VhZ2UgdHlwZV0oaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4OCkgb2YgYE9iamVjdGAuXG4gKiAoZS5nLiBhcnJheXMsIGZ1bmN0aW9ucywgb2JqZWN0cywgcmVnZXhlcywgYG5ldyBOdW1iZXIoMClgLCBhbmQgYG5ldyBTdHJpbmcoJycpYClcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KDEpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgLy8gQXZvaWQgYSBWOCBKSVQgYnVnIGluIENocm9tZSAxOS0yMC5cbiAgLy8gU2VlIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxIGZvciBtb3JlIGRldGFpbHMuXG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNhY2hlSW5kZXhPZjtcbiIsIi8qKlxuICogbG9kYXNoIDMuMS4yIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kZXJuIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgZ2V0TmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9nZXRuYXRpdmUnKTtcblxuLyoqIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBTZXQgPSBnZXROYXRpdmUoZ2xvYmFsLCAnU2V0Jyk7XG5cbi8qIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlQ3JlYXRlID0gZ2V0TmF0aXZlKE9iamVjdCwgJ2NyZWF0ZScpO1xuXG4vKipcbiAqXG4gKiBDcmVhdGVzIGEgY2FjaGUgb2JqZWN0IHRvIHN0b3JlIHVuaXF1ZSB2YWx1ZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IFt2YWx1ZXNdIFRoZSB2YWx1ZXMgdG8gY2FjaGUuXG4gKi9cbmZ1bmN0aW9uIFNldENhY2hlKHZhbHVlcykge1xuICB2YXIgbGVuZ3RoID0gdmFsdWVzID8gdmFsdWVzLmxlbmd0aCA6IDA7XG5cbiAgdGhpcy5kYXRhID0geyAnaGFzaCc6IG5hdGl2ZUNyZWF0ZShudWxsKSwgJ3NldCc6IG5ldyBTZXQgfTtcbiAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgdGhpcy5wdXNoKHZhbHVlc1tsZW5ndGhdKTtcbiAgfVxufVxuXG4vKipcbiAqIEFkZHMgYHZhbHVlYCB0byB0aGUgY2FjaGUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBuYW1lIHB1c2hcbiAqIEBtZW1iZXJPZiBTZXRDYWNoZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2FjaGUuXG4gKi9cbmZ1bmN0aW9uIGNhY2hlUHVzaCh2YWx1ZSkge1xuICB2YXIgZGF0YSA9IHRoaXMuZGF0YTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PSAnc3RyaW5nJyB8fCBpc09iamVjdCh2YWx1ZSkpIHtcbiAgICBkYXRhLnNldC5hZGQodmFsdWUpO1xuICB9IGVsc2Uge1xuICAgIGRhdGEuaGFzaFt2YWx1ZV0gPSB0cnVlO1xuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIGBTZXRgIGNhY2hlIG9iamVjdCB0byBvcHRpbWl6ZSBsaW5lYXIgc2VhcmNoZXMgb2YgbGFyZ2UgYXJyYXlzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBbdmFsdWVzXSBUaGUgdmFsdWVzIHRvIGNhY2hlLlxuICogQHJldHVybnMge251bGx8T2JqZWN0fSBSZXR1cm5zIHRoZSBuZXcgY2FjaGUgb2JqZWN0IGlmIGBTZXRgIGlzIHN1cHBvcnRlZCwgZWxzZSBgbnVsbGAuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUNhY2hlKHZhbHVlcykge1xuICByZXR1cm4gKG5hdGl2ZUNyZWF0ZSAmJiBTZXQpID8gbmV3IFNldENhY2hlKHZhbHVlcykgOiBudWxsO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBbbGFuZ3VhZ2UgdHlwZV0oaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4OCkgb2YgYE9iamVjdGAuXG4gKiAoZS5nLiBhcnJheXMsIGZ1bmN0aW9ucywgb2JqZWN0cywgcmVnZXhlcywgYG5ldyBOdW1iZXIoMClgLCBhbmQgYG5ldyBTdHJpbmcoJycpYClcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KDEpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgLy8gQXZvaWQgYSBWOCBKSVQgYnVnIGluIENocm9tZSAxOS0yMC5cbiAgLy8gU2VlIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxIGZvciBtb3JlIGRldGFpbHMuXG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG4vLyBBZGQgZnVuY3Rpb25zIHRvIHRoZSBgU2V0YCBjYWNoZS5cblNldENhY2hlLnByb3RvdHlwZS5wdXNoID0gY2FjaGVQdXNoO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNhY2hlO1xuIiwiLyoqXG4gKiBsb2Rhc2ggMy45LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE1IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNUYWcgPSAnW29iamVjdCBGdW5jdGlvbl0nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgaG9zdCBjb25zdHJ1Y3RvcnMgKFNhZmFyaSA+IDUpLiAqL1xudmFyIHJlSXNIb3N0Q3RvciA9IC9eXFxbb2JqZWN0IC4rP0NvbnN0cnVjdG9yXFxdJC87XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9ucy4gKi9cbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgaWYgYSBtZXRob2QgaXMgbmF0aXZlLiAqL1xudmFyIHJlSXNOYXRpdmUgPSBSZWdFeHAoJ14nICtcbiAgZm5Ub1N0cmluZy5jYWxsKGhhc093blByb3BlcnR5KS5yZXBsYWNlKC9bXFxcXF4kLiorPygpW1xcXXt9fF0vZywgJ1xcXFwkJicpXG4gIC5yZXBsYWNlKC9oYXNPd25Qcm9wZXJ0eXwoZnVuY3Rpb24pLio/KD89XFxcXFxcKCl8IGZvciAuKz8oPz1cXFxcXFxdKS9nLCAnJDEuKj8nKSArICckJ1xuKTtcblxuLyoqXG4gKiBHZXRzIHRoZSBuYXRpdmUgZnVuY3Rpb24gYXQgYGtleWAgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIGtleSBvZiB0aGUgbWV0aG9kIHRvIGdldC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBmdW5jdGlvbiBpZiBpdCdzIG5hdGl2ZSwgZWxzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gZ2V0TmF0aXZlKG9iamVjdCwga2V5KSB7XG4gIHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0W2tleV07XG4gIHJldHVybiBpc05hdGl2ZSh2YWx1ZSkgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgYEZ1bmN0aW9uYCBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGNvcnJlY3RseSBjbGFzc2lmaWVkLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGdW5jdGlvbihfKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oL2FiYy8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICAvLyBUaGUgdXNlIG9mIGBPYmplY3QjdG9TdHJpbmdgIGF2b2lkcyBpc3N1ZXMgd2l0aCB0aGUgYHR5cGVvZmAgb3BlcmF0b3JcbiAgLy8gaW4gb2xkZXIgdmVyc2lvbnMgb2YgQ2hyb21lIGFuZCBTYWZhcmkgd2hpY2ggcmV0dXJuICdmdW5jdGlvbicgZm9yIHJlZ2V4ZXNcbiAgLy8gYW5kIFNhZmFyaSA4IGVxdWl2YWxlbnRzIHdoaWNoIHJldHVybiAnb2JqZWN0JyBmb3IgdHlwZWQgYXJyYXkgY29uc3RydWN0b3JzLlxuICByZXR1cm4gaXNPYmplY3QodmFsdWUpICYmIG9ialRvU3RyaW5nLmNhbGwodmFsdWUpID09IGZ1bmNUYWc7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIFtsYW5ndWFnZSB0eXBlXShodHRwczovL2VzNS5naXRodWIuaW8vI3g4KSBvZiBgT2JqZWN0YC5cbiAqIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoMSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAvLyBBdm9pZCBhIFY4IEpJVCBidWcgaW4gQ2hyb21lIDE5LTIwLlxuICAvLyBTZWUgaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTIyOTEgZm9yIG1vcmUgZGV0YWlscy5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIHJldHVybiAhIXZhbHVlICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNOYXRpdmUoQXJyYXkucHJvdG90eXBlLnB1c2gpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNOYXRpdmUoXyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc05hdGl2ZSh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICByZXR1cm4gcmVJc05hdGl2ZS50ZXN0KGZuVG9TdHJpbmcuY2FsbCh2YWx1ZSkpO1xuICB9XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIHJlSXNIb3N0Q3Rvci50ZXN0KHZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXROYXRpdmU7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNiBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE2IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIGRldGVybWluZSBpZiB2YWx1ZXMgYXJlIG9mIHRoZSBsYW5ndWFnZSB0eXBlIGBPYmplY3RgLiAqL1xudmFyIG9iamVjdFR5cGVzID0ge1xuICAnZnVuY3Rpb24nOiB0cnVlLFxuICAnb2JqZWN0JzogdHJ1ZVxufTtcblxuLyoqIERldGVjdCBmcmVlIHZhcmlhYmxlIGBleHBvcnRzYC4gKi9cbnZhciBmcmVlRXhwb3J0cyA9IChvYmplY3RUeXBlc1t0eXBlb2YgZXhwb3J0c10gJiYgZXhwb3J0cyAmJiAhZXhwb3J0cy5ub2RlVHlwZSlcbiAgPyBleHBvcnRzXG4gIDogdW5kZWZpbmVkO1xuXG4vKiogRGV0ZWN0IGZyZWUgdmFyaWFibGUgYG1vZHVsZWAuICovXG52YXIgZnJlZU1vZHVsZSA9IChvYmplY3RUeXBlc1t0eXBlb2YgbW9kdWxlXSAmJiBtb2R1bGUgJiYgIW1vZHVsZS5ub2RlVHlwZSlcbiAgPyBtb2R1bGVcbiAgOiB1bmRlZmluZWQ7XG5cbi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgZ2xvYmFsYCBmcm9tIE5vZGUuanMuICovXG52YXIgZnJlZUdsb2JhbCA9IGNoZWNrR2xvYmFsKGZyZWVFeHBvcnRzICYmIGZyZWVNb2R1bGUgJiYgdHlwZW9mIGdsb2JhbCA9PSAnb2JqZWN0JyAmJiBnbG9iYWwpO1xuXG4vKiogRGV0ZWN0IGZyZWUgdmFyaWFibGUgYHNlbGZgLiAqL1xudmFyIGZyZWVTZWxmID0gY2hlY2tHbG9iYWwob2JqZWN0VHlwZXNbdHlwZW9mIHNlbGZdICYmIHNlbGYpO1xuXG4vKiogRGV0ZWN0IGZyZWUgdmFyaWFibGUgYHdpbmRvd2AuICovXG52YXIgZnJlZVdpbmRvdyA9IGNoZWNrR2xvYmFsKG9iamVjdFR5cGVzW3R5cGVvZiB3aW5kb3ddICYmIHdpbmRvdyk7XG5cbi8qKiBEZXRlY3QgYHRoaXNgIGFzIHRoZSBnbG9iYWwgb2JqZWN0LiAqL1xudmFyIHRoaXNHbG9iYWwgPSBjaGVja0dsb2JhbChvYmplY3RUeXBlc1t0eXBlb2YgdGhpc10gJiYgdGhpcyk7XG5cbi8qKlxuICogVXNlZCBhcyBhIHJlZmVyZW5jZSB0byB0aGUgZ2xvYmFsIG9iamVjdC5cbiAqXG4gKiBUaGUgYHRoaXNgIHZhbHVlIGlzIHVzZWQgaWYgaXQncyB0aGUgZ2xvYmFsIG9iamVjdCB0byBhdm9pZCBHcmVhc2Vtb25rZXknc1xuICogcmVzdHJpY3RlZCBgd2luZG93YCBvYmplY3QsIG90aGVyd2lzZSB0aGUgYHdpbmRvd2Agb2JqZWN0IGlzIHVzZWQuXG4gKi9cbnZhciByb290ID0gZnJlZUdsb2JhbCB8fFxuICAoKGZyZWVXaW5kb3cgIT09ICh0aGlzR2xvYmFsICYmIHRoaXNHbG9iYWwud2luZG93KSkgJiYgZnJlZVdpbmRvdykgfHxcbiAgICBmcmVlU2VsZiB8fCB0aGlzR2xvYmFsIHx8IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBnbG9iYWwgb2JqZWN0LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtudWxsfE9iamVjdH0gUmV0dXJucyBgdmFsdWVgIGlmIGl0J3MgYSBnbG9iYWwgb2JqZWN0LCBlbHNlIGBudWxsYC5cbiAqL1xuZnVuY3Rpb24gY2hlY2tHbG9iYWwodmFsdWUpIHtcbiAgcmV0dXJuICh2YWx1ZSAmJiB2YWx1ZS5PYmplY3QgPT09IE9iamVjdCkgPyB2YWx1ZSA6IG51bGw7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcm9vdDtcbiIsIi8qKlxuICogbG9kYXNoIDMuMi4wIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE2IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTYgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciByb290ID0gcmVxdWlyZSgnbG9kYXNoLl9yb290Jyk7XG5cbi8qKiBVc2VkIGFzIHJlZmVyZW5jZXMgZm9yIHZhcmlvdXMgYE51bWJlcmAgY29uc3RhbnRzLiAqL1xudmFyIElORklOSVRZID0gMSAvIDA7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1ib2xUYWcgPSAnW29iamVjdCBTeW1ib2xdJztcblxuLyoqIFVzZWQgdG8gbWF0Y2ggbGF0aW4tMSBzdXBwbGVtZW50YXJ5IGxldHRlcnMgKGV4Y2x1ZGluZyBtYXRoZW1hdGljYWwgb3BlcmF0b3JzKS4gKi9cbnZhciByZUxhdGluMSA9IC9bXFx4YzAtXFx4ZDZcXHhkOC1cXHhkZVxceGRmLVxceGY2XFx4ZjgtXFx4ZmZdL2c7XG5cbi8qKiBVc2VkIHRvIGNvbXBvc2UgdW5pY29kZSBjaGFyYWN0ZXIgY2xhc3Nlcy4gKi9cbnZhciByc0NvbWJvTWFya3NSYW5nZSA9ICdcXFxcdTAzMDAtXFxcXHUwMzZmXFxcXHVmZTIwLVxcXFx1ZmUyMycsXG4gICAgcnNDb21ib1N5bWJvbHNSYW5nZSA9ICdcXFxcdTIwZDAtXFxcXHUyMGYwJztcblxuLyoqIFVzZWQgdG8gY29tcG9zZSB1bmljb2RlIGNhcHR1cmUgZ3JvdXBzLiAqL1xudmFyIHJzQ29tYm8gPSAnWycgKyByc0NvbWJvTWFya3NSYW5nZSArIHJzQ29tYm9TeW1ib2xzUmFuZ2UgKyAnXSc7XG5cbi8qKlxuICogVXNlZCB0byBtYXRjaCBbY29tYmluaW5nIGRpYWNyaXRpY2FsIG1hcmtzXShodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db21iaW5pbmdfRGlhY3JpdGljYWxfTWFya3MpIGFuZFxuICogW2NvbWJpbmluZyBkaWFjcml0aWNhbCBtYXJrcyBmb3Igc3ltYm9sc10oaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29tYmluaW5nX0RpYWNyaXRpY2FsX01hcmtzX2Zvcl9TeW1ib2xzKS5cbiAqL1xudmFyIHJlQ29tYm9NYXJrID0gUmVnRXhwKHJzQ29tYm8sICdnJyk7XG5cbi8qKiBVc2VkIHRvIG1hcCBsYXRpbi0xIHN1cHBsZW1lbnRhcnkgbGV0dGVycyB0byBiYXNpYyBsYXRpbiBsZXR0ZXJzLiAqL1xudmFyIGRlYnVycmVkTGV0dGVycyA9IHtcbiAgJ1xceGMwJzogJ0EnLCAgJ1xceGMxJzogJ0EnLCAnXFx4YzInOiAnQScsICdcXHhjMyc6ICdBJywgJ1xceGM0JzogJ0EnLCAnXFx4YzUnOiAnQScsXG4gICdcXHhlMCc6ICdhJywgICdcXHhlMSc6ICdhJywgJ1xceGUyJzogJ2EnLCAnXFx4ZTMnOiAnYScsICdcXHhlNCc6ICdhJywgJ1xceGU1JzogJ2EnLFxuICAnXFx4YzcnOiAnQycsICAnXFx4ZTcnOiAnYycsXG4gICdcXHhkMCc6ICdEJywgICdcXHhmMCc6ICdkJyxcbiAgJ1xceGM4JzogJ0UnLCAgJ1xceGM5JzogJ0UnLCAnXFx4Y2EnOiAnRScsICdcXHhjYic6ICdFJyxcbiAgJ1xceGU4JzogJ2UnLCAgJ1xceGU5JzogJ2UnLCAnXFx4ZWEnOiAnZScsICdcXHhlYic6ICdlJyxcbiAgJ1xceGNDJzogJ0knLCAgJ1xceGNkJzogJ0knLCAnXFx4Y2UnOiAnSScsICdcXHhjZic6ICdJJyxcbiAgJ1xceGVDJzogJ2knLCAgJ1xceGVkJzogJ2knLCAnXFx4ZWUnOiAnaScsICdcXHhlZic6ICdpJyxcbiAgJ1xceGQxJzogJ04nLCAgJ1xceGYxJzogJ24nLFxuICAnXFx4ZDInOiAnTycsICAnXFx4ZDMnOiAnTycsICdcXHhkNCc6ICdPJywgJ1xceGQ1JzogJ08nLCAnXFx4ZDYnOiAnTycsICdcXHhkOCc6ICdPJyxcbiAgJ1xceGYyJzogJ28nLCAgJ1xceGYzJzogJ28nLCAnXFx4ZjQnOiAnbycsICdcXHhmNSc6ICdvJywgJ1xceGY2JzogJ28nLCAnXFx4ZjgnOiAnbycsXG4gICdcXHhkOSc6ICdVJywgICdcXHhkYSc6ICdVJywgJ1xceGRiJzogJ1UnLCAnXFx4ZGMnOiAnVScsXG4gICdcXHhmOSc6ICd1JywgICdcXHhmYSc6ICd1JywgJ1xceGZiJzogJ3UnLCAnXFx4ZmMnOiAndScsXG4gICdcXHhkZCc6ICdZJywgICdcXHhmZCc6ICd5JywgJ1xceGZmJzogJ3knLFxuICAnXFx4YzYnOiAnQWUnLCAnXFx4ZTYnOiAnYWUnLFxuICAnXFx4ZGUnOiAnVGgnLCAnXFx4ZmUnOiAndGgnLFxuICAnXFx4ZGYnOiAnc3MnXG59O1xuXG4vKipcbiAqIFVzZWQgYnkgYF8uZGVidXJyYCB0byBjb252ZXJ0IGxhdGluLTEgc3VwcGxlbWVudGFyeSBsZXR0ZXJzIHRvIGJhc2ljIGxhdGluIGxldHRlcnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBsZXR0ZXIgVGhlIG1hdGNoZWQgbGV0dGVyIHRvIGRlYnVyci5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIGRlYnVycmVkIGxldHRlci5cbiAqL1xuZnVuY3Rpb24gZGVidXJyTGV0dGVyKGxldHRlcikge1xuICByZXR1cm4gZGVidXJyZWRMZXR0ZXJzW2xldHRlcl07XG59XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIFN5bWJvbCA9IHJvb3QuU3ltYm9sO1xuXG4vKiogVXNlZCB0byBjb252ZXJ0IHN5bWJvbHMgdG8gcHJpbWl0aXZlcyBhbmQgc3RyaW5ncy4gKi9cbnZhciBzeW1ib2xQcm90byA9IFN5bWJvbCA/IFN5bWJvbC5wcm90b3R5cGUgOiB1bmRlZmluZWQsXG4gICAgc3ltYm9sVG9TdHJpbmcgPSBTeW1ib2wgPyBzeW1ib2xQcm90by50b1N0cmluZyA6IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS4gQSB2YWx1ZSBpcyBvYmplY3QtbGlrZSBpZiBpdCdzIG5vdCBgbnVsbGBcbiAqIGFuZCBoYXMgYSBgdHlwZW9mYCByZXN1bHQgb2YgXCJvYmplY3RcIi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdExpa2Uoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoXy5ub29wKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc09iamVjdExpa2UobnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdExpa2UodmFsdWUpIHtcbiAgcmV0dXJuICEhdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSBgU3ltYm9sYCBwcmltaXRpdmUgb3Igb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzU3ltYm9sKFN5bWJvbC5pdGVyYXRvcik7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc1N5bWJvbCgnYWJjJyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc1N5bWJvbCh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdzeW1ib2wnIHx8XG4gICAgKGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgb2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gc3ltYm9sVGFnKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGEgc3RyaW5nIGlmIGl0J3Mgbm90IG9uZS4gQW4gZW1wdHkgc3RyaW5nIGlzIHJldHVybmVkXG4gKiBmb3IgYG51bGxgIGFuZCBgdW5kZWZpbmVkYCB2YWx1ZXMuIFRoZSBzaWduIG9mIGAtMGAgaXMgcHJlc2VydmVkLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHN0cmluZy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy50b1N0cmluZyhudWxsKTtcbiAqIC8vID0+ICcnXG4gKlxuICogXy50b1N0cmluZygtMCk7XG4gKiAvLyA9PiAnLTAnXG4gKlxuICogXy50b1N0cmluZyhbMSwgMiwgM10pO1xuICogLy8gPT4gJzEsMiwzJ1xuICovXG5mdW5jdGlvbiB0b1N0cmluZyh2YWx1ZSkge1xuICAvLyBFeGl0IGVhcmx5IGZvciBzdHJpbmdzIHRvIGF2b2lkIGEgcGVyZm9ybWFuY2UgaGl0IGluIHNvbWUgZW52aXJvbm1lbnRzLlxuICBpZiAodHlwZW9mIHZhbHVlID09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG4gIGlmIChpc1N5bWJvbCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gU3ltYm9sID8gc3ltYm9sVG9TdHJpbmcuY2FsbCh2YWx1ZSkgOiAnJztcbiAgfVxuICB2YXIgcmVzdWx0ID0gKHZhbHVlICsgJycpO1xuICByZXR1cm4gKHJlc3VsdCA9PSAnMCcgJiYgKDEgLyB2YWx1ZSkgPT0gLUlORklOSVRZKSA/ICctMCcgOiByZXN1bHQ7XG59XG5cbi8qKlxuICogRGVidXJycyBgc3RyaW5nYCBieSBjb252ZXJ0aW5nIFtsYXRpbi0xIHN1cHBsZW1lbnRhcnkgbGV0dGVyc10oaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvTGF0aW4tMV9TdXBwbGVtZW50XyhVbmljb2RlX2Jsb2NrKSNDaGFyYWN0ZXJfdGFibGUpXG4gKiB0byBiYXNpYyBsYXRpbiBsZXR0ZXJzIGFuZCByZW1vdmluZyBbY29tYmluaW5nIGRpYWNyaXRpY2FsIG1hcmtzXShodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db21iaW5pbmdfRGlhY3JpdGljYWxfTWFya3MpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgU3RyaW5nXG4gKiBAcGFyYW0ge3N0cmluZ30gW3N0cmluZz0nJ10gVGhlIHN0cmluZyB0byBkZWJ1cnIuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBkZWJ1cnJlZCBzdHJpbmcuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZGVidXJyKCdkw6lqw6AgdnUnKTtcbiAqIC8vID0+ICdkZWphIHZ1J1xuICovXG5mdW5jdGlvbiBkZWJ1cnIoc3RyaW5nKSB7XG4gIHN0cmluZyA9IHRvU3RyaW5nKHN0cmluZyk7XG4gIHJldHVybiBzdHJpbmcgJiYgc3RyaW5nLnJlcGxhY2UocmVMYXRpbjEsIGRlYnVyckxldHRlcikucmVwbGFjZShyZUNvbWJvTWFyaywgJycpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRlYnVycjtcbiIsIi8qKlxuICogbG9kYXNoIDMuMi4wIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE2IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTYgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciByb290ID0gcmVxdWlyZSgnbG9kYXNoLl9yb290Jyk7XG5cbi8qKiBVc2VkIGFzIHJlZmVyZW5jZXMgZm9yIHZhcmlvdXMgYE51bWJlcmAgY29uc3RhbnRzLiAqL1xudmFyIElORklOSVRZID0gMSAvIDA7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1ib2xUYWcgPSAnW29iamVjdCBTeW1ib2xdJztcblxuLyoqIFVzZWQgdG8gbWF0Y2ggSFRNTCBlbnRpdGllcyBhbmQgSFRNTCBjaGFyYWN0ZXJzLiAqL1xudmFyIHJlVW5lc2NhcGVkSHRtbCA9IC9bJjw+XCInYF0vZyxcbiAgICByZUhhc1VuZXNjYXBlZEh0bWwgPSBSZWdFeHAocmVVbmVzY2FwZWRIdG1sLnNvdXJjZSk7XG5cbi8qKiBVc2VkIHRvIG1hcCBjaGFyYWN0ZXJzIHRvIEhUTUwgZW50aXRpZXMuICovXG52YXIgaHRtbEVzY2FwZXMgPSB7XG4gICcmJzogJyZhbXA7JyxcbiAgJzwnOiAnJmx0OycsXG4gICc+JzogJyZndDsnLFxuICAnXCInOiAnJnF1b3Q7JyxcbiAgXCInXCI6ICcmIzM5OycsXG4gICdgJzogJyYjOTY7J1xufTtcblxuLyoqXG4gKiBVc2VkIGJ5IGBfLmVzY2FwZWAgdG8gY29udmVydCBjaGFyYWN0ZXJzIHRvIEhUTUwgZW50aXRpZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBjaHIgVGhlIG1hdGNoZWQgY2hhcmFjdGVyIHRvIGVzY2FwZS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIGVzY2FwZWQgY2hhcmFjdGVyLlxuICovXG5mdW5jdGlvbiBlc2NhcGVIdG1sQ2hhcihjaHIpIHtcbiAgcmV0dXJuIGh0bWxFc2NhcGVzW2Nocl07XG59XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIFN5bWJvbCA9IHJvb3QuU3ltYm9sO1xuXG4vKiogVXNlZCB0byBjb252ZXJ0IHN5bWJvbHMgdG8gcHJpbWl0aXZlcyBhbmQgc3RyaW5ncy4gKi9cbnZhciBzeW1ib2xQcm90byA9IFN5bWJvbCA/IFN5bWJvbC5wcm90b3R5cGUgOiB1bmRlZmluZWQsXG4gICAgc3ltYm9sVG9TdHJpbmcgPSBTeW1ib2wgPyBzeW1ib2xQcm90by50b1N0cmluZyA6IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS4gQSB2YWx1ZSBpcyBvYmplY3QtbGlrZSBpZiBpdCdzIG5vdCBgbnVsbGBcbiAqIGFuZCBoYXMgYSBgdHlwZW9mYCByZXN1bHQgb2YgXCJvYmplY3RcIi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdExpa2Uoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoXy5ub29wKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc09iamVjdExpa2UobnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdExpa2UodmFsdWUpIHtcbiAgcmV0dXJuICEhdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSBgU3ltYm9sYCBwcmltaXRpdmUgb3Igb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzU3ltYm9sKFN5bWJvbC5pdGVyYXRvcik7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc1N5bWJvbCgnYWJjJyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc1N5bWJvbCh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdzeW1ib2wnIHx8XG4gICAgKGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgb2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gc3ltYm9sVGFnKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGEgc3RyaW5nIGlmIGl0J3Mgbm90IG9uZS4gQW4gZW1wdHkgc3RyaW5nIGlzIHJldHVybmVkXG4gKiBmb3IgYG51bGxgIGFuZCBgdW5kZWZpbmVkYCB2YWx1ZXMuIFRoZSBzaWduIG9mIGAtMGAgaXMgcHJlc2VydmVkLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHN0cmluZy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy50b1N0cmluZyhudWxsKTtcbiAqIC8vID0+ICcnXG4gKlxuICogXy50b1N0cmluZygtMCk7XG4gKiAvLyA9PiAnLTAnXG4gKlxuICogXy50b1N0cmluZyhbMSwgMiwgM10pO1xuICogLy8gPT4gJzEsMiwzJ1xuICovXG5mdW5jdGlvbiB0b1N0cmluZyh2YWx1ZSkge1xuICAvLyBFeGl0IGVhcmx5IGZvciBzdHJpbmdzIHRvIGF2b2lkIGEgcGVyZm9ybWFuY2UgaGl0IGluIHNvbWUgZW52aXJvbm1lbnRzLlxuICBpZiAodHlwZW9mIHZhbHVlID09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG4gIGlmIChpc1N5bWJvbCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gU3ltYm9sID8gc3ltYm9sVG9TdHJpbmcuY2FsbCh2YWx1ZSkgOiAnJztcbiAgfVxuICB2YXIgcmVzdWx0ID0gKHZhbHVlICsgJycpO1xuICByZXR1cm4gKHJlc3VsdCA9PSAnMCcgJiYgKDEgLyB2YWx1ZSkgPT0gLUlORklOSVRZKSA/ICctMCcgOiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29udmVydHMgdGhlIGNoYXJhY3RlcnMgXCImXCIsIFwiPFwiLCBcIj5cIiwgJ1wiJywgXCInXCIsIGFuZCBcIlxcYFwiIGluIGBzdHJpbmdgIHRvXG4gKiB0aGVpciBjb3JyZXNwb25kaW5nIEhUTUwgZW50aXRpZXMuXG4gKlxuICogKipOb3RlOioqIE5vIG90aGVyIGNoYXJhY3RlcnMgYXJlIGVzY2FwZWQuIFRvIGVzY2FwZSBhZGRpdGlvbmFsXG4gKiBjaGFyYWN0ZXJzIHVzZSBhIHRoaXJkLXBhcnR5IGxpYnJhcnkgbGlrZSBbX2hlX10oaHR0cHM6Ly9tdGhzLmJlL2hlKS5cbiAqXG4gKiBUaG91Z2ggdGhlIFwiPlwiIGNoYXJhY3RlciBpcyBlc2NhcGVkIGZvciBzeW1tZXRyeSwgY2hhcmFjdGVycyBsaWtlXG4gKiBcIj5cIiBhbmQgXCIvXCIgZG9uJ3QgbmVlZCBlc2NhcGluZyBpbiBIVE1MIGFuZCBoYXZlIG5vIHNwZWNpYWwgbWVhbmluZ1xuICogdW5sZXNzIHRoZXkncmUgcGFydCBvZiBhIHRhZyBvciB1bnF1b3RlZCBhdHRyaWJ1dGUgdmFsdWUuXG4gKiBTZWUgW01hdGhpYXMgQnluZW5zJ3MgYXJ0aWNsZV0oaHR0cHM6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2FtYmlndW91cy1hbXBlcnNhbmRzKVxuICogKHVuZGVyIFwic2VtaS1yZWxhdGVkIGZ1biBmYWN0XCIpIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogQmFja3RpY2tzIGFyZSBlc2NhcGVkIGJlY2F1c2UgaW4gSUUgPCA5LCB0aGV5IGNhbiBicmVhayBvdXQgb2ZcbiAqIGF0dHJpYnV0ZSB2YWx1ZXMgb3IgSFRNTCBjb21tZW50cy4gU2VlIFsjNTldKGh0dHBzOi8vaHRtbDVzZWMub3JnLyM1OSksXG4gKiBbIzEwMl0oaHR0cHM6Ly9odG1sNXNlYy5vcmcvIzEwMiksIFsjMTA4XShodHRwczovL2h0bWw1c2VjLm9yZy8jMTA4KSwgYW5kXG4gKiBbIzEzM10oaHR0cHM6Ly9odG1sNXNlYy5vcmcvIzEzMykgb2YgdGhlIFtIVE1MNSBTZWN1cml0eSBDaGVhdHNoZWV0XShodHRwczovL2h0bWw1c2VjLm9yZy8pXG4gKiBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIFdoZW4gd29ya2luZyB3aXRoIEhUTUwgeW91IHNob3VsZCBhbHdheXMgW3F1b3RlIGF0dHJpYnV0ZSB2YWx1ZXNdKGh0dHA6Ly93b25rby5jb20vcG9zdC9odG1sLWVzY2FwaW5nKVxuICogdG8gcmVkdWNlIFhTUyB2ZWN0b3JzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgU3RyaW5nXG4gKiBAcGFyYW0ge3N0cmluZ30gW3N0cmluZz0nJ10gVGhlIHN0cmluZyB0byBlc2NhcGUuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBlc2NhcGVkIHN0cmluZy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5lc2NhcGUoJ2ZyZWQsIGJhcm5leSwgJiBwZWJibGVzJyk7XG4gKiAvLyA9PiAnZnJlZCwgYmFybmV5LCAmYW1wOyBwZWJibGVzJ1xuICovXG5mdW5jdGlvbiBlc2NhcGUoc3RyaW5nKSB7XG4gIHN0cmluZyA9IHRvU3RyaW5nKHN0cmluZyk7XG4gIHJldHVybiAoc3RyaW5nICYmIHJlSGFzVW5lc2NhcGVkSHRtbC50ZXN0KHN0cmluZykpXG4gICAgPyBzdHJpbmcucmVwbGFjZShyZVVuZXNjYXBlZEh0bWwsIGVzY2FwZUh0bWxDaGFyKVxuICAgIDogc3RyaW5nO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVzY2FwZTtcbiIsIi8qKlxuICogbG9kYXNoIDMuMC4yIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kZXJuIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUZvciA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWZvcicpLFxuICAgIGJpbmRDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5fYmluZGNhbGxiYWNrJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJ2xvZGFzaC5rZXlzJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uZm9yT3duYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBiYXNlRm9yT3duKG9iamVjdCwgaXRlcmF0ZWUpIHtcbiAgcmV0dXJuIGJhc2VGb3Iob2JqZWN0LCBpdGVyYXRlZSwga2V5cyk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIGZvciBgXy5mb3JPd25gIG9yIGBfLmZvck93blJpZ2h0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gb2JqZWN0RnVuYyBUaGUgZnVuY3Rpb24gdG8gaXRlcmF0ZSBvdmVyIGFuIG9iamVjdC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGVhY2ggZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUZvck93bihvYmplY3RGdW5jKSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QsIGl0ZXJhdGVlLCB0aGlzQXJnKSB7XG4gICAgaWYgKHR5cGVvZiBpdGVyYXRlZSAhPSAnZnVuY3Rpb24nIHx8IHRoaXNBcmcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaXRlcmF0ZWUgPSBiaW5kQ2FsbGJhY2soaXRlcmF0ZWUsIHRoaXNBcmcsIDMpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0RnVuYyhvYmplY3QsIGl0ZXJhdGVlKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBJdGVyYXRlcyBvdmVyIG93biBlbnVtZXJhYmxlIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0IGludm9raW5nIGBpdGVyYXRlZWBcbiAqIGZvciBlYWNoIHByb3BlcnR5LiBUaGUgYGl0ZXJhdGVlYCBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aFxuICogdGhyZWUgYXJndW1lbnRzOiAodmFsdWUsIGtleSwgb2JqZWN0KS4gSXRlcmF0ZWUgZnVuY3Rpb25zIG1heSBleGl0IGl0ZXJhdGlvblxuICogZWFybHkgYnkgZXhwbGljaXRseSByZXR1cm5pbmcgYGZhbHNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtpdGVyYXRlZT1fLmlkZW50aXR5XSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBpdGVyYXRlZWAuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBGb28oKSB7XG4gKiAgIHRoaXMuYSA9IDE7XG4gKiAgIHRoaXMuYiA9IDI7XG4gKiB9XG4gKlxuICogRm9vLnByb3RvdHlwZS5jID0gMztcbiAqXG4gKiBfLmZvck93bihuZXcgRm9vLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gKiAgIGNvbnNvbGUubG9nKGtleSk7XG4gKiB9KTtcbiAqIC8vID0+IGxvZ3MgJ2EnIGFuZCAnYicgKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqL1xudmFyIGZvck93biA9IGNyZWF0ZUZvck93bihiYXNlRm9yT3duKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JPd247XG4iLCIvKipcbiAqIGxvZGFzaCAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IGpRdWVyeSBGb3VuZGF0aW9uIGFuZCBvdGhlciBjb250cmlidXRvcnMgPGh0dHBzOi8vanF1ZXJ5Lm9yZy8+XG4gKiBSZWxlYXNlZCB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKi9cblxuLyoqIFVzZWQgYXMgcmVmZXJlbmNlcyBmb3IgdmFyaW91cyBgTnVtYmVyYCBjb25zdGFudHMuICovXG52YXIgTUFYX1NBRkVfSU5URUdFUiA9IDkwMDcxOTkyNTQ3NDA5OTE7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBhcmdzVGFnID0gJ1tvYmplY3QgQXJndW1lbnRzXScsXG4gICAgZnVuY1RhZyA9ICdbb2JqZWN0IEZ1bmN0aW9uXScsXG4gICAgZ2VuVGFnID0gJ1tvYmplY3QgR2VuZXJhdG9yRnVuY3Rpb25dJztcblxuLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlXG4gKiBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNy4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBCdWlsdC1pbiB2YWx1ZSByZWZlcmVuY2VzLiAqL1xudmFyIHByb3BlcnR5SXNFbnVtZXJhYmxlID0gb2JqZWN0UHJvdG8ucHJvcGVydHlJc0VudW1lcmFibGU7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgbGlrZWx5IGFuIGBhcmd1bWVudHNgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDAuMS4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBgYXJndW1lbnRzYCBvYmplY3QsXG4gKiAgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzQXJndW1lbnRzKGZ1bmN0aW9uKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcmd1bWVudHMoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKHZhbHVlKSB7XG4gIC8vIFNhZmFyaSA4LjEgbWFrZXMgYGFyZ3VtZW50cy5jYWxsZWVgIGVudW1lcmFibGUgaW4gc3RyaWN0IG1vZGUuXG4gIHJldHVybiBpc0FycmF5TGlrZU9iamVjdCh2YWx1ZSkgJiYgaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgJ2NhbGxlZScpICYmXG4gICAgKCFwcm9wZXJ0eUlzRW51bWVyYWJsZS5jYWxsKHZhbHVlLCAnY2FsbGVlJykgfHwgb2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJnc1RhZyk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYXJyYXktbGlrZS4gQSB2YWx1ZSBpcyBjb25zaWRlcmVkIGFycmF5LWxpa2UgaWYgaXQnc1xuICogbm90IGEgZnVuY3Rpb24gYW5kIGhhcyBhIGB2YWx1ZS5sZW5ndGhgIHRoYXQncyBhbiBpbnRlZ2VyIGdyZWF0ZXIgdGhhbiBvclxuICogZXF1YWwgdG8gYDBgIGFuZCBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYE51bWJlci5NQVhfU0FGRV9JTlRFR0VSYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhcnJheS1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNBcnJheUxpa2UoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQXJyYXlMaWtlKGRvY3VtZW50LmJvZHkuY2hpbGRyZW4pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcnJheUxpa2UoJ2FiYycpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcnJheUxpa2UoXy5ub29wKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSAhPSBudWxsICYmIGlzTGVuZ3RoKHZhbHVlLmxlbmd0aCkgJiYgIWlzRnVuY3Rpb24odmFsdWUpO1xufVxuXG4vKipcbiAqIFRoaXMgbWV0aG9kIGlzIGxpa2UgYF8uaXNBcnJheUxpa2VgIGV4Y2VwdCB0aGF0IGl0IGFsc28gY2hlY2tzIGlmIGB2YWx1ZWBcbiAqIGlzIGFuIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBhcnJheS1saWtlIG9iamVjdCxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNBcnJheUxpa2VPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQXJyYXlMaWtlT2JqZWN0KGRvY3VtZW50LmJvZHkuY2hpbGRyZW4pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcnJheUxpa2VPYmplY3QoJ2FiYycpO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzQXJyYXlMaWtlT2JqZWN0KF8ubm9vcCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0FycmF5TGlrZU9iamVjdCh2YWx1ZSkge1xuICByZXR1cm4gaXNPYmplY3RMaWtlKHZhbHVlKSAmJiBpc0FycmF5TGlrZSh2YWx1ZSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBGdW5jdGlvbmAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMC4xLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgZnVuY3Rpb24sIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0Z1bmN0aW9uKF8pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNGdW5jdGlvbigvYWJjLyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHZhbHVlKSB7XG4gIC8vIFRoZSB1c2Ugb2YgYE9iamVjdCN0b1N0cmluZ2AgYXZvaWRzIGlzc3VlcyB3aXRoIHRoZSBgdHlwZW9mYCBvcGVyYXRvclxuICAvLyBpbiBTYWZhcmkgOC05IHdoaWNoIHJldHVybnMgJ29iamVjdCcgZm9yIHR5cGVkIGFycmF5IGFuZCBvdGhlciBjb25zdHJ1Y3RvcnMuXG4gIHZhciB0YWcgPSBpc09iamVjdCh2YWx1ZSkgPyBvYmplY3RUb1N0cmluZy5jYWxsKHZhbHVlKSA6ICcnO1xuICByZXR1cm4gdGFnID09IGZ1bmNUYWcgfHwgdGFnID09IGdlblRhZztcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGFycmF5LWxpa2UgbGVuZ3RoLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIG1ldGhvZCBpcyBsb29zZWx5IGJhc2VkIG9uXG4gKiBbYFRvTGVuZ3RoYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNy4wLyNzZWMtdG9sZW5ndGgpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgNC4wLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgbGVuZ3RoLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNMZW5ndGgoMyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0xlbmd0aChOdW1iZXIuTUlOX1ZBTFVFKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc0xlbmd0aChJbmZpbml0eSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNMZW5ndGgoJzMnKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzTGVuZ3RoKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgJiZcbiAgICB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDw9IE1BWF9TQUZFX0lOVEVHRVI7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlXG4gKiBbbGFuZ3VhZ2UgdHlwZV0oaHR0cDovL3d3dy5lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLWVjbWFzY3JpcHQtbGFuZ3VhZ2UtdHlwZXMpXG4gKiBvZiBgT2JqZWN0YC4gKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSAwLjEuMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KF8ubm9vcCk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLiBBIHZhbHVlIGlzIG9iamVjdC1saWtlIGlmIGl0J3Mgbm90IGBudWxsYFxuICogYW5kIGhhcyBhIGB0eXBlb2ZgIHJlc3VsdCBvZiBcIm9iamVjdFwiLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgNC4wLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKF8ubm9vcCk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKG51bGwpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FyZ3VtZW50cztcbiIsIi8qKlxuICogbG9kYXNoIDMuMC40IChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kZXJuIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBhcnJheVRhZyA9ICdbb2JqZWN0IEFycmF5XScsXG4gICAgZnVuY1RhZyA9ICdbb2JqZWN0IEZ1bmN0aW9uXSc7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBob3N0IGNvbnN0cnVjdG9ycyAoU2FmYXJpID4gNSkuICovXG52YXIgcmVJc0hvc3RDdG9yID0gL15cXFtvYmplY3QgLis/Q29uc3RydWN0b3JcXF0kLztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZSwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBpc09iamVjdExpa2UodmFsdWUpIHtcbiAgcmV0dXJuICEhdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnO1xufVxuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zLiAqL1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBpZiBhIG1ldGhvZCBpcyBuYXRpdmUuICovXG52YXIgcmVJc05hdGl2ZSA9IFJlZ0V4cCgnXicgK1xuICBmblRvU3RyaW5nLmNhbGwoaGFzT3duUHJvcGVydHkpLnJlcGxhY2UoL1tcXFxcXiQuKis/KClbXFxde318XS9nLCAnXFxcXCQmJylcbiAgLnJlcGxhY2UoL2hhc093blByb3BlcnR5fChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2csICckMS4qPycpICsgJyQnXG4pO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZUlzQXJyYXkgPSBnZXROYXRpdmUoQXJyYXksICdpc0FycmF5Jyk7XG5cbi8qKlxuICogVXNlZCBhcyB0aGUgW21heGltdW0gbGVuZ3RoXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1udW1iZXIubWF4X3NhZmVfaW50ZWdlcilcbiAqIG9mIGFuIGFycmF5LWxpa2UgdmFsdWUuXG4gKi9cbnZhciBNQVhfU0FGRV9JTlRFR0VSID0gOTAwNzE5OTI1NDc0MDk5MTtcblxuLyoqXG4gKiBHZXRzIHRoZSBuYXRpdmUgZnVuY3Rpb24gYXQgYGtleWAgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIGtleSBvZiB0aGUgbWV0aG9kIHRvIGdldC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBmdW5jdGlvbiBpZiBpdCdzIG5hdGl2ZSwgZWxzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gZ2V0TmF0aXZlKG9iamVjdCwga2V5KSB7XG4gIHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0W2tleV07XG4gIHJldHVybiBpc05hdGl2ZSh2YWx1ZSkgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGFycmF5LWxpa2UgbGVuZ3RoLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIGlzIGJhc2VkIG9uIFtgVG9MZW5ndGhgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy10b2xlbmd0aCkuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBsZW5ndGgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyAmJiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDw9IE1BWF9TQUZFX0lOVEVHRVI7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhbiBgQXJyYXlgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0FycmF5KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0FycmF5KGZ1bmN0aW9uKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xudmFyIGlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIGlzTGVuZ3RoKHZhbHVlLmxlbmd0aCkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJyYXlUYWc7XG59O1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSBgRnVuY3Rpb25gIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0Z1bmN0aW9uKF8pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNGdW5jdGlvbigvYWJjLyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHZhbHVlKSB7XG4gIC8vIFRoZSB1c2Ugb2YgYE9iamVjdCN0b1N0cmluZ2AgYXZvaWRzIGlzc3VlcyB3aXRoIHRoZSBgdHlwZW9mYCBvcGVyYXRvclxuICAvLyBpbiBvbGRlciB2ZXJzaW9ucyBvZiBDaHJvbWUgYW5kIFNhZmFyaSB3aGljaCByZXR1cm4gJ2Z1bmN0aW9uJyBmb3IgcmVnZXhlc1xuICAvLyBhbmQgU2FmYXJpIDggZXF1aXZhbGVudHMgd2hpY2ggcmV0dXJuICdvYmplY3QnIGZvciB0eXBlZCBhcnJheSBjb25zdHJ1Y3RvcnMuXG4gIHJldHVybiBpc09iamVjdCh2YWx1ZSkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gZnVuY1RhZztcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyB0aGUgW2xhbmd1YWdlIHR5cGVdKGh0dHBzOi8vZXM1LmdpdGh1Yi5pby8jeDgpIG9mIGBPYmplY3RgLlxuICogKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0KHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdCgxKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gIC8vIEF2b2lkIGEgVjggSklUIGJ1ZyBpbiBDaHJvbWUgMTktMjAuXG4gIC8vIFNlZSBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL3Y4L2lzc3Vlcy9kZXRhaWw/aWQ9MjI5MSBmb3IgbW9yZSBkZXRhaWxzLlxuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgcmV0dXJuICEhdmFsdWUgJiYgKHR5cGUgPT0gJ29iamVjdCcgfHwgdHlwZSA9PSAnZnVuY3Rpb24nKTtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIG5hdGl2ZSBmdW5jdGlvbi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24sIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc05hdGl2ZShBcnJheS5wcm90b3R5cGUucHVzaCk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc05hdGl2ZShfKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzTmF0aXZlKHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHJldHVybiByZUlzTmF0aXZlLnRlc3QoZm5Ub1N0cmluZy5jYWxsKHZhbHVlKSk7XG4gIH1cbiAgcmV0dXJuIGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgcmVJc0hvc3RDdG9yLnRlc3QodmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJyYXk7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjEuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNiBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE2IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgZGVidXJyID0gcmVxdWlyZSgnbG9kYXNoLmRlYnVycicpLFxuICAgIHdvcmRzID0gcmVxdWlyZSgnbG9kYXNoLndvcmRzJyk7XG5cbi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBfLnJlZHVjZWAgZm9yIGFycmF5cyB3aXRob3V0IHN1cHBvcnQgZm9yXG4gKiBpdGVyYXRlZSBzaG9ydGhhbmRzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW2FjY3VtdWxhdG9yXSBUaGUgaW5pdGlhbCB2YWx1ZS5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2luaXRBY2N1bV0gU3BlY2lmeSB1c2luZyB0aGUgZmlyc3QgZWxlbWVudCBvZiBgYXJyYXlgIGFzIHRoZSBpbml0aWFsIHZhbHVlLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGFjY3VtdWxhdGVkIHZhbHVlLlxuICovXG5mdW5jdGlvbiBhcnJheVJlZHVjZShhcnJheSwgaXRlcmF0ZWUsIGFjY3VtdWxhdG9yLCBpbml0QWNjdW0pIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cbiAgaWYgKGluaXRBY2N1bSAmJiBsZW5ndGgpIHtcbiAgICBhY2N1bXVsYXRvciA9IGFycmF5WysraW5kZXhdO1xuICB9XG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgYWNjdW11bGF0b3IgPSBpdGVyYXRlZShhY2N1bXVsYXRvciwgYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpO1xuICB9XG4gIHJldHVybiBhY2N1bXVsYXRvcjtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gbGlrZSBgXy5jYW1lbENhc2VgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdG8gY29tYmluZSBlYWNoIHdvcmQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBjb21wb3VuZGVyIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBjcmVhdGVDb21wb3VuZGVyKGNhbGxiYWNrKSB7XG4gIHJldHVybiBmdW5jdGlvbihzdHJpbmcpIHtcbiAgICByZXR1cm4gYXJyYXlSZWR1Y2Uod29yZHMoZGVidXJyKHN0cmluZykpLCBjYWxsYmFjaywgJycpO1xuICB9O1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGBzdHJpbmdgIHRvIFtrZWJhYiBjYXNlXShodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9MZXR0ZXJfY2FzZSNTcGVjaWFsX2Nhc2Vfc3R5bGVzKS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFN0cmluZ1xuICogQHBhcmFtIHtzdHJpbmd9IFtzdHJpbmc9JyddIFRoZSBzdHJpbmcgdG8gY29udmVydC5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIGtlYmFiIGNhc2VkIHN0cmluZy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5rZWJhYkNhc2UoJ0ZvbyBCYXInKTtcbiAqIC8vID0+ICdmb28tYmFyJ1xuICpcbiAqIF8ua2ViYWJDYXNlKCdmb29CYXInKTtcbiAqIC8vID0+ICdmb28tYmFyJ1xuICpcbiAqIF8ua2ViYWJDYXNlKCdfX2Zvb19iYXJfXycpO1xuICogLy8gPT4gJ2Zvby1iYXInXG4gKi9cbnZhciBrZWJhYkNhc2UgPSBjcmVhdGVDb21wb3VuZGVyKGZ1bmN0aW9uKHJlc3VsdCwgd29yZCwgaW5kZXgpIHtcbiAgcmV0dXJuIHJlc3VsdCArIChpbmRleCA/ICctJyA6ICcnKSArIHdvcmQudG9Mb3dlckNhc2UoKTtcbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGtlYmFiQ2FzZTtcbiIsIi8qKlxuICogbG9kYXNoIDMuMS4yIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kZXJuIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgZ2V0TmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9nZXRuYXRpdmUnKSxcbiAgICBpc0FyZ3VtZW50cyA9IHJlcXVpcmUoJ2xvZGFzaC5pc2FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCdsb2Rhc2guaXNhcnJheScpO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgdW5zaWduZWQgaW50ZWdlciB2YWx1ZXMuICovXG52YXIgcmVJc1VpbnQgPSAvXlxcZCskLztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlS2V5cyA9IGdldE5hdGl2ZShPYmplY3QsICdrZXlzJyk7XG5cbi8qKlxuICogVXNlZCBhcyB0aGUgW21heGltdW0gbGVuZ3RoXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1udW1iZXIubWF4X3NhZmVfaW50ZWdlcilcbiAqIG9mIGFuIGFycmF5LWxpa2UgdmFsdWUuXG4gKi9cbnZhciBNQVhfU0FGRV9JTlRFR0VSID0gOTAwNzE5OTI1NDc0MDk5MTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5wcm9wZXJ0eWAgd2l0aG91dCBzdXBwb3J0IGZvciBkZWVwIHBhdGhzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBrZXkgb2YgdGhlIHByb3BlcnR5IHRvIGdldC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlUHJvcGVydHkoa2V5KSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0ID09IG51bGwgPyB1bmRlZmluZWQgOiBvYmplY3Rba2V5XTtcbiAgfTtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBcImxlbmd0aFwiIHByb3BlcnR5IHZhbHVlIG9mIGBvYmplY3RgLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgdG8gYXZvaWQgYSBbSklUIGJ1Z10oaHR0cHM6Ly9idWdzLndlYmtpdC5vcmcvc2hvd19idWcuY2dpP2lkPTE0Mjc5MilcbiAqIHRoYXQgYWZmZWN0cyBTYWZhcmkgb24gYXQgbGVhc3QgaU9TIDguMS04LjMgQVJNNjQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBcImxlbmd0aFwiIHZhbHVlLlxuICovXG52YXIgZ2V0TGVuZ3RoID0gYmFzZVByb3BlcnR5KCdsZW5ndGgnKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhcnJheS1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFycmF5LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNBcnJheUxpa2UodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICE9IG51bGwgJiYgaXNMZW5ndGgoZ2V0TGVuZ3RoKHZhbHVlKSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBhcnJheS1saWtlIGluZGV4LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbbGVuZ3RoPU1BWF9TQUZFX0lOVEVHRVJdIFRoZSB1cHBlciBib3VuZHMgb2YgYSB2YWxpZCBpbmRleC5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgaW5kZXgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNJbmRleCh2YWx1ZSwgbGVuZ3RoKSB7XG4gIHZhbHVlID0gKHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyB8fCByZUlzVWludC50ZXN0KHZhbHVlKSkgPyArdmFsdWUgOiAtMTtcbiAgbGVuZ3RoID0gbGVuZ3RoID09IG51bGwgPyBNQVhfU0FGRV9JTlRFR0VSIDogbGVuZ3RoO1xuICByZXR1cm4gdmFsdWUgPiAtMSAmJiB2YWx1ZSAlIDEgPT0gMCAmJiB2YWx1ZSA8IGxlbmd0aDtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGFycmF5LWxpa2UgbGVuZ3RoLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIGlzIGJhc2VkIG9uIFtgVG9MZW5ndGhgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy10b2xlbmd0aCkuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBsZW5ndGgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyAmJiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDw9IE1BWF9TQUZFX0lOVEVHRVI7XG59XG5cbi8qKlxuICogQSBmYWxsYmFjayBpbXBsZW1lbnRhdGlvbiBvZiBgT2JqZWN0LmtleXNgIHdoaWNoIGNyZWF0ZXMgYW4gYXJyYXkgb2YgdGhlXG4gKiBvd24gZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcyBvZiBgb2JqZWN0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqL1xuZnVuY3Rpb24gc2hpbUtleXMob2JqZWN0KSB7XG4gIHZhciBwcm9wcyA9IGtleXNJbihvYmplY3QpLFxuICAgICAgcHJvcHNMZW5ndGggPSBwcm9wcy5sZW5ndGgsXG4gICAgICBsZW5ndGggPSBwcm9wc0xlbmd0aCAmJiBvYmplY3QubGVuZ3RoO1xuXG4gIHZhciBhbGxvd0luZGV4ZXMgPSAhIWxlbmd0aCAmJiBpc0xlbmd0aChsZW5ndGgpICYmXG4gICAgKGlzQXJyYXkob2JqZWN0KSB8fCBpc0FyZ3VtZW50cyhvYmplY3QpKTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIHJlc3VsdCA9IFtdO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgcHJvcHNMZW5ndGgpIHtcbiAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdO1xuICAgIGlmICgoYWxsb3dJbmRleGVzICYmIGlzSW5kZXgoa2V5LCBsZW5ndGgpKSB8fCBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KSkge1xuICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyB0aGUgW2xhbmd1YWdlIHR5cGVdKGh0dHBzOi8vZXM1LmdpdGh1Yi5pby8jeDgpIG9mIGBPYmplY3RgLlxuICogKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0KHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdCgxKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gIC8vIEF2b2lkIGEgVjggSklUIGJ1ZyBpbiBDaHJvbWUgMTktMjAuXG4gIC8vIFNlZSBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL3Y4L2lzc3Vlcy9kZXRhaWw/aWQ9MjI5MSBmb3IgbW9yZSBkZXRhaWxzLlxuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgcmV0dXJuICEhdmFsdWUgJiYgKHR5cGUgPT0gJ29iamVjdCcgfHwgdHlwZSA9PSAnZnVuY3Rpb24nKTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHRoZSBvd24gZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcyBvZiBgb2JqZWN0YC5cbiAqXG4gKiAqKk5vdGU6KiogTm9uLW9iamVjdCB2YWx1ZXMgYXJlIGNvZXJjZWQgdG8gb2JqZWN0cy4gU2VlIHRoZVxuICogW0VTIHNwZWNdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5rZXlzKVxuICogZm9yIG1vcmUgZGV0YWlscy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogICB0aGlzLmIgPSAyO1xuICogfVxuICpcbiAqIEZvby5wcm90b3R5cGUuYyA9IDM7XG4gKlxuICogXy5rZXlzKG5ldyBGb28pO1xuICogLy8gPT4gWydhJywgJ2InXSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICpcbiAqIF8ua2V5cygnaGknKTtcbiAqIC8vID0+IFsnMCcsICcxJ11cbiAqL1xudmFyIGtleXMgPSAhbmF0aXZlS2V5cyA/IHNoaW1LZXlzIDogZnVuY3Rpb24ob2JqZWN0KSB7XG4gIHZhciBDdG9yID0gb2JqZWN0ID09IG51bGwgPyB1bmRlZmluZWQgOiBvYmplY3QuY29uc3RydWN0b3I7XG4gIGlmICgodHlwZW9mIEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBDdG9yLnByb3RvdHlwZSA9PT0gb2JqZWN0KSB8fFxuICAgICAgKHR5cGVvZiBvYmplY3QgIT0gJ2Z1bmN0aW9uJyAmJiBpc0FycmF5TGlrZShvYmplY3QpKSkge1xuICAgIHJldHVybiBzaGltS2V5cyhvYmplY3QpO1xuICB9XG4gIHJldHVybiBpc09iamVjdChvYmplY3QpID8gbmF0aXZlS2V5cyhvYmplY3QpIDogW107XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgdGhlIG93biBhbmQgaW5oZXJpdGVkIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIE5vbi1vYmplY3QgdmFsdWVzIGFyZSBjb2VyY2VkIHRvIG9iamVjdHMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIEZvbygpIHtcbiAqICAgdGhpcy5hID0gMTtcbiAqICAgdGhpcy5iID0gMjtcbiAqIH1cbiAqXG4gKiBGb28ucHJvdG90eXBlLmMgPSAzO1xuICpcbiAqIF8ua2V5c0luKG5ldyBGb28pO1xuICogLy8gPT4gWydhJywgJ2InLCAnYyddIChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbmZ1bmN0aW9uIGtleXNJbihvYmplY3QpIHtcbiAgaWYgKG9iamVjdCA9PSBudWxsKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIGlmICghaXNPYmplY3Qob2JqZWN0KSkge1xuICAgIG9iamVjdCA9IE9iamVjdChvYmplY3QpO1xuICB9XG4gIHZhciBsZW5ndGggPSBvYmplY3QubGVuZ3RoO1xuICBsZW5ndGggPSAobGVuZ3RoICYmIGlzTGVuZ3RoKGxlbmd0aCkgJiZcbiAgICAoaXNBcnJheShvYmplY3QpIHx8IGlzQXJndW1lbnRzKG9iamVjdCkpICYmIGxlbmd0aCkgfHwgMDtcblxuICB2YXIgQ3RvciA9IG9iamVjdC5jb25zdHJ1Y3RvcixcbiAgICAgIGluZGV4ID0gLTEsXG4gICAgICBpc1Byb3RvID0gdHlwZW9mIEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBDdG9yLnByb3RvdHlwZSA9PT0gb2JqZWN0LFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKSxcbiAgICAgIHNraXBJbmRleGVzID0gbGVuZ3RoID4gMDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSAoaW5kZXggKyAnJyk7XG4gIH1cbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmICghKHNraXBJbmRleGVzICYmIGlzSW5kZXgoa2V5LCBsZW5ndGgpKSAmJlxuICAgICAgICAhKGtleSA9PSAnY29uc3RydWN0b3InICYmIChpc1Byb3RvIHx8ICFoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KSkpKSB7XG4gICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGtleXM7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjYuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCBhcyB0aGUgYFR5cGVFcnJvcmAgbWVzc2FnZSBmb3IgXCJGdW5jdGlvbnNcIiBtZXRob2RzLiAqL1xudmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcblxuLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVNYXggPSBNYXRoLm1heDtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdGhhdCBpbnZva2VzIGBmdW5jYCB3aXRoIHRoZSBgdGhpc2AgYmluZGluZyBvZiB0aGVcbiAqIGNyZWF0ZWQgZnVuY3Rpb24gYW5kIGFyZ3VtZW50cyBmcm9tIGBzdGFydGAgYW5kIGJleW9uZCBwcm92aWRlZCBhcyBhbiBhcnJheS5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBtZXRob2QgaXMgYmFzZWQgb24gdGhlIFtyZXN0IHBhcmFtZXRlcl0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvRnVuY3Rpb25zL3Jlc3RfcGFyYW1ldGVycykuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYXBwbHkgYSByZXN0IHBhcmFtZXRlciB0by5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnQ9ZnVuYy5sZW5ndGgtMV0gVGhlIHN0YXJ0IHBvc2l0aW9uIG9mIHRoZSByZXN0IHBhcmFtZXRlci5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgc2F5ID0gXy5yZXN0UGFyYW0oZnVuY3Rpb24od2hhdCwgbmFtZXMpIHtcbiAqICAgcmV0dXJuIHdoYXQgKyAnICcgKyBfLmluaXRpYWwobmFtZXMpLmpvaW4oJywgJykgK1xuICogICAgIChfLnNpemUobmFtZXMpID4gMSA/ICcsICYgJyA6ICcnKSArIF8ubGFzdChuYW1lcyk7XG4gKiB9KTtcbiAqXG4gKiBzYXkoJ2hlbGxvJywgJ2ZyZWQnLCAnYmFybmV5JywgJ3BlYmJsZXMnKTtcbiAqIC8vID0+ICdoZWxsbyBmcmVkLCBiYXJuZXksICYgcGViYmxlcydcbiAqL1xuZnVuY3Rpb24gcmVzdFBhcmFtKGZ1bmMsIHN0YXJ0KSB7XG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihGVU5DX0VSUk9SX1RFWFQpO1xuICB9XG4gIHN0YXJ0ID0gbmF0aXZlTWF4KHN0YXJ0ID09PSB1bmRlZmluZWQgPyAoZnVuYy5sZW5ndGggLSAxKSA6ICgrc3RhcnQgfHwgMCksIDApO1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBhcmd1bWVudHMsXG4gICAgICAgIGluZGV4ID0gLTEsXG4gICAgICAgIGxlbmd0aCA9IG5hdGl2ZU1heChhcmdzLmxlbmd0aCAtIHN0YXJ0LCAwKSxcbiAgICAgICAgcmVzdCA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgcmVzdFtpbmRleF0gPSBhcmdzW3N0YXJ0ICsgaW5kZXhdO1xuICAgIH1cbiAgICBzd2l0Y2ggKHN0YXJ0KSB7XG4gICAgICBjYXNlIDA6IHJldHVybiBmdW5jLmNhbGwodGhpcywgcmVzdCk7XG4gICAgICBjYXNlIDE6IHJldHVybiBmdW5jLmNhbGwodGhpcywgYXJnc1swXSwgcmVzdCk7XG4gICAgICBjYXNlIDI6IHJldHVybiBmdW5jLmNhbGwodGhpcywgYXJnc1swXSwgYXJnc1sxXSwgcmVzdCk7XG4gICAgfVxuICAgIHZhciBvdGhlckFyZ3MgPSBBcnJheShzdGFydCArIDEpO1xuICAgIGluZGV4ID0gLTE7XG4gICAgd2hpbGUgKCsraW5kZXggPCBzdGFydCkge1xuICAgICAgb3RoZXJBcmdzW2luZGV4XSA9IGFyZ3NbaW5kZXhdO1xuICAgIH1cbiAgICBvdGhlckFyZ3Nbc3RhcnRdID0gcmVzdDtcbiAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBvdGhlckFyZ3MpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlc3RQYXJhbTtcbiIsIi8qKlxuICogbG9kYXNoIDMuMS4wIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kZXJuIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUZsYXR0ZW4gPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VmbGF0dGVuJyksXG4gICAgYmFzZVVuaXEgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2V1bmlxJyksXG4gICAgcmVzdFBhcmFtID0gcmVxdWlyZSgnbG9kYXNoLnJlc3RwYXJhbScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgdW5pcXVlIHZhbHVlcywgaW4gb3JkZXIsIG9mIHRoZSBwcm92aWRlZCBhcnJheXMgdXNpbmdcbiAqIGBTYW1lVmFsdWVaZXJvYCBmb3IgZXF1YWxpdHkgY29tcGFyaXNvbnMuXG4gKlxuICogKipOb3RlOioqIFtgU2FtZVZhbHVlWmVyb2BdKGh0dHBzOi8vcGVvcGxlLm1vemlsbGEub3JnL35qb3JlbmRvcmZmL2VzNi1kcmFmdC5odG1sI3NlYy1zYW1ldmFsdWV6ZXJvKVxuICogY29tcGFyaXNvbnMgYXJlIGxpa2Ugc3RyaWN0IGVxdWFsaXR5IGNvbXBhcmlzb25zLCBlLmcuIGA9PT1gLCBleGNlcHQgdGhhdFxuICogYE5hTmAgbWF0Y2hlcyBgTmFOYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEFycmF5XG4gKiBAcGFyYW0gey4uLkFycmF5fSBbYXJyYXlzXSBUaGUgYXJyYXlzIHRvIGluc3BlY3QuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBhcnJheSBvZiBjb21iaW5lZCB2YWx1ZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8udW5pb24oWzEsIDJdLCBbNCwgMl0sIFsyLCAxXSk7XG4gKiAvLyA9PiBbMSwgMiwgNF1cbiAqL1xudmFyIHVuaW9uID0gcmVzdFBhcmFtKGZ1bmN0aW9uKGFycmF5cykge1xuICByZXR1cm4gYmFzZVVuaXEoYmFzZUZsYXR0ZW4oYXJyYXlzLCBmYWxzZSwgdHJ1ZSkpO1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gdW5pb247XG4iLCIvKipcbiAqIGxvZGFzaCAzLjIuMCAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgZXhwb3J0cz1cIm5wbVwiIC1vIC4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNiBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDE2IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgcm9vdCA9IHJlcXVpcmUoJ2xvZGFzaC5fcm9vdCcpO1xuXG4vKiogVXNlZCBhcyByZWZlcmVuY2VzIGZvciB2YXJpb3VzIGBOdW1iZXJgIGNvbnN0YW50cy4gKi9cbnZhciBJTkZJTklUWSA9IDEgLyAwO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgc3ltYm9sVGFnID0gJ1tvYmplY3QgU3ltYm9sXSc7XG5cbi8qKiBVc2VkIHRvIGNvbXBvc2UgdW5pY29kZSBjaGFyYWN0ZXIgY2xhc3Nlcy4gKi9cbnZhciByc0FzdHJhbFJhbmdlID0gJ1xcXFx1ZDgwMC1cXFxcdWRmZmYnLFxuICAgIHJzQ29tYm9NYXJrc1JhbmdlID0gJ1xcXFx1MDMwMC1cXFxcdTAzNmZcXFxcdWZlMjAtXFxcXHVmZTIzJyxcbiAgICByc0NvbWJvU3ltYm9sc1JhbmdlID0gJ1xcXFx1MjBkMC1cXFxcdTIwZjAnLFxuICAgIHJzRGluZ2JhdFJhbmdlID0gJ1xcXFx1MjcwMC1cXFxcdTI3YmYnLFxuICAgIHJzTG93ZXJSYW5nZSA9ICdhLXpcXFxceGRmLVxcXFx4ZjZcXFxceGY4LVxcXFx4ZmYnLFxuICAgIHJzTWF0aE9wUmFuZ2UgPSAnXFxcXHhhY1xcXFx4YjFcXFxceGQ3XFxcXHhmNycsXG4gICAgcnNOb25DaGFyUmFuZ2UgPSAnXFxcXHgwMC1cXFxceDJmXFxcXHgzYS1cXFxceDQwXFxcXHg1Yi1cXFxceDYwXFxcXHg3Yi1cXFxceGJmJyxcbiAgICByc1F1b3RlUmFuZ2UgPSAnXFxcXHUyMDE4XFxcXHUyMDE5XFxcXHUyMDFjXFxcXHUyMDFkJyxcbiAgICByc1NwYWNlUmFuZ2UgPSAnIFxcXFx0XFxcXHgwYlxcXFxmXFxcXHhhMFxcXFx1ZmVmZlxcXFxuXFxcXHJcXFxcdTIwMjhcXFxcdTIwMjlcXFxcdTE2ODBcXFxcdTE4MGVcXFxcdTIwMDBcXFxcdTIwMDFcXFxcdTIwMDJcXFxcdTIwMDNcXFxcdTIwMDRcXFxcdTIwMDVcXFxcdTIwMDZcXFxcdTIwMDdcXFxcdTIwMDhcXFxcdTIwMDlcXFxcdTIwMGFcXFxcdTIwMmZcXFxcdTIwNWZcXFxcdTMwMDAnLFxuICAgIHJzVXBwZXJSYW5nZSA9ICdBLVpcXFxceGMwLVxcXFx4ZDZcXFxceGQ4LVxcXFx4ZGUnLFxuICAgIHJzVmFyUmFuZ2UgPSAnXFxcXHVmZTBlXFxcXHVmZTBmJyxcbiAgICByc0JyZWFrUmFuZ2UgPSByc01hdGhPcFJhbmdlICsgcnNOb25DaGFyUmFuZ2UgKyByc1F1b3RlUmFuZ2UgKyByc1NwYWNlUmFuZ2U7XG5cbi8qKiBVc2VkIHRvIGNvbXBvc2UgdW5pY29kZSBjYXB0dXJlIGdyb3Vwcy4gKi9cbnZhciByc0JyZWFrID0gJ1snICsgcnNCcmVha1JhbmdlICsgJ10nLFxuICAgIHJzQ29tYm8gPSAnWycgKyByc0NvbWJvTWFya3NSYW5nZSArIHJzQ29tYm9TeW1ib2xzUmFuZ2UgKyAnXScsXG4gICAgcnNEaWdpdHMgPSAnXFxcXGQrJyxcbiAgICByc0RpbmdiYXQgPSAnWycgKyByc0RpbmdiYXRSYW5nZSArICddJyxcbiAgICByc0xvd2VyID0gJ1snICsgcnNMb3dlclJhbmdlICsgJ10nLFxuICAgIHJzTWlzYyA9ICdbXicgKyByc0FzdHJhbFJhbmdlICsgcnNCcmVha1JhbmdlICsgcnNEaWdpdHMgKyByc0RpbmdiYXRSYW5nZSArIHJzTG93ZXJSYW5nZSArIHJzVXBwZXJSYW5nZSArICddJyxcbiAgICByc0ZpdHogPSAnXFxcXHVkODNjW1xcXFx1ZGZmYi1cXFxcdWRmZmZdJyxcbiAgICByc01vZGlmaWVyID0gJyg/OicgKyByc0NvbWJvICsgJ3wnICsgcnNGaXR6ICsgJyknLFxuICAgIHJzTm9uQXN0cmFsID0gJ1teJyArIHJzQXN0cmFsUmFuZ2UgKyAnXScsXG4gICAgcnNSZWdpb25hbCA9ICcoPzpcXFxcdWQ4M2NbXFxcXHVkZGU2LVxcXFx1ZGRmZl0pezJ9JyxcbiAgICByc1N1cnJQYWlyID0gJ1tcXFxcdWQ4MDAtXFxcXHVkYmZmXVtcXFxcdWRjMDAtXFxcXHVkZmZmXScsXG4gICAgcnNVcHBlciA9ICdbJyArIHJzVXBwZXJSYW5nZSArICddJyxcbiAgICByc1pXSiA9ICdcXFxcdTIwMGQnO1xuXG4vKiogVXNlZCB0byBjb21wb3NlIHVuaWNvZGUgcmVnZXhlcy4gKi9cbnZhciByc0xvd2VyTWlzYyA9ICcoPzonICsgcnNMb3dlciArICd8JyArIHJzTWlzYyArICcpJyxcbiAgICByc1VwcGVyTWlzYyA9ICcoPzonICsgcnNVcHBlciArICd8JyArIHJzTWlzYyArICcpJyxcbiAgICByZU9wdE1vZCA9IHJzTW9kaWZpZXIgKyAnPycsXG4gICAgcnNPcHRWYXIgPSAnWycgKyByc1ZhclJhbmdlICsgJ10/JyxcbiAgICByc09wdEpvaW4gPSAnKD86JyArIHJzWldKICsgJyg/OicgKyBbcnNOb25Bc3RyYWwsIHJzUmVnaW9uYWwsIHJzU3VyclBhaXJdLmpvaW4oJ3wnKSArICcpJyArIHJzT3B0VmFyICsgcmVPcHRNb2QgKyAnKSonLFxuICAgIHJzU2VxID0gcnNPcHRWYXIgKyByZU9wdE1vZCArIHJzT3B0Sm9pbixcbiAgICByc0Vtb2ppID0gJyg/OicgKyBbcnNEaW5nYmF0LCByc1JlZ2lvbmFsLCByc1N1cnJQYWlyXS5qb2luKCd8JykgKyAnKScgKyByc1NlcTtcblxuLyoqIFVzZWQgdG8gbWF0Y2ggbm9uLWNvbXBvdW5kIHdvcmRzIGNvbXBvc2VkIG9mIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzLiAqL1xudmFyIHJlQmFzaWNXb3JkID0gL1thLXpBLVowLTldKy9nO1xuXG4vKiogVXNlZCB0byBtYXRjaCBjb21wbGV4IG9yIGNvbXBvdW5kIHdvcmRzLiAqL1xudmFyIHJlQ29tcGxleFdvcmQgPSBSZWdFeHAoW1xuICByc1VwcGVyICsgJz8nICsgcnNMb3dlciArICcrKD89JyArIFtyc0JyZWFrLCByc1VwcGVyLCAnJCddLmpvaW4oJ3wnKSArICcpJyxcbiAgcnNVcHBlck1pc2MgKyAnKyg/PScgKyBbcnNCcmVhaywgcnNVcHBlciArIHJzTG93ZXJNaXNjLCAnJCddLmpvaW4oJ3wnKSArICcpJyxcbiAgcnNVcHBlciArICc/JyArIHJzTG93ZXJNaXNjICsgJysnLFxuICByc1VwcGVyICsgJysnLFxuICByc0RpZ2l0cyxcbiAgcnNFbW9qaVxuXS5qb2luKCd8JyksICdnJyk7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBzdHJpbmdzIHRoYXQgbmVlZCBhIG1vcmUgcm9idXN0IHJlZ2V4cCB0byBtYXRjaCB3b3Jkcy4gKi9cbnZhciByZUhhc0NvbXBsZXhXb3JkID0gL1thLXpdW0EtWl18WzAtOV1bYS16QS1aXXxbYS16QS1aXVswLTldfFteYS16QS1aMC05IF0vO1xuXG4vKiogVXNlZCBmb3IgYnVpbHQtaW4gbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogQnVpbHQtaW4gdmFsdWUgcmVmZXJlbmNlcy4gKi9cbnZhciBTeW1ib2wgPSByb290LlN5bWJvbDtcblxuLyoqIFVzZWQgdG8gY29udmVydCBzeW1ib2xzIHRvIHByaW1pdGl2ZXMgYW5kIHN0cmluZ3MuICovXG52YXIgc3ltYm9sUHJvdG8gPSBTeW1ib2wgPyBTeW1ib2wucHJvdG90eXBlIDogdW5kZWZpbmVkLFxuICAgIHN5bWJvbFRvU3RyaW5nID0gU3ltYm9sID8gc3ltYm9sUHJvdG8udG9TdHJpbmcgOiB1bmRlZmluZWQ7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UuIEEgdmFsdWUgaXMgb2JqZWN0LWxpa2UgaWYgaXQncyBub3QgYG51bGxgXG4gKiBhbmQgaGFzIGEgYHR5cGVvZmAgcmVzdWx0IG9mIFwib2JqZWN0XCIuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKF8ubm9vcCk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKG51bGwpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgYFN5bWJvbGAgcHJpbWl0aXZlIG9yIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1N5bWJvbChTeW1ib2wuaXRlcmF0b3IpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNTeW1ib2woJ2FiYycpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNTeW1ib2wodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnc3ltYm9sJyB8fFxuICAgIChpc09iamVjdExpa2UodmFsdWUpICYmIG9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpID09IHN5bWJvbFRhZyk7XG59XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhIHN0cmluZyBpZiBpdCdzIG5vdCBvbmUuIEFuIGVtcHR5IHN0cmluZyBpcyByZXR1cm5lZFxuICogZm9yIGBudWxsYCBhbmQgYHVuZGVmaW5lZGAgdmFsdWVzLiBUaGUgc2lnbiBvZiBgLTBgIGlzIHByZXNlcnZlZC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHByb2Nlc3MuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBzdHJpbmcuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8udG9TdHJpbmcobnVsbCk7XG4gKiAvLyA9PiAnJ1xuICpcbiAqIF8udG9TdHJpbmcoLTApO1xuICogLy8gPT4gJy0wJ1xuICpcbiAqIF8udG9TdHJpbmcoWzEsIDIsIDNdKTtcbiAqIC8vID0+ICcxLDIsMydcbiAqL1xuZnVuY3Rpb24gdG9TdHJpbmcodmFsdWUpIHtcbiAgLy8gRXhpdCBlYXJseSBmb3Igc3RyaW5ncyB0byBhdm9pZCBhIHBlcmZvcm1hbmNlIGhpdCBpbiBzb21lIGVudmlyb25tZW50cy5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiAnJztcbiAgfVxuICBpZiAoaXNTeW1ib2wodmFsdWUpKSB7XG4gICAgcmV0dXJuIFN5bWJvbCA/IHN5bWJvbFRvU3RyaW5nLmNhbGwodmFsdWUpIDogJyc7XG4gIH1cbiAgdmFyIHJlc3VsdCA9ICh2YWx1ZSArICcnKTtcbiAgcmV0dXJuIChyZXN1bHQgPT0gJzAnICYmICgxIC8gdmFsdWUpID09IC1JTkZJTklUWSkgPyAnLTAnIDogcmVzdWx0O1xufVxuXG4vKipcbiAqIFNwbGl0cyBgc3RyaW5nYCBpbnRvIGFuIGFycmF5IG9mIGl0cyB3b3Jkcy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFN0cmluZ1xuICogQHBhcmFtIHtzdHJpbmd9IFtzdHJpbmc9JyddIFRoZSBzdHJpbmcgdG8gaW5zcGVjdC5cbiAqIEBwYXJhbSB7UmVnRXhwfHN0cmluZ30gW3BhdHRlcm5dIFRoZSBwYXR0ZXJuIHRvIG1hdGNoIHdvcmRzLlxuICogQHBhcmFtLSB7T2JqZWN0fSBbZ3VhcmRdIEVuYWJsZXMgdXNlIGFzIGFuIGl0ZXJhdGVlIGZvciBmdW5jdGlvbnMgbGlrZSBgXy5tYXBgLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSB3b3JkcyBvZiBgc3RyaW5nYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy53b3JkcygnZnJlZCwgYmFybmV5LCAmIHBlYmJsZXMnKTtcbiAqIC8vID0+IFsnZnJlZCcsICdiYXJuZXknLCAncGViYmxlcyddXG4gKlxuICogXy53b3JkcygnZnJlZCwgYmFybmV5LCAmIHBlYmJsZXMnLCAvW14sIF0rL2cpO1xuICogLy8gPT4gWydmcmVkJywgJ2Jhcm5leScsICcmJywgJ3BlYmJsZXMnXVxuICovXG5mdW5jdGlvbiB3b3JkcyhzdHJpbmcsIHBhdHRlcm4sIGd1YXJkKSB7XG4gIHN0cmluZyA9IHRvU3RyaW5nKHN0cmluZyk7XG4gIHBhdHRlcm4gPSBndWFyZCA/IHVuZGVmaW5lZCA6IHBhdHRlcm47XG5cbiAgaWYgKHBhdHRlcm4gPT09IHVuZGVmaW5lZCkge1xuICAgIHBhdHRlcm4gPSByZUhhc0NvbXBsZXhXb3JkLnRlc3Qoc3RyaW5nKSA/IHJlQ29tcGxleFdvcmQgOiByZUJhc2ljV29yZDtcbiAgfVxuICByZXR1cm4gc3RyaW5nLm1hdGNoKHBhdHRlcm4pIHx8IFtdO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHdvcmRzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcHJvdG8gPSBFbGVtZW50LnByb3RvdHlwZTtcbnZhciB2ZW5kb3IgPSBwcm90by5tYXRjaGVzXG4gIHx8IHByb3RvLm1hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by53ZWJraXRNYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ubW96TWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLm1zTWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLm9NYXRjaGVzU2VsZWN0b3I7XG5cbm1vZHVsZS5leHBvcnRzID0gbWF0Y2g7XG5cbi8qKlxuICogTWF0Y2ggYGVsYCB0byBgc2VsZWN0b3JgLlxuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxcbiAqIEBwYXJhbSB7U3RyaW5nfSBzZWxlY3RvclxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gbWF0Y2goZWwsIHNlbGVjdG9yKSB7XG4gIGlmICh2ZW5kb3IpIHJldHVybiB2ZW5kb3IuY2FsbChlbCwgc2VsZWN0b3IpO1xuICB2YXIgbm9kZXMgPSBlbC5wYXJlbnROb2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKG5vZGVzW2ldID09IGVsKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gY2xhc3NOYW1lRnJvbVZOb2RlO1xuXG52YXIgX3NlbGVjdG9yUGFyc2VyMiA9IHJlcXVpcmUoJy4vc2VsZWN0b3JQYXJzZXInKTtcblxudmFyIF9zZWxlY3RvclBhcnNlcjMgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9zZWxlY3RvclBhcnNlcjIpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBjbGFzc05hbWVGcm9tVk5vZGUodk5vZGUpIHtcbiAgdmFyIF9zZWxlY3RvclBhcnNlciA9ICgwLCBfc2VsZWN0b3JQYXJzZXIzLmRlZmF1bHQpKHZOb2RlLnNlbCk7XG5cbiAgdmFyIGNuID0gX3NlbGVjdG9yUGFyc2VyLmNsYXNzTmFtZTtcblxuXG4gIGlmICghdk5vZGUuZGF0YSkge1xuICAgIHJldHVybiBjbjtcbiAgfVxuXG4gIHZhciBfdk5vZGUkZGF0YSA9IHZOb2RlLmRhdGE7XG4gIHZhciBkYXRhQ2xhc3MgPSBfdk5vZGUkZGF0YS5jbGFzcztcbiAgdmFyIHByb3BzID0gX3ZOb2RlJGRhdGEucHJvcHM7XG5cblxuICBpZiAoZGF0YUNsYXNzKSB7XG4gICAgdmFyIGMgPSBPYmplY3Qua2V5cyh2Tm9kZS5kYXRhLmNsYXNzKS5maWx0ZXIoZnVuY3Rpb24gKGNsKSB7XG4gICAgICByZXR1cm4gdk5vZGUuZGF0YS5jbGFzc1tjbF07XG4gICAgfSk7XG4gICAgY24gKz0gJyAnICsgYy5qb2luKCcgJyk7XG4gIH1cblxuICBpZiAocHJvcHMgJiYgcHJvcHMuY2xhc3NOYW1lKSB7XG4gICAgY24gKz0gJyAnICsgcHJvcHMuY2xhc3NOYW1lO1xuICB9XG5cbiAgcmV0dXJuIGNuLnRyaW0oKTtcbn0iLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBzZWxlY3RvclBhcnNlcjtcblxudmFyIF9icm93c2VyU3BsaXQgPSByZXF1aXJlKCdicm93c2VyLXNwbGl0Jyk7XG5cbnZhciBfYnJvd3NlclNwbGl0MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Jyb3dzZXJTcGxpdCk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBjbGFzc0lkU3BsaXQgPSAvKFtcXC4jXT9bYS16QS1aMC05XFx1MDA3Ri1cXHVGRkZGXzotXSspLztcbnZhciBub3RDbGFzc0lkID0gL15cXC58Iy87XG5cbmZ1bmN0aW9uIHNlbGVjdG9yUGFyc2VyKCkge1xuICB2YXIgc2VsZWN0b3IgPSBhcmd1bWVudHMubGVuZ3RoIDw9IDAgfHwgYXJndW1lbnRzWzBdID09PSB1bmRlZmluZWQgPyAnJyA6IGFyZ3VtZW50c1swXTtcblxuICB2YXIgdGFnTmFtZSA9IHZvaWQgMDtcbiAgdmFyIGlkID0gJyc7XG4gIHZhciBjbGFzc2VzID0gW107XG5cbiAgdmFyIHRhZ1BhcnRzID0gKDAsIF9icm93c2VyU3BsaXQyLmRlZmF1bHQpKHNlbGVjdG9yLCBjbGFzc0lkU3BsaXQpO1xuXG4gIGlmIChub3RDbGFzc0lkLnRlc3QodGFnUGFydHNbMV0pIHx8IHNlbGVjdG9yID09PSAnJykge1xuICAgIHRhZ05hbWUgPSAnZGl2JztcbiAgfVxuXG4gIHZhciBwYXJ0ID0gdm9pZCAwO1xuICB2YXIgdHlwZSA9IHZvaWQgMDtcbiAgdmFyIGkgPSB2b2lkIDA7XG5cbiAgZm9yIChpID0gMDsgaSA8IHRhZ1BhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgcGFydCA9IHRhZ1BhcnRzW2ldO1xuXG4gICAgaWYgKCFwYXJ0KSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICB0eXBlID0gcGFydC5jaGFyQXQoMCk7XG5cbiAgICBpZiAoIXRhZ05hbWUpIHtcbiAgICAgIHRhZ05hbWUgPSBwYXJ0O1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJy4nKSB7XG4gICAgICBjbGFzc2VzLnB1c2gocGFydC5zdWJzdHJpbmcoMSwgcGFydC5sZW5ndGgpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICcjJykge1xuICAgICAgaWQgPSBwYXJ0LnN1YnN0cmluZygxLCBwYXJ0Lmxlbmd0aCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB0YWdOYW1lOiB0YWdOYW1lLFxuICAgIGlkOiBpZCxcbiAgICBjbGFzc05hbWU6IGNsYXNzZXMuam9pbignICcpXG4gIH07XG59IiwiXG4vLyBBbGwgU1ZHIGNoaWxkcmVuIGVsZW1lbnRzLCBub3QgaW4gdGhpcyBsaXN0LCBzaG91bGQgc2VsZi1jbG9zZVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgLy8gaHR0cDovL3d3dy53My5vcmcvVFIvU1ZHL2ludHJvLmh0bWwjVGVybUNvbnRhaW5lckVsZW1lbnRcbiAgJ2EnOiB0cnVlLFxuICAnZGVmcyc6IHRydWUsXG4gICdnbHlwaCc6IHRydWUsXG4gICdnJzogdHJ1ZSxcbiAgJ21hcmtlcic6IHRydWUsXG4gICdtYXNrJzogdHJ1ZSxcbiAgJ21pc3NpbmctZ2x5cGgnOiB0cnVlLFxuICAncGF0dGVybic6IHRydWUsXG4gICdzdmcnOiB0cnVlLFxuICAnc3dpdGNoJzogdHJ1ZSxcbiAgJ3N5bWJvbCc6IHRydWUsXG5cbiAgLy8gaHR0cDovL3d3dy53My5vcmcvVFIvU1ZHL2ludHJvLmh0bWwjVGVybURlc2NyaXB0aXZlRWxlbWVudFxuICAnZGVzYyc6IHRydWUsXG4gICdtZXRhZGF0YSc6IHRydWUsXG4gICd0aXRsZSc6IHRydWVcbn07IiwiXG52YXIgaW5pdCA9IHJlcXVpcmUoJy4vaW5pdCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluaXQoW3JlcXVpcmUoJy4vbW9kdWxlcy9hdHRyaWJ1dGVzJyksIHJlcXVpcmUoJy4vbW9kdWxlcy9zdHlsZScpXSk7IiwiXG52YXIgcGFyc2VTZWxlY3RvciA9IHJlcXVpcmUoJy4vcGFyc2Utc2VsZWN0b3InKTtcbnZhciBWT0lEX0VMRU1FTlRTID0gcmVxdWlyZSgnLi92b2lkLWVsZW1lbnRzJyk7XG52YXIgQ09OVEFJTkVSX0VMRU1FTlRTID0gcmVxdWlyZSgnLi9jb250YWluZXItZWxlbWVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbml0KG1vZHVsZXMpIHtcbiAgZnVuY3Rpb24gcGFyc2UoZGF0YSkge1xuICAgIHJldHVybiBtb2R1bGVzLnJlZHVjZShmdW5jdGlvbiAoYXJyLCBmbikge1xuICAgICAgYXJyLnB1c2goZm4oZGF0YSkpO1xuICAgICAgcmV0dXJuIGFycjtcbiAgICB9LCBbXSkuZmlsdGVyKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgIHJldHVybiByZXN1bHQgIT09ICcnO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIHJlbmRlclRvU3RyaW5nKHZub2RlKSB7XG4gICAgaWYgKCF2bm9kZS5zZWwgJiYgdm5vZGUudGV4dCkge1xuICAgICAgcmV0dXJuIHZub2RlLnRleHQ7XG4gICAgfVxuXG4gICAgdm5vZGUuZGF0YSA9IHZub2RlLmRhdGEgfHwge307XG5cbiAgICAvLyBTdXBwb3J0IHRodW5rc1xuICAgIGlmICh0eXBlb2Ygdm5vZGUuc2VsID09PSAnc3RyaW5nJyAmJiB2bm9kZS5zZWwuc2xpY2UoMCwgNSkgPT09ICd0aHVuaycpIHtcbiAgICAgIHZub2RlID0gdm5vZGUuZGF0YS5mbi5hcHBseShudWxsLCB2bm9kZS5kYXRhLmFyZ3MpO1xuICAgIH1cblxuICAgIHZhciB0YWdOYW1lID0gcGFyc2VTZWxlY3Rvcih2bm9kZS5zZWwpLnRhZ05hbWU7XG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBwYXJzZSh2bm9kZSk7XG4gICAgdmFyIHN2ZyA9IHZub2RlLmRhdGEubnMgPT09ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG4gICAgdmFyIHRhZyA9IFtdO1xuXG4gICAgLy8gT3BlbiB0YWdcbiAgICB0YWcucHVzaCgnPCcgKyB0YWdOYW1lKTtcbiAgICBpZiAoYXR0cmlidXRlcy5sZW5ndGgpIHtcbiAgICAgIHRhZy5wdXNoKCcgJyArIGF0dHJpYnV0ZXMuam9pbignICcpKTtcbiAgICB9XG4gICAgaWYgKHN2ZyAmJiBDT05UQUlORVJfRUxFTUVOVFNbdGFnTmFtZV0gIT09IHRydWUpIHtcbiAgICAgIHRhZy5wdXNoKCcgLycpO1xuICAgIH1cbiAgICB0YWcucHVzaCgnPicpO1xuXG4gICAgLy8gQ2xvc2UgdGFnLCBpZiBuZWVkZWRcbiAgICBpZiAoVk9JRF9FTEVNRU5UU1t0YWdOYW1lXSAhPT0gdHJ1ZSAmJiAhc3ZnIHx8IHN2ZyAmJiBDT05UQUlORVJfRUxFTUVOVFNbdGFnTmFtZV0gPT09IHRydWUpIHtcbiAgICAgIGlmICh2bm9kZS5kYXRhLnByb3BzICYmIHZub2RlLmRhdGEucHJvcHMuaW5uZXJIVE1MKSB7XG4gICAgICAgIHRhZy5wdXNoKHZub2RlLmRhdGEucHJvcHMuaW5uZXJIVE1MKTtcbiAgICAgIH0gZWxzZSBpZiAodm5vZGUudGV4dCkge1xuICAgICAgICB0YWcucHVzaCh2bm9kZS50ZXh0KTtcbiAgICAgIH0gZWxzZSBpZiAodm5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgdm5vZGUuY2hpbGRyZW4uZm9yRWFjaChmdW5jdGlvbiAoY2hpbGQpIHtcbiAgICAgICAgICB0YWcucHVzaChyZW5kZXJUb1N0cmluZyhjaGlsZCkpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHRhZy5wdXNoKCc8LycgKyB0YWdOYW1lICsgJz4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGFnLmpvaW4oJycpO1xuICB9O1xufTsiLCJcbnZhciBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2guZm9yb3duJyk7XG52YXIgZXNjYXBlID0gcmVxdWlyZSgnbG9kYXNoLmVzY2FwZScpO1xudmFyIHVuaW9uID0gcmVxdWlyZSgnbG9kYXNoLnVuaW9uJyk7XG5cbnZhciBwYXJzZVNlbGVjdG9yID0gcmVxdWlyZSgnLi4vcGFyc2Utc2VsZWN0b3InKTtcblxuLy8gZGF0YS5hdHRycywgZGF0YS5wcm9wcywgZGF0YS5jbGFzc1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0dHJpYnV0ZXModm5vZGUpIHtcbiAgdmFyIHNlbGVjdG9yID0gcGFyc2VTZWxlY3Rvcih2bm9kZS5zZWwpO1xuICB2YXIgcGFyc2VkQ2xhc3NlcyA9IHNlbGVjdG9yLmNsYXNzTmFtZS5zcGxpdCgnICcpO1xuXG4gIHZhciBhdHRyaWJ1dGVzID0gW107XG4gIHZhciBjbGFzc2VzID0gW107XG4gIHZhciB2YWx1ZXMgPSB7fTtcblxuICBpZiAoc2VsZWN0b3IuaWQpIHtcbiAgICB2YWx1ZXMuaWQgPSBzZWxlY3Rvci5pZDtcbiAgfVxuXG4gIHNldEF0dHJpYnV0ZXModm5vZGUuZGF0YS5wcm9wcywgdmFsdWVzKTtcbiAgc2V0QXR0cmlidXRlcyh2bm9kZS5kYXRhLmF0dHJzLCB2YWx1ZXMpOyAvLyBgYXR0cnNgIG92ZXJyaWRlIGBwcm9wc2AsIG5vdCBzdXJlIGlmIHRoaXMgaXMgZ29vZCBzb1xuXG4gIGlmICh2bm9kZS5kYXRhLmNsYXNzKSB7XG4gICAgLy8gT21pdCBgY2xhc3NOYW1lYCBhdHRyaWJ1dGUgaWYgYGNsYXNzYCBpcyBzZXQgb24gdm5vZGVcbiAgICB2YWx1ZXMuY2xhc3MgPSB1bmRlZmluZWQ7XG4gIH1cbiAgZm9yT3duKHZub2RlLmRhdGEuY2xhc3MsIGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgaWYgKHZhbHVlID09PSB0cnVlKSB7XG4gICAgICBjbGFzc2VzLnB1c2goa2V5KTtcbiAgICB9XG4gIH0pO1xuICBjbGFzc2VzID0gdW5pb24oY2xhc3NlcywgdmFsdWVzLmNsYXNzLCBwYXJzZWRDbGFzc2VzKS5maWx0ZXIoZnVuY3Rpb24gKHgpIHtcbiAgICByZXR1cm4geCAhPT0gJyc7XG4gIH0pO1xuXG4gIGlmIChjbGFzc2VzLmxlbmd0aCkge1xuICAgIHZhbHVlcy5jbGFzcyA9IGNsYXNzZXMuam9pbignICcpO1xuICB9XG5cbiAgZm9yT3duKHZhbHVlcywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICBhdHRyaWJ1dGVzLnB1c2godmFsdWUgPT09IHRydWUgPyBrZXkgOiBrZXkgKyAnPVwiJyArIGVzY2FwZSh2YWx1ZSkgKyAnXCInKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGF0dHJpYnV0ZXMubGVuZ3RoID8gYXR0cmlidXRlcy5qb2luKCcgJykgOiAnJztcbn07XG5cbmZ1bmN0aW9uIHNldEF0dHJpYnV0ZXModmFsdWVzLCB0YXJnZXQpIHtcbiAgZm9yT3duKHZhbHVlcywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoa2V5ID09PSAnaHRtbEZvcicpIHtcbiAgICAgIHRhcmdldFsnZm9yJ10gPSB2YWx1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGtleSA9PT0gJ2NsYXNzTmFtZScpIHtcbiAgICAgIHRhcmdldFsnY2xhc3MnXSA9IHZhbHVlLnNwbGl0KCcgJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChrZXkgPT09ICdpbm5lckhUTUwnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRhcmdldFtrZXldID0gdmFsdWU7XG4gIH0pO1xufSIsInZhciBfZXh0ZW5kcyA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gKHRhcmdldCkgeyBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykgeyB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldOyBmb3IgKHZhciBrZXkgaW4gc291cmNlKSB7IGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc291cmNlLCBrZXkpKSB7IHRhcmdldFtrZXldID0gc291cmNlW2tleV07IH0gfSB9IHJldHVybiB0YXJnZXQ7IH07XG5cbnZhciBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2guZm9yb3duJyk7XG52YXIgZXNjYXBlID0gcmVxdWlyZSgnbG9kYXNoLmVzY2FwZScpO1xudmFyIGtlYmFiQ2FzZSA9IHJlcXVpcmUoJ2xvZGFzaC5rZWJhYmNhc2UnKTtcblxuLy8gZGF0YS5zdHlsZVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHN0eWxlKHZub2RlKSB7XG4gIHZhciBzdHlsZXMgPSBbXTtcbiAgdmFyIHN0eWxlID0gdm5vZGUuZGF0YS5zdHlsZSB8fCB7fTtcblxuICAvLyBtZXJnZSBpbiBgZGVsYXllZGAgcHJvcGVydGllc1xuICBpZiAoc3R5bGUuZGVsYXllZCkge1xuICAgIF9leHRlbmRzKHN0eWxlLCBzdHlsZS5kZWxheWVkKTtcbiAgfVxuXG4gIGZvck93bihzdHlsZSwgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAvLyBvbWl0IGhvb2sgb2JqZWN0c1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBzdHlsZXMucHVzaChrZWJhYkNhc2Uoa2V5KSArICc6ICcgKyBlc2NhcGUodmFsdWUpKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBzdHlsZXMubGVuZ3RoID8gJ3N0eWxlPVwiJyArIHN0eWxlcy5qb2luKCc7ICcpICsgJ1wiJyA6ICcnO1xufTsiLCJcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9NYXR0LUVzY2gvdmlydHVhbC1kb20vYmxvYi9tYXN0ZXIvdmlydHVhbC1oeXBlcnNjcmlwdC9wYXJzZS10YWcuanNcblxudmFyIHNwbGl0ID0gcmVxdWlyZSgnYnJvd3Nlci1zcGxpdCcpO1xuXG52YXIgY2xhc3NJZFNwbGl0ID0gLyhbXFwuI10/W2EtekEtWjAtOVxcdTAwN0YtXFx1RkZGRl86LV0rKS87XG52YXIgbm90Q2xhc3NJZCA9IC9eXFwufCMvO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlU2VsZWN0b3Ioc2VsZWN0b3IsIHVwcGVyKSB7XG4gIHNlbGVjdG9yID0gc2VsZWN0b3IgfHwgJyc7XG4gIHZhciB0YWdOYW1lO1xuICB2YXIgaWQgPSAnJztcbiAgdmFyIGNsYXNzZXMgPSBbXTtcblxuICB2YXIgdGFnUGFydHMgPSBzcGxpdChzZWxlY3RvciwgY2xhc3NJZFNwbGl0KTtcblxuICBpZiAobm90Q2xhc3NJZC50ZXN0KHRhZ1BhcnRzWzFdKSB8fCBzZWxlY3RvciA9PT0gJycpIHtcbiAgICB0YWdOYW1lID0gJ2Rpdic7XG4gIH1cblxuICB2YXIgcGFydCwgdHlwZSwgaTtcblxuICBmb3IgKGkgPSAwOyBpIDwgdGFnUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBwYXJ0ID0gdGFnUGFydHNbaV07XG5cbiAgICBpZiAoIXBhcnQpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHR5cGUgPSBwYXJ0LmNoYXJBdCgwKTtcblxuICAgIGlmICghdGFnTmFtZSkge1xuICAgICAgdGFnTmFtZSA9IHBhcnQ7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnLicpIHtcbiAgICAgIGNsYXNzZXMucHVzaChwYXJ0LnN1YnN0cmluZygxLCBwYXJ0Lmxlbmd0aCkpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJyMnKSB7XG4gICAgICBpZCA9IHBhcnQuc3Vic3RyaW5nKDEsIHBhcnQubGVuZ3RoKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRhZ05hbWU6IHVwcGVyID09PSB0cnVlID8gdGFnTmFtZS50b1VwcGVyQ2FzZSgpIDogdGFnTmFtZSxcbiAgICBpZDogaWQsXG4gICAgY2xhc3NOYW1lOiBjbGFzc2VzLmpvaW4oJyAnKVxuICB9O1xufTsiLCJcbi8vIGh0dHA6Ly93d3cudzMub3JnL2h0bWwvd2cvZHJhZnRzL2h0bWwvbWFzdGVyL3N5bnRheC5odG1sI3ZvaWQtZWxlbWVudHNcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFyZWE6IHRydWUsXG4gIGJhc2U6IHRydWUsXG4gIGJyOiB0cnVlLFxuICBjb2w6IHRydWUsXG4gIGVtYmVkOiB0cnVlLFxuICBocjogdHJ1ZSxcbiAgaW1nOiB0cnVlLFxuICBpbnB1dDogdHJ1ZSxcbiAga2V5Z2VuOiB0cnVlLFxuICBsaW5rOiB0cnVlLFxuICBtZXRhOiB0cnVlLFxuICBwYXJhbTogdHJ1ZSxcbiAgc291cmNlOiB0cnVlLFxuICB0cmFjazogdHJ1ZSxcbiAgd2JyOiB0cnVlXG59OyIsInZhciBWTm9kZSA9IHJlcXVpcmUoJy4vdm5vZGUnKTtcbnZhciBpcyA9IHJlcXVpcmUoJy4vaXMnKTtcblxuZnVuY3Rpb24gYWRkTlMoZGF0YSwgY2hpbGRyZW4pIHtcbiAgZGF0YS5ucyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG4gIGlmIChjaGlsZHJlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgYWRkTlMoY2hpbGRyZW5baV0uZGF0YSwgY2hpbGRyZW5baV0uY2hpbGRyZW4pO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGgoc2VsLCBiLCBjKSB7XG4gIHZhciBkYXRhID0ge30sIGNoaWxkcmVuLCB0ZXh0LCBpO1xuICBpZiAoYyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgZGF0YSA9IGI7XG4gICAgaWYgKGlzLmFycmF5KGMpKSB7IGNoaWxkcmVuID0gYzsgfVxuICAgIGVsc2UgaWYgKGlzLnByaW1pdGl2ZShjKSkgeyB0ZXh0ID0gYzsgfVxuICB9IGVsc2UgaWYgKGIgIT09IHVuZGVmaW5lZCkge1xuICAgIGlmIChpcy5hcnJheShiKSkgeyBjaGlsZHJlbiA9IGI7IH1cbiAgICBlbHNlIGlmIChpcy5wcmltaXRpdmUoYikpIHsgdGV4dCA9IGI7IH1cbiAgICBlbHNlIHsgZGF0YSA9IGI7IH1cbiAgfVxuICBpZiAoaXMuYXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoaXMucHJpbWl0aXZlKGNoaWxkcmVuW2ldKSkgY2hpbGRyZW5baV0gPSBWTm9kZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGlsZHJlbltpXSk7XG4gICAgfVxuICB9XG4gIGlmIChzZWxbMF0gPT09ICdzJyAmJiBzZWxbMV0gPT09ICd2JyAmJiBzZWxbMl0gPT09ICdnJykge1xuICAgIGFkZE5TKGRhdGEsIGNoaWxkcmVuKTtcbiAgfVxuICByZXR1cm4gVk5vZGUoc2VsLCBkYXRhLCBjaGlsZHJlbiwgdGV4dCwgdW5kZWZpbmVkKTtcbn07XG4iLCJmdW5jdGlvbiBjcmVhdGVFbGVtZW50KHRhZ05hbWUpe1xuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZVVSSSwgcXVhbGlmaWVkTmFtZSl7XG4gIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlVVJJLCBxdWFsaWZpZWROYW1lKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGV4dE5vZGUodGV4dCl7XG4gIHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbn1cblxuXG5mdW5jdGlvbiBpbnNlcnRCZWZvcmUocGFyZW50Tm9kZSwgbmV3Tm9kZSwgcmVmZXJlbmNlTm9kZSl7XG4gIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKG5ld05vZGUsIHJlZmVyZW5jZU5vZGUpO1xufVxuXG5cbmZ1bmN0aW9uIHJlbW92ZUNoaWxkKG5vZGUsIGNoaWxkKXtcbiAgbm9kZS5yZW1vdmVDaGlsZChjaGlsZCk7XG59XG5cbmZ1bmN0aW9uIGFwcGVuZENoaWxkKG5vZGUsIGNoaWxkKXtcbiAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZCk7XG59XG5cbmZ1bmN0aW9uIHBhcmVudE5vZGUobm9kZSl7XG4gIHJldHVybiBub2RlLnBhcmVudEVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIG5leHRTaWJsaW5nKG5vZGUpe1xuICByZXR1cm4gbm9kZS5uZXh0U2libGluZztcbn1cblxuZnVuY3Rpb24gdGFnTmFtZShub2RlKXtcbiAgcmV0dXJuIG5vZGUudGFnTmFtZTtcbn1cblxuZnVuY3Rpb24gc2V0VGV4dENvbnRlbnQobm9kZSwgdGV4dCl7XG4gIG5vZGUudGV4dENvbnRlbnQgPSB0ZXh0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY3JlYXRlRWxlbWVudDogY3JlYXRlRWxlbWVudCxcbiAgY3JlYXRlRWxlbWVudE5TOiBjcmVhdGVFbGVtZW50TlMsXG4gIGNyZWF0ZVRleHROb2RlOiBjcmVhdGVUZXh0Tm9kZSxcbiAgYXBwZW5kQ2hpbGQ6IGFwcGVuZENoaWxkLFxuICByZW1vdmVDaGlsZDogcmVtb3ZlQ2hpbGQsXG4gIGluc2VydEJlZm9yZTogaW5zZXJ0QmVmb3JlLFxuICBwYXJlbnROb2RlOiBwYXJlbnROb2RlLFxuICBuZXh0U2libGluZzogbmV4dFNpYmxpbmcsXG4gIHRhZ05hbWU6IHRhZ05hbWUsXG4gIHNldFRleHRDb250ZW50OiBzZXRUZXh0Q29udGVudFxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBhcnJheTogQXJyYXkuaXNBcnJheSxcbiAgcHJpbWl0aXZlOiBmdW5jdGlvbihzKSB7IHJldHVybiB0eXBlb2YgcyA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHMgPT09ICdudW1iZXInOyB9LFxufTtcbiIsInZhciBib29sZWFuQXR0cnMgPSBbXCJhbGxvd2Z1bGxzY3JlZW5cIiwgXCJhc3luY1wiLCBcImF1dG9mb2N1c1wiLCBcImF1dG9wbGF5XCIsIFwiY2hlY2tlZFwiLCBcImNvbXBhY3RcIiwgXCJjb250cm9sc1wiLCBcImRlY2xhcmVcIiwgXG4gICAgICAgICAgICAgICAgXCJkZWZhdWx0XCIsIFwiZGVmYXVsdGNoZWNrZWRcIiwgXCJkZWZhdWx0bXV0ZWRcIiwgXCJkZWZhdWx0c2VsZWN0ZWRcIiwgXCJkZWZlclwiLCBcImRpc2FibGVkXCIsIFwiZHJhZ2dhYmxlXCIsIFxuICAgICAgICAgICAgICAgIFwiZW5hYmxlZFwiLCBcImZvcm1ub3ZhbGlkYXRlXCIsIFwiaGlkZGVuXCIsIFwiaW5kZXRlcm1pbmF0ZVwiLCBcImluZXJ0XCIsIFwiaXNtYXBcIiwgXCJpdGVtc2NvcGVcIiwgXCJsb29wXCIsIFwibXVsdGlwbGVcIiwgXG4gICAgICAgICAgICAgICAgXCJtdXRlZFwiLCBcIm5vaHJlZlwiLCBcIm5vcmVzaXplXCIsIFwibm9zaGFkZVwiLCBcIm5vdmFsaWRhdGVcIiwgXCJub3dyYXBcIiwgXCJvcGVuXCIsIFwicGF1c2VvbmV4aXRcIiwgXCJyZWFkb25seVwiLCBcbiAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCIsIFwicmV2ZXJzZWRcIiwgXCJzY29wZWRcIiwgXCJzZWFtbGVzc1wiLCBcInNlbGVjdGVkXCIsIFwic29ydGFibGVcIiwgXCJzcGVsbGNoZWNrXCIsIFwidHJhbnNsYXRlXCIsIFxuICAgICAgICAgICAgICAgIFwidHJ1ZXNwZWVkXCIsIFwidHlwZW11c3RtYXRjaFwiLCBcInZpc2libGVcIl07XG4gICAgXG52YXIgYm9vbGVhbkF0dHJzRGljdCA9IHt9O1xuZm9yKHZhciBpPTAsIGxlbiA9IGJvb2xlYW5BdHRycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICBib29sZWFuQXR0cnNEaWN0W2Jvb2xlYW5BdHRyc1tpXV0gPSB0cnVlO1xufVxuICAgIFxuZnVuY3Rpb24gdXBkYXRlQXR0cnMob2xkVm5vZGUsIHZub2RlKSB7XG4gIHZhciBrZXksIGN1ciwgb2xkLCBlbG0gPSB2bm9kZS5lbG0sXG4gICAgICBvbGRBdHRycyA9IG9sZFZub2RlLmRhdGEuYXR0cnMgfHwge30sIGF0dHJzID0gdm5vZGUuZGF0YS5hdHRycyB8fCB7fTtcbiAgXG4gIC8vIHVwZGF0ZSBtb2RpZmllZCBhdHRyaWJ1dGVzLCBhZGQgbmV3IGF0dHJpYnV0ZXNcbiAgZm9yIChrZXkgaW4gYXR0cnMpIHtcbiAgICBjdXIgPSBhdHRyc1trZXldO1xuICAgIG9sZCA9IG9sZEF0dHJzW2tleV07XG4gICAgaWYgKG9sZCAhPT0gY3VyKSB7XG4gICAgICAvLyBUT0RPOiBhZGQgc3VwcG9ydCB0byBuYW1lc3BhY2VkIGF0dHJpYnV0ZXMgKHNldEF0dHJpYnV0ZU5TKVxuICAgICAgaWYoIWN1ciAmJiBib29sZWFuQXR0cnNEaWN0W2tleV0pXG4gICAgICAgIGVsbS5yZW1vdmVBdHRyaWJ1dGUoa2V5KTtcbiAgICAgIGVsc2VcbiAgICAgICAgZWxtLnNldEF0dHJpYnV0ZShrZXksIGN1cik7XG4gICAgfVxuICB9XG4gIC8vcmVtb3ZlIHJlbW92ZWQgYXR0cmlidXRlc1xuICAvLyB1c2UgYGluYCBvcGVyYXRvciBzaW5jZSB0aGUgcHJldmlvdXMgYGZvcmAgaXRlcmF0aW9uIHVzZXMgaXQgKC5pLmUuIGFkZCBldmVuIGF0dHJpYnV0ZXMgd2l0aCB1bmRlZmluZWQgdmFsdWUpXG4gIC8vIHRoZSBvdGhlciBvcHRpb24gaXMgdG8gcmVtb3ZlIGFsbCBhdHRyaWJ1dGVzIHdpdGggdmFsdWUgPT0gdW5kZWZpbmVkXG4gIGZvciAoa2V5IGluIG9sZEF0dHJzKSB7XG4gICAgaWYgKCEoa2V5IGluIGF0dHJzKSkge1xuICAgICAgZWxtLnJlbW92ZUF0dHJpYnV0ZShrZXkpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtjcmVhdGU6IHVwZGF0ZUF0dHJzLCB1cGRhdGU6IHVwZGF0ZUF0dHJzfTtcbiIsImZ1bmN0aW9uIHVwZGF0ZUNsYXNzKG9sZFZub2RlLCB2bm9kZSkge1xuICB2YXIgY3VyLCBuYW1lLCBlbG0gPSB2bm9kZS5lbG0sXG4gICAgICBvbGRDbGFzcyA9IG9sZFZub2RlLmRhdGEuY2xhc3MgfHwge30sXG4gICAgICBrbGFzcyA9IHZub2RlLmRhdGEuY2xhc3MgfHwge307XG4gIGZvciAobmFtZSBpbiBvbGRDbGFzcykge1xuICAgIGlmICgha2xhc3NbbmFtZV0pIHtcbiAgICAgIGVsbS5jbGFzc0xpc3QucmVtb3ZlKG5hbWUpO1xuICAgIH1cbiAgfVxuICBmb3IgKG5hbWUgaW4ga2xhc3MpIHtcbiAgICBjdXIgPSBrbGFzc1tuYW1lXTtcbiAgICBpZiAoY3VyICE9PSBvbGRDbGFzc1tuYW1lXSkge1xuICAgICAgZWxtLmNsYXNzTGlzdFtjdXIgPyAnYWRkJyA6ICdyZW1vdmUnXShuYW1lKTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7Y3JlYXRlOiB1cGRhdGVDbGFzcywgdXBkYXRlOiB1cGRhdGVDbGFzc307XG4iLCJ2YXIgaXMgPSByZXF1aXJlKCcuLi9pcycpO1xuXG5mdW5jdGlvbiBhcnJJbnZva2VyKGFycikge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFhcnIubGVuZ3RoKSByZXR1cm47XG4gICAgLy8gU3BlY2lhbCBjYXNlIHdoZW4gbGVuZ3RoIGlzIHR3bywgZm9yIHBlcmZvcm1hbmNlXG4gICAgYXJyLmxlbmd0aCA9PT0gMiA/IGFyclswXShhcnJbMV0pIDogYXJyWzBdLmFwcGx5KHVuZGVmaW5lZCwgYXJyLnNsaWNlKDEpKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gZm5JbnZva2VyKG8pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGV2KSB7IFxuICAgIGlmIChvLmZuID09PSBudWxsKSByZXR1cm47XG4gICAgby5mbihldik7IFxuICB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVFdmVudExpc3RlbmVycyhvbGRWbm9kZSwgdm5vZGUpIHtcbiAgdmFyIG5hbWUsIGN1ciwgb2xkLCBlbG0gPSB2bm9kZS5lbG0sXG4gICAgICBvbGRPbiA9IG9sZFZub2RlLmRhdGEub24gfHwge30sIG9uID0gdm5vZGUuZGF0YS5vbjtcbiAgaWYgKCFvbikgcmV0dXJuO1xuICBmb3IgKG5hbWUgaW4gb24pIHtcbiAgICBjdXIgPSBvbltuYW1lXTtcbiAgICBvbGQgPSBvbGRPbltuYW1lXTtcbiAgICBpZiAob2xkID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpcy5hcnJheShjdXIpKSB7XG4gICAgICAgIGVsbS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGFyckludm9rZXIoY3VyKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXIgPSB7Zm46IGN1cn07XG4gICAgICAgIG9uW25hbWVdID0gY3VyO1xuICAgICAgICBlbG0uYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCBmbkludm9rZXIoY3VyKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpcy5hcnJheShvbGQpKSB7XG4gICAgICAvLyBEZWxpYmVyYXRlbHkgbW9kaWZ5IG9sZCBhcnJheSBzaW5jZSBpdCdzIGNhcHR1cmVkIGluIGNsb3N1cmUgY3JlYXRlZCB3aXRoIGBhcnJJbnZva2VyYFxuICAgICAgb2xkLmxlbmd0aCA9IGN1ci5sZW5ndGg7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9sZC5sZW5ndGg7ICsraSkgb2xkW2ldID0gY3VyW2ldO1xuICAgICAgb25bbmFtZV0gID0gb2xkO1xuICAgIH0gZWxzZSB7XG4gICAgICBvbGQuZm4gPSBjdXI7XG4gICAgICBvbltuYW1lXSA9IG9sZDtcbiAgICB9XG4gIH1cbiAgaWYgKG9sZE9uKSB7XG4gICAgZm9yIChuYW1lIGluIG9sZE9uKSB7XG4gICAgICBpZiAob25bbmFtZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB2YXIgb2xkID0gb2xkT25bbmFtZV07XG4gICAgICAgIGlmIChpcy5hcnJheShvbGQpKSB7XG4gICAgICAgICAgb2xkLmxlbmd0aCA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgb2xkLmZuID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtjcmVhdGU6IHVwZGF0ZUV2ZW50TGlzdGVuZXJzLCB1cGRhdGU6IHVwZGF0ZUV2ZW50TGlzdGVuZXJzfTtcbiIsInZhciByYWYgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSkgfHwgc2V0VGltZW91dDtcbnZhciBuZXh0RnJhbWUgPSBmdW5jdGlvbihmbikgeyByYWYoZnVuY3Rpb24oKSB7IHJhZihmbik7IH0pOyB9O1xuXG5mdW5jdGlvbiBzZXROZXh0RnJhbWUob2JqLCBwcm9wLCB2YWwpIHtcbiAgbmV4dEZyYW1lKGZ1bmN0aW9uKCkgeyBvYmpbcHJvcF0gPSB2YWw7IH0pO1xufVxuXG5mdW5jdGlvbiBnZXRUZXh0Tm9kZVJlY3QodGV4dE5vZGUpIHtcbiAgdmFyIHJlY3Q7XG4gIGlmIChkb2N1bWVudC5jcmVhdGVSYW5nZSkge1xuICAgIHZhciByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgcmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHRleHROb2RlKTtcbiAgICBpZiAocmFuZ2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KSB7XG4gICAgICAgIHJlY3QgPSByYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlY3Q7XG59XG5cbmZ1bmN0aW9uIGNhbGNUcmFuc2Zvcm1PcmlnaW4oaXNUZXh0Tm9kZSwgdGV4dFJlY3QsIGJvdW5kaW5nUmVjdCkge1xuICBpZiAoaXNUZXh0Tm9kZSkge1xuICAgIGlmICh0ZXh0UmVjdCkge1xuICAgICAgLy9jYWxjdWxhdGUgcGl4ZWxzIHRvIGNlbnRlciBvZiB0ZXh0IGZyb20gbGVmdCBlZGdlIG9mIGJvdW5kaW5nIGJveFxuICAgICAgdmFyIHJlbGF0aXZlQ2VudGVyWCA9IHRleHRSZWN0LmxlZnQgKyB0ZXh0UmVjdC53aWR0aC8yIC0gYm91bmRpbmdSZWN0LmxlZnQ7XG4gICAgICB2YXIgcmVsYXRpdmVDZW50ZXJZID0gdGV4dFJlY3QudG9wICsgdGV4dFJlY3QuaGVpZ2h0LzIgLSBib3VuZGluZ1JlY3QudG9wO1xuICAgICAgcmV0dXJuIHJlbGF0aXZlQ2VudGVyWCArICdweCAnICsgcmVsYXRpdmVDZW50ZXJZICsgJ3B4JztcbiAgICB9XG4gIH1cbiAgcmV0dXJuICcwIDAnOyAvL3RvcCBsZWZ0XG59XG5cbmZ1bmN0aW9uIGdldFRleHREeChvbGRUZXh0UmVjdCwgbmV3VGV4dFJlY3QpIHtcbiAgaWYgKG9sZFRleHRSZWN0ICYmIG5ld1RleHRSZWN0KSB7XG4gICAgcmV0dXJuICgob2xkVGV4dFJlY3QubGVmdCArIG9sZFRleHRSZWN0LndpZHRoLzIpIC0gKG5ld1RleHRSZWN0LmxlZnQgKyBuZXdUZXh0UmVjdC53aWR0aC8yKSk7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5mdW5jdGlvbiBnZXRUZXh0RHkob2xkVGV4dFJlY3QsIG5ld1RleHRSZWN0KSB7XG4gIGlmIChvbGRUZXh0UmVjdCAmJiBuZXdUZXh0UmVjdCkge1xuICAgIHJldHVybiAoKG9sZFRleHRSZWN0LnRvcCArIG9sZFRleHRSZWN0LmhlaWdodC8yKSAtIChuZXdUZXh0UmVjdC50b3AgKyBuZXdUZXh0UmVjdC5oZWlnaHQvMikpO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBpc1RleHRFbGVtZW50KGVsbSkge1xuICByZXR1cm4gZWxtLmNoaWxkTm9kZXMubGVuZ3RoID09PSAxICYmIGVsbS5jaGlsZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzO1xufVxuXG52YXIgcmVtb3ZlZCwgY3JlYXRlZDtcblxuZnVuY3Rpb24gcHJlKG9sZFZub2RlLCB2bm9kZSkge1xuICByZW1vdmVkID0ge307XG4gIGNyZWF0ZWQgPSBbXTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlKG9sZFZub2RlLCB2bm9kZSkge1xuICB2YXIgaGVybyA9IHZub2RlLmRhdGEuaGVybztcbiAgaWYgKGhlcm8gJiYgaGVyby5pZCkge1xuICAgIGNyZWF0ZWQucHVzaChoZXJvLmlkKTtcbiAgICBjcmVhdGVkLnB1c2godm5vZGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRlc3Ryb3kodm5vZGUpIHtcbiAgdmFyIGhlcm8gPSB2bm9kZS5kYXRhLmhlcm87XG4gIGlmIChoZXJvICYmIGhlcm8uaWQpIHtcbiAgICB2YXIgZWxtID0gdm5vZGUuZWxtO1xuICAgIHZub2RlLmlzVGV4dE5vZGUgPSBpc1RleHRFbGVtZW50KGVsbSk7IC8vaXMgdGhpcyBhIHRleHQgbm9kZT9cbiAgICB2bm9kZS5ib3VuZGluZ1JlY3QgPSBlbG0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7IC8vc2F2ZSB0aGUgYm91bmRpbmcgcmVjdGFuZ2xlIHRvIGEgbmV3IHByb3BlcnR5IG9uIHRoZSB2bm9kZVxuICAgIHZub2RlLnRleHRSZWN0ID0gdm5vZGUuaXNUZXh0Tm9kZSA/IGdldFRleHROb2RlUmVjdChlbG0uY2hpbGROb2Rlc1swXSkgOiBudWxsOyAvL3NhdmUgYm91bmRpbmcgcmVjdCBvZiBpbm5lciB0ZXh0IG5vZGVcbiAgICB2YXIgY29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsbSwgbnVsbCk7IC8vZ2V0IGN1cnJlbnQgc3R5bGVzIChpbmNsdWRlcyBpbmhlcml0ZWQgcHJvcGVydGllcylcbiAgICB2bm9kZS5zYXZlZFN0eWxlID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShjb21wdXRlZFN0eWxlKSk7IC8vc2F2ZSBhIGNvcHkgb2YgY29tcHV0ZWQgc3R5bGUgdmFsdWVzXG4gICAgcmVtb3ZlZFtoZXJvLmlkXSA9IHZub2RlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBvc3QoKSB7XG4gIHZhciBpLCBpZCwgbmV3RWxtLCBvbGRWbm9kZSwgb2xkRWxtLCBoUmF0aW8sIHdSYXRpbyxcbiAgICAgIG9sZFJlY3QsIG5ld1JlY3QsIGR4LCBkeSwgb3JpZ1RyYW5zZm9ybSwgb3JpZ1RyYW5zaXRpb24sXG4gICAgICBuZXdTdHlsZSwgb2xkU3R5bGUsIG5ld0NvbXB1dGVkU3R5bGUsIGlzVGV4dE5vZGUsXG4gICAgICBuZXdUZXh0UmVjdCwgb2xkVGV4dFJlY3Q7XG4gIGZvciAoaSA9IDA7IGkgPCBjcmVhdGVkLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgaWQgPSBjcmVhdGVkW2ldO1xuICAgIG5ld0VsbSA9IGNyZWF0ZWRbaSsxXS5lbG07XG4gICAgb2xkVm5vZGUgPSByZW1vdmVkW2lkXTtcbiAgICBpZiAob2xkVm5vZGUpIHtcbiAgICAgIGlzVGV4dE5vZGUgPSBvbGRWbm9kZS5pc1RleHROb2RlICYmIGlzVGV4dEVsZW1lbnQobmV3RWxtKTsgLy9BcmUgb2xkICYgbmV3IGJvdGggdGV4dD9cbiAgICAgIG5ld1N0eWxlID0gbmV3RWxtLnN0eWxlO1xuICAgICAgbmV3Q29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKG5ld0VsbSwgbnVsbCk7IC8vZ2V0IGZ1bGwgY29tcHV0ZWQgc3R5bGUgZm9yIG5ldyBlbGVtZW50XG4gICAgICBvbGRFbG0gPSBvbGRWbm9kZS5lbG07XG4gICAgICBvbGRTdHlsZSA9IG9sZEVsbS5zdHlsZTtcbiAgICAgIC8vT3ZlcmFsbCBlbGVtZW50IGJvdW5kaW5nIGJveGVzXG4gICAgICBuZXdSZWN0ID0gbmV3RWxtLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgb2xkUmVjdCA9IG9sZFZub2RlLmJvdW5kaW5nUmVjdDsgLy9wcmV2aW91c2x5IHNhdmVkIGJvdW5kaW5nIHJlY3RcbiAgICAgIC8vVGV4dCBub2RlIGJvdW5kaW5nIGJveGVzICYgZGlzdGFuY2VzXG4gICAgICBpZiAoaXNUZXh0Tm9kZSkge1xuICAgICAgICBuZXdUZXh0UmVjdCA9IGdldFRleHROb2RlUmVjdChuZXdFbG0uY2hpbGROb2Rlc1swXSk7XG4gICAgICAgIG9sZFRleHRSZWN0ID0gb2xkVm5vZGUudGV4dFJlY3Q7XG4gICAgICAgIGR4ID0gZ2V0VGV4dER4KG9sZFRleHRSZWN0LCBuZXdUZXh0UmVjdCk7XG4gICAgICAgIGR5ID0gZ2V0VGV4dER5KG9sZFRleHRSZWN0LCBuZXdUZXh0UmVjdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvL0NhbGN1bGF0ZSBkaXN0YW5jZXMgYmV0d2VlbiBvbGQgJiBuZXcgcG9zaXRpb25zXG4gICAgICAgIGR4ID0gb2xkUmVjdC5sZWZ0IC0gbmV3UmVjdC5sZWZ0O1xuICAgICAgICBkeSA9IG9sZFJlY3QudG9wIC0gbmV3UmVjdC50b3A7XG4gICAgICB9XG4gICAgICBoUmF0aW8gPSBuZXdSZWN0LmhlaWdodCAvIChNYXRoLm1heChvbGRSZWN0LmhlaWdodCwgMSkpO1xuICAgICAgd1JhdGlvID0gaXNUZXh0Tm9kZSA/IGhSYXRpbyA6IG5ld1JlY3Qud2lkdGggLyAoTWF0aC5tYXgob2xkUmVjdC53aWR0aCwgMSkpOyAvL3RleHQgc2NhbGVzIGJhc2VkIG9uIGhSYXRpb1xuICAgICAgLy8gQW5pbWF0ZSBuZXcgZWxlbWVudFxuICAgICAgb3JpZ1RyYW5zZm9ybSA9IG5ld1N0eWxlLnRyYW5zZm9ybTtcbiAgICAgIG9yaWdUcmFuc2l0aW9uID0gbmV3U3R5bGUudHJhbnNpdGlvbjtcbiAgICAgIGlmIChuZXdDb21wdXRlZFN0eWxlLmRpc3BsYXkgPT09ICdpbmxpbmUnKSAvL2lubGluZSBlbGVtZW50cyBjYW5ub3QgYmUgdHJhbnNmb3JtZWRcbiAgICAgICAgbmV3U3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snOyAgICAgICAgLy90aGlzIGRvZXMgbm90IGFwcGVhciB0byBoYXZlIGFueSBuZWdhdGl2ZSBzaWRlIGVmZmVjdHNcbiAgICAgIG5ld1N0eWxlLnRyYW5zaXRpb24gPSBvcmlnVHJhbnNpdGlvbiArICd0cmFuc2Zvcm0gMHMnO1xuICAgICAgbmV3U3R5bGUudHJhbnNmb3JtT3JpZ2luID0gY2FsY1RyYW5zZm9ybU9yaWdpbihpc1RleHROb2RlLCBuZXdUZXh0UmVjdCwgbmV3UmVjdCk7XG4gICAgICBuZXdTdHlsZS5vcGFjaXR5ID0gJzAnO1xuICAgICAgbmV3U3R5bGUudHJhbnNmb3JtID0gb3JpZ1RyYW5zZm9ybSArICd0cmFuc2xhdGUoJytkeCsncHgsICcrZHkrJ3B4KSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc2NhbGUoJysxL3dSYXRpbysnLCAnKzEvaFJhdGlvKycpJztcbiAgICAgIHNldE5leHRGcmFtZShuZXdTdHlsZSwgJ3RyYW5zaXRpb24nLCBvcmlnVHJhbnNpdGlvbik7XG4gICAgICBzZXROZXh0RnJhbWUobmV3U3R5bGUsICd0cmFuc2Zvcm0nLCBvcmlnVHJhbnNmb3JtKTtcbiAgICAgIHNldE5leHRGcmFtZShuZXdTdHlsZSwgJ29wYWNpdHknLCAnMScpO1xuICAgICAgLy8gQW5pbWF0ZSBvbGQgZWxlbWVudFxuICAgICAgZm9yICh2YXIga2V5IGluIG9sZFZub2RlLnNhdmVkU3R5bGUpIHsgLy9yZS1hcHBseSBzYXZlZCBpbmhlcml0ZWQgcHJvcGVydGllc1xuICAgICAgICBpZiAocGFyc2VJbnQoa2V5KSAhPSBrZXkpIHtcbiAgICAgICAgICB2YXIgbXMgPSBrZXkuc3Vic3RyaW5nKDAsMikgPT09ICdtcyc7XG4gICAgICAgICAgdmFyIG1veiA9IGtleS5zdWJzdHJpbmcoMCwzKSA9PT0gJ21veic7XG4gICAgICAgICAgdmFyIHdlYmtpdCA9IGtleS5zdWJzdHJpbmcoMCw2KSA9PT0gJ3dlYmtpdCc7XG4gICAgICBcdCAgaWYgKCFtcyAmJiAhbW96ICYmICF3ZWJraXQpIC8vaWdub3JlIHByZWZpeGVkIHN0eWxlIHByb3BlcnRpZXNcbiAgICAgICAgXHQgIG9sZFN0eWxlW2tleV0gPSBvbGRWbm9kZS5zYXZlZFN0eWxlW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG9sZFN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICAgIG9sZFN0eWxlLnRvcCA9IG9sZFJlY3QudG9wICsgJ3B4JzsgLy9zdGFydCBhdCBleGlzdGluZyBwb3NpdGlvblxuICAgICAgb2xkU3R5bGUubGVmdCA9IG9sZFJlY3QubGVmdCArICdweCc7XG4gICAgICBvbGRTdHlsZS53aWR0aCA9IG9sZFJlY3Qud2lkdGggKyAncHgnOyAvL05lZWRlZCBmb3IgZWxlbWVudHMgd2hvIHdlcmUgc2l6ZWQgcmVsYXRpdmUgdG8gdGhlaXIgcGFyZW50c1xuICAgICAgb2xkU3R5bGUuaGVpZ2h0ID0gb2xkUmVjdC5oZWlnaHQgKyAncHgnOyAvL05lZWRlZCBmb3IgZWxlbWVudHMgd2hvIHdlcmUgc2l6ZWQgcmVsYXRpdmUgdG8gdGhlaXIgcGFyZW50c1xuICAgICAgb2xkU3R5bGUubWFyZ2luID0gMDsgLy9NYXJnaW4gb24gaGVybyBlbGVtZW50IGxlYWRzIHRvIGluY29ycmVjdCBwb3NpdGlvbmluZ1xuICAgICAgb2xkU3R5bGUudHJhbnNmb3JtT3JpZ2luID0gY2FsY1RyYW5zZm9ybU9yaWdpbihpc1RleHROb2RlLCBvbGRUZXh0UmVjdCwgb2xkUmVjdCk7XG4gICAgICBvbGRTdHlsZS50cmFuc2Zvcm0gPSAnJztcbiAgICAgIG9sZFN0eWxlLm9wYWNpdHkgPSAnMSc7XG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG9sZEVsbSk7XG4gICAgICBzZXROZXh0RnJhbWUob2xkU3R5bGUsICd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcrIC1keCArJ3B4LCAnKyAtZHkgKydweCkgc2NhbGUoJyt3UmF0aW8rJywgJytoUmF0aW8rJyknKTsgLy9zY2FsZSBtdXN0IGJlIG9uIGZhciByaWdodCBmb3IgdHJhbnNsYXRlIHRvIGJlIGNvcnJlY3RcbiAgICAgIHNldE5leHRGcmFtZShvbGRTdHlsZSwgJ29wYWNpdHknLCAnMCcpO1xuICAgICAgb2xkRWxtLmFkZEV2ZW50TGlzdGVuZXIoJ3RyYW5zaXRpb25lbmQnLCBmdW5jdGlvbihldikge1xuICAgICAgICBpZiAoZXYucHJvcGVydHlOYW1lID09PSAndHJhbnNmb3JtJylcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGV2LnRhcmdldCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmVtb3ZlZCA9IGNyZWF0ZWQgPSB1bmRlZmluZWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge3ByZTogcHJlLCBjcmVhdGU6IGNyZWF0ZSwgZGVzdHJveTogZGVzdHJveSwgcG9zdDogcG9zdH07XG4iLCJmdW5jdGlvbiB1cGRhdGVQcm9wcyhvbGRWbm9kZSwgdm5vZGUpIHtcbiAgdmFyIGtleSwgY3VyLCBvbGQsIGVsbSA9IHZub2RlLmVsbSxcbiAgICAgIG9sZFByb3BzID0gb2xkVm5vZGUuZGF0YS5wcm9wcyB8fCB7fSwgcHJvcHMgPSB2bm9kZS5kYXRhLnByb3BzIHx8IHt9O1xuICBmb3IgKGtleSBpbiBvbGRQcm9wcykge1xuICAgIGlmICghcHJvcHNba2V5XSkge1xuICAgICAgZGVsZXRlIGVsbVtrZXldO1xuICAgIH1cbiAgfVxuICBmb3IgKGtleSBpbiBwcm9wcykge1xuICAgIGN1ciA9IHByb3BzW2tleV07XG4gICAgb2xkID0gb2xkUHJvcHNba2V5XTtcbiAgICBpZiAob2xkICE9PSBjdXIgJiYgKGtleSAhPT0gJ3ZhbHVlJyB8fCBlbG1ba2V5XSAhPT0gY3VyKSkge1xuICAgICAgZWxtW2tleV0gPSBjdXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge2NyZWF0ZTogdXBkYXRlUHJvcHMsIHVwZGF0ZTogdXBkYXRlUHJvcHN9O1xuIiwidmFyIHJhZiA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKSB8fCBzZXRUaW1lb3V0O1xudmFyIG5leHRGcmFtZSA9IGZ1bmN0aW9uKGZuKSB7IHJhZihmdW5jdGlvbigpIHsgcmFmKGZuKTsgfSk7IH07XG5cbmZ1bmN0aW9uIHNldE5leHRGcmFtZShvYmosIHByb3AsIHZhbCkge1xuICBuZXh0RnJhbWUoZnVuY3Rpb24oKSB7IG9ialtwcm9wXSA9IHZhbDsgfSk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0eWxlKG9sZFZub2RlLCB2bm9kZSkge1xuICB2YXIgY3VyLCBuYW1lLCBlbG0gPSB2bm9kZS5lbG0sXG4gICAgICBvbGRTdHlsZSA9IG9sZFZub2RlLmRhdGEuc3R5bGUgfHwge30sXG4gICAgICBzdHlsZSA9IHZub2RlLmRhdGEuc3R5bGUgfHwge30sXG4gICAgICBvbGRIYXNEZWwgPSAnZGVsYXllZCcgaW4gb2xkU3R5bGU7XG4gIGZvciAobmFtZSBpbiBvbGRTdHlsZSkge1xuICAgIGlmICghc3R5bGVbbmFtZV0pIHtcbiAgICAgIGVsbS5zdHlsZVtuYW1lXSA9ICcnO1xuICAgIH1cbiAgfVxuICBmb3IgKG5hbWUgaW4gc3R5bGUpIHtcbiAgICBjdXIgPSBzdHlsZVtuYW1lXTtcbiAgICBpZiAobmFtZSA9PT0gJ2RlbGF5ZWQnKSB7XG4gICAgICBmb3IgKG5hbWUgaW4gc3R5bGUuZGVsYXllZCkge1xuICAgICAgICBjdXIgPSBzdHlsZS5kZWxheWVkW25hbWVdO1xuICAgICAgICBpZiAoIW9sZEhhc0RlbCB8fCBjdXIgIT09IG9sZFN0eWxlLmRlbGF5ZWRbbmFtZV0pIHtcbiAgICAgICAgICBzZXROZXh0RnJhbWUoZWxtLnN0eWxlLCBuYW1lLCBjdXIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChuYW1lICE9PSAncmVtb3ZlJyAmJiBjdXIgIT09IG9sZFN0eWxlW25hbWVdKSB7XG4gICAgICBlbG0uc3R5bGVbbmFtZV0gPSBjdXI7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5RGVzdHJveVN0eWxlKHZub2RlKSB7XG4gIHZhciBzdHlsZSwgbmFtZSwgZWxtID0gdm5vZGUuZWxtLCBzID0gdm5vZGUuZGF0YS5zdHlsZTtcbiAgaWYgKCFzIHx8ICEoc3R5bGUgPSBzLmRlc3Ryb3kpKSByZXR1cm47XG4gIGZvciAobmFtZSBpbiBzdHlsZSkge1xuICAgIGVsbS5zdHlsZVtuYW1lXSA9IHN0eWxlW25hbWVdO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5UmVtb3ZlU3R5bGUodm5vZGUsIHJtKSB7XG4gIHZhciBzID0gdm5vZGUuZGF0YS5zdHlsZTtcbiAgaWYgKCFzIHx8ICFzLnJlbW92ZSkge1xuICAgIHJtKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBuYW1lLCBlbG0gPSB2bm9kZS5lbG0sIGlkeCwgaSA9IDAsIG1heER1ciA9IDAsXG4gICAgICBjb21wU3R5bGUsIHN0eWxlID0gcy5yZW1vdmUsIGFtb3VudCA9IDAsIGFwcGxpZWQgPSBbXTtcbiAgZm9yIChuYW1lIGluIHN0eWxlKSB7XG4gICAgYXBwbGllZC5wdXNoKG5hbWUpO1xuICAgIGVsbS5zdHlsZVtuYW1lXSA9IHN0eWxlW25hbWVdO1xuICB9XG4gIGNvbXBTdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWxtKTtcbiAgdmFyIHByb3BzID0gY29tcFN0eWxlWyd0cmFuc2l0aW9uLXByb3BlcnR5J10uc3BsaXQoJywgJyk7XG4gIGZvciAoOyBpIDwgcHJvcHMubGVuZ3RoOyArK2kpIHtcbiAgICBpZihhcHBsaWVkLmluZGV4T2YocHJvcHNbaV0pICE9PSAtMSkgYW1vdW50Kys7XG4gIH1cbiAgZWxtLmFkZEV2ZW50TGlzdGVuZXIoJ3RyYW5zaXRpb25lbmQnLCBmdW5jdGlvbihldikge1xuICAgIGlmIChldi50YXJnZXQgPT09IGVsbSkgLS1hbW91bnQ7XG4gICAgaWYgKGFtb3VudCA9PT0gMCkgcm0oKTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge2NyZWF0ZTogdXBkYXRlU3R5bGUsIHVwZGF0ZTogdXBkYXRlU3R5bGUsIGRlc3Ryb3k6IGFwcGx5RGVzdHJveVN0eWxlLCByZW1vdmU6IGFwcGx5UmVtb3ZlU3R5bGV9O1xuIiwiLy8ganNoaW50IG5ld2NhcDogZmFsc2Vcbi8qIGdsb2JhbCByZXF1aXJlLCBtb2R1bGUsIGRvY3VtZW50LCBOb2RlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBWTm9kZSA9IHJlcXVpcmUoJy4vdm5vZGUnKTtcbnZhciBpcyA9IHJlcXVpcmUoJy4vaXMnKTtcbnZhciBkb21BcGkgPSByZXF1aXJlKCcuL2h0bWxkb21hcGknKTtcblxuZnVuY3Rpb24gaXNVbmRlZihzKSB7IHJldHVybiBzID09PSB1bmRlZmluZWQ7IH1cbmZ1bmN0aW9uIGlzRGVmKHMpIHsgcmV0dXJuIHMgIT09IHVuZGVmaW5lZDsgfVxuXG52YXIgZW1wdHlOb2RlID0gVk5vZGUoJycsIHt9LCBbXSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5mdW5jdGlvbiBzYW1lVm5vZGUodm5vZGUxLCB2bm9kZTIpIHtcbiAgcmV0dXJuIHZub2RlMS5rZXkgPT09IHZub2RlMi5rZXkgJiYgdm5vZGUxLnNlbCA9PT0gdm5vZGUyLnNlbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlS2V5VG9PbGRJZHgoY2hpbGRyZW4sIGJlZ2luSWR4LCBlbmRJZHgpIHtcbiAgdmFyIGksIG1hcCA9IHt9LCBrZXk7XG4gIGZvciAoaSA9IGJlZ2luSWR4OyBpIDw9IGVuZElkeDsgKytpKSB7XG4gICAga2V5ID0gY2hpbGRyZW5baV0ua2V5O1xuICAgIGlmIChpc0RlZihrZXkpKSBtYXBba2V5XSA9IGk7XG4gIH1cbiAgcmV0dXJuIG1hcDtcbn1cblxudmFyIGhvb2tzID0gWydjcmVhdGUnLCAndXBkYXRlJywgJ3JlbW92ZScsICdkZXN0cm95JywgJ3ByZScsICdwb3N0J107XG5cbmZ1bmN0aW9uIGluaXQobW9kdWxlcywgYXBpKSB7XG4gIHZhciBpLCBqLCBjYnMgPSB7fTtcblxuICBpZiAoaXNVbmRlZihhcGkpKSBhcGkgPSBkb21BcGk7XG5cbiAgZm9yIChpID0gMDsgaSA8IGhvb2tzLmxlbmd0aDsgKytpKSB7XG4gICAgY2JzW2hvb2tzW2ldXSA9IFtdO1xuICAgIGZvciAoaiA9IDA7IGogPCBtb2R1bGVzLmxlbmd0aDsgKytqKSB7XG4gICAgICBpZiAobW9kdWxlc1tqXVtob29rc1tpXV0gIT09IHVuZGVmaW5lZCkgY2JzW2hvb2tzW2ldXS5wdXNoKG1vZHVsZXNbal1baG9va3NbaV1dKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbXB0eU5vZGVBdChlbG0pIHtcbiAgICByZXR1cm4gVk5vZGUoYXBpLnRhZ05hbWUoZWxtKS50b0xvd2VyQ2FzZSgpLCB7fSwgW10sIHVuZGVmaW5lZCwgZWxtKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJtQ2IoY2hpbGRFbG0sIGxpc3RlbmVycykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLWxpc3RlbmVycyA9PT0gMCkge1xuICAgICAgICB2YXIgcGFyZW50ID0gYXBpLnBhcmVudE5vZGUoY2hpbGRFbG0pO1xuICAgICAgICBhcGkucmVtb3ZlQ2hpbGQocGFyZW50LCBjaGlsZEVsbSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsbSh2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgdmFyIGksIGRhdGEgPSB2bm9kZS5kYXRhO1xuICAgIGlmIChpc0RlZihkYXRhKSkge1xuICAgICAgaWYgKGlzRGVmKGkgPSBkYXRhLmhvb2spICYmIGlzRGVmKGkgPSBpLmluaXQpKSB7XG4gICAgICAgIGkodm5vZGUpO1xuICAgICAgICBkYXRhID0gdm5vZGUuZGF0YTtcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIGVsbSwgY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbiwgc2VsID0gdm5vZGUuc2VsO1xuICAgIGlmIChpc0RlZihzZWwpKSB7XG4gICAgICAvLyBQYXJzZSBzZWxlY3RvclxuICAgICAgdmFyIGhhc2hJZHggPSBzZWwuaW5kZXhPZignIycpO1xuICAgICAgdmFyIGRvdElkeCA9IHNlbC5pbmRleE9mKCcuJywgaGFzaElkeCk7XG4gICAgICB2YXIgaGFzaCA9IGhhc2hJZHggPiAwID8gaGFzaElkeCA6IHNlbC5sZW5ndGg7XG4gICAgICB2YXIgZG90ID0gZG90SWR4ID4gMCA/IGRvdElkeCA6IHNlbC5sZW5ndGg7XG4gICAgICB2YXIgdGFnID0gaGFzaElkeCAhPT0gLTEgfHwgZG90SWR4ICE9PSAtMSA/IHNlbC5zbGljZSgwLCBNYXRoLm1pbihoYXNoLCBkb3QpKSA6IHNlbDtcbiAgICAgIGVsbSA9IHZub2RlLmVsbSA9IGlzRGVmKGRhdGEpICYmIGlzRGVmKGkgPSBkYXRhLm5zKSA/IGFwaS5jcmVhdGVFbGVtZW50TlMoaSwgdGFnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogYXBpLmNyZWF0ZUVsZW1lbnQodGFnKTtcbiAgICAgIGlmIChoYXNoIDwgZG90KSBlbG0uaWQgPSBzZWwuc2xpY2UoaGFzaCArIDEsIGRvdCk7XG4gICAgICBpZiAoZG90SWR4ID4gMCkgZWxtLmNsYXNzTmFtZSA9IHNlbC5zbGljZShkb3QrMSkucmVwbGFjZSgvXFwuL2csICcgJyk7XG4gICAgICBpZiAoaXMuYXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGFwaS5hcHBlbmRDaGlsZChlbG0sIGNyZWF0ZUVsbShjaGlsZHJlbltpXSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXMucHJpbWl0aXZlKHZub2RlLnRleHQpKSB7XG4gICAgICAgIGFwaS5hcHBlbmRDaGlsZChlbG0sIGFwaS5jcmVhdGVUZXh0Tm9kZSh2bm9kZS50ZXh0KSk7XG4gICAgICB9XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLmNyZWF0ZS5sZW5ndGg7ICsraSkgY2JzLmNyZWF0ZVtpXShlbXB0eU5vZGUsIHZub2RlKTtcbiAgICAgIGkgPSB2bm9kZS5kYXRhLmhvb2s7IC8vIFJldXNlIHZhcmlhYmxlXG4gICAgICBpZiAoaXNEZWYoaSkpIHtcbiAgICAgICAgaWYgKGkuY3JlYXRlKSBpLmNyZWF0ZShlbXB0eU5vZGUsIHZub2RlKTtcbiAgICAgICAgaWYgKGkuaW5zZXJ0KSBpbnNlcnRlZFZub2RlUXVldWUucHVzaCh2bm9kZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVsbSA9IHZub2RlLmVsbSA9IGFwaS5jcmVhdGVUZXh0Tm9kZSh2bm9kZS50ZXh0KTtcbiAgICB9XG4gICAgcmV0dXJuIHZub2RlLmVsbTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZFZub2RlcyhwYXJlbnRFbG0sIGJlZm9yZSwgdm5vZGVzLCBzdGFydElkeCwgZW5kSWR4LCBpbnNlcnRlZFZub2RlUXVldWUpIHtcbiAgICBmb3IgKDsgc3RhcnRJZHggPD0gZW5kSWR4OyArK3N0YXJ0SWR4KSB7XG4gICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgY3JlYXRlRWxtKHZub2Rlc1tzdGFydElkeF0sIGluc2VydGVkVm5vZGVRdWV1ZSksIGJlZm9yZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW52b2tlRGVzdHJveUhvb2sodm5vZGUpIHtcbiAgICB2YXIgaSwgaiwgZGF0YSA9IHZub2RlLmRhdGE7XG4gICAgaWYgKGlzRGVmKGRhdGEpKSB7XG4gICAgICBpZiAoaXNEZWYoaSA9IGRhdGEuaG9vaykgJiYgaXNEZWYoaSA9IGkuZGVzdHJveSkpIGkodm5vZGUpO1xuICAgICAgZm9yIChpID0gMDsgaSA8IGNicy5kZXN0cm95Lmxlbmd0aDsgKytpKSBjYnMuZGVzdHJveVtpXSh2bm9kZSk7XG4gICAgICBpZiAoaXNEZWYoaSA9IHZub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgdm5vZGUuY2hpbGRyZW4ubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICBpbnZva2VEZXN0cm95SG9vayh2bm9kZS5jaGlsZHJlbltqXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVWbm9kZXMocGFyZW50RWxtLCB2bm9kZXMsIHN0YXJ0SWR4LCBlbmRJZHgpIHtcbiAgICBmb3IgKDsgc3RhcnRJZHggPD0gZW5kSWR4OyArK3N0YXJ0SWR4KSB7XG4gICAgICB2YXIgaSwgbGlzdGVuZXJzLCBybSwgY2ggPSB2bm9kZXNbc3RhcnRJZHhdO1xuICAgICAgaWYgKGlzRGVmKGNoKSkge1xuICAgICAgICBpZiAoaXNEZWYoY2guc2VsKSkge1xuICAgICAgICAgIGludm9rZURlc3Ryb3lIb29rKGNoKTtcbiAgICAgICAgICBsaXN0ZW5lcnMgPSBjYnMucmVtb3ZlLmxlbmd0aCArIDE7XG4gICAgICAgICAgcm0gPSBjcmVhdGVSbUNiKGNoLmVsbSwgbGlzdGVuZXJzKTtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnJlbW92ZS5sZW5ndGg7ICsraSkgY2JzLnJlbW92ZVtpXShjaCwgcm0pO1xuICAgICAgICAgIGlmIChpc0RlZihpID0gY2guZGF0YSkgJiYgaXNEZWYoaSA9IGkuaG9vaykgJiYgaXNEZWYoaSA9IGkucmVtb3ZlKSkge1xuICAgICAgICAgICAgaShjaCwgcm0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBybSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHsgLy8gVGV4dCBub2RlXG4gICAgICAgICAgYXBpLnJlbW92ZUNoaWxkKHBhcmVudEVsbSwgY2guZWxtKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUNoaWxkcmVuKHBhcmVudEVsbSwgb2xkQ2gsIG5ld0NoLCBpbnNlcnRlZFZub2RlUXVldWUpIHtcbiAgICB2YXIgb2xkU3RhcnRJZHggPSAwLCBuZXdTdGFydElkeCA9IDA7XG4gICAgdmFyIG9sZEVuZElkeCA9IG9sZENoLmxlbmd0aCAtIDE7XG4gICAgdmFyIG9sZFN0YXJ0Vm5vZGUgPSBvbGRDaFswXTtcbiAgICB2YXIgb2xkRW5kVm5vZGUgPSBvbGRDaFtvbGRFbmRJZHhdO1xuICAgIHZhciBuZXdFbmRJZHggPSBuZXdDaC5sZW5ndGggLSAxO1xuICAgIHZhciBuZXdTdGFydFZub2RlID0gbmV3Q2hbMF07XG4gICAgdmFyIG5ld0VuZFZub2RlID0gbmV3Q2hbbmV3RW5kSWR4XTtcbiAgICB2YXIgb2xkS2V5VG9JZHgsIGlkeEluT2xkLCBlbG1Ub01vdmUsIGJlZm9yZTtcblxuICAgIHdoaWxlIChvbGRTdGFydElkeCA8PSBvbGRFbmRJZHggJiYgbmV3U3RhcnRJZHggPD0gbmV3RW5kSWR4KSB7XG4gICAgICBpZiAoaXNVbmRlZihvbGRTdGFydFZub2RlKSkge1xuICAgICAgICBvbGRTdGFydFZub2RlID0gb2xkQ2hbKytvbGRTdGFydElkeF07IC8vIFZub2RlIGhhcyBiZWVuIG1vdmVkIGxlZnRcbiAgICAgIH0gZWxzZSBpZiAoaXNVbmRlZihvbGRFbmRWbm9kZSkpIHtcbiAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICB9IGVsc2UgaWYgKHNhbWVWbm9kZShvbGRTdGFydFZub2RlLCBuZXdTdGFydFZub2RlKSkge1xuICAgICAgICBwYXRjaFZub2RlKG9sZFN0YXJ0Vm5vZGUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgIG9sZFN0YXJ0Vm5vZGUgPSBvbGRDaFsrK29sZFN0YXJ0SWR4XTtcbiAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgfSBlbHNlIGlmIChzYW1lVm5vZGUob2xkRW5kVm5vZGUsIG5ld0VuZFZub2RlKSkge1xuICAgICAgICBwYXRjaFZub2RlKG9sZEVuZFZub2RlLCBuZXdFbmRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgb2xkRW5kVm5vZGUgPSBvbGRDaFstLW9sZEVuZElkeF07XG4gICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgfSBlbHNlIGlmIChzYW1lVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3RW5kVm5vZGUpKSB7IC8vIFZub2RlIG1vdmVkIHJpZ2h0XG4gICAgICAgIHBhdGNoVm5vZGUob2xkU3RhcnRWbm9kZSwgbmV3RW5kVm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBvbGRTdGFydFZub2RlLmVsbSwgYXBpLm5leHRTaWJsaW5nKG9sZEVuZFZub2RlLmVsbSkpO1xuICAgICAgICBvbGRTdGFydFZub2RlID0gb2xkQ2hbKytvbGRTdGFydElkeF07XG4gICAgICAgIG5ld0VuZFZub2RlID0gbmV3Q2hbLS1uZXdFbmRJZHhdO1xuICAgICAgfSBlbHNlIGlmIChzYW1lVm5vZGUob2xkRW5kVm5vZGUsIG5ld1N0YXJ0Vm5vZGUpKSB7IC8vIFZub2RlIG1vdmVkIGxlZnRcbiAgICAgICAgcGF0Y2hWbm9kZShvbGRFbmRWbm9kZSwgbmV3U3RhcnRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKTtcbiAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnRFbG0sIG9sZEVuZFZub2RlLmVsbSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICBvbGRFbmRWbm9kZSA9IG9sZENoWy0tb2xkRW5kSWR4XTtcbiAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGlzVW5kZWYob2xkS2V5VG9JZHgpKSBvbGRLZXlUb0lkeCA9IGNyZWF0ZUtleVRvT2xkSWR4KG9sZENoLCBvbGRTdGFydElkeCwgb2xkRW5kSWR4KTtcbiAgICAgICAgaWR4SW5PbGQgPSBvbGRLZXlUb0lkeFtuZXdTdGFydFZub2RlLmtleV07XG4gICAgICAgIGlmIChpc1VuZGVmKGlkeEluT2xkKSkgeyAvLyBOZXcgZWxlbWVudFxuICAgICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBjcmVhdGVFbG0obmV3U3RhcnRWbm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSwgb2xkU3RhcnRWbm9kZS5lbG0pO1xuICAgICAgICAgIG5ld1N0YXJ0Vm5vZGUgPSBuZXdDaFsrK25ld1N0YXJ0SWR4XTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbG1Ub01vdmUgPSBvbGRDaFtpZHhJbk9sZF07XG4gICAgICAgICAgcGF0Y2hWbm9kZShlbG1Ub01vdmUsIG5ld1N0YXJ0Vm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICAgICAgb2xkQ2hbaWR4SW5PbGRdID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGFwaS5pbnNlcnRCZWZvcmUocGFyZW50RWxtLCBlbG1Ub01vdmUuZWxtLCBvbGRTdGFydFZub2RlLmVsbSk7XG4gICAgICAgICAgbmV3U3RhcnRWbm9kZSA9IG5ld0NoWysrbmV3U3RhcnRJZHhdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvbGRTdGFydElkeCA+IG9sZEVuZElkeCkge1xuICAgICAgYmVmb3JlID0gaXNVbmRlZihuZXdDaFtuZXdFbmRJZHgrMV0pID8gbnVsbCA6IG5ld0NoW25ld0VuZElkeCsxXS5lbG07XG4gICAgICBhZGRWbm9kZXMocGFyZW50RWxtLCBiZWZvcmUsIG5ld0NoLCBuZXdTdGFydElkeCwgbmV3RW5kSWR4LCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgIH0gZWxzZSBpZiAobmV3U3RhcnRJZHggPiBuZXdFbmRJZHgpIHtcbiAgICAgIHJlbW92ZVZub2RlcyhwYXJlbnRFbG0sIG9sZENoLCBvbGRTdGFydElkeCwgb2xkRW5kSWR4KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXRjaFZub2RlKG9sZFZub2RlLCB2bm9kZSwgaW5zZXJ0ZWRWbm9kZVF1ZXVlKSB7XG4gICAgdmFyIGksIGhvb2s7XG4gICAgaWYgKGlzRGVmKGkgPSB2bm9kZS5kYXRhKSAmJiBpc0RlZihob29rID0gaS5ob29rKSAmJiBpc0RlZihpID0gaG9vay5wcmVwYXRjaCkpIHtcbiAgICAgIGkob2xkVm5vZGUsIHZub2RlKTtcbiAgICB9XG4gICAgdmFyIGVsbSA9IHZub2RlLmVsbSA9IG9sZFZub2RlLmVsbSwgb2xkQ2ggPSBvbGRWbm9kZS5jaGlsZHJlbiwgY2ggPSB2bm9kZS5jaGlsZHJlbjtcbiAgICBpZiAob2xkVm5vZGUgPT09IHZub2RlKSByZXR1cm47XG4gICAgaWYgKCFzYW1lVm5vZGUob2xkVm5vZGUsIHZub2RlKSkge1xuICAgICAgdmFyIHBhcmVudEVsbSA9IGFwaS5wYXJlbnROb2RlKG9sZFZub2RlLmVsbSk7XG4gICAgICBlbG0gPSBjcmVhdGVFbG0odm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICBhcGkuaW5zZXJ0QmVmb3JlKHBhcmVudEVsbSwgZWxtLCBvbGRWbm9kZS5lbG0pO1xuICAgICAgcmVtb3ZlVm5vZGVzKHBhcmVudEVsbSwgW29sZFZub2RlXSwgMCwgMCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpc0RlZih2bm9kZS5kYXRhKSkge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGNicy51cGRhdGUubGVuZ3RoOyArK2kpIGNicy51cGRhdGVbaV0ob2xkVm5vZGUsIHZub2RlKTtcbiAgICAgIGkgPSB2bm9kZS5kYXRhLmhvb2s7XG4gICAgICBpZiAoaXNEZWYoaSkgJiYgaXNEZWYoaSA9IGkudXBkYXRlKSkgaShvbGRWbm9kZSwgdm5vZGUpO1xuICAgIH1cbiAgICBpZiAoaXNVbmRlZih2bm9kZS50ZXh0KSkge1xuICAgICAgaWYgKGlzRGVmKG9sZENoKSAmJiBpc0RlZihjaCkpIHtcbiAgICAgICAgaWYgKG9sZENoICE9PSBjaCkgdXBkYXRlQ2hpbGRyZW4oZWxtLCBvbGRDaCwgY2gsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGlzRGVmKGNoKSkge1xuICAgICAgICBpZiAoaXNEZWYob2xkVm5vZGUudGV4dCkpIGFwaS5zZXRUZXh0Q29udGVudChlbG0sICcnKTtcbiAgICAgICAgYWRkVm5vZGVzKGVsbSwgbnVsbCwgY2gsIDAsIGNoLmxlbmd0aCAtIDEsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGlzRGVmKG9sZENoKSkge1xuICAgICAgICByZW1vdmVWbm9kZXMoZWxtLCBvbGRDaCwgMCwgb2xkQ2gubGVuZ3RoIC0gMSk7XG4gICAgICB9IGVsc2UgaWYgKGlzRGVmKG9sZFZub2RlLnRleHQpKSB7XG4gICAgICAgIGFwaS5zZXRUZXh0Q29udGVudChlbG0sICcnKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9sZFZub2RlLnRleHQgIT09IHZub2RlLnRleHQpIHtcbiAgICAgIGFwaS5zZXRUZXh0Q29udGVudChlbG0sIHZub2RlLnRleHQpO1xuICAgIH1cbiAgICBpZiAoaXNEZWYoaG9vaykgJiYgaXNEZWYoaSA9IGhvb2sucG9zdHBhdGNoKSkge1xuICAgICAgaShvbGRWbm9kZSwgdm5vZGUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbihvbGRWbm9kZSwgdm5vZGUpIHtcbiAgICB2YXIgaSwgZWxtLCBwYXJlbnQ7XG4gICAgdmFyIGluc2VydGVkVm5vZGVRdWV1ZSA9IFtdO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjYnMucHJlLmxlbmd0aDsgKytpKSBjYnMucHJlW2ldKCk7XG5cbiAgICBpZiAoaXNVbmRlZihvbGRWbm9kZS5zZWwpKSB7XG4gICAgICBvbGRWbm9kZSA9IGVtcHR5Tm9kZUF0KG9sZFZub2RlKTtcbiAgICB9XG5cbiAgICBpZiAoc2FtZVZub2RlKG9sZFZub2RlLCB2bm9kZSkpIHtcbiAgICAgIHBhdGNoVm5vZGUob2xkVm5vZGUsIHZub2RlLCBpbnNlcnRlZFZub2RlUXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbG0gPSBvbGRWbm9kZS5lbG07XG4gICAgICBwYXJlbnQgPSBhcGkucGFyZW50Tm9kZShlbG0pO1xuXG4gICAgICBjcmVhdGVFbG0odm5vZGUsIGluc2VydGVkVm5vZGVRdWV1ZSk7XG5cbiAgICAgIGlmIChwYXJlbnQgIT09IG51bGwpIHtcbiAgICAgICAgYXBpLmluc2VydEJlZm9yZShwYXJlbnQsIHZub2RlLmVsbSwgYXBpLm5leHRTaWJsaW5nKGVsbSkpO1xuICAgICAgICByZW1vdmVWbm9kZXMocGFyZW50LCBbb2xkVm5vZGVdLCAwLCAwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgaW5zZXJ0ZWRWbm9kZVF1ZXVlLmxlbmd0aDsgKytpKSB7XG4gICAgICBpbnNlcnRlZFZub2RlUXVldWVbaV0uZGF0YS5ob29rLmluc2VydChpbnNlcnRlZFZub2RlUXVldWVbaV0pO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY2JzLnBvc3QubGVuZ3RoOyArK2kpIGNicy5wb3N0W2ldKCk7XG4gICAgcmV0dXJuIHZub2RlO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtpbml0OiBpbml0fTtcbiIsInZhciBoID0gcmVxdWlyZSgnLi9oJyk7XG5cbmZ1bmN0aW9uIGNvcHlUb1RodW5rKHZub2RlLCB0aHVuaykge1xuICB0aHVuay5lbG0gPSB2bm9kZS5lbG07XG4gIHZub2RlLmRhdGEuZm4gPSB0aHVuay5kYXRhLmZuO1xuICB2bm9kZS5kYXRhLmFyZ3MgPSB0aHVuay5kYXRhLmFyZ3M7XG4gIHRodW5rLmRhdGEgPSB2bm9kZS5kYXRhO1xuICB0aHVuay5jaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuO1xuICB0aHVuay50ZXh0ID0gdm5vZGUudGV4dDtcbiAgdGh1bmsuZWxtID0gdm5vZGUuZWxtO1xufVxuXG5mdW5jdGlvbiBpbml0KHRodW5rKSB7XG4gIHZhciBpLCBjdXIgPSB0aHVuay5kYXRhO1xuICB2YXIgdm5vZGUgPSBjdXIuZm4uYXBwbHkodW5kZWZpbmVkLCBjdXIuYXJncyk7XG4gIGNvcHlUb1RodW5rKHZub2RlLCB0aHVuayk7XG59XG5cbmZ1bmN0aW9uIHByZXBhdGNoKG9sZFZub2RlLCB0aHVuaykge1xuICB2YXIgaSwgb2xkID0gb2xkVm5vZGUuZGF0YSwgY3VyID0gdGh1bmsuZGF0YSwgdm5vZGU7XG4gIHZhciBvbGRBcmdzID0gb2xkLmFyZ3MsIGFyZ3MgPSBjdXIuYXJncztcbiAgaWYgKG9sZC5mbiAhPT0gY3VyLmZuIHx8IG9sZEFyZ3MubGVuZ3RoICE9PSBhcmdzLmxlbmd0aCkge1xuICAgIGNvcHlUb1RodW5rKGN1ci5mbi5hcHBseSh1bmRlZmluZWQsIGFyZ3MpLCB0aHVuayk7XG4gIH1cbiAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAob2xkQXJnc1tpXSAhPT0gYXJnc1tpXSkge1xuICAgICAgY29weVRvVGh1bmsoY3VyLmZuLmFwcGx5KHVuZGVmaW5lZCwgYXJncyksIHRodW5rKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbiAgY29weVRvVGh1bmsob2xkVm5vZGUsIHRodW5rKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzZWwsIGtleSwgZm4sIGFyZ3MpIHtcbiAgaWYgKGFyZ3MgPT09IHVuZGVmaW5lZCkge1xuICAgIGFyZ3MgPSBmbjtcbiAgICBmbiA9IGtleTtcbiAgICBrZXkgPSB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIGgoc2VsLCB7XG4gICAga2V5OiBrZXksXG4gICAgaG9vazoge2luaXQ6IGluaXQsIHByZXBhdGNoOiBwcmVwYXRjaH0sXG4gICAgZm46IGZuLFxuICAgIGFyZ3M6IGFyZ3NcbiAgfSk7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzZWwsIGRhdGEsIGNoaWxkcmVuLCB0ZXh0LCBlbG0pIHtcbiAgdmFyIGtleSA9IGRhdGEgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGRhdGEua2V5O1xuICByZXR1cm4ge3NlbDogc2VsLCBkYXRhOiBkYXRhLCBjaGlsZHJlbjogY2hpbGRyZW4sXG4gICAgICAgICAgdGV4dDogdGV4dCwgZWxtOiBlbG0sIGtleToga2V5fTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL2luZGV4Jyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBfcG9ueWZpbGwgPSByZXF1aXJlKCcuL3BvbnlmaWxsJyk7XG5cbnZhciBfcG9ueWZpbGwyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfcG9ueWZpbGwpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyAnZGVmYXVsdCc6IG9iaiB9OyB9XG5cbnZhciByb290OyAvKiBnbG9iYWwgd2luZG93ICovXG5cblxuaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICByb290ID0gc2VsZjtcbn0gZWxzZSBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IGdsb2JhbDtcbn0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IG1vZHVsZTtcbn0gZWxzZSB7XG4gIHJvb3QgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xufVxuXG52YXIgcmVzdWx0ID0gKDAsIF9wb255ZmlsbDJbJ2RlZmF1bHQnXSkocm9vdCk7XG5leHBvcnRzWydkZWZhdWx0J10gPSByZXN1bHQ7IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcblx0dmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0c1snZGVmYXVsdCddID0gc3ltYm9sT2JzZXJ2YWJsZVBvbnlmaWxsO1xuZnVuY3Rpb24gc3ltYm9sT2JzZXJ2YWJsZVBvbnlmaWxsKHJvb3QpIHtcblx0dmFyIHJlc3VsdDtcblx0dmFyIF9TeW1ib2wgPSByb290LlN5bWJvbDtcblxuXHRpZiAodHlwZW9mIF9TeW1ib2wgPT09ICdmdW5jdGlvbicpIHtcblx0XHRpZiAoX1N5bWJvbC5vYnNlcnZhYmxlKSB7XG5cdFx0XHRyZXN1bHQgPSBfU3ltYm9sLm9ic2VydmFibGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IF9TeW1ib2woJ29ic2VydmFibGUnKTtcblx0XHRcdF9TeW1ib2wub2JzZXJ2YWJsZSA9IHJlc3VsdDtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0cmVzdWx0ID0gJ0BAb2JzZXJ2YWJsZSc7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufTsiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBpbmRleF8xID0gcmVxdWlyZSgnLi4vaW5kZXgnKTtcbnZhciBlbXB0eSA9IHt9O1xudmFyIERyb3BSZXBlYXRzT3BlcmF0b3IgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERyb3BSZXBlYXRzT3BlcmF0b3IoaW5zLCBmbikge1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5mbiA9IGZuO1xuICAgICAgICB0aGlzLnR5cGUgPSAnZHJvcFJlcGVhdHMnO1xuICAgICAgICB0aGlzLm91dCA9IG51bGw7XG4gICAgICAgIHRoaXMudiA9IGVtcHR5O1xuICAgIH1cbiAgICBEcm9wUmVwZWF0c09wZXJhdG9yLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRHJvcFJlcGVhdHNPcGVyYXRvci5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMub3V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy52ID0gZW1wdHk7XG4gICAgfTtcbiAgICBEcm9wUmVwZWF0c09wZXJhdG9yLnByb3RvdHlwZS5pc0VxID0gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZm4gPyB0aGlzLmZuKHgsIHkpIDogeCA9PT0geTtcbiAgICB9O1xuICAgIERyb3BSZXBlYXRzT3BlcmF0b3IucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKCF1KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgdiA9IHRoaXMudjtcbiAgICAgICAgaWYgKHYgIT09IGVtcHR5ICYmIHRoaXMuaXNFcSh0LCB2KSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy52ID0gQXJyYXkuaXNBcnJheSh0KSA/IHQuc2xpY2UoKSA6IHQ7XG4gICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBEcm9wUmVwZWF0c09wZXJhdG9yLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKCF1KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9lKGVycik7XG4gICAgfTtcbiAgICBEcm9wUmVwZWF0c09wZXJhdG9yLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKCF1KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9jKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRHJvcFJlcGVhdHNPcGVyYXRvcjtcbn0oKSk7XG5leHBvcnRzLkRyb3BSZXBlYXRzT3BlcmF0b3IgPSBEcm9wUmVwZWF0c09wZXJhdG9yO1xuLyoqXG4gKiBEcm9wcyBjb25zZWN1dGl2ZSBkdXBsaWNhdGUgdmFsdWVzIGluIGEgc3RyZWFtLlxuICpcbiAqIE1hcmJsZSBkaWFncmFtOlxuICpcbiAqIGBgYHRleHRcbiAqIC0tMS0tMi0tMS0tMS0tMS0tMi0tMy0tNC0tMy0tM3xcbiAqICAgICBkcm9wUmVwZWF0c1xuICogLS0xLS0yLS0xLS0tLS0tLS0yLS0zLS00LS0zLS0tfFxuICogYGBgXG4gKlxuICogRXhhbXBsZTpcbiAqXG4gKiBgYGBqc1xuICogaW1wb3J0IGRyb3BSZXBlYXRzIGZyb20gJ3hzdHJlYW0vZXh0cmEvZHJvcFJlcGVhdHMnXG4gKlxuICogY29uc3Qgc3RyZWFtID0geHMub2YoMSwgMiwgMSwgMSwgMSwgMiwgMywgNCwgMywgMylcbiAqICAgLmNvbXBvc2UoZHJvcFJlcGVhdHMoKSlcbiAqXG4gKiBzdHJlYW0uYWRkTGlzdGVuZXIoe1xuICogICBuZXh0OiBpID0+IGNvbnNvbGUubG9nKGkpLFxuICogICBlcnJvcjogZXJyID0+IGNvbnNvbGUuZXJyb3IoZXJyKSxcbiAqICAgY29tcGxldGU6ICgpID0+IGNvbnNvbGUubG9nKCdjb21wbGV0ZWQnKVxuICogfSlcbiAqIGBgYFxuICpcbiAqIGBgYHRleHRcbiAqID4gMVxuICogPiAyXG4gKiA+IDFcbiAqID4gMlxuICogPiAzXG4gKiA+IDRcbiAqID4gM1xuICogPiBjb21wbGV0ZWRcbiAqIGBgYFxuICpcbiAqIEV4YW1wbGUgd2l0aCBhIGN1c3RvbSBpc0VxdWFsIGZ1bmN0aW9uOlxuICpcbiAqIGBgYGpzXG4gKiBpbXBvcnQgZHJvcFJlcGVhdHMgZnJvbSAneHN0cmVhbS9leHRyYS9kcm9wUmVwZWF0cydcbiAqXG4gKiBjb25zdCBzdHJlYW0gPSB4cy5vZignYScsICdiJywgJ2EnLCAnQScsICdCJywgJ2InKVxuICogICAuY29tcG9zZShkcm9wUmVwZWF0cygoeCwgeSkgPT4geC50b0xvd2VyQ2FzZSgpID09PSB5LnRvTG93ZXJDYXNlKCkpKVxuICpcbiAqIHN0cmVhbS5hZGRMaXN0ZW5lcih7XG4gKiAgIG5leHQ6IGkgPT4gY29uc29sZS5sb2coaSksXG4gKiAgIGVycm9yOiBlcnIgPT4gY29uc29sZS5lcnJvcihlcnIpLFxuICogICBjb21wbGV0ZTogKCkgPT4gY29uc29sZS5sb2coJ2NvbXBsZXRlZCcpXG4gKiB9KVxuICogYGBgXG4gKlxuICogYGBgdGV4dFxuICogPiBhXG4gKiA+IGJcbiAqID4gYVxuICogPiBCXG4gKiA+IGNvbXBsZXRlZFxuICogYGBgXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXNFcXVhbCBBbiBvcHRpb25hbCBmdW5jdGlvbiBvZiB0eXBlXG4gKiBgKHg6IFQsIHk6IFQpID0+IGJvb2xlYW5gIHRoYXQgdGFrZXMgYW4gZXZlbnQgZnJvbSB0aGUgaW5wdXQgc3RyZWFtIGFuZFxuICogY2hlY2tzIGlmIGl0IGlzIGVxdWFsIHRvIHByZXZpb3VzIGV2ZW50LCBieSByZXR1cm5pbmcgYSBib29sZWFuLlxuICogQHJldHVybiB7U3RyZWFtfVxuICovXG5mdW5jdGlvbiBkcm9wUmVwZWF0cyhpc0VxdWFsKSB7XG4gICAgaWYgKGlzRXF1YWwgPT09IHZvaWQgMCkgeyBpc0VxdWFsID0gdm9pZCAwOyB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGRyb3BSZXBlYXRzT3BlcmF0b3IoaW5zKSB7XG4gICAgICAgIHJldHVybiBuZXcgaW5kZXhfMS5TdHJlYW0obmV3IERyb3BSZXBlYXRzT3BlcmF0b3IoaW5zLCBpc0VxdWFsKSk7XG4gICAgfTtcbn1cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGRyb3BSZXBlYXRzO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZHJvcFJlcGVhdHMuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgX19leHRlbmRzID0gKHRoaXMgJiYgdGhpcy5fX2V4dGVuZHMpIHx8IGZ1bmN0aW9uIChkLCBiKSB7XG4gICAgZm9yICh2YXIgcCBpbiBiKSBpZiAoYi5oYXNPd25Qcm9wZXJ0eShwKSkgZFtwXSA9IGJbcF07XG4gICAgZnVuY3Rpb24gX18oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBkOyB9XG4gICAgZC5wcm90b3R5cGUgPSBiID09PSBudWxsID8gT2JqZWN0LmNyZWF0ZShiKSA6IChfXy5wcm90b3R5cGUgPSBiLnByb3RvdHlwZSwgbmV3IF9fKCkpO1xufTtcbnZhciBzeW1ib2xfb2JzZXJ2YWJsZV8xID0gcmVxdWlyZSgnc3ltYm9sLW9ic2VydmFibGUnKTtcbnZhciBOTyA9IHt9O1xuZXhwb3J0cy5OTyA9IE5PO1xuZnVuY3Rpb24gbm9vcCgpIHsgfVxuZnVuY3Rpb24gY29weShhKSB7XG4gICAgdmFyIGwgPSBhLmxlbmd0aDtcbiAgICB2YXIgYiA9IEFycmF5KGwpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgKytpKSB7XG4gICAgICAgIGJbaV0gPSBhW2ldO1xuICAgIH1cbiAgICByZXR1cm4gYjtcbn1cbmZ1bmN0aW9uIGFuZChmMSwgZjIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gYW5kRm4odCkge1xuICAgICAgICByZXR1cm4gZjEodCkgJiYgZjIodCk7XG4gICAgfTtcbn1cbmZ1bmN0aW9uIF90cnkoYywgdCwgdSkge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBjLmYodCk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIHUuX2UoZSk7XG4gICAgICAgIHJldHVybiBOTztcbiAgICB9XG59XG52YXIgTk9fSUwgPSB7XG4gICAgX246IG5vb3AsXG4gICAgX2U6IG5vb3AsXG4gICAgX2M6IG5vb3AsXG59O1xuZXhwb3J0cy5OT19JTCA9IE5PX0lMO1xuLy8gbXV0YXRlcyB0aGUgaW5wdXRcbmZ1bmN0aW9uIGludGVybmFsaXplUHJvZHVjZXIocHJvZHVjZXIpIHtcbiAgICBwcm9kdWNlci5fc3RhcnQgPVxuICAgICAgICBmdW5jdGlvbiBfc3RhcnQoaWwpIHtcbiAgICAgICAgICAgIGlsLm5leHQgPSBpbC5fbjtcbiAgICAgICAgICAgIGlsLmVycm9yID0gaWwuX2U7XG4gICAgICAgICAgICBpbC5jb21wbGV0ZSA9IGlsLl9jO1xuICAgICAgICAgICAgdGhpcy5zdGFydChpbCk7XG4gICAgICAgIH07XG4gICAgcHJvZHVjZXIuX3N0b3AgPSBwcm9kdWNlci5zdG9wO1xufVxudmFyIFN0cmVhbVN1YiA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gU3RyZWFtU3ViKF9zdHJlYW0sIF9saXN0ZW5lcikge1xuICAgICAgICB0aGlzLl9zdHJlYW0gPSBfc3RyZWFtO1xuICAgICAgICB0aGlzLl9saXN0ZW5lciA9IF9saXN0ZW5lcjtcbiAgICB9XG4gICAgU3RyZWFtU3ViLnByb3RvdHlwZS51bnN1YnNjcmliZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fc3RyZWFtLnJlbW92ZUxpc3RlbmVyKHRoaXMuX2xpc3RlbmVyKTtcbiAgICB9O1xuICAgIHJldHVybiBTdHJlYW1TdWI7XG59KCkpO1xudmFyIE9ic2VydmVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBPYnNlcnZlcihfbGlzdGVuZXIpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIgPSBfbGlzdGVuZXI7XG4gICAgfVxuICAgIE9ic2VydmVyLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVyLl9uKHZhbHVlKTtcbiAgICB9O1xuICAgIE9ic2VydmVyLnByb3RvdHlwZS5lcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIuX2UoZXJyKTtcbiAgICB9O1xuICAgIE9ic2VydmVyLnByb3RvdHlwZS5jb21wbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBPYnNlcnZlcjtcbn0oKSk7XG52YXIgRnJvbU9ic2VydmFibGUgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEZyb21PYnNlcnZhYmxlKG9ic2VydmFibGUpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2Zyb21PYnNlcnZhYmxlJztcbiAgICAgICAgdGhpcy5pbnMgPSBvYnNlcnZhYmxlO1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlO1xuICAgIH1cbiAgICBGcm9tT2JzZXJ2YWJsZS5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xuICAgICAgICB0aGlzLl9zdWIgPSB0aGlzLmlucy5zdWJzY3JpYmUobmV3IE9ic2VydmVyKG91dCkpO1xuICAgICAgICBpZiAoIXRoaXMuYWN0aXZlKVxuICAgICAgICAgICAgdGhpcy5fc3ViLnVuc3Vic2NyaWJlKCk7XG4gICAgfTtcbiAgICBGcm9tT2JzZXJ2YWJsZS5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9zdWIpXG4gICAgICAgICAgICB0aGlzLl9zdWIudW5zdWJzY3JpYmUoKTtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBGcm9tT2JzZXJ2YWJsZTtcbn0oKSk7XG52YXIgTWVyZ2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIE1lcmdlKGluc0Fycikge1xuICAgICAgICB0aGlzLnR5cGUgPSAnbWVyZ2UnO1xuICAgICAgICB0aGlzLmluc0FyciA9IGluc0FycjtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5hYyA9IDA7XG4gICAgfVxuICAgIE1lcmdlLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB2YXIgcyA9IHRoaXMuaW5zQXJyO1xuICAgICAgICB2YXIgTCA9IHMubGVuZ3RoO1xuICAgICAgICB0aGlzLmFjID0gTDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBMOyBpKyspIHtcbiAgICAgICAgICAgIHNbaV0uX2FkZCh0aGlzKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgTWVyZ2UucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcyA9IHRoaXMuaW5zQXJyO1xuICAgICAgICB2YXIgTCA9IHMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IEw7IGkrKykge1xuICAgICAgICAgICAgc1tpXS5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgfTtcbiAgICBNZXJnZS5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBNZXJnZS5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgTWVyZ2UucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoLS10aGlzLmFjIDw9IDApIHtcbiAgICAgICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdS5fYygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gTWVyZ2U7XG59KCkpO1xudmFyIENvbWJpbmVMaXN0ZW5lciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQ29tYmluZUxpc3RlbmVyKGksIG91dCwgcCkge1xuICAgICAgICB0aGlzLmkgPSBpO1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5wID0gcDtcbiAgICAgICAgcC5pbHMucHVzaCh0aGlzKTtcbiAgICB9XG4gICAgQ29tYmluZUxpc3RlbmVyLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciBwID0gdGhpcy5wLCBvdXQgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKG91dCA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmIChwLnVwKHQsIHRoaXMuaSkpIHtcbiAgICAgICAgICAgIG91dC5fbihwLnZhbHMpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBDb21iaW5lTGlzdGVuZXIucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgb3V0ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmIChvdXQgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBvdXQuX2UoZXJyKTtcbiAgICB9O1xuICAgIENvbWJpbmVMaXN0ZW5lci5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBwID0gdGhpcy5wO1xuICAgICAgICBpZiAocC5vdXQgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAoLS1wLk5jID09PSAwKSB7XG4gICAgICAgICAgICBwLm91dC5fYygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gQ29tYmluZUxpc3RlbmVyO1xufSgpKTtcbnZhciBDb21iaW5lID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBDb21iaW5lKGluc0Fycikge1xuICAgICAgICB0aGlzLnR5cGUgPSAnY29tYmluZSc7XG4gICAgICAgIHRoaXMuaW5zQXJyID0gaW5zQXJyO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmlscyA9IFtdO1xuICAgICAgICB0aGlzLk5jID0gdGhpcy5ObiA9IDA7XG4gICAgICAgIHRoaXMudmFscyA9IFtdO1xuICAgIH1cbiAgICBDb21iaW5lLnByb3RvdHlwZS51cCA9IGZ1bmN0aW9uICh0LCBpKSB7XG4gICAgICAgIHZhciB2ID0gdGhpcy52YWxzW2ldO1xuICAgICAgICB2YXIgTm4gPSAhdGhpcy5ObiA/IDAgOiB2ID09PSBOTyA/IC0tdGhpcy5ObiA6IHRoaXMuTm47XG4gICAgICAgIHRoaXMudmFsc1tpXSA9IHQ7XG4gICAgICAgIHJldHVybiBObiA9PT0gMDtcbiAgICB9O1xuICAgIENvbWJpbmUucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHZhciBzID0gdGhpcy5pbnNBcnI7XG4gICAgICAgIHZhciBuID0gdGhpcy5OYyA9IHRoaXMuTm4gPSBzLmxlbmd0aDtcbiAgICAgICAgdmFyIHZhbHMgPSB0aGlzLnZhbHMgPSBuZXcgQXJyYXkobik7XG4gICAgICAgIGlmIChuID09PSAwKSB7XG4gICAgICAgICAgICBvdXQuX24oW10pO1xuICAgICAgICAgICAgb3V0Ll9jKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIHZhbHNbaV0gPSBOTztcbiAgICAgICAgICAgICAgICBzW2ldLl9hZGQobmV3IENvbWJpbmVMaXN0ZW5lcihpLCBvdXQsIHRoaXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgQ29tYmluZS5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzID0gdGhpcy5pbnNBcnI7XG4gICAgICAgIHZhciBuID0gcy5sZW5ndGg7XG4gICAgICAgIHZhciBpbHMgPSB0aGlzLmlscztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHNbaV0uX3JlbW92ZShpbHNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMuaWxzID0gW107XG4gICAgICAgIHRoaXMudmFscyA9IFtdO1xuICAgIH07XG4gICAgcmV0dXJuIENvbWJpbmU7XG59KCkpO1xudmFyIEZyb21BcnJheSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRnJvbUFycmF5KGEpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2Zyb21BcnJheSc7XG4gICAgICAgIHRoaXMuYSA9IGE7XG4gICAgfVxuICAgIEZyb21BcnJheS5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB2YXIgYSA9IHRoaXMuYTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBhLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgb3V0Ll9uKGFbaV0pO1xuICAgICAgICB9XG4gICAgICAgIG91dC5fYygpO1xuICAgIH07XG4gICAgRnJvbUFycmF5LnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB9O1xuICAgIHJldHVybiBGcm9tQXJyYXk7XG59KCkpO1xudmFyIEZyb21Qcm9taXNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGcm9tUHJvbWlzZShwKSB7XG4gICAgICAgIHRoaXMudHlwZSA9ICdmcm9tUHJvbWlzZSc7XG4gICAgICAgIHRoaXMub24gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5wID0gcDtcbiAgICB9XG4gICAgRnJvbVByb21pc2UucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdmFyIHByb2QgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wLnRoZW4oZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIGlmIChwcm9kLm9uKSB7XG4gICAgICAgICAgICAgICAgb3V0Ll9uKHYpO1xuICAgICAgICAgICAgICAgIG91dC5fYygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgb3V0Ll9lKGUpO1xuICAgICAgICB9KS50aGVuKG5vb3AsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyB0aHJvdyBlcnI7IH0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIEZyb21Qcm9taXNlLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5vbiA9IGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIEZyb21Qcm9taXNlO1xufSgpKTtcbnZhciBQZXJpb2RpYyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUGVyaW9kaWMocGVyaW9kKSB7XG4gICAgICAgIHRoaXMudHlwZSA9ICdwZXJpb2RpYyc7XG4gICAgICAgIHRoaXMucGVyaW9kID0gcGVyaW9kO1xuICAgICAgICB0aGlzLmludGVydmFsSUQgPSAtMTtcbiAgICAgICAgdGhpcy5pID0gMDtcbiAgICB9XG4gICAgUGVyaW9kaWMucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBpbnRlcnZhbEhhbmRsZXIoKSB7IG91dC5fbihzZWxmLmkrKyk7IH1cbiAgICAgICAgdGhpcy5pbnRlcnZhbElEID0gc2V0SW50ZXJ2YWwoaW50ZXJ2YWxIYW5kbGVyLCB0aGlzLnBlcmlvZCk7XG4gICAgfTtcbiAgICBQZXJpb2RpYy5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmludGVydmFsSUQgIT09IC0xKVxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsSUQpO1xuICAgICAgICB0aGlzLmludGVydmFsSUQgPSAtMTtcbiAgICAgICAgdGhpcy5pID0gMDtcbiAgICB9O1xuICAgIHJldHVybiBQZXJpb2RpYztcbn0oKSk7XG52YXIgRGVidWcgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERlYnVnKGlucywgYXJnKSB7XG4gICAgICAgIHRoaXMudHlwZSA9ICdkZWJ1Zyc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLnMgPSBub29wO1xuICAgICAgICB0aGlzLmwgPSAnJztcbiAgICAgICAgaWYgKHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aGlzLmwgPSBhcmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5zID0gYXJnO1xuICAgICAgICB9XG4gICAgfVxuICAgIERlYnVnLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRGVidWcucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgRGVidWcucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgcyA9IHRoaXMucywgbCA9IHRoaXMubDtcbiAgICAgICAgaWYgKHMgIT09IG5vb3ApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcyh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdS5fZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhsICsgJzonLCB0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHQpO1xuICAgICAgICB9XG4gICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBEZWJ1Zy5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgRGVidWcucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBEZWJ1Zztcbn0oKSk7XG52YXIgRHJvcCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRHJvcChtYXgsIGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAnZHJvcCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLm1heCA9IG1heDtcbiAgICAgICAgdGhpcy5kcm9wcGVkID0gMDtcbiAgICB9XG4gICAgRHJvcC5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5kcm9wcGVkID0gMDtcbiAgICAgICAgdGhpcy5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIERyb3AucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgRHJvcC5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICh0aGlzLmRyb3BwZWQrKyA+PSB0aGlzLm1heClcbiAgICAgICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBEcm9wLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9lKGVycik7XG4gICAgfTtcbiAgICBEcm9wLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9jKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRHJvcDtcbn0oKSk7XG52YXIgRW5kV2hlbkxpc3RlbmVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBFbmRXaGVuTGlzdGVuZXIob3V0LCBvcCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5vcCA9IG9wO1xuICAgIH1cbiAgICBFbmRXaGVuTGlzdGVuZXIucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLm9wLmVuZCgpO1xuICAgIH07XG4gICAgRW5kV2hlbkxpc3RlbmVyLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdGhpcy5vdXQuX2UoZXJyKTtcbiAgICB9O1xuICAgIEVuZFdoZW5MaXN0ZW5lci5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMub3AuZW5kKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRW5kV2hlbkxpc3RlbmVyO1xufSgpKTtcbnZhciBFbmRXaGVuID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBFbmRXaGVuKG8sIGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAnZW5kV2hlbic7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLm8gPSBvO1xuICAgICAgICB0aGlzLm9pbCA9IE5PX0lMO1xuICAgIH1cbiAgICBFbmRXaGVuLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLm8uX2FkZCh0aGlzLm9pbCA9IG5ldyBFbmRXaGVuTGlzdGVuZXIob3V0LCB0aGlzKSk7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQodGhpcyk7XG4gICAgfTtcbiAgICBFbmRXaGVuLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vLl9yZW1vdmUodGhpcy5vaWwpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLm9pbCA9IE5PX0lMO1xuICAgIH07XG4gICAgRW5kV2hlbi5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIEVuZFdoZW4ucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9uKHQpO1xuICAgIH07XG4gICAgRW5kV2hlbi5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgRW5kV2hlbi5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZW5kKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRW5kV2hlbjtcbn0oKSk7XG52YXIgRmlsdGVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGaWx0ZXIocGFzc2VzLCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2ZpbHRlcic7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmYgPSBwYXNzZXM7XG4gICAgfVxuICAgIEZpbHRlci5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIEZpbHRlci5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgfTtcbiAgICBGaWx0ZXIucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgciA9IF90cnkodGhpcywgdCwgdSk7XG4gICAgICAgIGlmIChyID09PSBOTyB8fCAhcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fbih0KTtcbiAgICB9O1xuICAgIEZpbHRlci5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgRmlsdGVyLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9jKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRmlsdGVyO1xufSgpKTtcbnZhciBGbGF0dGVuTGlzdGVuZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEZsYXR0ZW5MaXN0ZW5lcihvdXQsIG9wKSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLm9wID0gb3A7XG4gICAgfVxuICAgIEZsYXR0ZW5MaXN0ZW5lci5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB0aGlzLm91dC5fbih0KTtcbiAgICB9O1xuICAgIEZsYXR0ZW5MaXN0ZW5lci5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHRoaXMub3V0Ll9lKGVycik7XG4gICAgfTtcbiAgICBGbGF0dGVuTGlzdGVuZXIucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLm9wLmlubmVyID0gTk87XG4gICAgICAgIHRoaXMub3AubGVzcygpO1xuICAgIH07XG4gICAgcmV0dXJuIEZsYXR0ZW5MaXN0ZW5lcjtcbn0oKSk7XG52YXIgRmxhdHRlbiA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRmxhdHRlbihpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2ZsYXR0ZW4nO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5vcGVuID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5pbm5lciA9IE5PO1xuICAgICAgICB0aGlzLmlsID0gTk9fSUw7XG4gICAgfVxuICAgIEZsYXR0ZW4ucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMub3BlbiA9IHRydWU7XG4gICAgICAgIHRoaXMuaW5uZXIgPSBOTztcbiAgICAgICAgdGhpcy5pbCA9IE5PX0lMO1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRmxhdHRlbi5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLmlubmVyICE9PSBOTylcbiAgICAgICAgICAgIHRoaXMuaW5uZXIuX3JlbW92ZSh0aGlzLmlsKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5vcGVuID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5pbm5lciA9IE5PO1xuICAgICAgICB0aGlzLmlsID0gTk9fSUw7XG4gICAgfTtcbiAgICBGbGF0dGVuLnByb3RvdHlwZS5sZXNzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICghdGhpcy5vcGVuICYmIHRoaXMuaW5uZXIgPT09IE5PKVxuICAgICAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgRmxhdHRlbi5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAocykge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBfYSA9IHRoaXMsIGlubmVyID0gX2EuaW5uZXIsIGlsID0gX2EuaWw7XG4gICAgICAgIGlmIChpbm5lciAhPT0gTk8gJiYgaWwgIT09IE5PX0lMKVxuICAgICAgICAgICAgaW5uZXIuX3JlbW92ZShpbCk7XG4gICAgICAgICh0aGlzLmlubmVyID0gcykuX2FkZCh0aGlzLmlsID0gbmV3IEZsYXR0ZW5MaXN0ZW5lcih1LCB0aGlzKSk7XG4gICAgfTtcbiAgICBGbGF0dGVuLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9lKGVycik7XG4gICAgfTtcbiAgICBGbGF0dGVuLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5vcGVuID0gZmFsc2U7XG4gICAgICAgIHRoaXMubGVzcygpO1xuICAgIH07XG4gICAgcmV0dXJuIEZsYXR0ZW47XG59KCkpO1xudmFyIEZvbGQgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEZvbGQoZiwgc2VlZCwgaW5zKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHRoaXMudHlwZSA9ICdmb2xkJztcbiAgICAgICAgdGhpcy5pbnMgPSBpbnM7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMuZiA9IGZ1bmN0aW9uICh0KSB7IHJldHVybiBmKF90aGlzLmFjYywgdCk7IH07XG4gICAgICAgIHRoaXMuYWNjID0gdGhpcy5zZWVkID0gc2VlZDtcbiAgICB9XG4gICAgRm9sZC5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5hY2MgPSB0aGlzLnNlZWQ7XG4gICAgICAgIG91dC5fbih0aGlzLmFjYyk7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQodGhpcyk7XG4gICAgfTtcbiAgICBGb2xkLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5hY2MgPSB0aGlzLnNlZWQ7XG4gICAgfTtcbiAgICBGb2xkLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHIgPSBfdHJ5KHRoaXMsIHQsIHUpO1xuICAgICAgICBpZiAociA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24odGhpcy5hY2MgPSByKTtcbiAgICB9O1xuICAgIEZvbGQucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIEZvbGQucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBGb2xkO1xufSgpKTtcbnZhciBMYXN0ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBMYXN0KGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAnbGFzdCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmhhcyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnZhbCA9IE5PO1xuICAgIH1cbiAgICBMYXN0LnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmhhcyA9IGZhbHNlO1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgTGFzdC5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMudmFsID0gTk87XG4gICAgfTtcbiAgICBMYXN0LnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHRoaXMuaGFzID0gdHJ1ZTtcbiAgICAgICAgdGhpcy52YWwgPSB0O1xuICAgIH07XG4gICAgTGFzdC5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgTGFzdC5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKHRoaXMuaGFzKSB7XG4gICAgICAgICAgICB1Ll9uKHRoaXMudmFsKTtcbiAgICAgICAgICAgIHUuX2MoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHUuX2UoJ1RPRE8gc2hvdyBwcm9wZXIgZXJyb3InKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIExhc3Q7XG59KCkpO1xudmFyIE1hcEZsYXR0ZW5MaXN0ZW5lciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gTWFwRmxhdHRlbkxpc3RlbmVyKG91dCwgb3ApIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMub3AgPSBvcDtcbiAgICB9XG4gICAgTWFwRmxhdHRlbkxpc3RlbmVyLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uIChyKSB7XG4gICAgICAgIHRoaXMub3V0Ll9uKHIpO1xuICAgIH07XG4gICAgTWFwRmxhdHRlbkxpc3RlbmVyLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdGhpcy5vdXQuX2UoZXJyKTtcbiAgICB9O1xuICAgIE1hcEZsYXR0ZW5MaXN0ZW5lci5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMub3AuaW5uZXIgPSBOTztcbiAgICAgICAgdGhpcy5vcC5sZXNzKCk7XG4gICAgfTtcbiAgICByZXR1cm4gTWFwRmxhdHRlbkxpc3RlbmVyO1xufSgpKTtcbnZhciBNYXBGbGF0dGVuID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBNYXBGbGF0dGVuKG1hcE9wKSB7XG4gICAgICAgIHRoaXMudHlwZSA9IG1hcE9wLnR5cGUgKyBcIitmbGF0dGVuXCI7XG4gICAgICAgIHRoaXMuaW5zID0gbWFwT3AuaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLm1hcE9wID0gbWFwT3A7XG4gICAgICAgIHRoaXMuaW5uZXIgPSBOTztcbiAgICAgICAgdGhpcy5pbCA9IE5PX0lMO1xuICAgICAgICB0aGlzLm9wZW4gPSB0cnVlO1xuICAgIH1cbiAgICBNYXBGbGF0dGVuLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlubmVyID0gTk87XG4gICAgICAgIHRoaXMuaWwgPSBOT19JTDtcbiAgICAgICAgdGhpcy5vcGVuID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5tYXBPcC5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIE1hcEZsYXR0ZW4ucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLm1hcE9wLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy5pbm5lciAhPT0gTk8pXG4gICAgICAgICAgICB0aGlzLmlubmVyLl9yZW1vdmUodGhpcy5pbCk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMuaW5uZXIgPSBOTztcbiAgICAgICAgdGhpcy5pbCA9IE5PX0lMO1xuICAgIH07XG4gICAgTWFwRmxhdHRlbi5wcm90b3R5cGUubGVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLm9wZW4gJiYgdGhpcy5pbm5lciA9PT0gTk8pIHtcbiAgICAgICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdS5fYygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBNYXBGbGF0dGVuLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIF9hID0gdGhpcywgaW5uZXIgPSBfYS5pbm5lciwgaWwgPSBfYS5pbDtcbiAgICAgICAgdmFyIHMgPSBfdHJ5KHRoaXMubWFwT3AsIHYsIHUpO1xuICAgICAgICBpZiAocyA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmIChpbm5lciAhPT0gTk8gJiYgaWwgIT09IE5PX0lMKVxuICAgICAgICAgICAgaW5uZXIuX3JlbW92ZShpbCk7XG4gICAgICAgICh0aGlzLmlubmVyID0gcykuX2FkZCh0aGlzLmlsID0gbmV3IE1hcEZsYXR0ZW5MaXN0ZW5lcih1LCB0aGlzKSk7XG4gICAgfTtcbiAgICBNYXBGbGF0dGVuLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9lKGVycik7XG4gICAgfTtcbiAgICBNYXBGbGF0dGVuLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5vcGVuID0gZmFsc2U7XG4gICAgICAgIHRoaXMubGVzcygpO1xuICAgIH07XG4gICAgcmV0dXJuIE1hcEZsYXR0ZW47XG59KCkpO1xudmFyIE1hcE9wID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBNYXBPcChwcm9qZWN0LCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ21hcCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmYgPSBwcm9qZWN0O1xuICAgIH1cbiAgICBNYXBPcC5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIE1hcE9wLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9O1xuICAgIE1hcE9wLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHIgPSBfdHJ5KHRoaXMsIHQsIHUpO1xuICAgICAgICBpZiAociA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24ocik7XG4gICAgfTtcbiAgICBNYXBPcC5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgTWFwT3AucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBNYXBPcDtcbn0oKSk7XG52YXIgRmlsdGVyTWFwRnVzaW9uID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoRmlsdGVyTWFwRnVzaW9uLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIEZpbHRlck1hcEZ1c2lvbihwYXNzZXMsIHByb2plY3QsIGlucykge1xuICAgICAgICBfc3VwZXIuY2FsbCh0aGlzLCBwcm9qZWN0LCBpbnMpO1xuICAgICAgICB0aGlzLnR5cGUgPSAnZmlsdGVyK21hcCc7XG4gICAgICAgIHRoaXMucGFzc2VzID0gcGFzc2VzO1xuICAgIH1cbiAgICBGaWx0ZXJNYXBGdXNpb24ucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgaWYgKCF0aGlzLnBhc3Nlcyh0KSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgciA9IF90cnkodGhpcywgdCwgdSk7XG4gICAgICAgIGlmIChyID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fbihyKTtcbiAgICB9O1xuICAgIHJldHVybiBGaWx0ZXJNYXBGdXNpb247XG59KE1hcE9wKSk7XG52YXIgUmVtZW1iZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFJlbWVtYmVyKGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAncmVtZW1iZXInO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9XG4gICAgUmVtZW1iZXIucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQob3V0KTtcbiAgICB9O1xuICAgIFJlbWVtYmVyLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzLm91dCk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgfTtcbiAgICByZXR1cm4gUmVtZW1iZXI7XG59KCkpO1xudmFyIFJlcGxhY2VFcnJvciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUmVwbGFjZUVycm9yKHJlcGxhY2VyLCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ3JlcGxhY2VFcnJvcic7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmYgPSByZXBsYWNlcjtcbiAgICB9XG4gICAgUmVwbGFjZUVycm9yLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgUmVwbGFjZUVycm9yLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9O1xuICAgIFJlcGxhY2VFcnJvci5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBSZXBsYWNlRXJyb3IucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICAgICAgKHRoaXMuaW5zID0gdGhpcy5mKGVycikpLl9hZGQodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHUuX2UoZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFJlcGxhY2VFcnJvci5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIFJlcGxhY2VFcnJvcjtcbn0oKSk7XG52YXIgU3RhcnRXaXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBTdGFydFdpdGgoaW5zLCB2YWwpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ3N0YXJ0V2l0aCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLnZhbCA9IHZhbDtcbiAgICB9XG4gICAgU3RhcnRXaXRoLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLm91dC5fbih0aGlzLnZhbCk7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQob3V0KTtcbiAgICB9O1xuICAgIFN0YXJ0V2l0aC5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcy5vdXQpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgcmV0dXJuIFN0YXJ0V2l0aDtcbn0oKSk7XG52YXIgVGFrZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVGFrZShtYXgsIGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAndGFrZSc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLm1heCA9IG1heDtcbiAgICAgICAgdGhpcy50YWtlbiA9IDA7XG4gICAgfVxuICAgIFRha2UucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMudGFrZW4gPSAwO1xuICAgICAgICBpZiAodGhpcy5tYXggPD0gMCkge1xuICAgICAgICAgICAgb3V0Ll9jKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBUYWtlLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9O1xuICAgIFRha2UucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgbSA9ICsrdGhpcy50YWtlbjtcbiAgICAgICAgaWYgKG0gPCB0aGlzLm1heCkge1xuICAgICAgICAgICAgdS5fbih0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtID09PSB0aGlzLm1heCkge1xuICAgICAgICAgICAgdS5fbih0KTtcbiAgICAgICAgICAgIHUuX2MoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVGFrZS5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgVGFrZS5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIFRha2U7XG59KCkpO1xudmFyIFN0cmVhbSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gU3RyZWFtKHByb2R1Y2VyKSB7XG4gICAgICAgIHRoaXMuX3Byb2QgPSBwcm9kdWNlciB8fCBOTztcbiAgICAgICAgdGhpcy5faWxzID0gW107XG4gICAgICAgIHRoaXMuX3N0b3BJRCA9IE5PO1xuICAgICAgICB0aGlzLl9kbCA9IE5PO1xuICAgICAgICB0aGlzLl9kID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3RhcmdldCA9IE5PO1xuICAgICAgICB0aGlzLl9lcnIgPSBOTztcbiAgICB9XG4gICAgU3RyZWFtLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciBhID0gdGhpcy5faWxzO1xuICAgICAgICB2YXIgTCA9IGEubGVuZ3RoO1xuICAgICAgICBpZiAodGhpcy5fZClcbiAgICAgICAgICAgIHRoaXMuX2RsLl9uKHQpO1xuICAgICAgICBpZiAoTCA9PSAxKVxuICAgICAgICAgICAgYVswXS5fbih0KTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgYiA9IGNvcHkoYSk7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IEw7IGkrKylcbiAgICAgICAgICAgICAgICBiW2ldLl9uKHQpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICBpZiAodGhpcy5fZXJyICE9PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy5fZXJyID0gZXJyO1xuICAgICAgICB2YXIgYSA9IHRoaXMuX2lscztcbiAgICAgICAgdmFyIEwgPSBhLmxlbmd0aDtcbiAgICAgICAgdGhpcy5feCgpO1xuICAgICAgICBpZiAodGhpcy5fZClcbiAgICAgICAgICAgIHRoaXMuX2RsLl9lKGVycik7XG4gICAgICAgIGlmIChMID09IDEpXG4gICAgICAgICAgICBhWzBdLl9lKGVycik7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGIgPSBjb3B5KGEpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBMOyBpKyspXG4gICAgICAgICAgICAgICAgYltpXS5fZShlcnIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5fZCAmJiBMID09IDApXG4gICAgICAgICAgICB0aHJvdyB0aGlzLl9lcnI7XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYSA9IHRoaXMuX2lscztcbiAgICAgICAgdmFyIEwgPSBhLmxlbmd0aDtcbiAgICAgICAgdGhpcy5feCgpO1xuICAgICAgICBpZiAodGhpcy5fZClcbiAgICAgICAgICAgIHRoaXMuX2RsLl9jKCk7XG4gICAgICAgIGlmIChMID09IDEpXG4gICAgICAgICAgICBhWzBdLl9jKCk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGIgPSBjb3B5KGEpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBMOyBpKyspXG4gICAgICAgICAgICAgICAgYltpXS5fYygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl94ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5faWxzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKHRoaXMuX3Byb2QgIT09IE5PKVxuICAgICAgICAgICAgdGhpcy5fcHJvZC5fc3RvcCgpO1xuICAgICAgICB0aGlzLl9lcnIgPSBOTztcbiAgICAgICAgdGhpcy5faWxzID0gW107XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9zdG9wTm93ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBXQVJOSU5HOiBjb2RlIHRoYXQgY2FsbHMgdGhpcyBtZXRob2Qgc2hvdWxkXG4gICAgICAgIC8vIGZpcnN0IGNoZWNrIGlmIHRoaXMuX3Byb2QgaXMgdmFsaWQgKG5vdCBgTk9gKVxuICAgICAgICB0aGlzLl9wcm9kLl9zdG9wKCk7XG4gICAgICAgIHRoaXMuX2VyciA9IE5PO1xuICAgICAgICB0aGlzLl9zdG9wSUQgPSBOTztcbiAgICB9O1xuICAgIFN0cmVhbS5wcm90b3R5cGUuX2FkZCA9IGZ1bmN0aW9uIChpbCkge1xuICAgICAgICB2YXIgdGEgPSB0aGlzLl90YXJnZXQ7XG4gICAgICAgIGlmICh0YSAhPT0gTk8pXG4gICAgICAgICAgICByZXR1cm4gdGEuX2FkZChpbCk7XG4gICAgICAgIHZhciBhID0gdGhpcy5faWxzO1xuICAgICAgICBhLnB1c2goaWwpO1xuICAgICAgICBpZiAoYS5sZW5ndGggPiAxKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAodGhpcy5fc3RvcElEICE9PSBOTykge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX3N0b3BJRCk7XG4gICAgICAgICAgICB0aGlzLl9zdG9wSUQgPSBOTztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwID0gdGhpcy5fcHJvZDtcbiAgICAgICAgICAgIGlmIChwICE9PSBOTylcbiAgICAgICAgICAgICAgICBwLl9zdGFydCh0aGlzKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgU3RyZWFtLnByb3RvdHlwZS5fcmVtb3ZlID0gZnVuY3Rpb24gKGlsKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHZhciB0YSA9IHRoaXMuX3RhcmdldDtcbiAgICAgICAgaWYgKHRhICE9PSBOTylcbiAgICAgICAgICAgIHJldHVybiB0YS5fcmVtb3ZlKGlsKTtcbiAgICAgICAgdmFyIGEgPSB0aGlzLl9pbHM7XG4gICAgICAgIHZhciBpID0gYS5pbmRleE9mKGlsKTtcbiAgICAgICAgaWYgKGkgPiAtMSkge1xuICAgICAgICAgICAgYS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICBpZiAodGhpcy5fcHJvZCAhPT0gTk8gJiYgYS5sZW5ndGggPD0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2VyciA9IE5PO1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0b3BJRCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gX3RoaXMuX3N0b3BOb3coKTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChhLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BydW5lQ3ljbGVzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIElmIGFsbCBwYXRocyBzdGVtbWluZyBmcm9tIGB0aGlzYCBzdHJlYW0gZXZlbnR1YWxseSBlbmQgYXQgYHRoaXNgXG4gICAgLy8gc3RyZWFtLCB0aGVuIHdlIHJlbW92ZSB0aGUgc2luZ2xlIGxpc3RlbmVyIG9mIGB0aGlzYCBzdHJlYW0sIHRvXG4gICAgLy8gZm9yY2UgaXQgdG8gZW5kIGl0cyBleGVjdXRpb24gYW5kIGRpc3Bvc2UgcmVzb3VyY2VzLiBUaGlzIG1ldGhvZFxuICAgIC8vIGFzc3VtZXMgYXMgYSBwcmVjb25kaXRpb24gdGhhdCB0aGlzLl9pbHMgaGFzIGp1c3Qgb25lIGxpc3RlbmVyLlxuICAgIFN0cmVhbS5wcm90b3R5cGUuX3BydW5lQ3ljbGVzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5faGFzTm9TaW5rcyh0aGlzLCBbXSkpIHtcbiAgICAgICAgICAgIHRoaXMuX3JlbW92ZSh0aGlzLl9pbHNbMF0pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvLyBDaGVja3Mgd2hldGhlciAqdGhlcmUgaXMgbm8qIHBhdGggc3RhcnRpbmcgZnJvbSBgeGAgdGhhdCBsZWFkcyB0byBhbiBlbmRcbiAgICAvLyBsaXN0ZW5lciAoc2luaykgaW4gdGhlIHN0cmVhbSBncmFwaCwgZm9sbG93aW5nIGVkZ2VzIEEtPkIgd2hlcmUgQiBpcyBhXG4gICAgLy8gbGlzdGVuZXIgb2YgQS4gVGhpcyBtZWFucyB0aGVzZSBwYXRocyBjb25zdGl0dXRlIGEgY3ljbGUgc29tZWhvdy4gSXMgZ2l2ZW5cbiAgICAvLyBhIHRyYWNlIG9mIGFsbCB2aXNpdGVkIG5vZGVzIHNvIGZhci5cbiAgICBTdHJlYW0ucHJvdG90eXBlLl9oYXNOb1NpbmtzID0gZnVuY3Rpb24gKHgsIHRyYWNlKSB7XG4gICAgICAgIGlmICh0cmFjZS5pbmRleE9mKHgpICE9PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoeC5vdXQgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHgub3V0ICYmIHgub3V0ICE9PSBOTykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2hhc05vU2lua3MoeC5vdXQsIHRyYWNlLmNvbmNhdCh4KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoeC5faWxzKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgTiA9IHguX2lscy5sZW5ndGg7IGkgPCBOOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX2hhc05vU2lua3MoeC5faWxzW2ldLCB0cmFjZS5jb25jYXQoeCkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgU3RyZWFtLnByb3RvdHlwZS5jdG9yID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcyBpbnN0YW5jZW9mIE1lbW9yeVN0cmVhbSA/IE1lbW9yeVN0cmVhbSA6IFN0cmVhbTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEFkZHMgYSBMaXN0ZW5lciB0byB0aGUgU3RyZWFtLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtMaXN0ZW5lcn0gbGlzdGVuZXJcbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyKSB7XG4gICAgICAgIGxpc3RlbmVyLl9uID0gbGlzdGVuZXIubmV4dCB8fCBub29wO1xuICAgICAgICBsaXN0ZW5lci5fZSA9IGxpc3RlbmVyLmVycm9yIHx8IG5vb3A7XG4gICAgICAgIGxpc3RlbmVyLl9jID0gbGlzdGVuZXIuY29tcGxldGUgfHwgbm9vcDtcbiAgICAgICAgdGhpcy5fYWRkKGxpc3RlbmVyKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSBMaXN0ZW5lciBmcm9tIHRoZSBTdHJlYW0sIGFzc3VtaW5nIHRoZSBMaXN0ZW5lciB3YXMgYWRkZWQgdG8gaXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0xpc3RlbmVyPFQ+fSBsaXN0ZW5lclxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgdGhpcy5fcmVtb3ZlKGxpc3RlbmVyKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEFkZHMgYSBMaXN0ZW5lciB0byB0aGUgU3RyZWFtIHJldHVybmluZyBhIFN1YnNjcmlwdGlvbiB0byByZW1vdmUgdGhhdFxuICAgICAqIGxpc3RlbmVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtMaXN0ZW5lcn0gbGlzdGVuZXJcbiAgICAgKiBAcmV0dXJucyB7U3Vic2NyaXB0aW9ufVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24gKGxpc3RlbmVyKSB7XG4gICAgICAgIHRoaXMuYWRkTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbVN1Yih0aGlzLCBsaXN0ZW5lcik7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBBZGQgaW50ZXJvcCBiZXR3ZWVuIG1vc3QuanMgYW5kIFJ4SlMgNVxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlW3N5bWJvbF9vYnNlcnZhYmxlXzEuZGVmYXVsdF0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBTdHJlYW0gZ2l2ZW4gYSBQcm9kdWNlci5cbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge1Byb2R1Y2VyfSBwcm9kdWNlciBBbiBvcHRpb25hbCBQcm9kdWNlciB0aGF0IGRpY3RhdGVzIGhvdyB0b1xuICAgICAqIHN0YXJ0LCBnZW5lcmF0ZSBldmVudHMsIGFuZCBzdG9wIHRoZSBTdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5jcmVhdGUgPSBmdW5jdGlvbiAocHJvZHVjZXIpIHtcbiAgICAgICAgaWYgKHByb2R1Y2VyKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHByb2R1Y2VyLnN0YXJ0ICE9PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgfHwgdHlwZW9mIHByb2R1Y2VyLnN0b3AgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2R1Y2VyIHJlcXVpcmVzIGJvdGggc3RhcnQgYW5kIHN0b3AgZnVuY3Rpb25zJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpbnRlcm5hbGl6ZVByb2R1Y2VyKHByb2R1Y2VyKTsgLy8gbXV0YXRlcyB0aGUgaW5wdXRcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbShwcm9kdWNlcik7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IE1lbW9yeVN0cmVhbSBnaXZlbiBhIFByb2R1Y2VyLlxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSB7UHJvZHVjZXJ9IHByb2R1Y2VyIEFuIG9wdGlvbmFsIFByb2R1Y2VyIHRoYXQgZGljdGF0ZXMgaG93IHRvXG4gICAgICogc3RhcnQsIGdlbmVyYXRlIGV2ZW50cywgYW5kIHN0b3AgdGhlIFN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtNZW1vcnlTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLmNyZWF0ZVdpdGhNZW1vcnkgPSBmdW5jdGlvbiAocHJvZHVjZXIpIHtcbiAgICAgICAgaWYgKHByb2R1Y2VyKSB7XG4gICAgICAgICAgICBpbnRlcm5hbGl6ZVByb2R1Y2VyKHByb2R1Y2VyKTsgLy8gbXV0YXRlcyB0aGUgaW5wdXRcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE1lbW9yeVN0cmVhbShwcm9kdWNlcik7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgU3RyZWFtIHRoYXQgZG9lcyBub3RoaW5nIHdoZW4gc3RhcnRlZC4gSXQgbmV2ZXIgZW1pdHMgYW55IGV2ZW50LlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogICAgICAgICAgbmV2ZXJcbiAgICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ubmV2ZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKHsgX3N0YXJ0OiBub29wLCBfc3RvcDogbm9vcCB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBTdHJlYW0gdGhhdCBpbW1lZGlhdGVseSBlbWl0cyB0aGUgXCJjb21wbGV0ZVwiIG5vdGlmaWNhdGlvbiB3aGVuXG4gICAgICogc3RhcnRlZCwgYW5kIHRoYXQncyBpdC5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIGVtcHR5XG4gICAgICogLXxcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLmVtcHR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbSh7XG4gICAgICAgICAgICBfc3RhcnQ6IGZ1bmN0aW9uIChpbCkgeyBpbC5fYygpOyB9LFxuICAgICAgICAgICAgX3N0b3A6IG5vb3AsXG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIFN0cmVhbSB0aGF0IGltbWVkaWF0ZWx5IGVtaXRzIGFuIFwiZXJyb3JcIiBub3RpZmljYXRpb24gd2l0aCB0aGVcbiAgICAgKiB2YWx1ZSB5b3UgcGFzc2VkIGFzIHRoZSBgZXJyb3JgIGFyZ3VtZW50IHdoZW4gdGhlIHN0cmVhbSBzdGFydHMsIGFuZCB0aGF0J3NcbiAgICAgKiBpdC5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIHRocm93KFgpXG4gICAgICogLVhcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0gZXJyb3IgVGhlIGVycm9yIGV2ZW50IHRvIGVtaXQgb24gdGhlIGNyZWF0ZWQgc3RyZWFtLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0udGhyb3cgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0oe1xuICAgICAgICAgICAgX3N0YXJ0OiBmdW5jdGlvbiAoaWwpIHsgaWwuX2UoZXJyb3IpOyB9LFxuICAgICAgICAgICAgX3N0b3A6IG5vb3AsXG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHN0cmVhbSBmcm9tIGFuIEFycmF5LCBQcm9taXNlLCBvciBhbiBPYnNlcnZhYmxlLlxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSB7QXJyYXl8UHJvbWlzZXxPYnNlcnZhYmxlfSBpbnB1dCBUaGUgaW5wdXQgdG8gbWFrZSBhIHN0cmVhbSBmcm9tLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0uZnJvbSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICBpZiAodHlwZW9mIGlucHV0W3N5bWJvbF9vYnNlcnZhYmxlXzEuZGVmYXVsdF0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBTdHJlYW0uZnJvbU9ic2VydmFibGUoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBpbnB1dC50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gU3RyZWFtLmZyb21Qcm9taXNlKGlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KGlucHV0KSkge1xuICAgICAgICAgICAgcmV0dXJuIFN0cmVhbS5mcm9tQXJyYXkoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJUeXBlIG9mIGlucHV0IHRvIGZyb20oKSBtdXN0IGJlIGFuIEFycmF5LCBQcm9taXNlLCBvciBPYnNlcnZhYmxlXCIpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIFN0cmVhbSB0aGF0IGltbWVkaWF0ZWx5IGVtaXRzIHRoZSBhcmd1bWVudHMgdGhhdCB5b3UgZ2l2ZSB0b1xuICAgICAqICpvZiosIHRoZW4gY29tcGxldGVzLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogb2YoMSwyLDMpXG4gICAgICogMTIzfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSBhIFRoZSBmaXJzdCB2YWx1ZSB5b3Ugd2FudCB0byBlbWl0IGFzIGFuIGV2ZW50IG9uIHRoZSBzdHJlYW0uXG4gICAgICogQHBhcmFtIGIgVGhlIHNlY29uZCB2YWx1ZSB5b3Ugd2FudCB0byBlbWl0IGFzIGFuIGV2ZW50IG9uIHRoZSBzdHJlYW0uIE9uZVxuICAgICAqIG9yIG1vcmUgb2YgdGhlc2UgdmFsdWVzIG1heSBiZSBnaXZlbiBhcyBhcmd1bWVudHMuXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5vZiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGl0ZW1zID0gW107XG4gICAgICAgIGZvciAodmFyIF9pID0gMDsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgICAgICBpdGVtc1tfaSAtIDBdID0gYXJndW1lbnRzW19pXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gU3RyZWFtLmZyb21BcnJheShpdGVtcyk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyBhbiBhcnJheSB0byBhIHN0cmVhbS4gVGhlIHJldHVybmVkIHN0cmVhbSB3aWxsIGVtaXQgc3luY2hyb25vdXNseVxuICAgICAqIGFsbCB0aGUgaXRlbXMgaW4gdGhlIGFycmF5LCBhbmQgdGhlbiBjb21wbGV0ZS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIGZyb21BcnJheShbMSwyLDNdKVxuICAgICAqIDEyM3xcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gYmUgY29udmVydGVkIGFzIGEgc3RyZWFtLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0uZnJvbUFycmF5ID0gZnVuY3Rpb24gKGFycmF5KSB7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBGcm9tQXJyYXkoYXJyYXkpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIGEgcHJvbWlzZSB0byBhIHN0cmVhbS4gVGhlIHJldHVybmVkIHN0cmVhbSB3aWxsIGVtaXQgdGhlIHJlc29sdmVkXG4gICAgICogdmFsdWUgb2YgdGhlIHByb21pc2UsIGFuZCB0aGVuIGNvbXBsZXRlLiBIb3dldmVyLCBpZiB0aGUgcHJvbWlzZSBpc1xuICAgICAqIHJlamVjdGVkLCB0aGUgc3RyZWFtIHdpbGwgZW1pdCB0aGUgY29ycmVzcG9uZGluZyBlcnJvci5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIGZyb21Qcm9taXNlKCAtLS0tNDIgKVxuICAgICAqIC0tLS0tLS0tLS0tLS0tLS0tNDJ8XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAZmFjdG9yeSB0cnVlXG4gICAgICogQHBhcmFtIHtQcm9taXNlfSBwcm9taXNlIFRoZSBwcm9taXNlIHRvIGJlIGNvbnZlcnRlZCBhcyBhIHN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLmZyb21Qcm9taXNlID0gZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IEZyb21Qcm9taXNlKHByb21pc2UpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIGFuIE9ic2VydmFibGUgaW50byBhIFN0cmVhbS5cbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge2FueX0gb2JzZXJ2YWJsZSBUaGUgb2JzZXJ2YWJsZSB0byBiZSBjb252ZXJ0ZWQgYXMgYSBzdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5mcm9tT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChvYnNlcnZhYmxlKSB7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBGcm9tT2JzZXJ2YWJsZShvYnNlcnZhYmxlKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgc3RyZWFtIHRoYXQgcGVyaW9kaWNhbGx5IGVtaXRzIGluY3JlbWVudGFsIG51bWJlcnMsIGV2ZXJ5XG4gICAgICogYHBlcmlvZGAgbWlsbGlzZWNvbmRzLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogICAgIHBlcmlvZGljKDEwMDApXG4gICAgICogLS0tMC0tLTEtLS0yLS0tMy0tLTQtLS0uLi5cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcGVyaW9kIFRoZSBpbnRlcnZhbCBpbiBtaWxsaXNlY29uZHMgdG8gdXNlIGFzIGEgcmF0ZSBvZlxuICAgICAqIGVtaXNzaW9uLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucGVyaW9kaWMgPSBmdW5jdGlvbiAocGVyaW9kKSB7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBQZXJpb2RpYyhwZXJpb2QpKTtcbiAgICB9O1xuICAgIFN0cmVhbS5wcm90b3R5cGUuX21hcCA9IGZ1bmN0aW9uIChwcm9qZWN0KSB7XG4gICAgICAgIHZhciBwID0gdGhpcy5fcHJvZDtcbiAgICAgICAgdmFyIGN0b3IgPSB0aGlzLmN0b3IoKTtcbiAgICAgICAgaWYgKHAgaW5zdGFuY2VvZiBGaWx0ZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgY3RvcihuZXcgRmlsdGVyTWFwRnVzaW9uKHAuZiwgcHJvamVjdCwgcC5pbnMpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IGN0b3IobmV3IE1hcE9wKHByb2plY3QsIHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFRyYW5zZm9ybXMgZWFjaCBldmVudCBmcm9tIHRoZSBpbnB1dCBTdHJlYW0gdGhyb3VnaCBhIGBwcm9qZWN0YCBmdW5jdGlvbixcbiAgICAgKiB0byBnZXQgYSBTdHJlYW0gdGhhdCBlbWl0cyB0aG9zZSB0cmFuc2Zvcm1lZCBldmVudHMuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLTEtLS0zLS01LS0tLS03LS0tLS0tXG4gICAgICogICAgbWFwKGkgPT4gaSAqIDEwKVxuICAgICAqIC0tMTAtLTMwLTUwLS0tLTcwLS0tLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IHByb2plY3QgQSBmdW5jdGlvbiBvZiB0eXBlIGAodDogVCkgPT4gVWAgdGhhdCB0YWtlcyBldmVudFxuICAgICAqIGB0YCBvZiB0eXBlIGBUYCBmcm9tIHRoZSBpbnB1dCBTdHJlYW0gYW5kIHByb2R1Y2VzIGFuIGV2ZW50IG9mIHR5cGUgYFVgLCB0b1xuICAgICAqIGJlIGVtaXR0ZWQgb24gdGhlIG91dHB1dCBTdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUubWFwID0gZnVuY3Rpb24gKHByb2plY3QpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcChwcm9qZWN0KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEl0J3MgbGlrZSBgbWFwYCwgYnV0IHRyYW5zZm9ybXMgZWFjaCBpbnB1dCBldmVudCB0byBhbHdheXMgdGhlIHNhbWVcbiAgICAgKiBjb25zdGFudCB2YWx1ZSBvbiB0aGUgb3V0cHV0IFN0cmVhbS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tMS0tLTMtLTUtLS0tLTctLS0tLVxuICAgICAqICAgICAgIG1hcFRvKDEwKVxuICAgICAqIC0tMTAtLTEwLTEwLS0tLTEwLS0tLVxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHBhcmFtIHByb2plY3RlZFZhbHVlIEEgdmFsdWUgdG8gZW1pdCBvbiB0aGUgb3V0cHV0IFN0cmVhbSB3aGVuZXZlciB0aGVcbiAgICAgKiBpbnB1dCBTdHJlYW0gZW1pdHMgYW55IHZhbHVlLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLm1hcFRvID0gZnVuY3Rpb24gKHByb2plY3RlZFZhbHVlKSB7XG4gICAgICAgIHZhciBzID0gdGhpcy5tYXAoZnVuY3Rpb24gKCkgeyByZXR1cm4gcHJvamVjdGVkVmFsdWU7IH0pO1xuICAgICAgICB2YXIgb3AgPSBzLl9wcm9kO1xuICAgICAgICBvcC50eXBlID0gb3AudHlwZS5yZXBsYWNlKCdtYXAnLCAnbWFwVG8nKTtcbiAgICAgICAgcmV0dXJuIHM7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBPbmx5IGFsbG93cyBldmVudHMgdGhhdCBwYXNzIHRoZSB0ZXN0IGdpdmVuIGJ5IHRoZSBgcGFzc2VzYCBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIEVhY2ggZXZlbnQgZnJvbSB0aGUgaW5wdXQgc3RyZWFtIGlzIGdpdmVuIHRvIHRoZSBgcGFzc2VzYCBmdW5jdGlvbi4gSWYgdGhlXG4gICAgICogZnVuY3Rpb24gcmV0dXJucyBgdHJ1ZWAsIHRoZSBldmVudCBpcyBmb3J3YXJkZWQgdG8gdGhlIG91dHB1dCBzdHJlYW0sXG4gICAgICogb3RoZXJ3aXNlIGl0IGlzIGlnbm9yZWQgYW5kIG5vdCBmb3J3YXJkZWQuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLTEtLS0yLS0zLS0tLS00LS0tLS01LS0tNi0tNy04LS1cbiAgICAgKiAgICAgZmlsdGVyKGkgPT4gaSAlIDIgPT09IDApXG4gICAgICogLS0tLS0tMi0tLS0tLS0tNC0tLS0tLS0tLTYtLS0tOC0tXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBwYXNzZXMgQSBmdW5jdGlvbiBvZiB0eXBlIGAodDogVCkgKz4gYm9vbGVhbmAgdGhhdCB0YWtlc1xuICAgICAqIGFuIGV2ZW50IGZyb20gdGhlIGlucHV0IHN0cmVhbSBhbmQgY2hlY2tzIGlmIGl0IHBhc3NlcywgYnkgcmV0dXJuaW5nIGFcbiAgICAgKiBib29sZWFuLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmZpbHRlciA9IGZ1bmN0aW9uIChwYXNzZXMpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLl9wcm9kO1xuICAgICAgICBpZiAocCBpbnN0YW5jZW9mIEZpbHRlcikge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IEZpbHRlcihhbmQocC5mLCBwYXNzZXMpLCBwLmlucykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBGaWx0ZXIocGFzc2VzLCB0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBMZXRzIHRoZSBmaXJzdCBgYW1vdW50YCBtYW55IGV2ZW50cyBmcm9tIHRoZSBpbnB1dCBzdHJlYW0gcGFzcyB0byB0aGVcbiAgICAgKiBvdXRwdXQgc3RyZWFtLCB0aGVuIG1ha2VzIHRoZSBvdXRwdXQgc3RyZWFtIGNvbXBsZXRlLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogLS1hLS0tYi0tYy0tLS1kLS0tZS0tXG4gICAgICogICAgdGFrZSgzKVxuICAgICAqIC0tYS0tLWItLWN8XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYW1vdW50IEhvdyBtYW55IGV2ZW50cyB0byBhbGxvdyBmcm9tIHRoZSBpbnB1dCBzdHJlYW1cbiAgICAgKiBiZWZvcmUgY29tcGxldGluZyB0aGUgb3V0cHV0IHN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS50YWtlID0gZnVuY3Rpb24gKGFtb3VudCkge1xuICAgICAgICByZXR1cm4gbmV3ICh0aGlzLmN0b3IoKSkobmV3IFRha2UoYW1vdW50LCB0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBJZ25vcmVzIHRoZSBmaXJzdCBgYW1vdW50YCBtYW55IGV2ZW50cyBmcm9tIHRoZSBpbnB1dCBzdHJlYW0sIGFuZCB0aGVuXG4gICAgICogYWZ0ZXIgdGhhdCBzdGFydHMgZm9yd2FyZGluZyBldmVudHMgZnJvbSB0aGUgaW5wdXQgc3RyZWFtIHRvIHRoZSBvdXRwdXRcbiAgICAgKiBzdHJlYW0uXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLWEtLS1iLS1jLS0tLWQtLS1lLS1cbiAgICAgKiAgICAgICBkcm9wKDMpXG4gICAgICogLS0tLS0tLS0tLS0tLS1kLS0tZS0tXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gYW1vdW50IEhvdyBtYW55IGV2ZW50cyB0byBpZ25vcmUgZnJvbSB0aGUgaW5wdXQgc3RyZWFtXG4gICAgICogYmVmb3JlIGZvcndhcmRpbmcgYWxsIGV2ZW50cyBmcm9tIHRoZSBpbnB1dCBzdHJlYW0gdG8gdGhlIG91dHB1dCBzdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuZHJvcCA9IGZ1bmN0aW9uIChhbW91bnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IERyb3AoYW1vdW50LCB0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBXaGVuIHRoZSBpbnB1dCBzdHJlYW0gY29tcGxldGVzLCB0aGUgb3V0cHV0IHN0cmVhbSB3aWxsIGVtaXQgdGhlIGxhc3QgZXZlbnRcbiAgICAgKiBlbWl0dGVkIGJ5IHRoZSBpbnB1dCBzdHJlYW0sIGFuZCB0aGVuIHdpbGwgYWxzbyBjb21wbGV0ZS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tYS0tLWItLWMtLWQtLS0tfFxuICAgICAqICAgICAgIGxhc3QoKVxuICAgICAqIC0tLS0tLS0tLS0tLS0tLS0tZHxcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmxhc3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBMYXN0KHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFByZXBlbmRzIHRoZSBnaXZlbiBgaW5pdGlhbGAgdmFsdWUgdG8gdGhlIHNlcXVlbmNlIG9mIGV2ZW50cyBlbWl0dGVkIGJ5IHRoZVxuICAgICAqIGlucHV0IHN0cmVhbS4gVGhlIHJldHVybmVkIHN0cmVhbSBpcyBhIE1lbW9yeVN0cmVhbSwgd2hpY2ggbWVhbnMgaXQgaXNcbiAgICAgKiBhbHJlYWR5IGByZW1lbWJlcigpYCdkLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogLS0tMS0tLTItLS0tLTMtLS1cbiAgICAgKiAgIHN0YXJ0V2l0aCgwKVxuICAgICAqIDAtLTEtLS0yLS0tLS0zLS0tXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0gaW5pdGlhbCBUaGUgdmFsdWUgb3IgZXZlbnQgdG8gcHJlcGVuZC5cbiAgICAgKiBAcmV0dXJuIHtNZW1vcnlTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5zdGFydFdpdGggPSBmdW5jdGlvbiAoaW5pdGlhbCkge1xuICAgICAgICByZXR1cm4gbmV3IE1lbW9yeVN0cmVhbShuZXcgU3RhcnRXaXRoKHRoaXMsIGluaXRpYWwpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFVzZXMgYW5vdGhlciBzdHJlYW0gdG8gZGV0ZXJtaW5lIHdoZW4gdG8gY29tcGxldGUgdGhlIGN1cnJlbnQgc3RyZWFtLlxuICAgICAqXG4gICAgICogV2hlbiB0aGUgZ2l2ZW4gYG90aGVyYCBzdHJlYW0gZW1pdHMgYW4gZXZlbnQgb3IgY29tcGxldGVzLCB0aGUgb3V0cHV0XG4gICAgICogc3RyZWFtIHdpbGwgY29tcGxldGUuIEJlZm9yZSB0aGF0IGhhcHBlbnMsIHRoZSBvdXRwdXQgc3RyZWFtIHdpbGwgYmVoYXZlc1xuICAgICAqIGxpa2UgdGhlIGlucHV0IHN0cmVhbS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tLTEtLS0yLS0tLS0zLS00LS0tLTUtLS0tNi0tLVxuICAgICAqICAgZW5kV2hlbiggLS0tLS0tLS1hLS1iLS18IClcbiAgICAgKiAtLS0xLS0tMi0tLS0tMy0tNC0tfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHBhcmFtIG90aGVyIFNvbWUgb3RoZXIgc3RyZWFtIHRoYXQgaXMgdXNlZCB0byBrbm93IHdoZW4gc2hvdWxkIHRoZSBvdXRwdXRcbiAgICAgKiBzdHJlYW0gb2YgdGhpcyBvcGVyYXRvciBjb21wbGV0ZS5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5lbmRXaGVuID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBuZXcgKHRoaXMuY3RvcigpKShuZXcgRW5kV2hlbihvdGhlciwgdGhpcykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogXCJGb2xkc1wiIHRoZSBzdHJlYW0gb250byBpdHNlbGYuXG4gICAgICpcbiAgICAgKiBDb21iaW5lcyBldmVudHMgZnJvbSB0aGUgcGFzdCB0aHJvdWdob3V0XG4gICAgICogdGhlIGVudGlyZSBleGVjdXRpb24gb2YgdGhlIGlucHV0IHN0cmVhbSwgYWxsb3dpbmcgeW91IHRvIGFjY3VtdWxhdGUgdGhlbVxuICAgICAqIHRvZ2V0aGVyLiBJdCdzIGVzc2VudGlhbGx5IGxpa2UgYEFycmF5LnByb3RvdHlwZS5yZWR1Y2VgLiBUaGUgcmV0dXJuZWRcbiAgICAgKiBzdHJlYW0gaXMgYSBNZW1vcnlTdHJlYW0sIHdoaWNoIG1lYW5zIGl0IGlzIGFscmVhZHkgYHJlbWVtYmVyKClgJ2QuXG4gICAgICpcbiAgICAgKiBUaGUgb3V0cHV0IHN0cmVhbSBzdGFydHMgYnkgZW1pdHRpbmcgdGhlIGBzZWVkYCB3aGljaCB5b3UgZ2l2ZSBhcyBhcmd1bWVudC5cbiAgICAgKiBUaGVuLCB3aGVuIGFuIGV2ZW50IGhhcHBlbnMgb24gdGhlIGlucHV0IHN0cmVhbSwgaXQgaXMgY29tYmluZWQgd2l0aCB0aGF0XG4gICAgICogc2VlZCB2YWx1ZSB0aHJvdWdoIHRoZSBgYWNjdW11bGF0ZWAgZnVuY3Rpb24sIGFuZCB0aGUgb3V0cHV0IHZhbHVlIGlzXG4gICAgICogZW1pdHRlZCBvbiB0aGUgb3V0cHV0IHN0cmVhbS4gYGZvbGRgIHJlbWVtYmVycyB0aGF0IG91dHB1dCB2YWx1ZSBhcyBgYWNjYFxuICAgICAqIChcImFjY3VtdWxhdG9yXCIpLCBhbmQgdGhlbiB3aGVuIGEgbmV3IGlucHV0IGV2ZW50IGB0YCBoYXBwZW5zLCBgYWNjYCB3aWxsIGJlXG4gICAgICogY29tYmluZWQgd2l0aCB0aGF0IHRvIHByb2R1Y2UgdGhlIG5ldyBgYWNjYCBhbmQgc28gZm9ydGguXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLS0tLS0xLS0tLS0xLS0yLS0tLTEtLS0tMS0tLS0tLVxuICAgICAqICAgZm9sZCgoYWNjLCB4KSA9PiBhY2MgKyB4LCAzKVxuICAgICAqIDMtLS0tLTQtLS0tLTUtLTctLS0tOC0tLS05LS0tLS0tXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBhY2N1bXVsYXRlIEEgZnVuY3Rpb24gb2YgdHlwZSBgKGFjYzogUiwgdDogVCkgPT4gUmAgdGhhdFxuICAgICAqIHRha2VzIHRoZSBwcmV2aW91cyBhY2N1bXVsYXRlZCB2YWx1ZSBgYWNjYCBhbmQgdGhlIGluY29taW5nIGV2ZW50IGZyb20gdGhlXG4gICAgICogaW5wdXQgc3RyZWFtIGFuZCBwcm9kdWNlcyB0aGUgbmV3IGFjY3VtdWxhdGVkIHZhbHVlLlxuICAgICAqIEBwYXJhbSBzZWVkIFRoZSBpbml0aWFsIGFjY3VtdWxhdGVkIHZhbHVlLCBvZiB0eXBlIGBSYC5cbiAgICAgKiBAcmV0dXJuIHtNZW1vcnlTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5mb2xkID0gZnVuY3Rpb24gKGFjY3VtdWxhdGUsIHNlZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNZW1vcnlTdHJlYW0obmV3IEZvbGQoYWNjdW11bGF0ZSwgc2VlZCwgdGhpcykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgYW4gZXJyb3Igd2l0aCBhbm90aGVyIHN0cmVhbS5cbiAgICAgKlxuICAgICAqIFdoZW4gKGFuZCBpZikgYW4gZXJyb3IgaGFwcGVucyBvbiB0aGUgaW5wdXQgc3RyZWFtLCBpbnN0ZWFkIG9mIGZvcndhcmRpbmdcbiAgICAgKiB0aGF0IGVycm9yIHRvIHRoZSBvdXRwdXQgc3RyZWFtLCAqcmVwbGFjZUVycm9yKiB3aWxsIGNhbGwgdGhlIGByZXBsYWNlYFxuICAgICAqIGZ1bmN0aW9uIHdoaWNoIHJldHVybnMgdGhlIHN0cmVhbSB0aGF0IHRoZSBvdXRwdXQgc3RyZWFtIHdpbGwgcmVwbGljYXRlLlxuICAgICAqIEFuZCwgaW4gY2FzZSB0aGF0IG5ldyBzdHJlYW0gYWxzbyBlbWl0cyBhbiBlcnJvciwgYHJlcGxhY2VgIHdpbGwgYmUgY2FsbGVkXG4gICAgICogYWdhaW4gdG8gZ2V0IGFub3RoZXIgc3RyZWFtIHRvIHN0YXJ0IHJlcGxpY2F0aW5nLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogLS0xLS0tMi0tLS0tMy0tNC0tLS0tWFxuICAgICAqICAgcmVwbGFjZUVycm9yKCAoKSA9PiAtLTEwLS18IClcbiAgICAgKiAtLTEtLS0yLS0tLS0zLS00LS0tLS0tLS0xMC0tfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gcmVwbGFjZSBBIGZ1bmN0aW9uIG9mIHR5cGUgYChlcnIpID0+IFN0cmVhbWAgdGhhdCB0YWtlc1xuICAgICAqIHRoZSBlcnJvciB0aGF0IG9jY3VycmVkIG9uIHRoZSBpbnB1dCBzdHJlYW0gb3Igb24gdGhlIHByZXZpb3VzIHJlcGxhY2VtZW50XG4gICAgICogc3RyZWFtIGFuZCByZXR1cm5zIGEgbmV3IHN0cmVhbS4gVGhlIG91dHB1dCBzdHJlYW0gd2lsbCBiZWhhdmUgbGlrZSB0aGVcbiAgICAgKiBzdHJlYW0gdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMuXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUucmVwbGFjZUVycm9yID0gZnVuY3Rpb24gKHJlcGxhY2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyAodGhpcy5jdG9yKCkpKG5ldyBSZXBsYWNlRXJyb3IocmVwbGFjZSwgdGhpcykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRmxhdHRlbnMgYSBcInN0cmVhbSBvZiBzdHJlYW1zXCIsIGhhbmRsaW5nIG9ubHkgb25lIG5lc3RlZCBzdHJlYW0gYXQgYSB0aW1lXG4gICAgICogKG5vIGNvbmN1cnJlbmN5KS5cbiAgICAgKlxuICAgICAqIElmIHRoZSBpbnB1dCBzdHJlYW0gaXMgYSBzdHJlYW0gdGhhdCBlbWl0cyBzdHJlYW1zLCB0aGVuIHRoaXMgb3BlcmF0b3Igd2lsbFxuICAgICAqIHJldHVybiBhbiBvdXRwdXQgc3RyZWFtIHdoaWNoIGlzIGEgZmxhdCBzdHJlYW06IGVtaXRzIHJlZ3VsYXIgZXZlbnRzLiBUaGVcbiAgICAgKiBmbGF0dGVuaW5nIGhhcHBlbnMgd2l0aG91dCBjb25jdXJyZW5jeS4gSXQgd29ya3MgbGlrZSB0aGlzOiB3aGVuIHRoZSBpbnB1dFxuICAgICAqIHN0cmVhbSBlbWl0cyBhIG5lc3RlZCBzdHJlYW0sICpmbGF0dGVuKiB3aWxsIHN0YXJ0IGltaXRhdGluZyB0aGF0IG5lc3RlZFxuICAgICAqIG9uZS4gSG93ZXZlciwgYXMgc29vbiBhcyB0aGUgbmV4dCBuZXN0ZWQgc3RyZWFtIGlzIGVtaXR0ZWQgb24gdGhlIGlucHV0XG4gICAgICogc3RyZWFtLCAqZmxhdHRlbiogd2lsbCBmb3JnZXQgdGhlIHByZXZpb3VzIG5lc3RlZCBvbmUgaXQgd2FzIGltaXRhdGluZywgYW5kXG4gICAgICogd2lsbCBzdGFydCBpbWl0YXRpbmcgdGhlIG5ldyBuZXN0ZWQgb25lLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogLS0rLS0tLS0tLS0rLS0tLS0tLS0tLS0tLS0tXG4gICAgICogICBcXCAgICAgICAgXFxcbiAgICAgKiAgICBcXCAgICAgICAtLS0tMS0tLS0yLS0tMy0tXG4gICAgICogICAgLS1hLS1iLS0tLWMtLS0tZC0tLS0tLS0tXG4gICAgICogICAgICAgICAgIGZsYXR0ZW5cbiAgICAgKiAtLS0tLWEtLWItLS0tLS0xLS0tLTItLS0zLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmZsYXR0ZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBwID0gdGhpcy5fcHJvZDtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0ocCBpbnN0YW5jZW9mIE1hcE9wICYmICEocCBpbnN0YW5jZW9mIEZpbHRlck1hcEZ1c2lvbikgP1xuICAgICAgICAgICAgbmV3IE1hcEZsYXR0ZW4ocCkgOlxuICAgICAgICAgICAgbmV3IEZsYXR0ZW4odGhpcykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUGFzc2VzIHRoZSBpbnB1dCBzdHJlYW0gdG8gYSBjdXN0b20gb3BlcmF0b3IsIHRvIHByb2R1Y2UgYW4gb3V0cHV0IHN0cmVhbS5cbiAgICAgKlxuICAgICAqICpjb21wb3NlKiBpcyBhIGhhbmR5IHdheSBvZiB1c2luZyBhbiBleGlzdGluZyBmdW5jdGlvbiBpbiBhIGNoYWluZWQgc3R5bGUuXG4gICAgICogSW5zdGVhZCBvZiB3cml0aW5nIGBvdXRTdHJlYW0gPSBmKGluU3RyZWFtKWAgeW91IGNhbiB3cml0ZVxuICAgICAqIGBvdXRTdHJlYW0gPSBpblN0cmVhbS5jb21wb3NlKGYpYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IG9wZXJhdG9yIEEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHN0cmVhbSBhcyBpbnB1dCBhbmRcbiAgICAgKiByZXR1cm5zIGEgc3RyZWFtIGFzIHdlbGwuXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuY29tcG9zZSA9IGZ1bmN0aW9uIChvcGVyYXRvcikge1xuICAgICAgICByZXR1cm4gb3BlcmF0b3IodGhpcyk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG91dHB1dCBzdHJlYW0gdGhhdCBiZWhhdmVzIGxpa2UgdGhlIGlucHV0IHN0cmVhbSwgYnV0IGFsc29cbiAgICAgKiByZW1lbWJlcnMgdGhlIG1vc3QgcmVjZW50IGV2ZW50IHRoYXQgaGFwcGVucyBvbiB0aGUgaW5wdXQgc3RyZWFtLCBzbyB0aGF0IGFcbiAgICAgKiBuZXdseSBhZGRlZCBsaXN0ZW5lciB3aWxsIGltbWVkaWF0ZWx5IHJlY2VpdmUgdGhhdCBtZW1vcmlzZWQgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtNZW1vcnlTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5yZW1lbWJlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNZW1vcnlTdHJlYW0obmV3IFJlbWVtYmVyKHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gb3V0cHV0IHN0cmVhbSB0aGF0IGlkZW50aWNhbGx5IGJlaGF2ZXMgbGlrZSB0aGUgaW5wdXQgc3RyZWFtLFxuICAgICAqIGJ1dCBhbHNvIHJ1bnMgYSBgc3B5YCBmdW5jdGlvbiBmbyBlYWNoIGV2ZW50LCB0byBoZWxwIHlvdSBkZWJ1ZyB5b3VyIGFwcC5cbiAgICAgKlxuICAgICAqICpkZWJ1ZyogdGFrZXMgYSBgc3B5YCBmdW5jdGlvbiBhcyBhcmd1bWVudCwgYW5kIHJ1bnMgdGhhdCBmb3IgZWFjaCBldmVudFxuICAgICAqIGhhcHBlbmluZyBvbiB0aGUgaW5wdXQgc3RyZWFtLiBJZiB5b3UgZG9uJ3QgcHJvdmlkZSB0aGUgYHNweWAgYXJndW1lbnQsXG4gICAgICogdGhlbiAqZGVidWcqIHdpbGwganVzdCBgY29uc29sZS5sb2dgIGVhY2ggZXZlbnQuIFRoaXMgaGVscHMgeW91IHRvXG4gICAgICogdW5kZXJzdGFuZCB0aGUgZmxvdyBvZiBldmVudHMgdGhyb3VnaCBzb21lIG9wZXJhdG9yIGNoYWluLlxuICAgICAqXG4gICAgICogUGxlYXNlIG5vdGUgdGhhdCBpZiB0aGUgb3V0cHV0IHN0cmVhbSBoYXMgbm8gbGlzdGVuZXJzLCB0aGVuIGl0IHdpbGwgbm90XG4gICAgICogc3RhcnQsIHdoaWNoIG1lYW5zIGBzcHlgIHdpbGwgbmV2ZXIgcnVuIGJlY2F1c2Ugbm8gYWN0dWFsIGV2ZW50IGhhcHBlbnMgaW5cbiAgICAgKiB0aGF0IGNhc2UuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLTEtLS0tMi0tLS0tMy0tLS0tNC0tXG4gICAgICogICAgICAgICBkZWJ1Z1xuICAgICAqIC0tMS0tLS0yLS0tLS0zLS0tLS00LS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxhYmVsT3JTcHkgQSBzdHJpbmcgdG8gdXNlIGFzIHRoZSBsYWJlbCB3aGVuIHByaW50aW5nXG4gICAgICogZGVidWcgaW5mb3JtYXRpb24gb24gdGhlIGNvbnNvbGUsIG9yIGEgJ3NweScgZnVuY3Rpb24gdGhhdCB0YWtlcyBhbiBldmVudFxuICAgICAqIGFzIGFyZ3VtZW50LCBhbmQgZG9lcyBub3QgbmVlZCB0byByZXR1cm4gYW55dGhpbmcuXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuZGVidWcgPSBmdW5jdGlvbiAobGFiZWxPclNweSkge1xuICAgICAgICByZXR1cm4gbmV3ICh0aGlzLmN0b3IoKSkobmV3IERlYnVnKHRoaXMsIGxhYmVsT3JTcHkpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqICppbWl0YXRlKiBjaGFuZ2VzIHRoaXMgY3VycmVudCBTdHJlYW0gdG8gZW1pdCB0aGUgc2FtZSBldmVudHMgdGhhdCB0aGVcbiAgICAgKiBgb3RoZXJgIGdpdmVuIFN0cmVhbSBkb2VzLiBUaGlzIG1ldGhvZCByZXR1cm5zIG5vdGhpbmcuXG4gICAgICpcbiAgICAgKiBUaGlzIG1ldGhvZCBleGlzdHMgdG8gYWxsb3cgb25lIHRoaW5nOiAqKmNpcmN1bGFyIGRlcGVuZGVuY3kgb2Ygc3RyZWFtcyoqLlxuICAgICAqIEZvciBpbnN0YW5jZSwgbGV0J3MgaW1hZ2luZSB0aGF0IGZvciBzb21lIHJlYXNvbiB5b3UgbmVlZCB0byBjcmVhdGUgYVxuICAgICAqIGNpcmN1bGFyIGRlcGVuZGVuY3kgd2hlcmUgc3RyZWFtIGBmaXJzdCRgIGRlcGVuZHMgb24gc3RyZWFtIGBzZWNvbmQkYFxuICAgICAqIHdoaWNoIGluIHR1cm4gZGVwZW5kcyBvbiBgZmlyc3QkYDpcbiAgICAgKlxuICAgICAqIDwhLS0gc2tpcC1leGFtcGxlIC0tPlxuICAgICAqIGBgYGpzXG4gICAgICogaW1wb3J0IGRlbGF5IGZyb20gJ3hzdHJlYW0vZXh0cmEvZGVsYXknXG4gICAgICpcbiAgICAgKiB2YXIgZmlyc3QkID0gc2Vjb25kJC5tYXAoeCA9PiB4ICogMTApLnRha2UoMyk7XG4gICAgICogdmFyIHNlY29uZCQgPSBmaXJzdCQubWFwKHggPT4geCArIDEpLnN0YXJ0V2l0aCgxKS5jb21wb3NlKGRlbGF5KDEwMCkpO1xuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogSG93ZXZlciwgdGhhdCBpcyBpbnZhbGlkIEphdmFTY3JpcHQsIGJlY2F1c2UgYHNlY29uZCRgIGlzIHVuZGVmaW5lZFxuICAgICAqIG9uIHRoZSBmaXJzdCBsaW5lLiBUaGlzIGlzIGhvdyAqaW1pdGF0ZSogY2FuIGhlbHAgc29sdmUgaXQ6XG4gICAgICpcbiAgICAgKiBgYGBqc1xuICAgICAqIGltcG9ydCBkZWxheSBmcm9tICd4c3RyZWFtL2V4dHJhL2RlbGF5J1xuICAgICAqXG4gICAgICogdmFyIHNlY29uZFByb3h5JCA9IHhzLmNyZWF0ZSgpO1xuICAgICAqIHZhciBmaXJzdCQgPSBzZWNvbmRQcm94eSQubWFwKHggPT4geCAqIDEwKS50YWtlKDMpO1xuICAgICAqIHZhciBzZWNvbmQkID0gZmlyc3QkLm1hcCh4ID0+IHggKyAxKS5zdGFydFdpdGgoMSkuY29tcG9zZShkZWxheSgxMDApKTtcbiAgICAgKiBzZWNvbmRQcm94eSQuaW1pdGF0ZShzZWNvbmQkKTtcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIFdlIGNyZWF0ZSBgc2Vjb25kUHJveHkkYCBiZWZvcmUgdGhlIG90aGVycywgc28gaXQgY2FuIGJlIHVzZWQgaW4gdGhlXG4gICAgICogZGVjbGFyYXRpb24gb2YgYGZpcnN0JGAuIFRoZW4sIGFmdGVyIGJvdGggYGZpcnN0JGAgYW5kIGBzZWNvbmQkYCBhcmVcbiAgICAgKiBkZWZpbmVkLCB3ZSBob29rIGBzZWNvbmRQcm94eSRgIHdpdGggYHNlY29uZCRgIHdpdGggYGltaXRhdGUoKWAgdG8gdGVsbFxuICAgICAqIHRoYXQgdGhleSBhcmUgXCJ0aGUgc2FtZVwiLiBgaW1pdGF0ZWAgd2lsbCBub3QgdHJpZ2dlciB0aGUgc3RhcnQgb2YgYW55XG4gICAgICogc3RyZWFtLCBpdCBqdXN0IGJpbmRzIGBzZWNvbmRQcm94eSRgIGFuZCBgc2Vjb25kJGAgdG9nZXRoZXIuXG4gICAgICpcbiAgICAgKiBUaGUgZm9sbG93aW5nIGlzIGFuIGV4YW1wbGUgd2hlcmUgYGltaXRhdGUoKWAgaXMgaW1wb3J0YW50IGluIEN5Y2xlLmpzXG4gICAgICogYXBwbGljYXRpb25zLiBBIHBhcmVudCBjb21wb25lbnQgY29udGFpbnMgc29tZSBjaGlsZCBjb21wb25lbnRzLiBBIGNoaWxkXG4gICAgICogaGFzIGFuIGFjdGlvbiBzdHJlYW0gd2hpY2ggaXMgZ2l2ZW4gdG8gdGhlIHBhcmVudCB0byBkZWZpbmUgaXRzIHN0YXRlOlxuICAgICAqXG4gICAgICogPCEtLSBza2lwLWV4YW1wbGUgLS0+XG4gICAgICogYGBganNcbiAgICAgKiBjb25zdCBjaGlsZEFjdGlvblByb3h5JCA9IHhzLmNyZWF0ZSgpO1xuICAgICAqIGNvbnN0IHBhcmVudCA9IFBhcmVudCh7Li4uc291cmNlcywgY2hpbGRBY3Rpb24kOiBjaGlsZEFjdGlvblByb3h5JH0pO1xuICAgICAqIGNvbnN0IGNoaWxkQWN0aW9uJCA9IHBhcmVudC5zdGF0ZSQubWFwKHMgPT4gcy5jaGlsZC5hY3Rpb24kKS5mbGF0dGVuKCk7XG4gICAgICogY2hpbGRBY3Rpb25Qcm94eSQuaW1pdGF0ZShjaGlsZEFjdGlvbiQpO1xuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogTm90ZSwgdGhvdWdoLCB0aGF0ICoqYGltaXRhdGUoKWAgZG9lcyBub3Qgc3VwcG9ydCBNZW1vcnlTdHJlYW1zKiouIElmIHdlXG4gICAgICogd291bGQgYXR0ZW1wdCB0byBpbWl0YXRlIGEgTWVtb3J5U3RyZWFtIGluIGEgY2lyY3VsYXIgZGVwZW5kZW5jeSwgd2Ugd291bGRcbiAgICAgKiBlaXRoZXIgZ2V0IGEgcmFjZSBjb25kaXRpb24gKHdoZXJlIHRoZSBzeW1wdG9tIHdvdWxkIGJlIFwibm90aGluZyBoYXBwZW5zXCIpXG4gICAgICogb3IgYW4gaW5maW5pdGUgY3ljbGljIGVtaXNzaW9uIG9mIHZhbHVlcy4gSXQncyB1c2VmdWwgdG8gdGhpbmsgYWJvdXRcbiAgICAgKiBNZW1vcnlTdHJlYW1zIGFzIGNlbGxzIGluIGEgc3ByZWFkc2hlZXQuIEl0IGRvZXNuJ3QgbWFrZSBhbnkgc2Vuc2UgdG9cbiAgICAgKiBkZWZpbmUgYSBzcHJlYWRzaGVldCBjZWxsIGBBMWAgd2l0aCBhIGZvcm11bGEgdGhhdCBkZXBlbmRzIG9uIGBCMWAgYW5kXG4gICAgICogY2VsbCBgQjFgIGRlZmluZWQgd2l0aCBhIGZvcm11bGEgdGhhdCBkZXBlbmRzIG9uIGBBMWAuXG4gICAgICpcbiAgICAgKiBJZiB5b3UgZmluZCB5b3Vyc2VsZiB3YW50aW5nIHRvIHVzZSBgaW1pdGF0ZSgpYCB3aXRoIGFcbiAgICAgKiBNZW1vcnlTdHJlYW0sIHlvdSBzaG91bGQgcmV3b3JrIHlvdXIgY29kZSBhcm91bmQgYGltaXRhdGUoKWAgdG8gdXNlIGFcbiAgICAgKiBTdHJlYW0gaW5zdGVhZC4gTG9vayBmb3IgdGhlIHN0cmVhbSBpbiB0aGUgY2lyY3VsYXIgZGVwZW5kZW5jeSB0aGF0XG4gICAgICogcmVwcmVzZW50cyBhbiBldmVudCBzdHJlYW0sIGFuZCB0aGF0IHdvdWxkIGJlIGEgY2FuZGlkYXRlIGZvciBjcmVhdGluZyBhXG4gICAgICogcHJveHkgU3RyZWFtIHdoaWNoIHRoZW4gaW1pdGF0ZXMgdGhlIHRhcmdldCBTdHJlYW0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmVhbX0gdGFyZ2V0IFRoZSBvdGhlciBzdHJlYW0gdG8gaW1pdGF0ZSBvbiB0aGUgY3VycmVudCBvbmUuIE11c3RcbiAgICAgKiBub3QgYmUgYSBNZW1vcnlTdHJlYW0uXG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5pbWl0YXRlID0gZnVuY3Rpb24gKHRhcmdldCkge1xuICAgICAgICBpZiAodGFyZ2V0IGluc3RhbmNlb2YgTWVtb3J5U3RyZWFtKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgTWVtb3J5U3RyZWFtIHdhcyBnaXZlbiB0byBpbWl0YXRlKCksIGJ1dCBpdCBvbmx5ICcgK1xuICAgICAgICAgICAgICAgICdzdXBwb3J0cyBhIFN0cmVhbS4gUmVhZCBtb3JlIGFib3V0IHRoaXMgcmVzdHJpY3Rpb24gaGVyZTogJyArXG4gICAgICAgICAgICAgICAgJ2h0dHBzOi8vZ2l0aHViLmNvbS9zdGFsdHoveHN0cmVhbSNmYXEnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl90YXJnZXQgPSB0YXJnZXQ7XG4gICAgICAgIGZvciAodmFyIGlscyA9IHRoaXMuX2lscywgTiA9IGlscy5sZW5ndGgsIGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICAgICAgICB0YXJnZXQuX2FkZChpbHNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2lscyA9IFtdO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRm9yY2VzIHRoZSBTdHJlYW0gdG8gZW1pdCB0aGUgZ2l2ZW4gdmFsdWUgdG8gaXRzIGxpc3RlbmVycy5cbiAgICAgKlxuICAgICAqIEFzIHRoZSBuYW1lIGluZGljYXRlcywgaWYgeW91IHVzZSB0aGlzLCB5b3UgYXJlIG1vc3QgbGlrZWx5IGRvaW5nIHNvbWV0aGluZ1xuICAgICAqIFRoZSBXcm9uZyBXYXkuIFBsZWFzZSB0cnkgdG8gdW5kZXJzdGFuZCB0aGUgcmVhY3RpdmUgd2F5IGJlZm9yZSB1c2luZyB0aGlzXG4gICAgICogbWV0aG9kLiBVc2UgaXQgb25seSB3aGVuIHlvdSBrbm93IHdoYXQgeW91IGFyZSBkb2luZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB2YWx1ZSBUaGUgXCJuZXh0XCIgdmFsdWUgeW91IHdhbnQgdG8gYnJvYWRjYXN0IHRvIGFsbCBsaXN0ZW5lcnMgb2ZcbiAgICAgKiB0aGlzIFN0cmVhbS5cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnNoYW1lZnVsbHlTZW5kTmV4dCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9uKHZhbHVlKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZvcmNlcyB0aGUgU3RyZWFtIHRvIGVtaXQgdGhlIGdpdmVuIGVycm9yIHRvIGl0cyBsaXN0ZW5lcnMuXG4gICAgICpcbiAgICAgKiBBcyB0aGUgbmFtZSBpbmRpY2F0ZXMsIGlmIHlvdSB1c2UgdGhpcywgeW91IGFyZSBtb3N0IGxpa2VseSBkb2luZyBzb21ldGhpbmdcbiAgICAgKiBUaGUgV3JvbmcgV2F5LiBQbGVhc2UgdHJ5IHRvIHVuZGVyc3RhbmQgdGhlIHJlYWN0aXZlIHdheSBiZWZvcmUgdXNpbmcgdGhpc1xuICAgICAqIG1ldGhvZC4gVXNlIGl0IG9ubHkgd2hlbiB5b3Uga25vdyB3aGF0IHlvdSBhcmUgZG9pbmcuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2FueX0gZXJyb3IgVGhlIGVycm9yIHlvdSB3YW50IHRvIGJyb2FkY2FzdCB0byBhbGwgdGhlIGxpc3RlbmVycyBvZlxuICAgICAqIHRoaXMgU3RyZWFtLlxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuc2hhbWVmdWxseVNlbmRFcnJvciA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICB0aGlzLl9lKGVycm9yKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZvcmNlcyB0aGUgU3RyZWFtIHRvIGVtaXQgdGhlIFwiY29tcGxldGVkXCIgZXZlbnQgdG8gaXRzIGxpc3RlbmVycy5cbiAgICAgKlxuICAgICAqIEFzIHRoZSBuYW1lIGluZGljYXRlcywgaWYgeW91IHVzZSB0aGlzLCB5b3UgYXJlIG1vc3QgbGlrZWx5IGRvaW5nIHNvbWV0aGluZ1xuICAgICAqIFRoZSBXcm9uZyBXYXkuIFBsZWFzZSB0cnkgdG8gdW5kZXJzdGFuZCB0aGUgcmVhY3RpdmUgd2F5IGJlZm9yZSB1c2luZyB0aGlzXG4gICAgICogbWV0aG9kLiBVc2UgaXQgb25seSB3aGVuIHlvdSBrbm93IHdoYXQgeW91IGFyZSBkb2luZy5cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnNoYW1lZnVsbHlTZW5kQ29tcGxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2MoKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEFkZHMgYSBcImRlYnVnXCIgbGlzdGVuZXIgdG8gdGhlIHN0cmVhbS4gVGhlcmUgY2FuIG9ubHkgYmUgb25lIGRlYnVnXG4gICAgICogbGlzdGVuZXIsIHRoYXQncyB3aHkgdGhpcyBpcyAnc2V0RGVidWdMaXN0ZW5lcicuIFRvIHJlbW92ZSB0aGUgZGVidWdcbiAgICAgKiBsaXN0ZW5lciwganVzdCBjYWxsIHNldERlYnVnTGlzdGVuZXIobnVsbCkuXG4gICAgICpcbiAgICAgKiBBIGRlYnVnIGxpc3RlbmVyIGlzIGxpa2UgYW55IG90aGVyIGxpc3RlbmVyLiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIHRoYXQgYVxuICAgICAqIGRlYnVnIGxpc3RlbmVyIGlzIFwic3RlYWx0aHlcIjogaXRzIHByZXNlbmNlL2Fic2VuY2UgZG9lcyBub3QgdHJpZ2dlciB0aGVcbiAgICAgKiBzdGFydC9zdG9wIG9mIHRoZSBzdHJlYW0gKG9yIHRoZSBwcm9kdWNlciBpbnNpZGUgdGhlIHN0cmVhbSkuIFRoaXMgaXNcbiAgICAgKiB1c2VmdWwgc28geW91IGNhbiBpbnNwZWN0IHdoYXQgaXMgZ29pbmcgb24gd2l0aG91dCBjaGFuZ2luZyB0aGUgYmVoYXZpb3JcbiAgICAgKiBvZiB0aGUgcHJvZ3JhbS4gSWYgeW91IGhhdmUgYW4gaWRsZSBzdHJlYW0gYW5kIHlvdSBhZGQgYSBub3JtYWwgbGlzdGVuZXIgdG9cbiAgICAgKiBpdCwgdGhlIHN0cmVhbSB3aWxsIHN0YXJ0IGV4ZWN1dGluZy4gQnV0IGlmIHlvdSBzZXQgYSBkZWJ1ZyBsaXN0ZW5lciBvbiBhblxuICAgICAqIGlkbGUgc3RyZWFtLCBpdCB3b24ndCBzdGFydCBleGVjdXRpbmcgKG5vdCB1bnRpbCB0aGUgZmlyc3Qgbm9ybWFsIGxpc3RlbmVyXG4gICAgICogaXMgYWRkZWQpLlxuICAgICAqXG4gICAgICogQXMgdGhlIG5hbWUgaW5kaWNhdGVzLCB3ZSBkb24ndCByZWNvbW1lbmQgdXNpbmcgdGhpcyBtZXRob2QgdG8gYnVpbGQgYXBwXG4gICAgICogbG9naWMuIEluIGZhY3QsIGluIG1vc3QgY2FzZXMgdGhlIGRlYnVnIG9wZXJhdG9yIHdvcmtzIGp1c3QgZmluZS4gT25seSB1c2VcbiAgICAgKiB0aGlzIG9uZSBpZiB5b3Uga25vdyB3aGF0IHlvdSdyZSBkb2luZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TGlzdGVuZXI8VD59IGxpc3RlbmVyXG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5zZXREZWJ1Z0xpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyKSB7XG4gICAgICAgIGlmICghbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2QgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX2RsID0gTk87XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9kID0gdHJ1ZTtcbiAgICAgICAgICAgIGxpc3RlbmVyLl9uID0gbGlzdGVuZXIubmV4dCB8fCBub29wO1xuICAgICAgICAgICAgbGlzdGVuZXIuX2UgPSBsaXN0ZW5lci5lcnJvciB8fCBub29wO1xuICAgICAgICAgICAgbGlzdGVuZXIuX2MgPSBsaXN0ZW5lci5jb21wbGV0ZSB8fCBub29wO1xuICAgICAgICAgICAgdGhpcy5fZGwgPSBsaXN0ZW5lcjtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLyoqXG4gICAgICogQmxlbmRzIG11bHRpcGxlIHN0cmVhbXMgdG9nZXRoZXIsIGVtaXR0aW5nIGV2ZW50cyBmcm9tIGFsbCBvZiB0aGVtXG4gICAgICogY29uY3VycmVudGx5LlxuICAgICAqXG4gICAgICogKm1lcmdlKiB0YWtlcyBtdWx0aXBsZSBzdHJlYW1zIGFzIGFyZ3VtZW50cywgYW5kIGNyZWF0ZXMgYSBzdHJlYW0gdGhhdFxuICAgICAqIGJlaGF2ZXMgbGlrZSBlYWNoIG9mIHRoZSBhcmd1bWVudCBzdHJlYW1zLCBpbiBwYXJhbGxlbC5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tMS0tLS0yLS0tLS0zLS0tLS0tLS00LS0tXG4gICAgICogLS0tLWEtLS0tLWItLS0tYy0tLWQtLS0tLS1cbiAgICAgKiAgICAgICAgICAgIG1lcmdlXG4gICAgICogLS0xLWEtLTItLWItLTMtYy0tLWQtLTQtLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge1N0cmVhbX0gc3RyZWFtMSBBIHN0cmVhbSB0byBtZXJnZSB0b2dldGhlciB3aXRoIG90aGVyIHN0cmVhbXMuXG4gICAgICogQHBhcmFtIHtTdHJlYW19IHN0cmVhbTIgQSBzdHJlYW0gdG8gbWVyZ2UgdG9nZXRoZXIgd2l0aCBvdGhlciBzdHJlYW1zLiBUd29cbiAgICAgKiBvciBtb3JlIHN0cmVhbXMgbWF5IGJlIGdpdmVuIGFzIGFyZ3VtZW50cy5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLm1lcmdlID0gZnVuY3Rpb24gbWVyZ2UoKSB7XG4gICAgICAgIHZhciBzdHJlYW1zID0gW107XG4gICAgICAgIGZvciAodmFyIF9pID0gMDsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgICAgICBzdHJlYW1zW19pIC0gMF0gPSBhcmd1bWVudHNbX2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBNZXJnZShzdHJlYW1zKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDb21iaW5lcyBtdWx0aXBsZSBpbnB1dCBzdHJlYW1zIHRvZ2V0aGVyIHRvIHJldHVybiBhIHN0cmVhbSB3aG9zZSBldmVudHNcbiAgICAgKiBhcmUgYXJyYXlzIHRoYXQgY29sbGVjdCB0aGUgbGF0ZXN0IGV2ZW50cyBmcm9tIGVhY2ggaW5wdXQgc3RyZWFtLlxuICAgICAqXG4gICAgICogKmNvbWJpbmUqIGludGVybmFsbHkgcmVtZW1iZXJzIHRoZSBtb3N0IHJlY2VudCBldmVudCBmcm9tIGVhY2ggb2YgdGhlIGlucHV0XG4gICAgICogc3RyZWFtcy4gV2hlbiBhbnkgb2YgdGhlIGlucHV0IHN0cmVhbXMgZW1pdHMgYW4gZXZlbnQsIHRoYXQgZXZlbnQgdG9nZXRoZXJcbiAgICAgKiB3aXRoIGFsbCB0aGUgb3RoZXIgc2F2ZWQgZXZlbnRzIGFyZSBjb21iaW5lZCBpbnRvIGFuIGFycmF5LiBUaGF0IGFycmF5IHdpbGxcbiAgICAgKiBiZSBlbWl0dGVkIG9uIHRoZSBvdXRwdXQgc3RyZWFtLiBJdCdzIGVzc2VudGlhbGx5IGEgd2F5IG9mIGpvaW5pbmcgdG9nZXRoZXJcbiAgICAgKiB0aGUgZXZlbnRzIGZyb20gbXVsdGlwbGUgc3RyZWFtcy5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tMS0tLS0yLS0tLS0zLS0tLS0tLS00LS0tXG4gICAgICogLS0tLWEtLS0tLWItLS0tLWMtLWQtLS0tLS1cbiAgICAgKiAgICAgICAgICBjb21iaW5lXG4gICAgICogLS0tLTFhLTJhLTJiLTNiLTNjLTNkLTRkLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIE5vdGU6IHRvIG1pbmltaXplIGdhcmJhZ2UgY29sbGVjdGlvbiwgKmNvbWJpbmUqIHVzZXMgdGhlIHNhbWUgYXJyYXlcbiAgICAgKiBpbnN0YW5jZSBmb3IgZWFjaCBlbWlzc2lvbi4gIElmIHlvdSBuZWVkIHRvIGNvbXBhcmUgZW1pc3Npb25zIG92ZXIgdGltZSxcbiAgICAgKiBjYWNoZSB0aGUgdmFsdWVzIHdpdGggYG1hcGAgZmlyc3Q6XG4gICAgICpcbiAgICAgKiBgYGBqc1xuICAgICAqIGltcG9ydCBwYWlyd2lzZSBmcm9tICd4c3RyZWFtL2V4dHJhL3BhaXJ3aXNlJ1xuICAgICAqXG4gICAgICogY29uc3Qgc3RyZWFtMSA9IHhzLm9mKDEpO1xuICAgICAqIGNvbnN0IHN0cmVhbTIgPSB4cy5vZigyKTtcbiAgICAgKlxuICAgICAqIHhzLmNvbWJpbmUoc3RyZWFtMSwgc3RyZWFtMikubWFwKFxuICAgICAqICAgY29tYmluZWRFbWlzc2lvbnMgPT4gKFsgLi4uY29tYmluZWRFbWlzc2lvbnMgXSlcbiAgICAgKiApLmNvbXBvc2UocGFpcndpc2UpXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAZmFjdG9yeSB0cnVlXG4gICAgICogQHBhcmFtIHtTdHJlYW19IHN0cmVhbTEgQSBzdHJlYW0gdG8gY29tYmluZSB0b2dldGhlciB3aXRoIG90aGVyIHN0cmVhbXMuXG4gICAgICogQHBhcmFtIHtTdHJlYW19IHN0cmVhbTIgQSBzdHJlYW0gdG8gY29tYmluZSB0b2dldGhlciB3aXRoIG90aGVyIHN0cmVhbXMuXG4gICAgICogTXVsdGlwbGUgc3RyZWFtcywgbm90IGp1c3QgdHdvLCBtYXkgYmUgZ2l2ZW4gYXMgYXJndW1lbnRzLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0uY29tYmluZSA9IGZ1bmN0aW9uIGNvbWJpbmUoKSB7XG4gICAgICAgIHZhciBzdHJlYW1zID0gW107XG4gICAgICAgIGZvciAodmFyIF9pID0gMDsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgICAgICBzdHJlYW1zW19pIC0gMF0gPSBhcmd1bWVudHNbX2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBDb21iaW5lKHN0cmVhbXMpKTtcbiAgICB9O1xuICAgIHJldHVybiBTdHJlYW07XG59KCkpO1xuZXhwb3J0cy5TdHJlYW0gPSBTdHJlYW07XG52YXIgTWVtb3J5U3RyZWFtID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoTWVtb3J5U3RyZWFtLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIE1lbW9yeVN0cmVhbShwcm9kdWNlcikge1xuICAgICAgICBfc3VwZXIuY2FsbCh0aGlzLCBwcm9kdWNlcik7XG4gICAgICAgIHRoaXMuX2hhcyA9IGZhbHNlO1xuICAgIH1cbiAgICBNZW1vcnlTdHJlYW0ucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgdGhpcy5fdiA9IHg7XG4gICAgICAgIHRoaXMuX2hhcyA9IHRydWU7XG4gICAgICAgIF9zdXBlci5wcm90b3R5cGUuX24uY2FsbCh0aGlzLCB4KTtcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUuX2FkZCA9IGZ1bmN0aW9uIChpbCkge1xuICAgICAgICB2YXIgdGEgPSB0aGlzLl90YXJnZXQ7XG4gICAgICAgIGlmICh0YSAhPT0gTk8pXG4gICAgICAgICAgICByZXR1cm4gdGEuX2FkZChpbCk7XG4gICAgICAgIHZhciBhID0gdGhpcy5faWxzO1xuICAgICAgICBhLnB1c2goaWwpO1xuICAgICAgICBpZiAoYS5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5faGFzKVxuICAgICAgICAgICAgICAgIGlsLl9uKHRoaXMuX3YpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9zdG9wSUQgIT09IE5PKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5faGFzKVxuICAgICAgICAgICAgICAgIGlsLl9uKHRoaXMuX3YpO1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX3N0b3BJRCk7XG4gICAgICAgICAgICB0aGlzLl9zdG9wSUQgPSBOTztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9oYXMpXG4gICAgICAgICAgICBpbC5fbih0aGlzLl92KTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcCA9IHRoaXMuX3Byb2Q7XG4gICAgICAgICAgICBpZiAocCAhPT0gTk8pXG4gICAgICAgICAgICAgICAgcC5fc3RhcnQodGhpcyk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUuX3N0b3BOb3cgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2hhcyA9IGZhbHNlO1xuICAgICAgICBfc3VwZXIucHJvdG90eXBlLl9zdG9wTm93LmNhbGwodGhpcyk7XG4gICAgfTtcbiAgICBNZW1vcnlTdHJlYW0ucHJvdG90eXBlLl94ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLl9oYXMgPSBmYWxzZTtcbiAgICAgICAgX3N1cGVyLnByb3RvdHlwZS5feC5jYWxsKHRoaXMpO1xuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS5tYXAgPSBmdW5jdGlvbiAocHJvamVjdCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFwKHByb2plY3QpO1xuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS5tYXBUbyA9IGZ1bmN0aW9uIChwcm9qZWN0ZWRWYWx1ZSkge1xuICAgICAgICByZXR1cm4gX3N1cGVyLnByb3RvdHlwZS5tYXBUby5jYWxsKHRoaXMsIHByb2plY3RlZFZhbHVlKTtcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUudGFrZSA9IGZ1bmN0aW9uIChhbW91bnQpIHtcbiAgICAgICAgcmV0dXJuIF9zdXBlci5wcm90b3R5cGUudGFrZS5jYWxsKHRoaXMsIGFtb3VudCk7XG4gICAgfTtcbiAgICBNZW1vcnlTdHJlYW0ucHJvdG90eXBlLmVuZFdoZW4gPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIF9zdXBlci5wcm90b3R5cGUuZW5kV2hlbi5jYWxsKHRoaXMsIG90aGVyKTtcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUucmVwbGFjZUVycm9yID0gZnVuY3Rpb24gKHJlcGxhY2UpIHtcbiAgICAgICAgcmV0dXJuIF9zdXBlci5wcm90b3R5cGUucmVwbGFjZUVycm9yLmNhbGwodGhpcywgcmVwbGFjZSk7XG4gICAgfTtcbiAgICBNZW1vcnlTdHJlYW0ucHJvdG90eXBlLnJlbWVtYmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUuZGVidWcgPSBmdW5jdGlvbiAobGFiZWxPclNweSkge1xuICAgICAgICByZXR1cm4gX3N1cGVyLnByb3RvdHlwZS5kZWJ1Zy5jYWxsKHRoaXMsIGxhYmVsT3JTcHkpO1xuICAgIH07XG4gICAgcmV0dXJuIE1lbW9yeVN0cmVhbTtcbn0oU3RyZWFtKSk7XG5leHBvcnRzLk1lbW9yeVN0cmVhbSA9IE1lbW9yeVN0cmVhbTtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZGVmYXVsdCA9IFN0cmVhbTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWluZGV4LmpzLm1hcCJdfQ==
