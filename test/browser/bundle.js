(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var Gun = require('gun');
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

},{"deep-equal":6,"gun":9,"xstream":14,"xstream/extra/dropRepeats":13}],2:[function(require,module,exports){
"use strict";
var cycle_gun_1 = require('./cycle-gun');
exports.makeGunDriver = cycle_gun_1.makeGunDriver;

},{"./cycle-gun":1}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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

},{"xstream":14}],5:[function(require,module,exports){
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

},{"@cycle/base":3,"@cycle/xstream-adapter":4}],6:[function(require,module,exports){
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

},{"./lib/is_arguments.js":7,"./lib/keys.js":8}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;

exports.shim = shim;
function shim (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}

},{}],9:[function(require,module,exports){
(function (global){
!function(){function t(n){function o(t){return t.split("/").slice(-1).toString().replace(".js","")}return n.slice?t[o(n)]:function(e,i){n(e={exports:{}}),t[o(i)]=e.exports}}var n;"undefined"!=typeof window&&(n=window),"undefined"!=typeof global&&(n=global),n=n||{};var o=n.console||{log:function(){}};if("undefined"!=typeof module)var e=module;t(function(t){var n={};n.fns=n.fn={is:function(t){return!!t&&"function"==typeof t}},n.bi={is:function(t){return t instanceof Boolean||"boolean"==typeof t}},n.num={is:function(t){return!e(t)&&(t-parseFloat(t)+1>=0||1/0===t||-(1/0)===t)}},n.text={is:function(t){return"string"==typeof t}},n.text.ify=function(t){return n.text.is(t)?t:"undefined"!=typeof JSON?JSON.stringify(t):t&&t.toString?t.toString():t},n.text.random=function(t,n){var o="";for(t=t||24,n=n||"0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz";t>0;)o+=n.charAt(Math.floor(Math.random()*n.length)),t--;return o},n.text.match=function(t,o){function e(t,n){for(var o,e=-1,i=0;o=n[i++];)if(!~(e=t.indexOf(o,e+1)))return!1;return!0}var i=!1;if(t=t||"",o=n.text.is(o)?{"=":o}:o||{},n.obj.has(o,"~")&&(t=t.toLowerCase(),o["="]=(o["="]||o["~"]).toLowerCase()),n.obj.has(o,"="))return t===o["="];if(n.obj.has(o,"*")){if(t.slice(0,o["*"].length)!==o["*"])return!1;i=!0,t=t.slice(o["*"].length)}if(n.obj.has(o,"!")){if(t.slice(-o["!"].length)!==o["!"])return!1;i=!0}if(n.obj.has(o,"+")&&n.list.map(n.list.is(o["+"])?o["+"]:[o["+"]],function(n){return t.indexOf(n)>=0?void(i=!0):!0}))return!1;if(n.obj.has(o,"-")&&n.list.map(n.list.is(o["-"])?o["-"]:[o["-"]],function(n){return t.indexOf(n)<0?void(i=!0):!0}))return!1;if(n.obj.has(o,">")){if(!(t>o[">"]))return!1;i=!0}if(n.obj.has(o,"<")){if(!(t<o["<"]))return!1;i=!0}if(n.obj.has(o,"?")){if(!e(t,o["?"]))return!1;i=!0}return i},n.list={is:function(t){return t instanceof Array}},n.list.slit=Array.prototype.slice,n.list.sort=function(t){return function(n,o){return n&&o?(n=n[t],o=o[t],o>n?-1:n>o?1:0):0}},n.list.map=function(t,n,o){return a(t,n,o)},n.list.index=1,n.obj={is:function(t){return t?t instanceof Object&&t.constructor===Object||"Object"===Object.prototype.toString.call(t).match(/^\[object (\w+)\]$/)[1]:!1}},n.obj.put=function(t,n,o){return(t||{})[n]=o,t},n.obj.has=function(t,n){return t&&Object.prototype.hasOwnProperty.call(t,n)},n.obj.del=function(t,n){return t?(t[n]=null,delete t[n],t):void 0},n.obj.as=function(t,n,o,e){return t[n]=t[n]||(e===o?{}:o)},n.obj.ify=function(t){if(r(t))return t;try{t=JSON.parse(t)}catch(n){t={}}return t},function(){function t(t,n){u(this,n)&&o!==this[n]||(this[n]=t)}var o;n.obj.to=function(n,o){return o=o||{},a(n,t,o),o}}(),n.obj.copy=function(t){return t?JSON.parse(JSON.stringify(t)):t},function(){function t(t,n){var o=this.n;if(!o||!(n===o||r(o)&&u(o,n)))return n?!0:void 0}n.obj.empty=function(n,o){return n&&a(n,t,{n:o})?!1:!0}}(),function(){function t(n,o){return 2===arguments.length?(t.r=t.r||{},void(t.r[n]=o)):(t.r=t.r||[],void t.r.push(n))}var i=Object.keys;n.obj.map=function(a,s,f){var c,l,p,d,h,g=0,v=o(s);if(t.r=null,i&&r(a)&&(d=Object.keys(a),h=!0),e(a)||d)for(l=(d||a).length;l>g;g++){var b=g+n.list.index;if(v){if(p=h?s.call(f||this,a[d[g]],d[g],t):s.call(f||this,a[g],b,t),p!==c)return p}else if(s===a[h?d[g]:g])return d?d[g]:b}else for(g in a)if(v){if(u(a,g)&&(p=f?s.call(f,a[g],g,t):s(a[g],g,t),p!==c))return p}else if(s===a[g])return g;return v?t.r:n.list.index?0:-1}}(),n.time={},n.time.is=function(t){return t?t instanceof Date:+(new Date).getTime()};var o=n.fn.is,e=n.list.is,i=n.obj,r=i.is,u=i.has,a=i.map;t.exports=n})(t,"./type"),t(function(t){t.exports=function n(t,o,e){if(!t)return{to:n};var t=(this.tag||(this.tag={}))[t]||(this.tag[t]={tag:t,to:n._={next:function(){}}});if(o instanceof Function){var i={off:n.off||(n.off=function(){return this.next===n._.next?!0:(this===this.the.last&&(this.the.last=this.back),this.to.back=this.back,this.next=n._.next,void(this.back.to=this.to))}),to:n._,next:o,the:t,on:this,as:e};return(i.back=t.last||t).to=i,t.last=i}return(t=t.to).next(o),t}})(t,"./onto"),t(function(n){function o(t,n){n=n||{},n.id=n.id||"#",n.rid=n.rid||"@",n.uuid=n.uuid||function(){return+new Date+Math.random()};var o=e;return o.stun=function(t){var n=function(t){return n.off&&n===this.stun?(this.stun=null,!1):o.stun.skip?!1:(t&&(t.cb=t.fn,t.off(),e.queue.push(t)),!0)},e=n.res=function(t,r){if(!n.off){if(t instanceof Function)return o.stun.skip=!0,t.call(r),void(o.stun.skip=!1);n.off=!0;var u,a=0,s=e.queue,f=s.length;for(e.queue=[],n===i.stun&&(i.stun=null),a;f>a;a++)u=s[a],u.fn=u.cb,u.cb=null,o.stun.skip=!0,u.ctx.on(u.tag,u.fn,u),o.stun.skip=!1}},i=t._;return e.back=i.stun||(i.back||{_:{}})._.stun,e.back&&(e.back.next=n),e.queue=[],i.stun=n,e},o}var e=t("./onto");n.exports=o})(t,"./onify"),t(function(n){function o(t,n,e){o.time=e||Gun.time.is,o.waiting.push({when:t,event:n||function(){}}),o.soonest<t||o.set(t)}var e=t("./type");o.waiting=[],o.soonest=1/0,o.sort=e.list.sort("when"),o.set=function(t){if(!(1/0<=(o.soonest=t))){var n=o.time();t=n>=t?0:t-n,clearTimeout(o.id),o.id=setTimeout(o.check,t)}},o.each=function(t,n,o){var e=this;t&&(t.when<=e.now?t.event instanceof Function&&setTimeout(function(){t.event()},0):(e.soonest=e.soonest<t.when?e.soonest:t.when,o(t)))},o.check=function(){var t={now:o.time(),soonest:1/0};o.waiting.sort(o.sort),o.waiting=e.list.map(o.waiting,o.each,t)||[],o.set(t.soonest)},n.exports=o})(t,"./schedule"),t(function(t){function n(t,n,e,i,r){if(n>t)return{defer:!0};if(e>n)return{historical:!0};if(n>e)return{converge:!0,incoming:!0};if(n===e){if(o(i)===o(r))return{state:!0};if(o(i)<o(r))return{converge:!0,current:!0};if(o(r)<o(i))return{converge:!0,incoming:!0}}return{err:"you have not properly handled recursion through your data or filtered it as JSON"}}if("undefined"==typeof JSON)throw new Error("JSON is not included in this browser. Please load it first: ajax.cdnjs.com/ajax/libs/json2/20110223/json2.js");var o=JSON.stringify;t.exports=n})(t,"./HAM"),t(function(n){var o=t("./type"),e={};e.is=function(t){return t===i?!1:null===t?!0:t===1/0?!1:s(t)||u(t)||a(t)?!0:e.rel.is(t)||!1},e.rel={_:"#"},function(){function t(t,n){var o=this;return o.id?o.id=!1:n==r&&s(t)?void(o.id=t):o.id=!1}e.rel.is=function(n){if(n&&n[r]&&!n._&&c(n)){var o={};if(p(n,t,o),o.id)return o.id}return!1}}(),e.rel.ify=function(t){return l({},r,t)};var i,r=e.rel._,u=o.bi.is,a=o.num.is,s=o.text.is,f=o.obj,c=f.is,l=f.put,p=f.map;n.exports=e})(t,"./val"),t(function(n){var o=t("./type"),e=t("./val"),i={_:"_"};i.soul=function(t,n){return t&&t._&&t._[n||p]},i.soul.ify=function(t,n){return n="string"==typeof n?{soul:n}:n||{},t=t||{},t._=t._||{},t._[p]=n.soul||t._[p]||l(),t},function(){function t(t,n){return n!==i._?e.is(t)?void(this.cb&&this.cb.call(this.as,t,n,this.n,this.s)):!0:void 0}i.is=function(n,o,e){var r;return a(n)&&(r=i.soul(n))?!f(n,t,{as:e,cb:o,s:r,n:n}):!1}}(),function(){function t(t,n){var o,i,r=this.o;return r.map?(o=r.map.call(this.as,t,""+n,r.node),void(i===o?s(r.node,n):r.node&&(r.node[n]=o))):void(e.is(t)&&(r.node[n]=t))}i.ify=function(n,o,e){return o?"string"==typeof o?o={soul:o}:o instanceof Function&&(o={map:o}):o={},o.map&&(o.node=o.map.call(e,n,r,o.node||{})),(o.node=i.soul.ify(o.node||{},o))&&f(n,t,{o:o,as:e}),o.node}}();var r,u=o.obj,a=u.is,s=u.del,f=u.map,c=o.text,l=c.random,p=e.rel._;n.exports=i})(t,"./node"),t(function(n){function o(){var t=r();return t>u?(a=0,u=t):u=t+(a+=1)/s}var e=t("./type"),i=t("./node"),r=e.time.is,u=-(1/0),a=0,s=1e3;o._=">",o.ify=function(t,n,e,r,u){if(!t||!t[m]){if(!u)return;t=i.soul.ify(t,u)}var a=l(t[m],o._);return f!==n&&n!==m&&(v(e)&&(a[n]=e),f!==r&&(t[n]=r)),t},o.is=function(t,n,e){var i=n&&t&&t[m]&&t[m][o._]||e;if(i)return v(i[n])?i[n]:-(1/0)},function(){function t(t,n){m!==n&&o.ify(this.o,n,this.s)}o.map=function(n,e,i){var r,u=d(u=n||e)?u:null;return n=y(n=n||e)?n:null,u&&!n?(e=v(e)?e:o(),u[m]=u[m]||{},h(u,t,{o:u,s:e}),u):(i=i||d(e)?e:r,e=v(e)?e:o(),function(o,u,a,s){return n?(n.call(i||this||{},o,u,a,s),void(p(a,u)&&r===a[u]||t.call({o:a,s:e},o,u))):(t.call({o:a,s:e},o,u),o)})}}();var f,c=e.obj,l=c.as,p=c.has,d=c.is,h=c.map,g=e.num,v=g.is,b=e.fn,y=b.is,m=i._;n.exports=o})(t,"./state"),t(function(n){var o=t("./type"),e=t("./val"),i=t("./node"),r={};!function(){function t(t,o){return t&&o===i.soul(t)&&i.is(t,this.fn)?void(this.cb&&(n.n=t,n.as=this.as,this.cb.call(n.as,t,o,n))):!0}function n(t){t&&i.is(n.n,t,n.as)}r.is=function(n,o,e,i){return n&&s(n)&&!l(n)?!d(n,t,{cb:o,fn:e,as:i}):!1}}(),function(){function t(t,r){var u;return(u=l(t,r))?u:(r.env=t,r.soul=o,i.ify(r.obj,n,r)&&(t.graph[e.rel.is(r.rel)]=r.node),r)}function n(n,o,r){var s,l,p=this,d=p.env;if(i._===o&&c(n,e.rel._))return r._;if(s=a(n,o,r,p,d)){if(o||(p.node=p.node||r||{},c(n,i._)&&(p.node._=h(n._)),p.node=i.soul.ify(p.node,e.rel.is(p.rel)),p.rel=p.rel||e.rel.ify(i.soul(p.node))),(l=d.map)&&(l.call(d.as||{},n,o,r,p),c(r,o))){if(n=r[o],u===n)return void f(r,o);if(!(s=a(n,o,r,p,d)))return}if(!o)return p.node;if(!0===s)return n;if(l=t(d,{obj:n,path:p.path.concat(o)}),l.node)return l.rel}}function o(t){var n=this,o=e.rel.is(n.rel),r=n.env.graph;n.rel=n.rel||e.rel.ify(t),n.rel[e.rel._]=t,n.node&&n.node[i._]&&(n.node[i._][e.rel._]=t),c(r,o)&&(r[t]=r[o],f(r,o))}function a(t,n,o,i,r){var u;return e.is(t)?!0:s(t)?1:(u=r.invalid)?(t=u.call(r.as||{},t,n,o),a(t,n,o,i,r)):void(r.err="Invalid value at '"+i.path.concat(n).join(".")+"'!")}function l(t,n){for(var o,e=t.seen,i=e.length;i--;)if(o=e[i],n.obj===o.obj)return o;e.push(n)}r.ify=function(n,o,i){var r={path:[],obj:n};return o?"string"==typeof o?o={soul:o}:o instanceof Function&&(o.map=o):o={},o.soul&&(r.rel=e.rel.ify(o.soul)),o.graph=o.graph||{},o.seen=o.seen||[],o.as=o.as||i,t(o,r),o.root=r.node,o.graph}}(),r.node=function(t){var n=i.soul(t);if(n)return p({},n,t)},function(){function t(t,n){var o,u;if(i._===n){if(l(t,e.rel._))return;return void(this.obj[n]=h(t))}return(o=e.rel.is(t))?(u=this.opt.seen[o])?void(this.obj[n]=u):void(this.obj[n]=this.opt.seen[o]=r.to(this.graph,o,this.opt)):void(this.obj[n]=t)}r.to=function(n,o,e){if(n){var i={};return e=e||{seen:{}},d(n[o],t,{obj:i,graph:n,opt:e}),i}}}();var u,a=(o.fn.is,o.obj),s=a.is,f=a.del,c=a.has,l=a.empty,p=a.put,d=a.map,h=a.copy;n.exports=r})(t,"./graph"),t(function(n){function o(){this.cache={}}var e=t("./type");o.prototype.track=function(t){return this.cache[t]=e.time.is(),this.to||this.gc(),t},o.prototype.check=function(t){return e.obj.has(this.cache,t)?this.track(t):!1},o.prototype.gc=function(){var t=this,n=e.time.is(),o=n,i=3e5;e.obj.map(t.cache,function(r,u){o=Math.min(n,r),i>n-r||e.obj.del(t.cache,u)});var r=e.obj.empty(t.cache);if(r)return void(t.to=null);var u=n-o,a=i-u;t.to=setTimeout(function(){t.gc()},a)},n.exports=o})(t,"./dup"),t(function(n){function i(t){return t instanceof i?(this._={gun:this}).gun:this instanceof i?i.create(this._={gun:this,opt:t}):new i(t)}i.is=function(t){return t instanceof i},i.version=.6,i.chain=i.prototype,i.chain.toJSON=function(){};var r=t("./type");r.obj.to(r,i),i.HAM=t("./HAM"),i.val=t("./val"),i.node=t("./node"),i.state=t("./state"),i.graph=t("./graph"),i.dup=t("./dup"),i.on=t("./onify")(),i._={node:i.node._,soul:i.val.rel._,state:i.state._,field:".",value:"="},function(){function t(t){var o=this.as,e=o.gun;t.get&&n(t,o)||(o.on("in",l(t,{gun:o.gun})),t["#"]&&o.dup.track(t["#"]),t.gun||(t=l(t,{gun:e})),i.on("out",t))}function n(t,n){var o,e=t.get[d],r=n.graph[e],u=t.get[h],a=n.next||(n.next={}),s=(a[e]||(a[e]=n.gun.get(e)))._;if(r){if(u){if(!c(r,u))return;o=i.obj.put(i.node.soul.ify({},e),u,r[u]),r=i.state.ify(o,u,i.state.is(r,u))}return s.on("in",{put:r,get:s.soul,gun:s.gun}),0<s.ack?!0:void 0}}function o(t){var n=this,o=n.as;if(t.gun||(t.gun=o.gun),!t["#"]&&t["@"]){if(t["#"]=i.text.random(),i.on.ack(t["@"],t))return;return o.dup.track(t["#"]),void o.on("out",t)}t["#"]&&o.dup.check(t["#"])||(o.dup.track(t["#"]),i.on.ack(t["@"],t)||(t.put&&(i.HAM.synth(t,n,o.gun),i.on("put",t)),t.get&&i.on("get",t),i.on("out",t)))}i.create=function(n){n.on=n.on||i.on,n.root=n.root||n.gun,n.graph=n.graph||{},n.dup=n.dup||new i.dup;var e=n.gun.opt(n.opt);return n.once||(n.on("in",o,n),n.on("out",t,n)),n.once=1,e}}(),function(){var t=i.on.ask=function(n,o){var e=i.text.random();return n&&t.on(e,n,o),e};t.on=i.on,i.on.ack=function(n,o){if(n&&o&&t.on){var e=n["#"]||n;if(t.tag&&t.tag[e])return t.on(e,o),!0}}}(),function(){i.chain.opt=function(t){t=t||{};var n=this,o=n._,e=t.peers||t;return f(t)||(t={}),f(o.opt)||(o.opt=t),u(e)&&(e=[e]),a(e)&&(e=p(e,function(t,n,o){o(t,{url:t})}),f(o.opt.peers)||(o.opt.peers={}),o.opt.peers=l(e,o.opt.peers)),o.opt.peers=o.opt.peers||{},l(t,o.opt),i.on("opt",o),n}}();var u=i.text.is,a=i.list.is,s=i.obj,f=s.is,c=s.has,l=s.to,p=s.map,d=i._.soul,h=i._.field;o.debug=function(t,n){return o.debug.i&&t===o.debug.i&&o.debug.i++&&(o.log.apply(o,arguments)||n)},i.log=function(){return!i.log.off&&o.log.apply(o,arguments),[].slice.call(arguments).join(" ")},i.log.once=function(t,n,o){return(o=i.log.once)[t]=o[t]||0,o[t]++||i.log(n)},i.log.once("welcome","Hello wonderful person! :) Thanks for using GUN, feel free to ask for help on https://gitter.im/amark/gun and ask StackOverflow questions tagged with 'gun'!"),"undefined"!=typeof window&&(window.Gun=i),"undefined"!=typeof e&&(e.exports=i),n.exports=i})(t,"./root"),t(function(){var n=t("./root");n.chain.back=function(t,n){var i;if(-1===t||1/0===t)return this._.root;if(1===t)return this._.back||this;var r=this,u=r._;if("string"==typeof t&&(t=t.split(".")),t instanceof Array){var a=0,s=t.length,i=u;for(a;s>a;a++)i=(i||e)[t[a]];if(o!==i)return n?r:i;if(i=u.back)return i.back(t,n)}else if(t instanceof Function){for(var f,i={back:r};(i=i.back)&&(i=i._)&&!(f=t(i,n)););return f}};var o,e={}})(t,"./back"),t(function(){function o(t){{var n,o=this.as,e=o.gun;e.back(-1)}if(t.gun||(t.gun=e),(n=t.get)&&!n[m])if(h(n,_)){n=n[_];var i=n?e.get(n)._:o;if(h(i,"put"))return void i.on("in",i);if(h(o,"put")){var r,u=o.put;if((r=c.node.soul(u))&&(u=c.val.rel.ify(r)),r=c.val.rel.is(u)){if(!t.gun._)return;return void t.gun._.on("out",{get:{"#":r,".":n},"#":c.on.ask(c.HAM.synth,t.gun),gun:t.gun})}if(l===u||c.val.is(u)){if(!t.gun._)return;return void t.gun._.on("in",{get:n,gun:t.gun})}}else o.map&&y(o.map,function(t){t.at.on("in",t.at)});if(o.soul){if(!t.gun._)return;return void t.gun._.on("out",{get:{"#":o.soul,".":n},"#":c.on.ask(c.HAM.synth,t.gun),gun:t.gun})}if(o.get){if(!o.back._)return;return void o.back._.on("out",{get:g({},_,o.get),gun:e})}t=b(t,{get:{}})}else{if(h(o,"put")?o.on("in",o):o.map&&y(o.map,function(t){t.at.on("in",t.at)}),o.ack&&!h(o,"put"))return;if(o.ack=-1,o.soul)return void o.on("out",{get:{"#":o.soul},"#":c.on.ask(c.HAM.synth,o.gun)});if(o.get){if(!o.back._)return;return void o.back._.on("out",{get:g({},_,o.get),gun:o.gun})}}o.back._.on("out",t)}function e(t){t=t._||t;{var n,o=this,e=this.as,u=t.gun,f=u._,d=t.put;e.back._||p}if(0>e.ack&&t.via&&!c.val.rel.is(d)&&(e.ack=1),e.get&&t.get!==e.get&&(t=b(t,{get:e.get})),e.field&&f!==e&&(t=b(t,{gun:e.gun}),f.ack&&(e.ack=e.ack||f.ack)),l===d){if(o.to.next(t),e.soul)return;return r(e,t,o),e.field&&s(e,t),v(f.echo,e.id),void v(e.map,f.id)}return e.soul?(o.to.next(t),r(e,t,o),void y(d,a,{at:t,cat:e})):(n=c.val.rel.is(d))?(i(e,t,f,n),o.to.next(t),void r(e,t,o)):c.val.is(d)?(e.field||e.soul?s(e,t):(f.field||f.soul)&&((f.echo||(f.echo={}))[e.id]=e,(e.map||(e.map={}))[f.id]=e.map[f.id]||{at:f}),o.to.next(t),void r(e,t,o)):(e.field&&f!==e&&h(f,"put")&&(e.put=f.put),(n=c.node.soul(d))&&f.field&&(f.put=e.root.get(n)._.put),o.to.next(t),r(e,t,o),i(e,t,f,n),void y(d,a,{at:t,cat:e}))}function i(t,n,o,e){if(e&&k!==t.get){var r=t.root.get(e)._;t.field?o=r:o.field&&i(o,n,o,e),o!==t&&((o.echo||(o.echo={}))[t.id]=t,t.field&&!(t.map||p)[o.id]&&s(t,n),r=(t.map||(t.map={}))[o.id]=t.map[o.id]||{at:o},e!==r.rel&&f(t,r.rel=e))}}function r(t,n,o){t.echo&&(t.field&&(n=b(n,{event:o})),y(t.echo,u,n))}function u(t){t.on("in",this)}function a(t,n){var o,e,i,r=this.cat,u=r.next||p,a=this.at;(k!==n||u[n])&&(o=u[n])&&(i=o._,i.field?(t&&t[m]&&c.val.rel.is(t)===c.node.soul(i.put)||(i.put=t),e=o):e=a.gun.get(n),i.on("in",{put:t,get:n,gun:e,via:a}))}function s(t){if(t.field||t.soul){var n=t.map;t.map=null,null!==n&&(l!==n||t.put===l)&&(y(n,function(n){(n=n.at)&&v(n.echo,t.id)}),y(t.next,function(t,n){var o=t._;o.put=l,o.ack&&(o.ack=-1),o.on("in",{get:n,gun:t,put:l})}))}}function f(t,n){var o=t.root.get(n)._;return t.ack?(o.ack=o.ack||-1,void o.on("out",{get:{"#":n},"#":c.on.ask(c.HAM.synth,o.gun),gun:o.gun})):void y(t.next,function(t,e){t._.on("out",{get:{"#":n,".":e},"#":c.on.ask(c.HAM.synth,o.gun),gun:t})})}var c=t("./root");c.chain.chain=function(){var t=this._,i=new this.constructor(this),r=i._;return r.root=n=t.root,r.id=++n._.once,r.back=this,r.on=c.on,c.on("chain",r),r.on("in",e,r),r.on("out",o,r),i},c.chain.chain.input=e;var l,p={},d=c.obj,h=d.has,g=d.put,v=d.del,b=d.to,y=d.map,m=c._.soul,_=c._.field,k=c.node._})(t,"./chain"),t(function(){function n(t,n){var o=n._,e=o.next,i=n.chain(),r=i._;return e||(e=o.next={}),e[r.get=t]=i,o.root===n?r.soul=t:(o.soul||o.field)&&(r.field=t),i}function o(t){var n,o=this,e=o.as,r=t.gun,a=r._,f=t.put;i===f&&(f=a.put),(n=f)&&n[s._]&&(n=s.is(n))&&(n=a.root.get(n)._,i!==n.put&&(t=u(t,{put:n.put}))),e.use(t,t.event||o),o.to.next(t)}var e=t("./root");e.chain.get=function(t,i,r){if("string"!=typeof t){if(t instanceof Function){var u=this,s=u._;return r=i||{},r.use=t,r.out=r.out||{},r.out.get=r.out.get||{},s.root._.now=!0,s.on("in",o,r),s.on("out",r.out),s.root._.now=!1,u}return a(t)?this.get(""+t,i,r):((r=this.chain())._.err={err:e.log("Invalid get request!",t)},i&&i.call(r,r._.err),r)}var u,c,l=l||this,p=l._,d=p.next||f;return(u=d[t])||(u=n(t,l)),(c=p.stun)&&(u._.stun=u._.stun||c),i&&i instanceof Function&&u.get(i,r),u};var i,r=e.obj,u=(r.has,e.obj.to),a=e.num.is,s=e.val.rel,f=(e.node._,{})})(t,"./get"),t(function(){function n(t){t.batch=e;var n=t.opt||{},o=t.env=s.state.map(r,n.state);return o.soul=t.soul,t.graph=s.graph.ify(t.data,o,t),o.err?((t.ack||g).call(n.as||t.gun,t.out={err:s.log(o.err)}),void(t.res&&t.res())):void t.batch()}function e(){var t=this;t.graph&&!d(t.stun,i)&&((t.res||v)(function(){t.ref._.on("out",{gun:t.ref,put:t.out=t.env.graph,opt:t.opt,"#":s.on.ask(function(n){this.off(),t.ack&&t.ack(n,this)},t.opt)})},t),t.res&&t.res())}function i(t){return t?!0:void 0}function r(t,n,o,e){var i=this;!n&&e.path.length&&(i.res||v)(function(){var t=e.path,n=i.ref,o=(i.opt,0),r=t.length;for(o;r>o;o++)n=n.get(t[o]);return i.not||s.node.soul(e.obj)?void e.soul(s.node.soul(e.obj)||((i.opt||{}).uuid||i.gun.back("opt.uuid")||s.text.random)()):((i.stun=i.stun||{})[t]=!0,void n.get("_").get(u,{as:{at:e,as:i}}))},{as:i,at:e})}function u(t,n){var o=this.as,e=o.at;o=o.as,t.gun&&t.gun._.back&&(n.off(),t=t.gun._.back._,e.soul(s.node.soul(e.obj)||s.node.soul(t.put)||s.val.rel.is(t.put)||((o.opt||{}).uuid||o.gun.back("opt.uuid")||s.text.random)()),o.stun[e.path]=!1,o.batch())}function a(t,n){var e=this.as;if(t.gun&&t.gun._){if(t.err)return void o.log("Please report this as an issue! Put.any.err");var i,r=t.gun._.back._,u=r.put,a=e.opt||{};if(n.off(),e.ref!==e.gun){if(i=e.gun._.get,!i)return void o.log("Please report this as an issue! Put.no.get");e.data=p({},i,e.data),i=null}if(f===u){if(!r.get)return;r.soul||(i=r.gun.back(function(t){return t.soul?t.soul:void(e.data=p({},t.get,e.data))})),i=i||r.get,r=r.root.get(i)._,e.not=e.soul=i,u=e.data}e.not||(e.soul=s.node.soul(u))||(e.soul=e.path&&l(e.data)?(a.uuid||e.gun.back("opt.uuid")||s.text.random)():t.soul),e.ref.put(e.data,e.soul,e)}}var s=t("./root");s.chain.put=function(t,o,e){var i,r=this,u=r._.root;return e=e||{},e.data=t,e.gun=e.gun||r,"string"==typeof o?e.soul=o:e.ack=o,e.soul||u===r?l(e.data)?(e.gun=r=u.get(e.soul=e.soul||(e.not=s.node.soul(e.data)||(u._.opt.uuid||s.text.random)())),e.ref=e.gun,n(e),r):((opt.any||g).call(opt.as||r,e.out={err:s.log("No field to put",typeof e.data,'"'+e.data+'" on!')}),e.res&&e.res(),r):s.is(t)?(t.get(function(t,n){n.off();var i=s.node.soul(t.put);return i?void r.put(s.val.rel.ify(i),o,e):void s.log("Can only save a node, not a property.")}),r):(e.ref=e.ref||u===(i=r._.back)?r:i,e.ref.get("_").get(a,{as:e}),e.out||(e.res=e.res||s.on.stun(e.ref),e.gun._.stun=e.ref._.stun),r)};var f,c=s.obj,l=c.is,p=c.put,d=c.map,h={},g=function(){},v=function(t,n){t.call(n||h)}})(t,"./put"),t(function(n){var e=t("./root");n.exports=e,function(){function t(t,n){if(e._.node!==n){var r=this.node,u=this.vertex,a=this.union,s=this.machine,f=h(r,n),c=h(u,n);if(i===f||i===c)return!0;var l=t,p=u[n];if(!b(l)&&i!==l)return!0;if(!b(p)&&i!==p)return!0;var d=e.HAM(s,f,c,l,p);if(d.err)return void o.log(".!HYPOTHETICAL AMNESIA MACHINE ERR!.",d.err);if(!(d.state||d.historical||d.current))return d.incoming?(a[n]=t,void g(a,n,f)):d.defer?(a[n]=t,void g(a,n,f)):void 0}}function n(t,n){var o=this;if(e._.node!==n&&b(t)){var i=o.node,r=o.vertex,u=h(i,n,!0),a=h(r,n,!0),s=o.delta,f=e.HAM(o.machine,u,a,t,r[n]);f.incoming&&(s[n]=t,g(s,n,u))}}e.HAM.union=function(n,o,i){return o&&o._&&(n=n||e.node.soul.ify({_:{">":{}}},e.node.soul(o)),n&&n._&&(i=a(i)?{machine:i}:{machine:e.state()},i.union=n||e.obj.copy(n),i.vertex=n,i.node=o,!l(o,t,i)))?i.union:void 0},e.HAM.delta=function(t,o,i){return i=a(i)?{machine:i}:{machine:e.state()},t?(i.soul=e.node.soul(i.vertex=t),i.soul?(i.delta=e.node.soul.ify({},i.soul),l(i.node=o,n,i),i.delta):void 0):e.obj.copy(o)},e.HAM.synth=function(t,n,o){var r=this.as||o,u=r._,a=u.root._,s={};if(!t.put){if(u.put!==i)return;return void u.on("in",{get:u.get,put:u.put=i,gun:r,via:t})}l(t.put,function(t,n){var o=this.graph;s[n]=e.HAM.delta(o[n],t,{graph:o}),o[n]=e.HAM.union(o[n],t)||o[n]},a),l(s,function(o,r){var a=this,s=a.next||(a.next={}),l=s[r]||(s[r]=a.gun.get(r)),p=l._;return p.put=a.graph[r],u.field&&!f(o,u.field)?((t=c(t,{})).put=i,void e.HAM.synth(t,n,u.gun)):void p.on("in",{put:o,get:r,gun:l,via:t})},a)}}();{var i,r=e,u=r.num,a=u.is,s=r.obj,f=s.has,c=(s.put,s.to),l=s.map,p=e.node,d=(p.soul,p.is,p.ify,e.state),h=d.is,g=d.ify,v=e.val,b=v.is;v.rel.is}})(t,"./index"),t(function(n){var o=t("./root");t("./index"),t("./opt"),t("./chain"),t("./back"),t("./put"),t("./get"),n.exports=o})(t,"./core"),t(function(){{var n=t("./core"),e=n.obj,i=(e.is,e.put),r=(e.map,e.empty,n.num);r.is,n.val.rel._}!function(){function t(t,o){var u=this;return o.off(),u.soul=n.node.soul(t.put),u.soul&&u.key!==u.soul?(u.data=i({},r._,n.node.ify(i({},u.soul,n.val.rel.ify(u.soul)),"#"+u.key+"#")),(u.res||e)(function(){u.ref.put(u.data,u.any,{soul:u.key,key:u.key})},u),void(u.res&&u.res())):u.data={}}function e(t,n){t.call(n||{})}function r(t){if(t&&"#"===t[0]&&"#"===t[t.length-1]){var n=t.slice(1,-1);if(n)return n}}function u(t){var o=this;if(!t.put)return void(t.get&&a.call(t.gun?t.gun._:o,t));if(!t.opt||!t.opt.key){var e=t.put,i=o.gun.back(-1)._.graph;n.graph.is(e,function(t,o){n.node.is(i["#"+o+"#"],function r(o,u){return u===n.val.rel.is(o)?(o=i["#"+u+"#"])?void n.node.is(o,r):void n.node.soul.ify(o=e[u]=n.obj.copy(t),u):void 0})&&n.obj.del(e,o)})}}function a(t){function o(u,a){var s=(u.put,t.get);if(!i.pseudo||u.via)return n.on.ack(e,u);if(u.put){if(!s["."])return a.off(),n.on.ack(e,u);if(c(u.put[s["#"]],s["."]))return a.off(),n.on.ack(e,u)}n.obj.map(i.seen,function(i,a){return r[a]?n.on.ack(e,u):(r[a]=!0,void i.on("out",{gun:i,get:a={"#":a,".":t.get["."]},"#":n.on.ask(o)}))})}var e,i=this;if(n.obj.is(e=t.get)&&n.obj.has(e,"#")){if((e=t.get)&&null===e["."])return void(e["."]="##");(e=t.get)&&n.obj.has(e,".")&&(e["#"]&&(i=i.root.gun.get(e["#"])._),e=t["#"],t["#"]=n.on.ask(o));var r={}}}function s(t,o){function e(t){n.node.is(t,i)}function i(t,o){o===n.val.rel.is(t)&&(p[o]||(p[o]=l.get(o).on(u,!0)))}function u(t){t&&(a.pseudo=n.HAM.union(a.pseudo,t)||a.pseudo,a.change=a.changed=t,a.put=a.pseudo,c({gun:a.gun,put:a.pseudo,get:f}))}var a=this;if(a.pseudo){if(a.pseudo===t.put)return;return o.stun(),a.change=a.changed||a.pseudo,void a.on("in",n.obj.to(t,{put:a.put=a.pseudo}))}if(t.put){var s=n.val.rel.is(t.put[r._]);if(s){var f=n.node.soul(t.put),c=o.stun(c),l=a.gun.back(-1),p=a.seen={};a.pseudo=a.put=n.state.ify(n.node.ify({},f)),l.get(s).on(e,{change:!0})}}}n.chain.key=function(e,i,r){if(!e)return i&&i.call(this,{err:n.log("No key!")}),this;var u=this;return"string"==typeof r?(o.log("Please report this as an issue! key.opt.string"),u):u===u._.root?(i&&i({err:n.log("Can't do that on root instance.")}),u):(r=r||{},r.key=e,r.any=i||function(){},r.ref=u.back(-1).get(r.key),r.gun=r.gun||u,u.on(t,{as:r}),r.data||(r.res=n.on.stun(r.ref)),u)},r._="##",n.on("next",function(t){var n=t.gun;n.back(-1)===t.back&&(n.on("in",s,n._),n.on("out",u,n._))});var f=n.obj,c=f.has}()})(t,"./key"),t(function(){var n=t("./core");n.chain.path=function(t,o,e){var i,r=this,u=r;if(e=e||{},e.path=!0,u===u._.root)return o&&o({err:n.log("Can't do that on root instance.")}),u;if("string"==typeof t){if(i=t.split(e.split||"."),1===i.length)return u=r.get(t,o,e),u._.opt=e,u;t=i}if(t instanceof Array){if(t.length>1){u=r;var a=0,s=t.length;for(a;s>a;a++)u=u.get(t[a],a+1===s?o:null,e)}else u=r.get(t[0],o,e);return u._.opt=e,u}return t||0==t?(u=r.get(""+t,o,e),u._.opt=e,u):r}})(t,"./path"),t(function(){function n(t,n){var o,r=this,u=t.gun,s=u._,f=s.put||t.put,o=r.last,c=s.id+t.get;if(i!==f){if(f&&f[a._]&&(o=a.is(f))){if(o=s.root.get(o)._,i===o.put)return;f=o.put}r.change&&(f=t.put),(o.put!==f||o.get!==c||e.node.soul(f))&&(o.put=f,o.get=c,s.last=f,r.as?r.ok.call(r.as,t,n):r.ok.call(u,f,t.get,t,n))}}function o(t,n,e){var r,u=this.as,s=u.cat,f=t.gun,c=f._,l=c.put||t.put;if(i!==l){if(l&&l[a._]&&(r=a.is(l))){if(r=s.root.get(r)._,i===r.put)return;l=r.put}if(n.wait&&clearTimeout(n.wait),!(e||0<c.ack&&(!0!==u.async||0===u.wait)))return void(n.wait=setTimeout(function(){o.call({as:u},t,n,n.wait||1)},u.wait||99));if(s.field||s.soul){if(n.off())return}else{if((u.seen=u.seen||{})[c.id])return;u.seen[c.id]=!0}u.ok.call(t.gun||u.gun,l,t.get)}}var e=t("./core");e.chain.on=function(t,o,e,i){var r,u,a=this,s=a._;if("string"==typeof t)return o?(r=s.on(t,o,e||s,i),e&&e.gun&&(e.subs||(e.subs=[])).push(r),u=function(){r&&r.off&&r.off(),u.off()},u.off=a.off.bind(a)||noop,a.off=u,a):s.on(t);var f=o;return f=!0===f?{change:!0}:f||{},f.ok=t,f.last={},a.get(n,f),a},e.chain.val=function(t,n){var r=this,u=r._,a=u.put;if(0<u.ack&&i!==a&&t)return t.call(r,a,u.get),r;if(!t){e.log.once("valonce","Chainable val is experimental, its behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.");var s=r.chain();return s._.val=r.val(function(){s._.on("in",r._)}),s}return(n=n||{}).ok=t,n.cat=u,r.get(o,{as:n}),n.async=u.stun?1:!0,r},e.chain.off=function(){var t,n=this,o=n._,e=o.back||{},i=e._;return i?((t=i.next)&&(t[o.get]?u(t,o.get):obj_map(t,function(o,e){n===o&&u(t,e)})),(t=n.back(-1))===e&&u(t.graph,o.get),o.ons&&(t=o.ons["@$"])&&obj_map(t.s,function(t){t.off()}),n):void 0};var i,r=e.obj,u=(r.has,r.del),a=(r.to,e.val.rel)})(t,"./on"),t(function(){function n(t,n){n.off(),t.err||e!==t.put||this.not&&this.not.call(t.gun,t.get,function(){o.log("Please report this bug on https://gitter.im/amark/gun and in the issues."),need.to.implement})}var e,i=t("./core");i.chain.not=function(t){return this.get(n,{not:t})}})(t,"./not"),t(function(){function n(t){t.put&&!e.val.is(t.put)&&(this.as.val&&this.off(),r(t.put,o,{cat:this.as,gun:t.gun}),this.to.next(t))}function o(t,n){if(a!==n){var o=this.cat,e=this.gun.get(n),i=e._;(i.echo||(i.echo={}))[o.id]=o}}var e=t("./core");e.chain.map=function(t){var o,r=this,a=r._;return t?(e.log.once("mapfn","Map functions are experimental, their behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it."),o=r.chain(),r.map().on(function(n,r,a,s){var f=(t||u).call(this,n,r,a,s);if(i!==f)return e.is(f)?void o._.on("in",f._):void o._.on("in",{get:r,put:f,gun:o})}),o):(o=a.fields)?o:(o=a.fields=r.chain(),o._.val=r.back("val"),r.on("in",n,o._),o)};var i,r=e.obj.map,u=function(){},a=e.node._})(t,"./map"),t(function(){var n=t("./core");n.chain.init=function(){return(this._.opt=this._.opt||{}).init=!0,this.back(-1).put(n.node.ify({},this._.get),null,this._.get)}})(t,"./init"),t(function(){var n=t("./core");n.chain.set=function(t,o,e){var i,r=this;return o=o||function(){},(i=n.node.soul(t))?r.set(r.back(-1).get(i),o,e):n.obj.is(t)&&!n.is(t)?r.set(r._.root.put(t),o,e):t.get("_").get(function(t,i){!t.gun||!t.gun._.back,i.off(),t=t.gun._.back._;var u={},a=t.put,s=n.node.soul(a);return s?void r.put(n.obj.put(u,s,n.val.rel.ify(s)),o,e):o.call(r,{err:n.log('Only a node can be linked! Not "'+a+'"!')})},{wait:0})}})(t,"./set"),t(function(){if("undefined"!=typeof Gun){var t,n=function(){};"undefined"!=typeof window&&(t=window);var o=t.localStorage||{setItem:n,removeItem:n,getItem:n};Gun.on("put",function(t){{var n,e;t.gun._.root}this.to.next(t),(e={}).prefix=(t.opt||e).prefix||t.gun.back("opt.prefix")||"gun/",Gun.graph.is(t.put,function(t,i,r){var u=Gun.obj.ify(o.getItem(e.prefix+i+"_")||{});r(function(r,a){u[a]=1;var s=Gun.state.is(t,a);try{o.setItem(e.prefix+i+a,JSON.stringify([r,s]))}catch(f){n=f||"localStorage failure"}});try{o.setItem(e.prefix+i+"_",JSON.stringify(u))}catch(a){n=a||"localStorage failure"}}),Gun.obj.empty(t.gun.back("opt.peers"))&&Gun.on.ack(t,{err:n,ok:0})}),Gun.on("get",function(t){this.to.next(t);var n,e,i,r,u=t.gun,a=t.get;if((i=t.opt||{}).prefix=i.prefix||t.gun.back("opt.prefix")||"gun/",a&&(n=a[Gun._.soul])){var s=a["."];s?(e=Gun.obj.ify(o.getItem(i.prefix+n+s)||null)||r)&&(e=Gun.state.ify(r,s,e[1],e[0],n)):Gun.obj.map(Gun.obj.ify(o.getItem(i.prefix+n+"_")),function(t,r){t=Gun.obj.ify(o.getItem(i.prefix+n+r)||{}),e=Gun.state.ify(e,r,t[1],t[0],n)}),u.back(-1).on("in",{"@":t["#"],put:Gun.graph.node(e)})}})}})(t,"./adapters/localStorage"),t(function(n){function o(t,n,e){return this instanceof o?(this.url=o.formatURL(t),this.socket=null,this.queue=[],this.sid=i.text.random(10),this.on=i.on,this.options=n||{},this.options.wsc=e,void this.resetBackoff()):new o(t,n,e)}function e(t,n){o.isSupported&&o.broadcast(t,n)}var i=t("./core");if("undefined"==typeof JSON)throw new Error("Gun depends on JSON. Please load it first:\najax.cdnjs.com/ajax/libs/json2/20110223/json2.js");o.prototype={constructor:o,drainQueue:function(){var t=this.queue,n=this;return this.queue=[],t.forEach(function(t){n.send(t)}),t.length},connect:function(){var t=this,n=new o.WebSocket(this.url,this.options.wsc.protocols,this.options.wsc);return this.socket=n,n.addEventListener("message",function(n){t.on("message",n)}),n.addEventListener("close",function(){t.scheduleReconnect()}),this.ready(function(){t.drainQueue()}),n},resetBackoff:function(){var t=this.options;return this.backoff={time:t.time||100,max:t.max||2e3,factor:t.factor||2},this.backoff},nextBackoff:function(){var t=this.backoff,n=t.time*t.factor,o=t.max;return n>o&&(n=o),t.time=n},scheduleReconnect:function(){var t=this,n=this.backoff.time;this.nextBackoff(),setTimeout(function(){t.connect(),t.ready(function(){t.resetBackoff()})},n)},isClosed:function(){var t=this.socket;if(!t)return!0;var n=t.readyState;return n===t.CLOSING||n===t.CLOSED?!0:!1},ready:function(t){var n=this.socket,o=n.readyState;return o===n.OPEN?void t():void(o===n.CONNECTING&&n.addEventListener("open",t))},send:function(t){if(this.isClosed())return this.queue.push(t),this.connect(),!1;var n=this.socket;return this.ready(function(){n.send(t)}),!0}},"undefined"!=typeof window&&(o.WebSocket=window.WebSocket||window.webkitWebSocket||window.mozWebSocket||null),o.isSupported=!!o.WebSocket,o.isSupported&&(o.formatURL=function(t){return t.replace(/^http/,"ws")},o.broadcast=function(t,n){var e=o.pool;n.headers=n.headers||{},i.obj.map(t,function(t,r){var u=o.formatURL(r),a=e[u],s={headers:i.obj.to(n.headers,{"gun-sid":a.sid}),body:n.body},f=i.text.ify(s);a.send(f)})},o.pool={},"undefined"!=typeof window&&window.addEventListener("unload",function(){i.obj.map(o.pool,function(t){t.isClosed()||t.socket.close();

})}),i.on("opt",function(t){this.to.next(t);var n=t.gun,e=n.back("opt.peers")||{};i.obj.map(e,function(t,e){var r=o.formatURL(e);if(!o.pool.hasOwnProperty(r)){var u=new o(r,t.backoff,n.back("opt.wsc")||{protocols:null});o.pool[r]=u,u.on("message",function(t){var o;try{o=i.obj.ify(t.data)}catch(e){return}o&&o.body&&n.on("in",o.body)})}})}),i.on("out",function(t){this.to.next(t);var n=t.gun,o=n.back("opt.peers")||{},r=n.back("opt.headers")||{};i.obj.empty(o)||e(o,{body:t,headers:r})}),e.jsonp=function(t,n){e.jsonp.ify(t,function(o){o&&e.jsonp.send(o,function(o,i){n(o,i),e.jsonp.poll(t,i)},t.jsonp)})},e.jsonp.send=function(t,n,o){var e=document.createElement("script");return e.src=t,e.onerror=function(){(window[e.id]||function(){})(null,{err:"JSONP failed!"})},window[e.id=o]=function(t,o){n(o,t),n.id=e.id,e.parentNode.removeChild(e),delete window[n.id]},e.async=!0,document.getElementsByTagName("head")[0].appendChild(e),e},e.jsonp.poll=function(t,n){if(t&&t.base&&n&&n.headers&&n.headers.poll){var o=e.jsonp.poll.s=e.jsonp.poll.s||{};o[t.base]=o[t.base]||setTimeout(function(){var n={base:t.base,headers:{pull:1}};e.each(t.headers,function(t,o){n.headers[o]=t}),e.jsonp(n,function(n,i){delete o[t.base];for(var r=i.body||[];r.length&&r.shift;){var u=i.body.shift();u&&u.body&&e.createServer.ing(u,function(){e(t.base,null,null,u)})}})},n.headers.poll)}},e.jsonp.ify=function(t,n){var o=encodeURIComponent,i="?";if(t.url&&t.url.pathname&&(i=t.url.pathname+i),i=t.base+i,e.each((t.url||{}).query,function(t,n){i+=o(n)+"="+o(t)+"&"}),t.headers&&(i+=o("`")+"="+o(JSON.stringify(t.headers))+"&"),e.jsonp.max<i.length)return n();var r=Math.floor(65536*Math.random());if(i+=o("jsonp")+"="+o(t.jsonp="P"+r),t.body){i+="&";var u=t.body,a=function(t,n,e){return o("%")+"="+o(t+"-"+(n||t)+"/"+(e||t))+"&"+o("$")+"="};"string"!=typeof u&&(u=JSON.stringify(u),i+=o("^")+"="+o("json")+"&"),u=o(u);var s=0,f=u.length,c=e.jsonp.max-(i.length+a(f.toString()).length);if(0>c)return n();for(;u;)n(i+a(s,s+=c,f)+u.slice(0,s)),u=u.slice(s)}else n(i)},e.jsonp.max=2e3,e.each=function(t,n,o){if(t&&n)for(var e in t)t.hasOwnProperty(e)&&n.call(o,t[e],e)},n.exports=o)})(t,"./polyfill/request")}();
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],10:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":11}],11:[function(require,module,exports){
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
},{"./ponyfill":12}],12:[function(require,module,exports){
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
},{}],13:[function(require,module,exports){
"use strict";
var index_1 = require("../index");
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

},{"../index":14}],14:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var symbol_observable_1 = require("symbol-observable");
var NO = {};
exports.NO = NO;
function noop() { }
function cp(a) {
    var l = a.length;
    var b = Array(l);
    for (var i = 0; i < l; ++i)
        b[i] = a[i];
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
    producer._start = function _start(il) {
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
        for (var i = 0; i < L; i++)
            s[i]._add(this);
    };
    Merge.prototype._stop = function () {
        var s = this.insArr;
        var L = s.length;
        for (var i = 0; i < L; i++)
            s[i]._remove(this);
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
        if (p.up(t, this.i))
            out._n(p.vals);
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
        if (--p.Nc === 0)
            p.out._c();
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
        for (var i = 0; i < n; i++)
            s[i]._remove(ils[i]);
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
        for (var i = 0, n = a.length; i < n; i++)
            out._n(a[i]);
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
        if (typeof arg === 'string')
            this.l = arg;
        else if (typeof arg === 'function')
            this.s = arg;
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
        else if (l)
            console.log(l + ':', t);
        else
            console.log(t);
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
        else
            u._e(new Error('last() failed because input stream completed'));
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
        var _this = _super.call(this, project, ins) || this;
        _this.type = 'filter+map';
        _this.passes = passes;
        return _this;
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
        if (this.max <= 0)
            out._c();
        else
            this.ins._add(this);
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
        if (m < this.max)
            u._n(t);
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
        else if (L == 0)
            return;
        else {
            var b = cp(a);
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
        else if (L == 0)
            return;
        else {
            var b = cp(a);
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
        else if (L == 0)
            return;
        else {
            var b = cp(a);
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
        if (this._hasNoSinks(this, []))
            this._remove(this._ils[0]);
    };
    // Checks whether *there is no* path starting from `x` that leads to an end
    // listener (sink) in the stream graph, following edges A->B where B is a
    // listener of A. This means these paths constitute a cycle somehow. Is given
    // a trace of all visited nodes so far.
    Stream.prototype._hasNoSinks = function (x, trace) {
        if (trace.indexOf(x) !== -1)
            return true;
        else if (x.out === this)
            return true;
        else if (x.out && x.out !== NO)
            return this._hasNoSinks(x.out, trace.concat(x));
        else if (x._ils) {
            for (var i = 0, N = x._ils.length; i < N; i++)
                if (!this._hasNoSinks(x._ils[i], trace.concat(x)))
                    return false;
            return true;
        }
        else
            return false;
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
                || typeof producer.stop !== 'function')
                throw new Error('producer requires both start and stop functions');
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
        if (producer)
            internalizeProducer(producer); // mutates the input
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
        if (typeof input[symbol_observable_1.default] === 'function')
            return Stream.fromObservable(input);
        else if (typeof input.then === 'function')
            return Stream.fromPromise(input);
        else if (Array.isArray(input))
            return Stream.fromArray(input);
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
            items[_i] = arguments[_i];
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
    Stream.fromObservable = function (obs) {
        if (obs.endWhen)
            return obs;
        return new Stream(new FromObservable(obs));
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
        if (p instanceof Filter)
            return new ctor(new FilterMapFusion(p.f, project, p.ins));
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
        if (p instanceof Filter)
            return new Stream(new Filter(and(p.f, passes), p.ins));
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
        if (target instanceof MemoryStream)
            throw new Error('A MemoryStream was given to imitate(), but it only ' +
                'supports a Stream. Read more about this restriction here: ' +
                'https://github.com/staltz/xstream#faq');
        this._target = target;
        for (var ils = this._ils, N = ils.length, i = 0; i < N; i++)
            target._add(ils[i]);
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
    return Stream;
}());
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
        streams[_i] = arguments[_i];
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
        streams[_i] = arguments[_i];
    }
    return new Stream(new Combine(streams));
};
exports.Stream = Stream;
var MemoryStream = (function (_super) {
    __extends(MemoryStream, _super);
    function MemoryStream(producer) {
        var _this = _super.call(this, producer) || this;
        _this._has = false;
        return _this;
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

},{"symbol-observable":10}],15:[function(require,module,exports){
var lib = require('../../lib/index');
var cycle = require('@cycle/xstream-run').default;
var xstream = require('xstream').default;


var dropRepeats = require('xstream/extra/dropRepeats').default;
var equal = require('deep-equal');


var makeGunDriver = lib.makeGunDriver;

var assert = chai.assert;



function sinkToGun(eventStream) {
    return eventStream
        .filter(function (event) {
            return event.typeKey === 'out-gun';
        })
        .map(function (event) {
            return function (gunInstance) {
                return gunInstance
                    .get('example/todo/data')
                    .path(event.payload.key)
                    .put(event.payload.value)
            };
        });
}

var testArray = [{
        typeKey: 'out-gun',
        payload: {
            key: '1',
            value: "test1"
        }
    },
    {
        typeKey: 'out-gun',
        payload: {
            key: '2',
            value: "test2"
        }
    },
    {
        typeKey: 'out-gun',
        payload: {
            key: '3',
            value: "test3"
        }
    },
    {
        typeKey: 'out-gun',
        payload: {
            key: '4',
            value: "test4"
        }
    }
]

// function main(sources) {


//     var get$ = sources.gun.get(function (gunInstance) {
//         return gunInstance.get('example/todo/data');
//     }).compose(dropRepeats(equal))
//     .debug('get')

//     get$.addListener({
//         next: function(event){
//             //console.log(event);
//         }
//     })

//     var testPut$ = xstream.fromArray(testArray);

//     var gunSinkStream$ = sinkToGun(testPut$);

//     return {
//         gun: gunSinkStream$
//     };
// }

// var drivers = {
//     gun: makeGunDriver()
// }

// cycle.run(main, drivers)








describe('MakeGunDriver Factory', function () {

    it('is a function', function () {
        assert.strictEqual(typeof makeGunDriver, 'function');
    });

    it('returns a function', function () {

        var gunDriver = makeGunDriver('http://a');
        assert.strictEqual(typeof gunDriver, 'function');
    });

});


describe('cycle-gun driver instance', function () {


    function main(sources) {


        it('sources is an object', function () {
            assert.strictEqual(typeof sources.gun, 'object');
        });

        it('returns a get method', function () {
            assert.strictEqual(typeof sources.gun.get, 'function');
        });

        it('gets inbound stream from gun', function () {
            var get$ = sources.gun.get(function (gunInstance) {
                return gunInstance.get('example/todo/data');
            });

            get$.addListener({
                next: function (event) {
                    console.log(event)
                    assert.strictEqual(typeof event, 'object');
                }
            });
        });

        it('checks data elements are same as those sent', function () {
            var get$ = sources.gun.get(function (gunInstance) {
                return gunInstance.get('example/todo/data');
            });

            get$.addListener({
                next: function (event) {
                    console.log(event)
                    assert.strictEqual(event['1'], 'test1');
                    assert.strictEqual(event['2'], 'test2');
                    assert.strictEqual(event['3'], 'test3');
                    assert.strictEqual(event['4'], 'test4');

                }
            });
        });














        var testPut$ = xstream.fromArray(testArray);

        const gunSinkStream$ = sinkToGun(testPut$);

        return {
            gun: gunSinkStream$
        };
    }

    var drivers = {
        gun: makeGunDriver()
    }

    cycle.run(main, drivers)

});
},{"../../lib/index":2,"@cycle/xstream-run":5,"deep-equal":6,"xstream":14,"xstream/extra/dropRepeats":13}]},{},[15]);
