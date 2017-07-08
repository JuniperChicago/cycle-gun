(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var xstream_1 = require("xstream");
var Gun = require("gun");
var GunSource = (function () {
    function GunSource(gun, path) {
        this.gun = gun;
        this.path = path;
    }
    GunSource.prototype.select = function (key) {
        return new GunSource(this.gun, this.path.concat(key));
    };
    GunSource.prototype.shallow = function () {
        var self = this;
        return xstream_1.default.create({
            start: function (listener) {
                (_a = self.gun).path.apply(_a, self.path).on(function (x) {
                    listener.next(x);
                });
                var _a;
            },
            stop: function () {
            },
        });
    };
    GunSource.prototype.each = function () {
        var self = this;
        return xstream_1.default.create({
            start: function (listener) {
                (_a = self.gun).path.apply(_a, self.path).map().on(function (value, key) {
                    listener.next({ key: key, value: value });
                });
                var _a;
            },
            stop: function () {
            },
        });
    };
    return GunSource;
}());
exports.GunSource = GunSource;
function makeGunDriver(opts) {
    var gun = Gun(opts).get(opts.root);
    function processTransform(inputFunction) {
        return inputFunction(gun);
    }
    return function gunDriver(sink) {
        sink.addListener({
            next: function (transform) {
                return processTransform(transform);
            },
        });
        return new GunSource(gun, []);
    };
}
exports.makeGunDriver = makeGunDriver;

},{"gun":8,"xstream":13}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var cycle_gun_1 = require("./cycle-gun");
exports.makeGunDriver = cycle_gun_1.makeGunDriver;
exports.GunSource = cycle_gun_1.GunSource;

},{"./cycle-gun":1}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var adaptStream = function (x) { return x; };
function setAdapt(f) {
    adaptStream = f;
}
exports.setAdapt = setAdapt;
function adapt(stream) {
    return adaptStream(stream);
}
exports.adapt = adapt;

},{}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var xstream_1 = require("xstream");
var adapt_1 = require("./adapt");
function logToConsoleError(err) {
    var target = err.stack || err;
    if (console && console.error) {
        console.error(target);
    }
    else if (console && console.log) {
        console.log(target);
    }
}
function makeSinkProxies(drivers) {
    var sinkProxies = {};
    for (var name_1 in drivers) {
        if (drivers.hasOwnProperty(name_1)) {
            sinkProxies[name_1] = xstream_1.default.createWithMemory();
        }
    }
    return sinkProxies;
}
function callDrivers(drivers, sinkProxies) {
    var sources = {};
    for (var name_2 in drivers) {
        if (drivers.hasOwnProperty(name_2)) {
            sources[name_2] = drivers[name_2](sinkProxies[name_2], name_2);
            if (sources[name_2] && typeof sources[name_2] === 'object') {
                sources[name_2]._isCycleSource = name_2;
            }
        }
    }
    return sources;
}
// NOTE: this will mutate `sources`.
function adaptSources(sources) {
    for (var name_3 in sources) {
        if (sources.hasOwnProperty(name_3)
            && sources[name_3]
            && typeof sources[name_3]['shamefullySendNext'] === 'function') {
            sources[name_3] = adapt_1.adapt(sources[name_3]);
        }
    }
    return sources;
}
function replicateMany(sinks, sinkProxies) {
    var sinkNames = Object.keys(sinks).filter(function (name) { return !!sinkProxies[name]; });
    var buffers = {};
    var replicators = {};
    sinkNames.forEach(function (name) {
        buffers[name] = { _n: [], _e: [] };
        replicators[name] = {
            next: function (x) { return buffers[name]._n.push(x); },
            error: function (err) { return buffers[name]._e.push(err); },
            complete: function () { },
        };
    });
    var subscriptions = sinkNames
        .map(function (name) { return xstream_1.default.fromObservable(sinks[name]).subscribe(replicators[name]); });
    sinkNames.forEach(function (name) {
        var listener = sinkProxies[name];
        var next = function (x) { listener._n(x); };
        var error = function (err) { logToConsoleError(err); listener._e(err); };
        buffers[name]._n.forEach(next);
        buffers[name]._e.forEach(error);
        replicators[name].next = next;
        replicators[name].error = error;
        // because sink.subscribe(replicator) had mutated replicator to add
        // _n, _e, _c, we must also update these:
        replicators[name]._n = next;
        replicators[name]._e = error;
    });
    buffers = null; // free up for GC
    return function disposeReplication() {
        subscriptions.forEach(function (s) { return s.unsubscribe(); });
        sinkNames.forEach(function (name) { return sinkProxies[name]._c(); });
    };
}
function disposeSources(sources) {
    for (var k in sources) {
        if (sources.hasOwnProperty(k) && sources[k] && sources[k].dispose) {
            sources[k].dispose();
        }
    }
}
function isObjectEmpty(obj) {
    return Object.keys(obj).length === 0;
}
/**
 * A function that prepares the Cycle application to be executed. Takes a `main`
 * function and prepares to circularly connects it to the given collection of
 * driver functions. As an output, `setup()` returns an object with three
 * properties: `sources`, `sinks` and `run`. Only when `run()` is called will
 * the application actually execute. Refer to the documentation of `run()` for
 * more details.
 *
 * **Example:**
 * ```js
 * import {setup} from '@cycle/run';
 * const {sources, sinks, run} = setup(main, drivers);
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
 * @function setup
 */
function setup(main, drivers) {
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
    var sinkProxies = makeSinkProxies(drivers);
    var sources = callDrivers(drivers, sinkProxies);
    var adaptedSources = adaptSources(sources);
    var sinks = main(adaptedSources);
    if (typeof window !== 'undefined') {
        window.Cyclejs = window.Cyclejs || {};
        window.Cyclejs.sinks = sinks;
    }
    function run() {
        var disposeReplication = replicateMany(sinks, sinkProxies);
        return function dispose() {
            disposeSources(sources);
            disposeReplication();
        };
    }
    ;
    return { sinks: sinks, sources: sources, run: run };
}
exports.setup = setup;
/**
 * Takes a `main` function and circularly connects it to the given collection
 * of driver functions.
 *
 * **Example:**
 * ```js
 * import run from '@cycle/run';
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
    var _a = setup(main, drivers), run = _a.run, sinks = _a.sinks;
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](sinks);
    }
    return run();
}
exports.run = run;
exports.default = run;

},{"./adapt":3,"xstream":13}],5:[function(require,module,exports){
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

},{"./lib/is_arguments.js":6,"./lib/keys.js":7}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;

exports.shim = shim;
function shim (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}

},{}],8:[function(require,module,exports){
(function (global){
!function(){function t(n){function o(t){return t.split("/").slice(-1).toString().replace(".js","")}return n.slice?t[o(n)]:function(e,i){n(e={exports:{}}),t[o(i)]=e.exports}}var n;"undefined"!=typeof window&&(n=window),"undefined"!=typeof global&&(n=global),n=n||{};var o=n.console||{log:function(){}};if("undefined"!=typeof module)var e=module;t(function(t){var n={};n.fns=n.fn={is:function(t){return!!t&&"function"==typeof t}},n.bi={is:function(t){return t instanceof Boolean||"boolean"==typeof t}},n.num={is:function(t){return!e(t)&&(t-parseFloat(t)+1>=0||1/0===t||-(1/0)===t)}},n.text={is:function(t){return"string"==typeof t}},n.text.ify=function(t){return n.text.is(t)?t:"undefined"!=typeof JSON?JSON.stringify(t):t&&t.toString?t.toString():t},n.text.random=function(t,n){var o="";for(t=t||24,n=n||"0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz";t>0;)o+=n.charAt(Math.floor(Math.random()*n.length)),t--;return o},n.text.match=function(t,o){function e(t,n){for(var o,e=-1,i=0;o=n[i++];)if(!~(e=t.indexOf(o,e+1)))return!1;return!0}var i=!1;if(t=t||"",o=n.text.is(o)?{"=":o}:o||{},n.obj.has(o,"~")&&(t=t.toLowerCase(),o["="]=(o["="]||o["~"]).toLowerCase()),n.obj.has(o,"="))return t===o["="];if(n.obj.has(o,"*")){if(t.slice(0,o["*"].length)!==o["*"])return!1;i=!0,t=t.slice(o["*"].length)}if(n.obj.has(o,"!")){if(t.slice(-o["!"].length)!==o["!"])return!1;i=!0}if(n.obj.has(o,"+")&&n.list.map(n.list.is(o["+"])?o["+"]:[o["+"]],function(n){return t.indexOf(n)>=0?void(i=!0):!0}))return!1;if(n.obj.has(o,"-")&&n.list.map(n.list.is(o["-"])?o["-"]:[o["-"]],function(n){return t.indexOf(n)<0?void(i=!0):!0}))return!1;if(n.obj.has(o,">")){if(!(t>o[">"]))return!1;i=!0}if(n.obj.has(o,"<")){if(!(t<o["<"]))return!1;i=!0}if(n.obj.has(o,"?")){if(!e(t,o["?"]))return!1;i=!0}return i},n.list={is:function(t){return t instanceof Array}},n.list.slit=Array.prototype.slice,n.list.sort=function(t){return function(n,o){return n&&o?(n=n[t],o=o[t],o>n?-1:n>o?1:0):0}},n.list.map=function(t,n,o){return a(t,n,o)},n.list.index=1,n.obj={is:function(t){return t?t instanceof Object&&t.constructor===Object||"Object"===Object.prototype.toString.call(t).match(/^\[object (\w+)\]$/)[1]:!1}},n.obj.put=function(t,n,o){return(t||{})[n]=o,t},n.obj.has=function(t,n){return t&&Object.prototype.hasOwnProperty.call(t,n)},n.obj.del=function(t,n){return t?(t[n]=null,delete t[n],t):void 0},n.obj.as=function(t,n,o,e){return t[n]=t[n]||(e===o?{}:o)},n.obj.ify=function(t){if(r(t))return t;try{t=JSON.parse(t)}catch(n){t={}}return t},function(){function t(t,n){u(this,n)&&o!==this[n]||(this[n]=t)}var o;n.obj.to=function(n,o){return o=o||{},a(n,t,o),o}}(),n.obj.copy=function(t){return t?JSON.parse(JSON.stringify(t)):t},function(){function t(t,n){var o=this.n;if(!o||!(n===o||r(o)&&u(o,n)))return n?!0:void 0}n.obj.empty=function(n,o){return n&&a(n,t,{n:o})?!1:!0}}(),function(){function t(n,o){return 2===arguments.length?(t.r=t.r||{},void(t.r[n]=o)):(t.r=t.r||[],void t.r.push(n))}var i=Object.keys;n.obj.map=function(a,s,f){var c,l,p,d,g,h=0,v=o(s);if(t.r=null,i&&r(a)&&(d=Object.keys(a),g=!0),e(a)||d)for(l=(d||a).length;l>h;h++){var _=h+n.list.index;if(v){if(p=g?s.call(f||this,a[d[h]],d[h],t):s.call(f||this,a[h],_,t),p!==c)return p}else if(s===a[g?d[h]:h])return d?d[h]:_}else for(h in a)if(v){if(u(a,h)&&(p=f?s.call(f,a[h],h,t):s(a[h],h,t),p!==c))return p}else if(s===a[h])return h;return v?t.r:n.list.index?0:-1}}(),n.time={},n.time.is=function(t){return t?t instanceof Date:+(new Date).getTime()};var o=n.fn.is,e=n.list.is,i=n.obj,r=i.is,u=i.has,a=i.map;t.exports=n})(t,"./type"),t(function(t){t.exports=function n(t,o,e){if(!t)return{to:n};var t=(this.tag||(this.tag={}))[t]||(this.tag[t]={tag:t,to:n._={next:function(){}}});if(o instanceof Function){var i={off:n.off||(n.off=function(){return this.next===n._.next?!0:(this===this.the.last&&(this.the.last=this.back),this.to.back=this.back,this.next=n._.next,void(this.back.to=this.to))}),to:n._,next:o,the:t,on:this,as:e};return(i.back=t.last||t).to=i,t.last=i}return(t=t.to).next(o),t}})(t,"./onto"),t(function(n){function o(t,n){n=n||{},n.id=n.id||"#",n.rid=n.rid||"@",n.uuid=n.uuid||function(){return+new Date+Math.random()};var o=e;return o.stun=function(t){var n=function(t){return n.off&&n===this.stun?(this.stun=null,!1):o.stun.skip?!1:(t&&(t.cb=t.fn,t.off(),e.queue.push(t)),!0)},e=n.res=function(t,r){if(!n.off){if(t instanceof Function)return o.stun.skip=!0,t.call(r),void(o.stun.skip=!1);n.off=!0;var u,a=0,s=e.queue,f=s.length;for(e.queue=[],n===i.stun&&(i.stun=null),a;f>a;a++)u=s[a],u.fn=u.cb,u.cb=null,o.stun.skip=!0,u.ctx.on(u.tag,u.fn,u),o.stun.skip=!1}},i=t._;return e.back=i.stun||(i.back||{_:{}})._.stun,e.back&&(e.back.next=n),e.queue=[],i.stun=n,e},o}var e=t("./onto");n.exports=o})(t,"./onify"),t(function(n){function o(t,n,e){o.time=e,o.waiting.push({when:t,event:n||function(){}}),o.soonest<t||o.set(t)}var e=t("./type");o.waiting=[],o.soonest=1/0,o.sort=e.list.sort("when"),o.set=function(t){if(!(1/0<=(o.soonest=t))){var n=o.time();t=n>=t?0:t-n,clearTimeout(o.id),o.id=setTimeout(o.check,t)}},o.each=function(t,n,o){var e=this;t&&(t.when<=e.now?t.event instanceof Function&&setTimeout(function(){t.event()},0):(e.soonest=e.soonest<t.when?e.soonest:t.when,o(t)))},o.check=function(){var t={now:o.time(),soonest:1/0};o.waiting.sort(o.sort),o.waiting=e.list.map(o.waiting,o.each,t)||[],o.set(t.soonest)},n.exports=o})(t,"./schedule"),t(function(t){function n(t,n,e,i,r){if(n>t)return{defer:!0};if(e>n)return{historical:!0};if(n>e)return{converge:!0,incoming:!0};if(n===e){if(i=o(i)||"",r=o(r)||"",i===r)return{state:!0};if(r>i)return{converge:!0,current:!0};if(i>r)return{converge:!0,incoming:!0}}return{err:"Invalid CRDT Data: "+i+" to "+r+" at "+n+" to "+e+"!"}}if("undefined"==typeof JSON)throw new Error("JSON is not included in this browser. Please load it first: ajax.cdnjs.com/ajax/libs/json2/20110223/json2.js");var o=JSON.stringify;t.exports=n})(t,"./HAM"),t(function(n){var o=t("./type"),e={};e.is=function(t){return t===i?!1:null===t?!0:t===1/0?!1:s(t)||u(t)||a(t)?!0:e.rel.is(t)||!1},e.rel={_:"#"},function(){function t(t,n){var o=this;return o.id?o.id=!1:n==r&&s(t)?void(o.id=t):o.id=!1}e.rel.is=function(n){if(n&&n[r]&&!n._&&c(n)){var o={};if(p(n,t,o),o.id)return o.id}return!1}}(),e.rel.ify=function(t){return l({},r,t)};var i,r=e.rel._,u=o.bi.is,a=o.num.is,s=o.text.is,f=o.obj,c=f.is,l=f.put,p=f.map;n.exports=e})(t,"./val"),t(function(n){var o=t("./type"),e=t("./val"),i={_:"_"};i.soul=function(t,n){return t&&t._&&t._[n||p]},i.soul.ify=function(t,n){return n="string"==typeof n?{soul:n}:n||{},t=t||{},t._=t._||{},t._[p]=n.soul||t._[p]||l(),t},i.soul._=e.rel._,function(){function t(t,n){return n!==i._?e.is(t)?void(this.cb&&this.cb.call(this.as,t,n,this.n,this.s)):!0:void 0}i.is=function(n,o,e){var r;return a(n)&&(r=i.soul(n))?!f(n,t,{as:e,cb:o,s:r,n:n}):!1}}(),function(){function t(t,n){var o,i,r=this.o;return r.map?(o=r.map.call(this.as,t,""+n,r.node),void(i===o?s(r.node,n):r.node&&(r.node[n]=o))):void(e.is(t)&&(r.node[n]=t))}i.ify=function(n,o,e){return o?"string"==typeof o?o={soul:o}:o instanceof Function&&(o={map:o}):o={},o.map&&(o.node=o.map.call(e,n,r,o.node||{})),(o.node=i.soul.ify(o.node||{},o))&&f(n,t,{o:o,as:e}),o.node}}();var r,u=o.obj,a=u.is,s=u.del,f=u.map,c=o.text,l=c.random,p=i.soul._;n.exports=i})(t,"./node"),t(function(n){function o(){var t;return t=f?c+f.now():r(),t>u?(a=0,u=t+o.drift):u=t+(a+=1)/s+o.drift}var e=t("./type"),i=t("./node"),r=e.time.is,u=-(1/0),a=0,s=1e3,f="undefined"!=typeof performance?performance.timing&&performance:!1,c=f&&f.timing&&f.timing.navigationStart||(f=!1);o._=">",o.drift=0,o.is=function(t,n,e){var i=n&&t&&t[x]&&t[x][o._]||e;if(i)return m(i=i[n])?i:-(1/0)},o.ify=function(t,n,e,r,u){if(!t||!t[x]){if(!u)return;t=i.soul.ify(t,u)}var a=d(t[x],o._);return l!==n&&n!==x&&(m(e)&&(a[n]=e),l!==r&&(t[n]=r)),t},o.to=function(t,n,e){var r=t[n];return h(r)&&(r=_(r)),o.ify(e,n,o.is(t,n),r,i.soul(t))},function(){function t(t,n){x!==n&&o.ify(this.o,n,this.s)}o.map=function(n,e,i){var r,u=h(u=n||e)?u:null;return n=k(n=n||e)?n:null,u&&!n?(e=m(e)?e:o(),u[x]=u[x]||{},v(u,t,{o:u,s:e}),u):(i=i||h(e)?e:r,e=m(e)?e:o(),function(o,u,a,s){return n?(n.call(i||this||{},o,u,a,s),void(g(a,u)&&r===a[u]||t.call({o:a,s:e},o,u))):(t.call({o:a,s:e},o,u),o)})}}();var l,p=e.obj,d=p.as,g=p.has,h=p.is,v=p.map,_=p.copy,b=e.num,m=b.is,y=e.fn,k=y.is,x=i._;n.exports=o})(t,"./state"),t(function(n){var o=t("./type"),e=t("./val"),i=t("./node"),r={};!function(){function t(t,o){return t&&o===i.soul(t)&&i.is(t,this.fn,this.as)?void(this.cb&&(n.n=t,n.as=this.as,this.cb.call(n.as,t,o,n))):!0}function n(t){t&&i.is(n.n,t,n.as)}r.is=function(n,o,e,i){return n&&s(n)&&!l(n)?!d(n,t,{cb:o,fn:e,as:i}):!1}}(),function(){function t(t,r){var u;return(u=l(t,r))?u:(r.env=t,r.soul=o,i.ify(r.obj,n,r)&&(t.graph[e.rel.is(r.rel)]=r.node),r)}function n(n,o,r){var s,l,p=this,d=p.env;if(i._===o&&c(n,e.rel._))return r._;if(s=a(n,o,r,p,d)){if(o||(p.node=p.node||r||{},c(n,i._)&&(p.node._=g(n._)),p.node=i.soul.ify(p.node,e.rel.is(p.rel)),p.rel=p.rel||e.rel.ify(i.soul(p.node))),(l=d.map)&&(l.call(d.as||{},n,o,r,p),c(r,o))){if(n=r[o],u===n)return void f(r,o);if(!(s=a(n,o,r,p,d)))return}if(!o)return p.node;if(!0===s)return n;if(l=t(d,{obj:n,path:p.path.concat(o)}),l.node)return l.rel}}function o(t){var n=this,o=e.rel.is(n.rel),r=n.env.graph;n.rel=n.rel||e.rel.ify(t),n.rel[e.rel._]=t,n.node&&n.node[i._]&&(n.node[i._][e.rel._]=t),c(r,o)&&(r[t]=r[o],f(r,o))}function a(t,n,o,i,r){var u;return e.is(t)?!0:s(t)?1:(u=r.invalid)?(t=u.call(r.as||{},t,n,o),a(t,n,o,i,r)):void(r.err="Invalid value at '"+i.path.concat(n).join(".")+"'!")}function l(t,n){for(var o,e=t.seen,i=e.length;i--;)if(o=e[i],n.obj===o.obj)return o;e.push(n)}r.ify=function(n,o,i){var r={path:[],obj:n};return o?"string"==typeof o?o={soul:o}:o instanceof Function&&(o.map=o):o={},o.soul&&(r.rel=e.rel.ify(o.soul)),o.graph=o.graph||{},o.seen=o.seen||[],o.as=o.as||i,t(o,r),o.root=r.node,o.graph}}(),r.node=function(t){var n=i.soul(t);if(n)return p({},n,t)},function(){function t(t,n){var o,u;if(i._===n){if(l(t,e.rel._))return;return void(this.obj[n]=g(t))}return(o=e.rel.is(t))?(u=this.opt.seen[o])?void(this.obj[n]=u):void(this.obj[n]=this.opt.seen[o]=r.to(this.graph,o,this.opt)):void(this.obj[n]=t)}r.to=function(n,o,e){if(n){var i={};return e=e||{seen:{}},d(n[o],t,{obj:i,graph:n,opt:e}),i}}}();var u,a=(o.fn.is,o.obj),s=a.is,f=a.del,c=a.has,l=a.empty,p=a.put,d=a.map,g=a.copy;n.exports=r})(t,"./graph"),t(function(n){function o(){this.cache={}}var e=t("./type");o.prototype.track=function(t){return this.cache[t]=e.time.is(),this.to||this.gc(),t},o.prototype.check=function(t){return e.obj.has(this.cache,t)?this.track(t):!1},o.prototype.gc=function(){var t=this,n=e.time.is(),o=n,i=3e5;e.obj.map(t.cache,function(r,u){o=Math.min(n,r),i>n-r||e.obj.del(t.cache,u)});var r=e.obj.empty(t.cache);if(r)return void(t.to=null);var u=n-o,a=i-u;t.to=setTimeout(function(){t.gc()},a)},n.exports=o})(t,"./dup"),t(function(n){function i(t){return t instanceof i?(this._={gun:this}).gun:this instanceof i?i.create(this._={gun:this,opt:t}):new i(t)}i.is=function(t){return t instanceof i},i.version=.7,i.chain=i.prototype,i.chain.toJSON=function(){};var r=t("./type");r.obj.to(r,i),i.HAM=t("./HAM"),i.val=t("./val"),i.node=t("./node"),i.state=t("./state"),i.graph=t("./graph"),i.dup=t("./dup"),i.schedule=t("./schedule"),i.on=t("./onify")(),i._={node:i.node._,soul:i.val.rel._,state:i.state._,field:".",value:"="},function(){function t(t){var n,o=this,e=o.as;if(t.gun||(t.gun=e.gun),t["#"]||(t["#"]=i.text.random()),!e.dup.check(t["#"])){if(t["@"]){if(e.ack(t["@"],t))return;return e.dup.track(t["#"]),void i.on("out",p(t,{gun:e.gun}))}e.dup.track(t["#"]),n=p(t,{gun:e.gun}),t.get&&i.on("get",n),t.put&&i.on("put",n),i.on("out",n)}}i.create=function(n){n.on=n.on||i.on,n.root=n.root||n.gun,n.graph=n.graph||{},n.dup=n.dup||new i.dup,n.ask=i.on.ask,n.ack=i.on.ack;var o=n.gun.opt(n.opt);return n.once||(n.on("in",t,n),n.on("out",t,n)),n.once=1,o}}(),function(){function t(t,n,o,e){var r=this,u=i.state.is(o,n);if(!u)return r.err="Error: No state on '"+n+"' in node '"+e+"'!";var a=r.graph[e]||v,s=i.state.is(a,n,!0),f=a[n],c=i.HAM(r.machine,u,s,t,f);c.incoming||c.defer&&(r.defer=u<(r.defer||1/0)?u:r.defer),r.put[e]=i.state.to(o,n,r.put[e]),(r.diff||(r.diff={}))[e]=i.state.to(o,n,r.diff[e])}function n(t,n){var e=(this.gun._.next||v)[n];if(e){var r=this.map[n]={put:this.node=t,get:this.soul=n,gun:this.ref=e};d(t,o,this),i.on("node",r)}}function o(t,n){var o=this.graph,e=this.soul,r=this.ref._;o[e]=i.state.to(this.node,n,o[e]),(r.put||(r.put={}))[n]=t}function e(t){t.gun&&t.gun._.on("in",t)}i.on("put",function(o){if(!o["#"])return this.to.next(o);var r=this,a={gun:o.gun,graph:o.gun._.graph,put:{},map:{},machine:i.state()};return i.graph.is(o.put,null,t,a)||(a.err="Error: Invalid graph!"),a.err?a.gun.on("in",{"@":o["#"],err:i.log(a.err)}):(d(a.put,n,a),d(a.map,e,a),u!==a.defer&&i.schedule(a.defer,function(){i.on("put",o)},i.state),void(a.diff&&r.to.next(p(o,{put:a.diff}))))})}(),function(){i.on("get",function(t){var n,o=this,e=t.get[g],r=t.gun._,u=r.graph[e],a=t.get[h],s=r.next||(r.next={}),f=(s[e]||v)._;if(!u||!f)return o.to.next(t);if(a){if(!l(u,a))return o.to.next(t);u=i.state.to(u,a)}else u=i.obj.copy(u);u=i.graph.node(u),n=f.ack,r.on("in",{"@":t["#"],how:"mem",put:u,gun:f.gun}),n>0||o.to.next(t)})}(),function(){i.on.ask=function(t,n){if(this.on){var o=i.text.random();return t&&this.on(o,t,n),o}},i.on.ack=function(t,n){if(t&&n&&this.on){var o=t["#"]||t;if(this.tag&&this.tag[o])return this.on(o,n),!0}}}(),function(){i.chain.opt=function(t){t=t||{};var n=this,o=n._,e=t.peers||t;return c(t)||(t={}),c(o.opt)||(o.opt=t),a(e)&&(e=[e]),s(e)&&(e=d(e,function(t,n,o){o(t,{url:t})}),c(o.opt.peers)||(o.opt.peers={}),o.opt.peers=p(e,o.opt.peers)),o.opt.wsc=o.opt.wsc||{protocols:""},o.opt.peers=o.opt.peers||{},p(t,o.opt),i.on("opt",o),n}}();var u,a=i.text.is,s=i.list.is,f=i.obj,c=f.is,l=f.has,p=f.to,d=f.map,g=(f.copy,i._.soul),h=i._.field,v=(i.val.rel.is,{});o.debug=function(t,n){return o.debug.i&&t===o.debug.i&&o.debug.i++&&(o.log.apply(o,arguments)||n)},i.log=function(){return!i.log.off&&o.log.apply(o,arguments),[].slice.call(arguments).join(" ")},i.log.once=function(t,n,o){return(o=i.log.once)[t]=o[t]||0,o[t]++||i.log(n)},i.log.once("welcome","Hello wonderful person! :) Thanks for using GUN, feel free to ask for help on https://gitter.im/amark/gun and ask StackOverflow questions tagged with 'gun'!"),"undefined"!=typeof window&&(window.Gun=i),"undefined"!=typeof e&&(e.exports=i),n.exports=i})(t,"./root"),t(function(){var n=t("./root");n.chain.back=function(t,n){var i;if(-1===t||1/0===t)return this._.root;if(1===t)return this._.back||this;var r=this,u=r._;if("string"==typeof t&&(t=t.split(".")),t instanceof Array){var a=0,s=t.length,i=u;for(a;s>a;a++)i=(i||e)[t[a]];if(o!==i)return n?r:i;if(i=u.back)return i.back(t,n)}else if(t instanceof Function){for(var f,i={back:r};(i=i.back)&&(i=i._)&&!(f=t(i,n)););return f}};var o,e={}})(t,"./back"),t(function(){function o(t){var n,o,e,i=this.as,r=i.gun,u=r.back(-1);if(t.gun||(t.gun=r),o=t.get)if(e=o[m])e=u.get(e)._,g(o,y)?g(n=e.put,o=o[y])&&e.on("in",{get:e.get,put:c.state.to(n,o),gun:e.gun}):g(e,"put")&&e.on("in",e);else if(g(o,y)){o=o[y];var a=o?r.get(o)._:i;if(l!==a.put)return void a.on("in",a);if(g(i,"put")){var s,f=i.put;if((s=c.node.soul(f))&&(f=c.val.rel.ify(s)),s=c.val.rel.is(f)){if(!t.gun._)return;return void t.gun._.on("out",{get:e={"#":s,".":o,gun:t.gun},"#":u._.ask(c.HAM.synth,e),gun:t.gun})}if(l===f||c.val.is(f)){if(!t.gun._)return;return void t.gun._.on("in",{get:o,gun:t.gun})}}else i.map&&b(i.map,function(t){t.at.on("in",t.at)});if(i.soul){if(!t.gun._)return;return void t.gun._.on("out",{get:e={"#":i.soul,".":o,gun:t.gun},"#":u._.ask(c.HAM.synth,e),gun:t.gun})}if(i.get){if(!i.back._)return;return void i.back._.on("out",{get:h({},y,i.get),gun:r})}t=_(t,{get:{}})}else{if(g(i,"put")?i.on("in",i):i.map&&b(i.map,function(t){t.at.on("in",t.at)}),i.ack&&!g(i,"put"))return;if(i.ack=-1,i.soul)return void i.on("out",{get:e={"#":i.soul,gun:i.gun},"#":u._.ask(c.HAM.synth,e),gun:i.gun});if(i.get){if(!i.back._)return;return void i.back._.on("out",{get:h({},y,i.get),gun:i.gun})}}i.back._.on("out",t)}function e(t){t=t._||t;{var n,o=this,e=this.as,u=t.gun,f=u._,d=t.put;e.back._||p}if(0>e.ack&&!t.ack&&!c.val.rel.is(d)&&(e.ack=1),e.get&&t.get!==e.get&&(t=_(t,{get:e.get})),e.field&&f!==e&&(t=_(t,{gun:e.gun}),f.ack&&(e.ack=e.ack||f.ack)),l===d){if(o.to.next(t),e.soul)return;return r(e,t,o),e.field&&s(e,t),v(f.echo,e.id),void v(e.map,f.id)}return e.soul?(e.root._.now&&(t=_(t,{put:d=f.put})),o.to.next(t),r(e,t,o),void b(d,a,{at:t,cat:e})):(n=c.val.rel.is(d))?(i(e,t,f,n),o.to.next(t),void r(e,t,o)):c.val.is(d)?(e.field||e.soul?s(e,t):(f.field||f.soul)&&((f.echo||(f.echo={}))[e.id]=e,(e.map||(e.map={}))[f.id]=e.map[f.id]||{at:f}),o.to.next(t),void r(e,t,o)):(e.field&&f!==e&&g(f,"put")&&(e.put=f.put),(n=c.node.soul(d))&&f.field&&(f.put=e.root.get(n)._.put),o.to.next(t),r(e,t,o),i(e,t,f,n),void b(d,a,{at:t,cat:e}))}function i(t,n,o,e){if(e&&k!==t.get){var r=t.root.get(e)._;t.field?o=r:o.field&&i(o,n,o,e),o!==t&&((o.echo||(o.echo={}))[t.id]=t,t.field&&!(t.map||p)[o.id]&&s(t,n),r=(t.map||(t.map={}))[o.id]=t.map[o.id]||{at:o},e!==r.rel&&f(t,r.rel=e))}}function r(t,n,o){t.echo&&(t.field&&(n=_(n,{event:o})),b(t.echo,u,n))}function u(t){t.on("in",this)}function a(t,n){var o,e,i,r=this.cat,u=r.next||p,a=this.at;(k!==n||u[n])&&(o=u[n])&&(i=o._,i.field?(t&&t[m]&&c.val.rel.is(t)===c.node.soul(i.put)||(i.put=t),e=o):e=a.gun.get(n),i.on("in",{put:t,get:n,gun:e,via:a}))}function s(t){if(t.field||t.soul){var n=t.map;t.map=null,null!==n&&(l!==n||t.put===l)&&(b(n,function(n){(n=n.at)&&v(n.echo,t.id)}),b(t.next,function(t,n){var o=t._;o.put=l,o.ack&&(o.ack=-1),o.on("in",{get:n,gun:t,put:l})}))}}function f(t,n){var o=t.root.get(n)._;return t.ack?(o.ack=o.ack||-1,void o.on("out",{get:o={"#":n,gun:o.gun},"#":t.root._.ask(c.HAM.synth,o)})):void b(t.next,function(o,e){o._.on("out",{get:o={"#":n,".":e,gun:o},"#":t.root._.ask(c.HAM.synth,o)})})}var c=t("./root");c.chain.chain=function(){var t=this._,i=new this.constructor(this),r=i._;return r.root=n=t.root,r.id=++n._.once,r.back=this,r.on=c.on,c.on("chain",r),r.on("in",e,r),r.on("out",o,r),i},c.chain.chain.input=e;var l,p={},d=c.obj,g=d.has,h=d.put,v=d.del,_=d.to,b=d.map,m=c._.soul,y=c._.field,k=c.node._})(t,"./chain"),t(function(){function n(t,n){var o=n._,e=o.next,i=n.chain(),r=i._;return e||(e=o.next={}),e[r.get=t]=i,o.root===n?r.soul=t:(o.soul||o.field)&&(r.field=t),i}function o(t){var n,o=this,e=o.as,r=t.gun,a=r._,f=t.put;i===f&&(f=a.put),(n=f)&&n[s._]&&(n=s.is(n))&&(n=a.root.get(n)._,i!==n.put&&(t=u(t,{put:n.put}))),e.use(t,t.event||o),o.to.next(t)}var e=t("./root");e.chain.get=function(t,i,r){if("string"!=typeof t){if(t instanceof Function){var u=this,s=u._;return r=i||{},r.use=t,r.out=r.out||{cap:1},r.out.get=r.out.get||{},"_"!=s.get&&(s.root._.now=!0),s.on("in",o,r),s.on("out",r.out),s.root._.now=!1,u}return a(t)?this.get(""+t,i,r):((r=this.chain())._.err={err:e.log("Invalid get request!",t)},i&&i.call(r,r._.err),r)}var u,c,l=this,p=l._,d=p.next||f;return(u=d[t])||(u=n(t,l)),(c=p.stun)&&(u._.stun=u._.stun||c),i&&i instanceof Function&&u.get(i,r),u};var i,r=e.obj,u=(r.has,e.obj.to),a=e.num.is,s=e.val.rel,f=(e.node._,{})})(t,"./get"),t(function(){function n(t){t.batch=e;var n=t.opt||{},o=t.env=s.state.map(r,n.state);return o.soul=t.soul,t.graph=s.graph.ify(t.data,o,t),o.err?((t.ack||h).call(t,t.out={err:s.log(o.err)}),void(t.res&&t.res())):void t.batch()}function e(){var t=this;t.graph&&!d(t.stun,i)&&((t.res||v)(function(){t.ref._.on("out",{cap:3,gun:t.ref,put:t.out=t.env.graph,opt:t.opt,"#":t.gun.back(-1)._.ask(function(n){this.off(),t.ack&&t.ack(n,this)},t.opt)})},t),t.res&&t.res())}function i(t){return t?!0:void 0}function r(t,n,o,e){var i=this;!n&&e.path.length&&(i.res||v)(function(){var t=e.path,n=i.ref,o=(i.opt,0),r=t.length;for(o;r>o;o++)n=n.get(t[o]);if(i.not||s.node.soul(e.obj)){var a=s.node.soul(e.obj)||((i.opt||{}).uuid||i.gun.back("opt.uuid")||s.text.random)();return n.back(-1).get(a),void e.soul(a)}(i.stun=i.stun||{})[t]=!0,n.get("_").get(u,{as:{at:e,as:i}})},{as:i,at:e})}function u(t,n){var o=this.as,e=o.at;if(o=o.as,t.gun&&t.gun._.back){n.off(),t=t.gun._.back._;var i=s.node.soul(e.obj)||s.node.soul(t.put)||s.val.rel.is(t.put)||((o.opt||{}).uuid||o.gun.back("opt.uuid")||s.text.random)();t.gun.back(-1).get(i),e.soul(i),o.stun[e.path]=!1,o.batch()}}function a(t,n){var e=this.as;if(t.gun&&t.gun._){if(t.err)return void o.log("Please report this as an issue! Put.any.err");var i,r=t.gun._.back._,u=r.put,a=e.opt||{};if(n.off(),e.ref!==e.gun){if(i=e.gun._.get||r.get,!i)return void o.log("Please report this as an issue! Put.no.get");e.data=p({},i,e.data),i=null}if(f===u){if(!r.get)return;r.soul||(i=r.gun.back(function(t){return t.soul?t.soul:void(e.data=p({},t.get,e.data))})),i=i||r.get,r=r.root.get(i)._,e.not=e.soul=i,u=e.data}e.not||(e.soul=s.node.soul(u))||(e.soul=e.path&&l(e.data)?(a.uuid||r.root._.opt.uuid||s.text.random)():t.soul||r.soul||(a.uuid||r.root._.opt.uuid||s.text.random)()),e.ref.put(e.data,e.soul,e)}}var s=t("./root");s.chain.put=function(t,o,e){var i,r=this,u=r._,f=u.root;return e=e||{},e.data=t,e.gun=e.gun||r,"string"==typeof o?e.soul=o:e.ack=o,u.soul&&(e.soul=u.soul),e.soul||f===r?l(e.data)?(e.gun=r=f.get(e.soul=e.soul||(e.not=s.node.soul(e.data)||(f._.opt.uuid||s.text.random)())),e.ref=e.gun,n(e),r):((e.ack||h).call(e,e.out={err:s.log("Data saved to the root level of the graph must be a node (an object), not a",typeof e.data,'of "'+e.data+'"!')}),e.res&&e.res(),r):s.is(t)?(t.get(function(t,n){n.off();var i=s.node.soul(t.put);return i?void r.put(s.val.rel.ify(i),o,e):void s.log("The reference you are saving is a",typeof t.put,'"'+e.put+'", not a node (object)!')}),r):(e.ref=e.ref||f===(i=u.back)?r:i,e.ref._.soul&&s.val.is(e.data)&&u.get?(e.data=p({},u.get,e.data),e.ref.put(e.data,e.soul,e),r):(e.ref.get("_").get(a,{as:e}),e.out||(e.res=e.res||s.on.stun(e.ref),e.gun._.stun=e.ref._.stun),r))};var f,c=s.obj,l=c.is,p=c.put,d=c.map,g={},h=function(){},v=function(t,n){t.call(n||g)}})(t,"./put"),t(function(n){var e=t("./root");n.exports=e,function(){function t(t,n){if(e._.node!==n){var r=this.node,u=this.vertex,a=this.union,s=this.machine,f=g(r,n),c=g(u,n);if(i===f||i===c)return!0;var l=t,p=u[n];if(!_(l)&&i!==l)return!0;if(!_(p)&&i!==p)return!0;var d=e.HAM(s,f,c,l,p);if(d.err)return void o.log(".!HYPOTHETICAL AMNESIA MACHINE ERR!.",n,d.err);if(!(d.state||d.historical||d.current))return d.incoming?(a[n]=t,void h(a,n,f)):d.defer?(a[n]=t,void h(a,n,f)):void 0}}function n(t,n){var o=this;if(e._.node!==n&&_(t)){var i=o.node,r=o.vertex,u=g(i,n,!0),a=g(r,n,!0),s=o.delta,f=e.HAM(o.machine,u,a,t,r[n]);f.incoming&&(s[n]=t,h(s,n,u))}}e.HAM.union=function(n,o,i){return o&&o._&&(n=n||e.node.soul.ify({_:{">":{}}},e.node.soul(o)),n&&n._&&(i=a(i)?{machine:i}:{machine:e.state()},i.union=n||e.obj.copy(n),i.vertex=n,i.node=o,!l(o,t,i)))?i.union:void 0},e.HAM.delta=function(t,o,i){return i=a(i)?{machine:i}:{machine:e.state()},t?(i.soul=e.node.soul(i.vertex=t),i.soul?(i.delta=e.node.soul.ify({},i.soul),l(i.node=o,n,i),i.delta):void 0):e.obj.copy(o)},e.HAM.synth=function(t){var n=this.as,o=n.gun._;if(!t.put||n["."]&&!f(t.put[n["#"]],o.get)){if(o.put!==i)return;return void o.on("in",{get:o.get,put:o.put=i,gun:o.gun})}t.gun=o.root,e.on("put",t)},e.HAM.synth_=function(t,n,o){var r=this.as||o,u=r._,a=u.root._,s={};if(!t.put){if(u.put!==i)return;return void u.on("in",{get:u.get,put:u.put=i,gun:r,via:t})}l(t.put,function(t,n){var o=this.graph;s[n]=e.HAM.delta(o[n],t,{graph:o}),o[n]=e.HAM.union(o[n],t)||o[n]},a),t.gun!==a.gun&&(s=t.put),l(s,function(o,r){var a=this,s=a.next||(a.next={}),l=s[r]||(s[r]=a.gun.get(r)),p=l._;return p.put=a.graph[r],u.field&&!f(o,u.field)?((t=c(t,{})).put=i,void e.HAM.synth(t,n,u.gun)):void p.on("in",{put:o,get:r,gun:l,via:t})},a)}}();{var i,r=e,u=r.num,a=u.is,s=r.obj,f=s.has,c=(s.put,s.to),l=s.map,p=e.node,d=(p.soul,p.is,p.ify,e.state),g=d.is,h=d.ify,v=e.val,_=v.is;v.rel.is}})(t,"./index"),t(function(n){var o=t("./root");t("./index"),t("./opt"),t("./chain"),t("./back"),t("./put"),t("./get"),n.exports=o})(t,"./core"),t(function(){var n=t("./core");n.chain.path=function(t,o,e){var i,r=this,u=r;if(e=e||{},e.path=!0,n.log.once("pathing","Warning: `.path` to be removed from core (but available as an extension), use `.get` chains instead. If you are opposed to this, please voice your opinion in https://gitter.im/amark/gun and ask others."),u===u._.root)return o&&o({err:n.log("Can't do that on root instance.")}),u;if("string"==typeof t){if(i=t.split(e.split||"."),1===i.length)return u=r.get(t,o,e),u._.opt=e,u;t=i}if(t instanceof Array){if(t.length>1){u=r;var a=0,s=t.length;for(a;s>a;a++)u=u.get(t[a],a+1===s?o:null,e)}else u=r.get(t[0],o,e);return u._.opt=e,u}return t||0==t?(u=r.get(""+t,o,e),u._.opt=e,u):r}})(t,"./path"),t(function(){function n(t,n){var o,r=this,u=t.gun,s=u._,f=s.put||t.put,o=r.last,c=s.id+t.get;if(i!==f){if(f&&f[a._]&&(o=a.is(f))){if(o=s.root.get(o)._,i===o.put)return;f=o.put}r.change&&(f=t.put),(o.put!==f||o.get!==c||e.node.soul(f))&&(o.put=f,o.get=c,s.last=f,r.as?r.ok.call(r.as,t,n):r.ok.call(u,f,t.get,t,n))}}function o(t,n){var e,r=this.as,u=r.cat,s=t.gun,f=s._,c=f.put||t.put;if(c&&c[a._]&&(e=a.is(c))){if(e=u.root.get(e)._,i===e.put)return;c=e.put}if(n.wait&&clearTimeout(n.wait),!r.async)return void(n.wait=setTimeout(function(){o.call({as:r},t,n,n.wait||1)},r.wait||99));if(u.field||u.soul){if(n.off())return}else{if((r.seen=r.seen||{})[f.id])return;r.seen[f.id]=!0}r.ok.call(t.gun||r.gun,c,t.get)}var e=t("./core");e.chain.on=function(t,o,e,i){var r,u,a=this,f=a._;if("string"==typeof t)return o?(r=f.on(t,o,e||f,i),e&&e.gun&&(e.subs||(e.subs=[])).push(r),u=function(){r&&r.off&&r.off(),u.off()},u.off=a.off.bind(a)||s,a.off=u,a):f.on(t);var c=o;return c=!0===c?{change:!0}:c||{},c.ok=t,c.last={},a.get(n,c),a},e.chain.val=function(t,n){var r=this,u=r._,a=u.put;if(0<u.ack&&i!==a)return(t||s).call(r,a,u.get),r;if(!t){e.log.once("valonce","Chainable val is experimental, its behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.");var f=r.chain();return f._.val=r.val(function(){f._.on("in",r._)}),f}return(n=n||{}).ok=t,n.cat=u,r.get(o,{as:n}),n.async=!0,r},e.chain.off=function(){var t,n=this,o=n._,e=o.back||{},i=e._;return i?((t=i.next)&&(t[o.get]?u(t,o.get):obj_map(t,function(o,e){n===o&&u(t,e)})),(t=n.back(-1))===e&&u(t.graph,o.get),o.ons&&(t=o.ons["@$"])&&obj_map(t.s,function(t){t.off()}),n):void 0};var i,r=e.obj,u=(r.has,r.del),a=(r.to,e.val.rel),s=function(){}})(t,"./on"),t(function(){function n(t,n){n.off(),t.err||e!==t.put||this.not&&this.not.call(t.gun,t.get,function(){o.log("Please report this bug on https://gitter.im/amark/gun and in the issues."),need.to.implement})}var e,i=t("./core");i.chain.not=function(t){return i.log.once("nottobe","Warning: `.not` to be removed from core (but available as an extension), use `.val` instead, which now supports (v0.7.x+) 'not found data' as `undefined` data in callbacks. If you are opposed to this, please voice your opinion in https://gitter.im/amark/gun and ask others."),this.get(n,{not:t})}})(t,"./not"),t(function(){function n(t){t.put&&!e.val.is(t.put)&&(this.as.val&&this.off(),r(t.put,o,{cat:this.as,gun:t.gun}),this.to.next(t))}function o(t,n){if(a!==n){var o=this.cat,e=this.gun.get(n),i=e._;(i.echo||(i.echo={}))[o.id]=o}}var e=t("./core");e.chain.map=function(t){var o,r=this,a=r._;return t?(e.log.once("mapfn","Map functions are experimental, their behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it."),o=r.chain(),r.map().on(function(n,r,a,s){var f=(t||u).call(this,n,r,a,s);if(i!==f)return e.is(f)?void o._.on("in",f._):void o._.on("in",{get:r,put:f,gun:o})}),o):(o=a.fields)?o:(o=a.fields=r.chain(),o._.val=r.back("val"),r.on("in",n,o._),o)};var i,r=e.obj.map,u=function(){},a=e.node._})(t,"./map"),t(function(){var n=t("./core");n.chain.set=function(t,o,e){var i,r=this;return o=o||function(){},(i=n.node.soul(t))?r.set(r.back(-1).get(i),o,e):n.is(t)?(t.get("_").get(function(t,i){!t.gun||!t.gun._.back,i.off(),t=t.gun._.back._;var u={},a=t.put,s=n.node.soul(a);return s?void r.put(n.obj.put(u,s,n.val.rel.ify(s)),o,e):o.call(r,{err:n.log('Only a node can be linked! Not "'+a+'"!')})},{wait:0}),t):n.obj.is(t)?r.set(r._.root.put(t),o,e):r.get(n.text.random()).put(t)}})(t,"./set"),t(function(){if("undefined"!=typeof Gun){var t,n=function(){};"undefined"!=typeof window&&(t=window);var o,e=t.localStorage||{setItem:n,removeItem:n,getItem:n},i={},r={},u=0,a=1e4;Gun.on("put",function(t){function n(){clearTimeout(o);var n=i,a=r;u=0,o=!1,i={},r={},Gun.obj.map(a,function(t,n){t=l[n]||a[n]||t;try{e.setItem(f.prefix+n,JSON.stringify(t))}catch(o){s=o||"localStorage failure"}}),Gun.obj.empty(t.gun.back("opt.peers"))&&Gun.obj.map(n,function(t,n){t.on("in",{"@":n,err:s,ok:0})})}var s,f,c=t.gun._.root;this.to.next(t),(f={}).prefix=(t.opt||f).prefix||t.gun.back("opt.prefix")||"gun/";var l=c._.graph;return Gun.obj.map(t.put,function(t,n){r[n]=r[n]||l[n]||t}),u+=1,i[t["#"]]=c,u>=a?n():void(o||(clearTimeout(o),o=setTimeout(n,1e3)))}),Gun.on("get",function(t){this.to.next(t);var n,o,i,u,a=t.gun,s=t.get;if((i=t.opt||{}).prefix=i.prefix||t.gun.back("opt.prefix")||"gun/",s&&(n=s[Gun._.soul])){var f=s["."];o=Gun.obj.ify(e.getItem(i.prefix+n)||null)||r[n]||u,o&&f&&(o=Gun.state.to(o,f)),(o||Gun.obj.empty(a.back("opt.peers")))&&a.on("in",{"@":t["#"],put:Gun.graph.node(o),how:"lS"})}})}})(t,"./adapters/localStorage"),t(function(){function n(t){var n=a,o=this,i=t.wire||e(t,o);return o.wsp&&o.wsp.count++,i?i.readyState===i.OPEN?void i.send(n):void(t.queue=t.queue||[]).push(n):void 0}function o(t,n,e){if(e&&t){try{t=JSON.parse(t.data||t)}catch(i){}if(t instanceof Array)for(var r,u=0;r=t[u++];)o(r,n,e);else e.wsp&&1===e.wsp.count&&((t.body||t).wsp=f),e.gun.on("in",t.body||t)}}function e(t,e){if(t&&t.url){var s=t.url.replace("http","ws"),f=t.wire=new u(s,e.opt.wsc.protocols,e.opt.wsc);return f.onclose=function(){i(t,e)},f.onerror=function(n){i(t,e),n&&"ECONNREFUSED"===n.code},f.onopen=function(){var o=t.queue;t.queue=[],r.obj.map(o,function(o){a=o,n.call(e,t)})},f.onmessage=function(n){o(n,t,e)},f}}function i(t,n){clearTimeout(t.defer),t.defer=setTimeout(function(){e(t,n)},2e3)}var r=t("./core");if("undefined"==typeof JSON)throw new Error("Gun depends on JSON. Please load it first:\najax.cdnjs.com/ajax/libs/json2/20110223/json2.js");var u;if("undefined"!=typeof window){u=window.WebSocket||window.webkitWebSocket||window.mozWebSocket;var a,s,f=function(){};r.on("out",function(t){this.to.next(t);var o=t.gun._.root._,e=o.wsp||(o.wsp={});if(!t.wsp||1!==e.count){if(a=JSON.stringify(t),o.udrain)return void o.udrain.push(a);o.udrain=[],clearTimeout(s),s=setTimeout(function(){if(o.udrain){var t=o.udrain;o.udrain=null,t.length&&(a=JSON.stringify(t),r.obj.map(o.opt.peers,n,o))}},1),e.count=0,r.obj.map(o.opt.peers,n,o)}})}})(t,"./polyfill/request")}();
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],9:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":10}],10:[function(require,module,exports){
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

},{"./ponyfill":11}],11:[function(require,module,exports){
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
},{}],12:[function(require,module,exports){
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
        this.v = t;
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

},{"../index":13}],13:[function(require,module,exports){
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
        if (p.up(t, this.i)) {
            var a = p.vals;
            var l = a.length;
            var b = Array(l);
            for (var i = 0; i < l; ++i)
                b[i] = a[i];
            out._n(b);
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
     * @param {Array|PromiseLike|Observable} input The input to make a stream from.
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
     * @param {PromiseLike} promise The promise to be converted as a stream.
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
        return new (this.ctor())(new MapOp(project, this));
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
        op.type = 'mapTo';
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
        return new Stream(new Flatten(this));
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

},{"symbol-observable":9}],14:[function(require,module,exports){
var lib = require('../../lib/index');
var run = require('@cycle/run').run;
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
            return function command(gunInstance) {
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

        it('GunSource has select, shallow, each methods', function () {
            assert.strictEqual(typeof sources.gun.select, 'function');
            assert.strictEqual(typeof sources.gun.shallow, 'function');
            assert.strictEqual(typeof sources.gun.each, 'function');
        });

        it('gets inbound stream from gun', function () {
            var get$ = sources.gun
                .select('example').select('todo').select('data')
                .shallow();

            get$.addListener({
                next: function (event) {
                    console.log(event)
                    assert.strictEqual(typeof event, 'object');
                }
            });
        });

        it('checks data elements are same as those sent', function () {
            var get$ = sources.gun
                .select('example').select('todo').select('data')
                .shallow();

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
        gun: makeGunDriver({root: '/'})
    }

    run(main, drivers)

});
},{"../../lib/index":2,"@cycle/run":4,"deep-equal":5,"xstream":13,"xstream/extra/dropRepeats":12}]},{},[14])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvY3ljbGUtZ3VuLmpzIiwibGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9ydW4vbGliL2FkYXB0LmpzIiwibm9kZV9tb2R1bGVzL0BjeWNsZS9ydW4vbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RlZXAtZXF1YWwvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVlcC1lcXVhbC9saWIvaXNfYXJndW1lbnRzLmpzIiwibm9kZV9tb2R1bGVzL2RlZXAtZXF1YWwvbGliL2tleXMuanMiLCJub2RlX21vZHVsZXMvZ3VuL2d1bi5taW4uanMiLCJub2RlX21vZHVsZXMvc3ltYm9sLW9ic2VydmFibGUvaW5kZXguanMiLCJub2RlX21vZHVsZXMvc3ltYm9sLW9ic2VydmFibGUvbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3N5bWJvbC1vYnNlcnZhYmxlL2xpYi9wb255ZmlsbC5qcyIsIm5vZGVfbW9kdWxlcy94c3RyZWFtL2V4dHJhL2Ryb3BSZXBlYXRzLmpzIiwibm9kZV9tb2R1bGVzL3hzdHJlYW0vaW5kZXguanMiLCJ0ZXN0L2Jyb3dzZXIvaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDVEE7Ozs7QUNBQTtBQUNBOzs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDenREQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgeHN0cmVhbV8xID0gcmVxdWlyZShcInhzdHJlYW1cIik7XG52YXIgR3VuID0gcmVxdWlyZShcImd1blwiKTtcbnZhciBHdW5Tb3VyY2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEd1blNvdXJjZShndW4sIHBhdGgpIHtcbiAgICAgICAgdGhpcy5ndW4gPSBndW47XG4gICAgICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gICAgfVxuICAgIEd1blNvdXJjZS5wcm90b3R5cGUuc2VsZWN0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICByZXR1cm4gbmV3IEd1blNvdXJjZSh0aGlzLmd1biwgdGhpcy5wYXRoLmNvbmNhdChrZXkpKTtcbiAgICB9O1xuICAgIEd1blNvdXJjZS5wcm90b3R5cGUuc2hhbGxvdyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICByZXR1cm4geHN0cmVhbV8xLmRlZmF1bHQuY3JlYXRlKHtcbiAgICAgICAgICAgIHN0YXJ0OiBmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICAoX2EgPSBzZWxmLmd1bikucGF0aC5hcHBseShfYSwgc2VsZi5wYXRoKS5vbihmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lci5uZXh0KHgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHZhciBfYTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9O1xuICAgIEd1blNvdXJjZS5wcm90b3R5cGUuZWFjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICByZXR1cm4geHN0cmVhbV8xLmRlZmF1bHQuY3JlYXRlKHtcbiAgICAgICAgICAgIHN0YXJ0OiBmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICAoX2EgPSBzZWxmLmd1bikucGF0aC5hcHBseShfYSwgc2VsZi5wYXRoKS5tYXAoKS5vbihmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lci5uZXh0KHsga2V5OiBrZXksIHZhbHVlOiB2YWx1ZSB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB2YXIgX2E7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICByZXR1cm4gR3VuU291cmNlO1xufSgpKTtcbmV4cG9ydHMuR3VuU291cmNlID0gR3VuU291cmNlO1xuZnVuY3Rpb24gbWFrZUd1bkRyaXZlcihvcHRzKSB7XG4gICAgdmFyIGd1biA9IEd1bihvcHRzKS5nZXQob3B0cy5yb290KTtcbiAgICBmdW5jdGlvbiBwcm9jZXNzVHJhbnNmb3JtKGlucHV0RnVuY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGlucHV0RnVuY3Rpb24oZ3VuKTtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGd1bkRyaXZlcihzaW5rKSB7XG4gICAgICAgIHNpbmsuYWRkTGlzdGVuZXIoe1xuICAgICAgICAgICAgbmV4dDogZnVuY3Rpb24gKHRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9jZXNzVHJhbnNmb3JtKHRyYW5zZm9ybSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG5ldyBHdW5Tb3VyY2UoZ3VuLCBbXSk7XG4gICAgfTtcbn1cbmV4cG9ydHMubWFrZUd1bkRyaXZlciA9IG1ha2VHdW5Ecml2ZXI7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1jeWNsZS1ndW4uanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgY3ljbGVfZ3VuXzEgPSByZXF1aXJlKFwiLi9jeWNsZS1ndW5cIik7XG5leHBvcnRzLm1ha2VHdW5Ecml2ZXIgPSBjeWNsZV9ndW5fMS5tYWtlR3VuRHJpdmVyO1xuZXhwb3J0cy5HdW5Tb3VyY2UgPSBjeWNsZV9ndW5fMS5HdW5Tb3VyY2U7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbnZhciBhZGFwdFN0cmVhbSA9IGZ1bmN0aW9uICh4KSB7IHJldHVybiB4OyB9O1xuZnVuY3Rpb24gc2V0QWRhcHQoZikge1xuICAgIGFkYXB0U3RyZWFtID0gZjtcbn1cbmV4cG9ydHMuc2V0QWRhcHQgPSBzZXRBZGFwdDtcbmZ1bmN0aW9uIGFkYXB0KHN0cmVhbSkge1xuICAgIHJldHVybiBhZGFwdFN0cmVhbShzdHJlYW0pO1xufVxuZXhwb3J0cy5hZGFwdCA9IGFkYXB0O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YWRhcHQuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG52YXIgeHN0cmVhbV8xID0gcmVxdWlyZShcInhzdHJlYW1cIik7XG52YXIgYWRhcHRfMSA9IHJlcXVpcmUoXCIuL2FkYXB0XCIpO1xuZnVuY3Rpb24gbG9nVG9Db25zb2xlRXJyb3IoZXJyKSB7XG4gICAgdmFyIHRhcmdldCA9IGVyci5zdGFjayB8fCBlcnI7XG4gICAgaWYgKGNvbnNvbGUgJiYgY29uc29sZS5lcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKHRhcmdldCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNvbnNvbGUgJiYgY29uc29sZS5sb2cpIHtcbiAgICAgICAgY29uc29sZS5sb2codGFyZ2V0KTtcbiAgICB9XG59XG5mdW5jdGlvbiBtYWtlU2lua1Byb3hpZXMoZHJpdmVycykge1xuICAgIHZhciBzaW5rUHJveGllcyA9IHt9O1xuICAgIGZvciAodmFyIG5hbWVfMSBpbiBkcml2ZXJzKSB7XG4gICAgICAgIGlmIChkcml2ZXJzLmhhc093blByb3BlcnR5KG5hbWVfMSkpIHtcbiAgICAgICAgICAgIHNpbmtQcm94aWVzW25hbWVfMV0gPSB4c3RyZWFtXzEuZGVmYXVsdC5jcmVhdGVXaXRoTWVtb3J5KCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNpbmtQcm94aWVzO1xufVxuZnVuY3Rpb24gY2FsbERyaXZlcnMoZHJpdmVycywgc2lua1Byb3hpZXMpIHtcbiAgICB2YXIgc291cmNlcyA9IHt9O1xuICAgIGZvciAodmFyIG5hbWVfMiBpbiBkcml2ZXJzKSB7XG4gICAgICAgIGlmIChkcml2ZXJzLmhhc093blByb3BlcnR5KG5hbWVfMikpIHtcbiAgICAgICAgICAgIHNvdXJjZXNbbmFtZV8yXSA9IGRyaXZlcnNbbmFtZV8yXShzaW5rUHJveGllc1tuYW1lXzJdLCBuYW1lXzIpO1xuICAgICAgICAgICAgaWYgKHNvdXJjZXNbbmFtZV8yXSAmJiB0eXBlb2Ygc291cmNlc1tuYW1lXzJdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIHNvdXJjZXNbbmFtZV8yXS5faXNDeWNsZVNvdXJjZSA9IG5hbWVfMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc291cmNlcztcbn1cbi8vIE5PVEU6IHRoaXMgd2lsbCBtdXRhdGUgYHNvdXJjZXNgLlxuZnVuY3Rpb24gYWRhcHRTb3VyY2VzKHNvdXJjZXMpIHtcbiAgICBmb3IgKHZhciBuYW1lXzMgaW4gc291cmNlcykge1xuICAgICAgICBpZiAoc291cmNlcy5oYXNPd25Qcm9wZXJ0eShuYW1lXzMpXG4gICAgICAgICAgICAmJiBzb3VyY2VzW25hbWVfM11cbiAgICAgICAgICAgICYmIHR5cGVvZiBzb3VyY2VzW25hbWVfM11bJ3NoYW1lZnVsbHlTZW5kTmV4dCddID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBzb3VyY2VzW25hbWVfM10gPSBhZGFwdF8xLmFkYXB0KHNvdXJjZXNbbmFtZV8zXSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNvdXJjZXM7XG59XG5mdW5jdGlvbiByZXBsaWNhdGVNYW55KHNpbmtzLCBzaW5rUHJveGllcykge1xuICAgIHZhciBzaW5rTmFtZXMgPSBPYmplY3Qua2V5cyhzaW5rcykuZmlsdGVyKGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiAhIXNpbmtQcm94aWVzW25hbWVdOyB9KTtcbiAgICB2YXIgYnVmZmVycyA9IHt9O1xuICAgIHZhciByZXBsaWNhdG9ycyA9IHt9O1xuICAgIHNpbmtOYW1lcy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIGJ1ZmZlcnNbbmFtZV0gPSB7IF9uOiBbXSwgX2U6IFtdIH07XG4gICAgICAgIHJlcGxpY2F0b3JzW25hbWVdID0ge1xuICAgICAgICAgICAgbmV4dDogZnVuY3Rpb24gKHgpIHsgcmV0dXJuIGJ1ZmZlcnNbbmFtZV0uX24ucHVzaCh4KTsgfSxcbiAgICAgICAgICAgIGVycm9yOiBmdW5jdGlvbiAoZXJyKSB7IHJldHVybiBidWZmZXJzW25hbWVdLl9lLnB1c2goZXJyKTsgfSxcbiAgICAgICAgICAgIGNvbXBsZXRlOiBmdW5jdGlvbiAoKSB7IH0sXG4gICAgICAgIH07XG4gICAgfSk7XG4gICAgdmFyIHN1YnNjcmlwdGlvbnMgPSBzaW5rTmFtZXNcbiAgICAgICAgLm1hcChmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4geHN0cmVhbV8xLmRlZmF1bHQuZnJvbU9ic2VydmFibGUoc2lua3NbbmFtZV0pLnN1YnNjcmliZShyZXBsaWNhdG9yc1tuYW1lXSk7IH0pO1xuICAgIHNpbmtOYW1lcy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBsaXN0ZW5lciA9IHNpbmtQcm94aWVzW25hbWVdO1xuICAgICAgICB2YXIgbmV4dCA9IGZ1bmN0aW9uICh4KSB7IGxpc3RlbmVyLl9uKHgpOyB9O1xuICAgICAgICB2YXIgZXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7IGxvZ1RvQ29uc29sZUVycm9yKGVycik7IGxpc3RlbmVyLl9lKGVycik7IH07XG4gICAgICAgIGJ1ZmZlcnNbbmFtZV0uX24uZm9yRWFjaChuZXh0KTtcbiAgICAgICAgYnVmZmVyc1tuYW1lXS5fZS5mb3JFYWNoKGVycm9yKTtcbiAgICAgICAgcmVwbGljYXRvcnNbbmFtZV0ubmV4dCA9IG5leHQ7XG4gICAgICAgIHJlcGxpY2F0b3JzW25hbWVdLmVycm9yID0gZXJyb3I7XG4gICAgICAgIC8vIGJlY2F1c2Ugc2luay5zdWJzY3JpYmUocmVwbGljYXRvcikgaGFkIG11dGF0ZWQgcmVwbGljYXRvciB0byBhZGRcbiAgICAgICAgLy8gX24sIF9lLCBfYywgd2UgbXVzdCBhbHNvIHVwZGF0ZSB0aGVzZTpcbiAgICAgICAgcmVwbGljYXRvcnNbbmFtZV0uX24gPSBuZXh0O1xuICAgICAgICByZXBsaWNhdG9yc1tuYW1lXS5fZSA9IGVycm9yO1xuICAgIH0pO1xuICAgIGJ1ZmZlcnMgPSBudWxsOyAvLyBmcmVlIHVwIGZvciBHQ1xuICAgIHJldHVybiBmdW5jdGlvbiBkaXNwb3NlUmVwbGljYXRpb24oKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbnMuZm9yRWFjaChmdW5jdGlvbiAocykgeyByZXR1cm4gcy51bnN1YnNjcmliZSgpOyB9KTtcbiAgICAgICAgc2lua05hbWVzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIHNpbmtQcm94aWVzW25hbWVdLl9jKCk7IH0pO1xuICAgIH07XG59XG5mdW5jdGlvbiBkaXNwb3NlU291cmNlcyhzb3VyY2VzKSB7XG4gICAgZm9yICh2YXIgayBpbiBzb3VyY2VzKSB7XG4gICAgICAgIGlmIChzb3VyY2VzLmhhc093blByb3BlcnR5KGspICYmIHNvdXJjZXNba10gJiYgc291cmNlc1trXS5kaXNwb3NlKSB7XG4gICAgICAgICAgICBzb3VyY2VzW2tdLmRpc3Bvc2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIGlzT2JqZWN0RW1wdHkob2JqKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubGVuZ3RoID09PSAwO1xufVxuLyoqXG4gKiBBIGZ1bmN0aW9uIHRoYXQgcHJlcGFyZXMgdGhlIEN5Y2xlIGFwcGxpY2F0aW9uIHRvIGJlIGV4ZWN1dGVkLiBUYWtlcyBhIGBtYWluYFxuICogZnVuY3Rpb24gYW5kIHByZXBhcmVzIHRvIGNpcmN1bGFybHkgY29ubmVjdHMgaXQgdG8gdGhlIGdpdmVuIGNvbGxlY3Rpb24gb2ZcbiAqIGRyaXZlciBmdW5jdGlvbnMuIEFzIGFuIG91dHB1dCwgYHNldHVwKClgIHJldHVybnMgYW4gb2JqZWN0IHdpdGggdGhyZWVcbiAqIHByb3BlcnRpZXM6IGBzb3VyY2VzYCwgYHNpbmtzYCBhbmQgYHJ1bmAuIE9ubHkgd2hlbiBgcnVuKClgIGlzIGNhbGxlZCB3aWxsXG4gKiB0aGUgYXBwbGljYXRpb24gYWN0dWFsbHkgZXhlY3V0ZS4gUmVmZXIgdG8gdGhlIGRvY3VtZW50YXRpb24gb2YgYHJ1bigpYCBmb3JcbiAqIG1vcmUgZGV0YWlscy5cbiAqXG4gKiAqKkV4YW1wbGU6KipcbiAqIGBgYGpzXG4gKiBpbXBvcnQge3NldHVwfSBmcm9tICdAY3ljbGUvcnVuJztcbiAqIGNvbnN0IHtzb3VyY2VzLCBzaW5rcywgcnVufSA9IHNldHVwKG1haW4sIGRyaXZlcnMpO1xuICogLy8gLi4uXG4gKiBjb25zdCBkaXNwb3NlID0gcnVuKCk7IC8vIEV4ZWN1dGVzIHRoZSBhcHBsaWNhdGlvblxuICogLy8gLi4uXG4gKiBkaXNwb3NlKCk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBtYWluIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBgc291cmNlc2AgYXMgaW5wdXQgYW5kIG91dHB1dHNcbiAqIGBzaW5rc2AuXG4gKiBAcGFyYW0ge09iamVjdH0gZHJpdmVycyBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgZHJpdmVyIG5hbWVzIGFuZCB2YWx1ZXNcbiAqIGFyZSBkcml2ZXIgZnVuY3Rpb25zLlxuICogQHJldHVybiB7T2JqZWN0fSBhbiBvYmplY3Qgd2l0aCB0aHJlZSBwcm9wZXJ0aWVzOiBgc291cmNlc2AsIGBzaW5rc2AgYW5kXG4gKiBgcnVuYC4gYHNvdXJjZXNgIGlzIHRoZSBjb2xsZWN0aW9uIG9mIGRyaXZlciBzb3VyY2VzLCBgc2lua3NgIGlzIHRoZVxuICogY29sbGVjdGlvbiBvZiBkcml2ZXIgc2lua3MsIHRoZXNlIGNhbiBiZSB1c2VkIGZvciBkZWJ1Z2dpbmcgb3IgdGVzdGluZy4gYHJ1bmBcbiAqIGlzIHRoZSBmdW5jdGlvbiB0aGF0IG9uY2UgY2FsbGVkIHdpbGwgZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24uXG4gKiBAZnVuY3Rpb24gc2V0dXBcbiAqL1xuZnVuY3Rpb24gc2V0dXAobWFpbiwgZHJpdmVycykge1xuICAgIGlmICh0eXBlb2YgbWFpbiAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkZpcnN0IGFyZ3VtZW50IGdpdmVuIHRvIEN5Y2xlIG11c3QgYmUgdGhlICdtYWluJyBcIiArXG4gICAgICAgICAgICBcImZ1bmN0aW9uLlwiKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBkcml2ZXJzICE9PSBcIm9iamVjdFwiIHx8IGRyaXZlcnMgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2Vjb25kIGFyZ3VtZW50IGdpdmVuIHRvIEN5Y2xlIG11c3QgYmUgYW4gb2JqZWN0IFwiICtcbiAgICAgICAgICAgIFwid2l0aCBkcml2ZXIgZnVuY3Rpb25zIGFzIHByb3BlcnRpZXMuXCIpO1xuICAgIH1cbiAgICBpZiAoaXNPYmplY3RFbXB0eShkcml2ZXJzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTZWNvbmQgYXJndW1lbnQgZ2l2ZW4gdG8gQ3ljbGUgbXVzdCBiZSBhbiBvYmplY3QgXCIgK1xuICAgICAgICAgICAgXCJ3aXRoIGF0IGxlYXN0IG9uZSBkcml2ZXIgZnVuY3Rpb24gZGVjbGFyZWQgYXMgYSBwcm9wZXJ0eS5cIik7XG4gICAgfVxuICAgIHZhciBzaW5rUHJveGllcyA9IG1ha2VTaW5rUHJveGllcyhkcml2ZXJzKTtcbiAgICB2YXIgc291cmNlcyA9IGNhbGxEcml2ZXJzKGRyaXZlcnMsIHNpbmtQcm94aWVzKTtcbiAgICB2YXIgYWRhcHRlZFNvdXJjZXMgPSBhZGFwdFNvdXJjZXMoc291cmNlcyk7XG4gICAgdmFyIHNpbmtzID0gbWFpbihhZGFwdGVkU291cmNlcyk7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5DeWNsZWpzID0gd2luZG93LkN5Y2xlanMgfHwge307XG4gICAgICAgIHdpbmRvdy5DeWNsZWpzLnNpbmtzID0gc2lua3M7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJ1bigpIHtcbiAgICAgICAgdmFyIGRpc3Bvc2VSZXBsaWNhdGlvbiA9IHJlcGxpY2F0ZU1hbnkoc2lua3MsIHNpbmtQcm94aWVzKTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIGRpc3Bvc2UoKSB7XG4gICAgICAgICAgICBkaXNwb3NlU291cmNlcyhzb3VyY2VzKTtcbiAgICAgICAgICAgIGRpc3Bvc2VSZXBsaWNhdGlvbigpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICA7XG4gICAgcmV0dXJuIHsgc2lua3M6IHNpbmtzLCBzb3VyY2VzOiBzb3VyY2VzLCBydW46IHJ1biB9O1xufVxuZXhwb3J0cy5zZXR1cCA9IHNldHVwO1xuLyoqXG4gKiBUYWtlcyBhIGBtYWluYCBmdW5jdGlvbiBhbmQgY2lyY3VsYXJseSBjb25uZWN0cyBpdCB0byB0aGUgZ2l2ZW4gY29sbGVjdGlvblxuICogb2YgZHJpdmVyIGZ1bmN0aW9ucy5cbiAqXG4gKiAqKkV4YW1wbGU6KipcbiAqIGBgYGpzXG4gKiBpbXBvcnQgcnVuIGZyb20gJ0BjeWNsZS9ydW4nO1xuICogY29uc3QgZGlzcG9zZSA9IHJ1bihtYWluLCBkcml2ZXJzKTtcbiAqIC8vIC4uLlxuICogZGlzcG9zZSgpO1xuICogYGBgXG4gKlxuICogVGhlIGBtYWluYCBmdW5jdGlvbiBleHBlY3RzIGEgY29sbGVjdGlvbiBvZiBcInNvdXJjZVwiIHN0cmVhbXMgKHJldHVybmVkIGZyb21cbiAqIGRyaXZlcnMpIGFzIGlucHV0LCBhbmQgc2hvdWxkIHJldHVybiBhIGNvbGxlY3Rpb24gb2YgXCJzaW5rXCIgc3RyZWFtcyAodG8gYmVcbiAqIGdpdmVuIHRvIGRyaXZlcnMpLiBBIFwiY29sbGVjdGlvbiBvZiBzdHJlYW1zXCIgaXMgYSBKYXZhU2NyaXB0IG9iamVjdCB3aGVyZVxuICoga2V5cyBtYXRjaCB0aGUgZHJpdmVyIG5hbWVzIHJlZ2lzdGVyZWQgYnkgdGhlIGBkcml2ZXJzYCBvYmplY3QsIGFuZCB2YWx1ZXNcbiAqIGFyZSB0aGUgc3RyZWFtcy4gUmVmZXIgdG8gdGhlIGRvY3VtZW50YXRpb24gb2YgZWFjaCBkcml2ZXIgdG8gc2VlIG1vcmVcbiAqIGRldGFpbHMgb24gd2hhdCB0eXBlcyBvZiBzb3VyY2VzIGl0IG91dHB1dHMgYW5kIHNpbmtzIGl0IHJlY2VpdmVzLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG1haW4gYSBmdW5jdGlvbiB0aGF0IHRha2VzIGBzb3VyY2VzYCBhcyBpbnB1dCBhbmQgb3V0cHV0c1xuICogYHNpbmtzYC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBkcml2ZXJzIGFuIG9iamVjdCB3aGVyZSBrZXlzIGFyZSBkcml2ZXIgbmFtZXMgYW5kIHZhbHVlc1xuICogYXJlIGRyaXZlciBmdW5jdGlvbnMuXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gYSBkaXNwb3NlIGZ1bmN0aW9uLCB1c2VkIHRvIHRlcm1pbmF0ZSB0aGUgZXhlY3V0aW9uIG9mIHRoZVxuICogQ3ljbGUuanMgcHJvZ3JhbSwgY2xlYW5pbmcgdXAgcmVzb3VyY2VzIHVzZWQuXG4gKiBAZnVuY3Rpb24gcnVuXG4gKi9cbmZ1bmN0aW9uIHJ1bihtYWluLCBkcml2ZXJzKSB7XG4gICAgdmFyIF9hID0gc2V0dXAobWFpbiwgZHJpdmVycyksIHJ1biA9IF9hLnJ1biwgc2lua3MgPSBfYS5zaW5rcztcbiAgICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93WydDeWNsZWpzRGV2VG9vbF9zdGFydEdyYXBoU2VyaWFsaXplciddKSB7XG4gICAgICAgIHdpbmRvd1snQ3ljbGVqc0RldlRvb2xfc3RhcnRHcmFwaFNlcmlhbGl6ZXInXShzaW5rcyk7XG4gICAgfVxuICAgIHJldHVybiBydW4oKTtcbn1cbmV4cG9ydHMucnVuID0gcnVuO1xuZXhwb3J0cy5kZWZhdWx0ID0gcnVuO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwidmFyIHBTbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBvYmplY3RLZXlzID0gcmVxdWlyZSgnLi9saWIva2V5cy5qcycpO1xudmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi9saWIvaXNfYXJndW1lbnRzLmpzJyk7XG5cbnZhciBkZWVwRXF1YWwgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhY3R1YWwsIGV4cGVjdGVkLCBvcHRzKSB7XG4gIGlmICghb3B0cykgb3B0cyA9IHt9O1xuICAvLyA3LjEuIEFsbCBpZGVudGljYWwgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2UgaWYgKGFjdHVhbCBpbnN0YW5jZW9mIERhdGUgJiYgZXhwZWN0ZWQgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5nZXRUaW1lKCkgPT09IGV4cGVjdGVkLmdldFRpbWUoKTtcblxuICAvLyA3LjMuIE90aGVyIHBhaXJzIHRoYXQgZG8gbm90IGJvdGggcGFzcyB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcsXG4gIC8vIGVxdWl2YWxlbmNlIGlzIGRldGVybWluZWQgYnkgPT0uXG4gIH0gZWxzZSBpZiAoIWFjdHVhbCB8fCAhZXhwZWN0ZWQgfHwgdHlwZW9mIGFjdHVhbCAhPSAnb2JqZWN0JyAmJiB0eXBlb2YgZXhwZWN0ZWQgIT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gb3B0cy5zdHJpY3QgPyBhY3R1YWwgPT09IGV4cGVjdGVkIDogYWN0dWFsID09IGV4cGVjdGVkO1xuXG4gIC8vIDcuNC4gRm9yIGFsbCBvdGhlciBPYmplY3QgcGFpcnMsIGluY2x1ZGluZyBBcnJheSBvYmplY3RzLCBlcXVpdmFsZW5jZSBpc1xuICAvLyBkZXRlcm1pbmVkIGJ5IGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoYXMgdmVyaWZpZWRcbiAgLy8gd2l0aCBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwpLCB0aGUgc2FtZSBzZXQgb2Yga2V5c1xuICAvLyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSwgZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5XG4gIC8vIGNvcnJlc3BvbmRpbmcga2V5LCBhbmQgYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LiBOb3RlOiB0aGlzXG4gIC8vIGFjY291bnRzIGZvciBib3RoIG5hbWVkIGFuZCBpbmRleGVkIHByb3BlcnRpZXMgb24gQXJyYXlzLlxuICB9IGVsc2Uge1xuICAgIHJldHVybiBvYmpFcXVpdihhY3R1YWwsIGV4cGVjdGVkLCBvcHRzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNCdWZmZXIgKHgpIHtcbiAgaWYgKCF4IHx8IHR5cGVvZiB4ICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgeC5sZW5ndGggIT09ICdudW1iZXInKSByZXR1cm4gZmFsc2U7XG4gIGlmICh0eXBlb2YgeC5jb3B5ICE9PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiB4LnNsaWNlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh4Lmxlbmd0aCA+IDAgJiYgdHlwZW9mIHhbMF0gIT09ICdudW1iZXInKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBvYmpFcXVpdihhLCBiLCBvcHRzKSB7XG4gIHZhciBpLCBrZXk7XG4gIGlmIChpc1VuZGVmaW5lZE9yTnVsbChhKSB8fCBpc1VuZGVmaW5lZE9yTnVsbChiKSlcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS5cbiAgaWYgKGEucHJvdG90eXBlICE9PSBiLnByb3RvdHlwZSkgcmV0dXJuIGZhbHNlO1xuICAvL35+fkkndmUgbWFuYWdlZCB0byBicmVhayBPYmplY3Qua2V5cyB0aHJvdWdoIHNjcmV3eSBhcmd1bWVudHMgcGFzc2luZy5cbiAgLy8gICBDb252ZXJ0aW5nIHRvIGFycmF5IHNvbHZlcyB0aGUgcHJvYmxlbS5cbiAgaWYgKGlzQXJndW1lbnRzKGEpKSB7XG4gICAgaWYgKCFpc0FyZ3VtZW50cyhiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBhID0gcFNsaWNlLmNhbGwoYSk7XG4gICAgYiA9IHBTbGljZS5jYWxsKGIpO1xuICAgIHJldHVybiBkZWVwRXF1YWwoYSwgYiwgb3B0cyk7XG4gIH1cbiAgaWYgKGlzQnVmZmVyKGEpKSB7XG4gICAgaWYgKCFpc0J1ZmZlcihiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhW2ldICE9PSBiW2ldKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHRyeSB7XG4gICAgdmFyIGthID0gb2JqZWN0S2V5cyhhKSxcbiAgICAgICAga2IgPSBvYmplY3RLZXlzKGIpO1xuICB9IGNhdGNoIChlKSB7Ly9oYXBwZW5zIHdoZW4gb25lIGlzIGEgc3RyaW5nIGxpdGVyYWwgYW5kIHRoZSBvdGhlciBpc24ndFxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBoYXZpbmcgdGhlIHNhbWUgbnVtYmVyIG9mIG93bmVkIHByb3BlcnRpZXMgKGtleXMgaW5jb3Jwb3JhdGVzXG4gIC8vIGhhc093blByb3BlcnR5KVxuICBpZiAoa2EubGVuZ3RoICE9IGtiLmxlbmd0aClcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vdGhlIHNhbWUgc2V0IG9mIGtleXMgKGFsdGhvdWdoIG5vdCBuZWNlc3NhcmlseSB0aGUgc2FtZSBvcmRlciksXG4gIGthLnNvcnQoKTtcbiAga2Iuc29ydCgpO1xuICAvL35+fmNoZWFwIGtleSB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgaWYgKGthW2ldICE9IGtiW2ldKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5IGNvcnJlc3BvbmRpbmcga2V5LCBhbmRcbiAgLy9+fn5wb3NzaWJseSBleHBlbnNpdmUgZGVlcCB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAga2V5ID0ga2FbaV07XG4gICAgaWYgKCFkZWVwRXF1YWwoYVtrZXldLCBiW2tleV0sIG9wdHMpKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHR5cGVvZiBhID09PSB0eXBlb2YgYjtcbn1cbiIsInZhciBzdXBwb3J0c0FyZ3VtZW50c0NsYXNzID0gKGZ1bmN0aW9uKCl7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJndW1lbnRzKVxufSkoKSA9PSAnW29iamVjdCBBcmd1bWVudHNdJztcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gc3VwcG9ydHNBcmd1bWVudHNDbGFzcyA/IHN1cHBvcnRlZCA6IHVuc3VwcG9ydGVkO1xuXG5leHBvcnRzLnN1cHBvcnRlZCA9IHN1cHBvcnRlZDtcbmZ1bmN0aW9uIHN1cHBvcnRlZChvYmplY3QpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmplY3QpID09ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xufTtcblxuZXhwb3J0cy51bnN1cHBvcnRlZCA9IHVuc3VwcG9ydGVkO1xuZnVuY3Rpb24gdW5zdXBwb3J0ZWQob2JqZWN0KXtcbiAgcmV0dXJuIG9iamVjdCAmJlxuICAgIHR5cGVvZiBvYmplY3QgPT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2Ygb2JqZWN0Lmxlbmd0aCA9PSAnbnVtYmVyJyAmJlxuICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdjYWxsZWUnKSAmJlxuICAgICFPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwob2JqZWN0LCAnY2FsbGVlJykgfHxcbiAgICBmYWxzZTtcbn07XG4iLCJleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB0eXBlb2YgT2JqZWN0LmtleXMgPT09ICdmdW5jdGlvbidcbiAgPyBPYmplY3Qua2V5cyA6IHNoaW07XG5cbmV4cG9ydHMuc2hpbSA9IHNoaW07XG5mdW5jdGlvbiBzaGltIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gIHJldHVybiBrZXlzO1xufVxuIiwiIWZ1bmN0aW9uKCl7ZnVuY3Rpb24gdChuKXtmdW5jdGlvbiBvKHQpe3JldHVybiB0LnNwbGl0KFwiL1wiKS5zbGljZSgtMSkudG9TdHJpbmcoKS5yZXBsYWNlKFwiLmpzXCIsXCJcIil9cmV0dXJuIG4uc2xpY2U/dFtvKG4pXTpmdW5jdGlvbihlLGkpe24oZT17ZXhwb3J0czp7fX0pLHRbbyhpKV09ZS5leHBvcnRzfX12YXIgbjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93JiYobj13aW5kb3cpLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWwmJihuPWdsb2JhbCksbj1ufHx7fTt2YXIgbz1uLmNvbnNvbGV8fHtsb2c6ZnVuY3Rpb24oKXt9fTtpZihcInVuZGVmaW5lZFwiIT10eXBlb2YgbW9kdWxlKXZhciBlPW1vZHVsZTt0KGZ1bmN0aW9uKHQpe3ZhciBuPXt9O24uZm5zPW4uZm49e2lzOmZ1bmN0aW9uKHQpe3JldHVybiEhdCYmXCJmdW5jdGlvblwiPT10eXBlb2YgdH19LG4uYmk9e2lzOmZ1bmN0aW9uKHQpe3JldHVybiB0IGluc3RhbmNlb2YgQm9vbGVhbnx8XCJib29sZWFuXCI9PXR5cGVvZiB0fX0sbi5udW09e2lzOmZ1bmN0aW9uKHQpe3JldHVybiFlKHQpJiYodC1wYXJzZUZsb2F0KHQpKzE+PTB8fDEvMD09PXR8fC0oMS8wKT09PXQpfX0sbi50ZXh0PXtpczpmdW5jdGlvbih0KXtyZXR1cm5cInN0cmluZ1wiPT10eXBlb2YgdH19LG4udGV4dC5pZnk9ZnVuY3Rpb24odCl7cmV0dXJuIG4udGV4dC5pcyh0KT90OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBKU09OP0pTT04uc3RyaW5naWZ5KHQpOnQmJnQudG9TdHJpbmc/dC50b1N0cmluZygpOnR9LG4udGV4dC5yYW5kb209ZnVuY3Rpb24odCxuKXt2YXIgbz1cIlwiO2Zvcih0PXR8fDI0LG49bnx8XCIwMTIzNDU2Nzg5QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6XCI7dD4wOylvKz1uLmNoYXJBdChNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqbi5sZW5ndGgpKSx0LS07cmV0dXJuIG99LG4udGV4dC5tYXRjaD1mdW5jdGlvbih0LG8pe2Z1bmN0aW9uIGUodCxuKXtmb3IodmFyIG8sZT0tMSxpPTA7bz1uW2krK107KWlmKCF+KGU9dC5pbmRleE9mKG8sZSsxKSkpcmV0dXJuITE7cmV0dXJuITB9dmFyIGk9ITE7aWYodD10fHxcIlwiLG89bi50ZXh0LmlzKG8pP3tcIj1cIjpvfTpvfHx7fSxuLm9iai5oYXMobyxcIn5cIikmJih0PXQudG9Mb3dlckNhc2UoKSxvW1wiPVwiXT0ob1tcIj1cIl18fG9bXCJ+XCJdKS50b0xvd2VyQ2FzZSgpKSxuLm9iai5oYXMobyxcIj1cIikpcmV0dXJuIHQ9PT1vW1wiPVwiXTtpZihuLm9iai5oYXMobyxcIipcIikpe2lmKHQuc2xpY2UoMCxvW1wiKlwiXS5sZW5ndGgpIT09b1tcIipcIl0pcmV0dXJuITE7aT0hMCx0PXQuc2xpY2Uob1tcIipcIl0ubGVuZ3RoKX1pZihuLm9iai5oYXMobyxcIiFcIikpe2lmKHQuc2xpY2UoLW9bXCIhXCJdLmxlbmd0aCkhPT1vW1wiIVwiXSlyZXR1cm4hMTtpPSEwfWlmKG4ub2JqLmhhcyhvLFwiK1wiKSYmbi5saXN0Lm1hcChuLmxpc3QuaXMob1tcIitcIl0pP29bXCIrXCJdOltvW1wiK1wiXV0sZnVuY3Rpb24obil7cmV0dXJuIHQuaW5kZXhPZihuKT49MD92b2lkKGk9ITApOiEwfSkpcmV0dXJuITE7aWYobi5vYmouaGFzKG8sXCItXCIpJiZuLmxpc3QubWFwKG4ubGlzdC5pcyhvW1wiLVwiXSk/b1tcIi1cIl06W29bXCItXCJdXSxmdW5jdGlvbihuKXtyZXR1cm4gdC5pbmRleE9mKG4pPDA/dm9pZChpPSEwKTohMH0pKXJldHVybiExO2lmKG4ub2JqLmhhcyhvLFwiPlwiKSl7aWYoISh0Pm9bXCI+XCJdKSlyZXR1cm4hMTtpPSEwfWlmKG4ub2JqLmhhcyhvLFwiPFwiKSl7aWYoISh0PG9bXCI8XCJdKSlyZXR1cm4hMTtpPSEwfWlmKG4ub2JqLmhhcyhvLFwiP1wiKSl7aWYoIWUodCxvW1wiP1wiXSkpcmV0dXJuITE7aT0hMH1yZXR1cm4gaX0sbi5saXN0PXtpczpmdW5jdGlvbih0KXtyZXR1cm4gdCBpbnN0YW5jZW9mIEFycmF5fX0sbi5saXN0LnNsaXQ9QXJyYXkucHJvdG90eXBlLnNsaWNlLG4ubGlzdC5zb3J0PWZ1bmN0aW9uKHQpe3JldHVybiBmdW5jdGlvbihuLG8pe3JldHVybiBuJiZvPyhuPW5bdF0sbz1vW3RdLG8+bj8tMTpuPm8/MTowKTowfX0sbi5saXN0Lm1hcD1mdW5jdGlvbih0LG4sbyl7cmV0dXJuIGEodCxuLG8pfSxuLmxpc3QuaW5kZXg9MSxuLm9iaj17aXM6ZnVuY3Rpb24odCl7cmV0dXJuIHQ/dCBpbnN0YW5jZW9mIE9iamVjdCYmdC5jb25zdHJ1Y3Rvcj09PU9iamVjdHx8XCJPYmplY3RcIj09PU9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh0KS5tYXRjaCgvXlxcW29iamVjdCAoXFx3KylcXF0kLylbMV06ITF9fSxuLm9iai5wdXQ9ZnVuY3Rpb24odCxuLG8pe3JldHVybih0fHx7fSlbbl09byx0fSxuLm9iai5oYXM9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdCYmT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHQsbil9LG4ub2JqLmRlbD1mdW5jdGlvbih0LG4pe3JldHVybiB0Pyh0W25dPW51bGwsZGVsZXRlIHRbbl0sdCk6dm9pZCAwfSxuLm9iai5hcz1mdW5jdGlvbih0LG4sbyxlKXtyZXR1cm4gdFtuXT10W25dfHwoZT09PW8/e306byl9LG4ub2JqLmlmeT1mdW5jdGlvbih0KXtpZihyKHQpKXJldHVybiB0O3RyeXt0PUpTT04ucGFyc2UodCl9Y2F0Y2gobil7dD17fX1yZXR1cm4gdH0sZnVuY3Rpb24oKXtmdW5jdGlvbiB0KHQsbil7dSh0aGlzLG4pJiZvIT09dGhpc1tuXXx8KHRoaXNbbl09dCl9dmFyIG87bi5vYmoudG89ZnVuY3Rpb24obixvKXtyZXR1cm4gbz1vfHx7fSxhKG4sdCxvKSxvfX0oKSxuLm9iai5jb3B5PWZ1bmN0aW9uKHQpe3JldHVybiB0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnR9LGZ1bmN0aW9uKCl7ZnVuY3Rpb24gdCh0LG4pe3ZhciBvPXRoaXMubjtpZighb3x8IShuPT09b3x8cihvKSYmdShvLG4pKSlyZXR1cm4gbj8hMDp2b2lkIDB9bi5vYmouZW1wdHk9ZnVuY3Rpb24obixvKXtyZXR1cm4gbiYmYShuLHQse246b30pPyExOiEwfX0oKSxmdW5jdGlvbigpe2Z1bmN0aW9uIHQobixvKXtyZXR1cm4gMj09PWFyZ3VtZW50cy5sZW5ndGg/KHQucj10LnJ8fHt9LHZvaWQodC5yW25dPW8pKToodC5yPXQucnx8W10sdm9pZCB0LnIucHVzaChuKSl9dmFyIGk9T2JqZWN0LmtleXM7bi5vYmoubWFwPWZ1bmN0aW9uKGEscyxmKXt2YXIgYyxsLHAsZCxnLGg9MCx2PW8ocyk7aWYodC5yPW51bGwsaSYmcihhKSYmKGQ9T2JqZWN0LmtleXMoYSksZz0hMCksZShhKXx8ZClmb3IobD0oZHx8YSkubGVuZ3RoO2w+aDtoKyspe3ZhciBfPWgrbi5saXN0LmluZGV4O2lmKHYpe2lmKHA9Zz9zLmNhbGwoZnx8dGhpcyxhW2RbaF1dLGRbaF0sdCk6cy5jYWxsKGZ8fHRoaXMsYVtoXSxfLHQpLHAhPT1jKXJldHVybiBwfWVsc2UgaWYocz09PWFbZz9kW2hdOmhdKXJldHVybiBkP2RbaF06X31lbHNlIGZvcihoIGluIGEpaWYodil7aWYodShhLGgpJiYocD1mP3MuY2FsbChmLGFbaF0saCx0KTpzKGFbaF0saCx0KSxwIT09YykpcmV0dXJuIHB9ZWxzZSBpZihzPT09YVtoXSlyZXR1cm4gaDtyZXR1cm4gdj90LnI6bi5saXN0LmluZGV4PzA6LTF9fSgpLG4udGltZT17fSxuLnRpbWUuaXM9ZnVuY3Rpb24odCl7cmV0dXJuIHQ/dCBpbnN0YW5jZW9mIERhdGU6KyhuZXcgRGF0ZSkuZ2V0VGltZSgpfTt2YXIgbz1uLmZuLmlzLGU9bi5saXN0LmlzLGk9bi5vYmoscj1pLmlzLHU9aS5oYXMsYT1pLm1hcDt0LmV4cG9ydHM9bn0pKHQsXCIuL3R5cGVcIiksdChmdW5jdGlvbih0KXt0LmV4cG9ydHM9ZnVuY3Rpb24gbih0LG8sZSl7aWYoIXQpcmV0dXJue3RvOm59O3ZhciB0PSh0aGlzLnRhZ3x8KHRoaXMudGFnPXt9KSlbdF18fCh0aGlzLnRhZ1t0XT17dGFnOnQsdG86bi5fPXtuZXh0OmZ1bmN0aW9uKCl7fX19KTtpZihvIGluc3RhbmNlb2YgRnVuY3Rpb24pe3ZhciBpPXtvZmY6bi5vZmZ8fChuLm9mZj1mdW5jdGlvbigpe3JldHVybiB0aGlzLm5leHQ9PT1uLl8ubmV4dD8hMDoodGhpcz09PXRoaXMudGhlLmxhc3QmJih0aGlzLnRoZS5sYXN0PXRoaXMuYmFjayksdGhpcy50by5iYWNrPXRoaXMuYmFjayx0aGlzLm5leHQ9bi5fLm5leHQsdm9pZCh0aGlzLmJhY2sudG89dGhpcy50bykpfSksdG86bi5fLG5leHQ6byx0aGU6dCxvbjp0aGlzLGFzOmV9O3JldHVybihpLmJhY2s9dC5sYXN0fHx0KS50bz1pLHQubGFzdD1pfXJldHVybih0PXQudG8pLm5leHQobyksdH19KSh0LFwiLi9vbnRvXCIpLHQoZnVuY3Rpb24obil7ZnVuY3Rpb24gbyh0LG4pe249bnx8e30sbi5pZD1uLmlkfHxcIiNcIixuLnJpZD1uLnJpZHx8XCJAXCIsbi51dWlkPW4udXVpZHx8ZnVuY3Rpb24oKXtyZXR1cm4rbmV3IERhdGUrTWF0aC5yYW5kb20oKX07dmFyIG89ZTtyZXR1cm4gby5zdHVuPWZ1bmN0aW9uKHQpe3ZhciBuPWZ1bmN0aW9uKHQpe3JldHVybiBuLm9mZiYmbj09PXRoaXMuc3R1bj8odGhpcy5zdHVuPW51bGwsITEpOm8uc3R1bi5za2lwPyExOih0JiYodC5jYj10LmZuLHQub2ZmKCksZS5xdWV1ZS5wdXNoKHQpKSwhMCl9LGU9bi5yZXM9ZnVuY3Rpb24odCxyKXtpZighbi5vZmYpe2lmKHQgaW5zdGFuY2VvZiBGdW5jdGlvbilyZXR1cm4gby5zdHVuLnNraXA9ITAsdC5jYWxsKHIpLHZvaWQoby5zdHVuLnNraXA9ITEpO24ub2ZmPSEwO3ZhciB1LGE9MCxzPWUucXVldWUsZj1zLmxlbmd0aDtmb3IoZS5xdWV1ZT1bXSxuPT09aS5zdHVuJiYoaS5zdHVuPW51bGwpLGE7Zj5hO2ErKyl1PXNbYV0sdS5mbj11LmNiLHUuY2I9bnVsbCxvLnN0dW4uc2tpcD0hMCx1LmN0eC5vbih1LnRhZyx1LmZuLHUpLG8uc3R1bi5za2lwPSExfX0saT10Ll87cmV0dXJuIGUuYmFjaz1pLnN0dW58fChpLmJhY2t8fHtfOnt9fSkuXy5zdHVuLGUuYmFjayYmKGUuYmFjay5uZXh0PW4pLGUucXVldWU9W10saS5zdHVuPW4sZX0sb312YXIgZT10KFwiLi9vbnRvXCIpO24uZXhwb3J0cz1vfSkodCxcIi4vb25pZnlcIiksdChmdW5jdGlvbihuKXtmdW5jdGlvbiBvKHQsbixlKXtvLnRpbWU9ZSxvLndhaXRpbmcucHVzaCh7d2hlbjp0LGV2ZW50Om58fGZ1bmN0aW9uKCl7fX0pLG8uc29vbmVzdDx0fHxvLnNldCh0KX12YXIgZT10KFwiLi90eXBlXCIpO28ud2FpdGluZz1bXSxvLnNvb25lc3Q9MS8wLG8uc29ydD1lLmxpc3Quc29ydChcIndoZW5cIiksby5zZXQ9ZnVuY3Rpb24odCl7aWYoISgxLzA8PShvLnNvb25lc3Q9dCkpKXt2YXIgbj1vLnRpbWUoKTt0PW4+PXQ/MDp0LW4sY2xlYXJUaW1lb3V0KG8uaWQpLG8uaWQ9c2V0VGltZW91dChvLmNoZWNrLHQpfX0sby5lYWNoPWZ1bmN0aW9uKHQsbixvKXt2YXIgZT10aGlzO3QmJih0LndoZW48PWUubm93P3QuZXZlbnQgaW5zdGFuY2VvZiBGdW5jdGlvbiYmc2V0VGltZW91dChmdW5jdGlvbigpe3QuZXZlbnQoKX0sMCk6KGUuc29vbmVzdD1lLnNvb25lc3Q8dC53aGVuP2Uuc29vbmVzdDp0LndoZW4sbyh0KSkpfSxvLmNoZWNrPWZ1bmN0aW9uKCl7dmFyIHQ9e25vdzpvLnRpbWUoKSxzb29uZXN0OjEvMH07by53YWl0aW5nLnNvcnQoby5zb3J0KSxvLndhaXRpbmc9ZS5saXN0Lm1hcChvLndhaXRpbmcsby5lYWNoLHQpfHxbXSxvLnNldCh0LnNvb25lc3QpfSxuLmV4cG9ydHM9b30pKHQsXCIuL3NjaGVkdWxlXCIpLHQoZnVuY3Rpb24odCl7ZnVuY3Rpb24gbih0LG4sZSxpLHIpe2lmKG4+dClyZXR1cm57ZGVmZXI6ITB9O2lmKGU+bilyZXR1cm57aGlzdG9yaWNhbDohMH07aWYobj5lKXJldHVybntjb252ZXJnZTohMCxpbmNvbWluZzohMH07aWYobj09PWUpe2lmKGk9byhpKXx8XCJcIixyPW8ocil8fFwiXCIsaT09PXIpcmV0dXJue3N0YXRlOiEwfTtpZihyPmkpcmV0dXJue2NvbnZlcmdlOiEwLGN1cnJlbnQ6ITB9O2lmKGk+cilyZXR1cm57Y29udmVyZ2U6ITAsaW5jb21pbmc6ITB9fXJldHVybntlcnI6XCJJbnZhbGlkIENSRFQgRGF0YTogXCIraStcIiB0byBcIityK1wiIGF0IFwiK24rXCIgdG8gXCIrZStcIiFcIn19aWYoXCJ1bmRlZmluZWRcIj09dHlwZW9mIEpTT04pdGhyb3cgbmV3IEVycm9yKFwiSlNPTiBpcyBub3QgaW5jbHVkZWQgaW4gdGhpcyBicm93c2VyLiBQbGVhc2UgbG9hZCBpdCBmaXJzdDogYWpheC5jZG5qcy5jb20vYWpheC9saWJzL2pzb24yLzIwMTEwMjIzL2pzb24yLmpzXCIpO3ZhciBvPUpTT04uc3RyaW5naWZ5O3QuZXhwb3J0cz1ufSkodCxcIi4vSEFNXCIpLHQoZnVuY3Rpb24obil7dmFyIG89dChcIi4vdHlwZVwiKSxlPXt9O2UuaXM9ZnVuY3Rpb24odCl7cmV0dXJuIHQ9PT1pPyExOm51bGw9PT10PyEwOnQ9PT0xLzA/ITE6cyh0KXx8dSh0KXx8YSh0KT8hMDplLnJlbC5pcyh0KXx8ITF9LGUucmVsPXtfOlwiI1wifSxmdW5jdGlvbigpe2Z1bmN0aW9uIHQodCxuKXt2YXIgbz10aGlzO3JldHVybiBvLmlkP28uaWQ9ITE6bj09ciYmcyh0KT92b2lkKG8uaWQ9dCk6by5pZD0hMX1lLnJlbC5pcz1mdW5jdGlvbihuKXtpZihuJiZuW3JdJiYhbi5fJiZjKG4pKXt2YXIgbz17fTtpZihwKG4sdCxvKSxvLmlkKXJldHVybiBvLmlkfXJldHVybiExfX0oKSxlLnJlbC5pZnk9ZnVuY3Rpb24odCl7cmV0dXJuIGwoe30scix0KX07dmFyIGkscj1lLnJlbC5fLHU9by5iaS5pcyxhPW8ubnVtLmlzLHM9by50ZXh0LmlzLGY9by5vYmosYz1mLmlzLGw9Zi5wdXQscD1mLm1hcDtuLmV4cG9ydHM9ZX0pKHQsXCIuL3ZhbFwiKSx0KGZ1bmN0aW9uKG4pe3ZhciBvPXQoXCIuL3R5cGVcIiksZT10KFwiLi92YWxcIiksaT17XzpcIl9cIn07aS5zb3VsPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHQmJnQuXyYmdC5fW258fHBdfSxpLnNvdWwuaWZ5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIG49XCJzdHJpbmdcIj09dHlwZW9mIG4/e3NvdWw6bn06bnx8e30sdD10fHx7fSx0Ll89dC5ffHx7fSx0Ll9bcF09bi5zb3VsfHx0Ll9bcF18fGwoKSx0fSxpLnNvdWwuXz1lLnJlbC5fLGZ1bmN0aW9uKCl7ZnVuY3Rpb24gdCh0LG4pe3JldHVybiBuIT09aS5fP2UuaXModCk/dm9pZCh0aGlzLmNiJiZ0aGlzLmNiLmNhbGwodGhpcy5hcyx0LG4sdGhpcy5uLHRoaXMucykpOiEwOnZvaWQgMH1pLmlzPWZ1bmN0aW9uKG4sbyxlKXt2YXIgcjtyZXR1cm4gYShuKSYmKHI9aS5zb3VsKG4pKT8hZihuLHQse2FzOmUsY2I6byxzOnIsbjpufSk6ITF9fSgpLGZ1bmN0aW9uKCl7ZnVuY3Rpb24gdCh0LG4pe3ZhciBvLGkscj10aGlzLm87cmV0dXJuIHIubWFwPyhvPXIubWFwLmNhbGwodGhpcy5hcyx0LFwiXCIrbixyLm5vZGUpLHZvaWQoaT09PW8/cyhyLm5vZGUsbik6ci5ub2RlJiYoci5ub2RlW25dPW8pKSk6dm9pZChlLmlzKHQpJiYoci5ub2RlW25dPXQpKX1pLmlmeT1mdW5jdGlvbihuLG8sZSl7cmV0dXJuIG8/XCJzdHJpbmdcIj09dHlwZW9mIG8/bz17c291bDpvfTpvIGluc3RhbmNlb2YgRnVuY3Rpb24mJihvPXttYXA6b30pOm89e30sby5tYXAmJihvLm5vZGU9by5tYXAuY2FsbChlLG4scixvLm5vZGV8fHt9KSksKG8ubm9kZT1pLnNvdWwuaWZ5KG8ubm9kZXx8e30sbykpJiZmKG4sdCx7bzpvLGFzOmV9KSxvLm5vZGV9fSgpO3ZhciByLHU9by5vYmosYT11LmlzLHM9dS5kZWwsZj11Lm1hcCxjPW8udGV4dCxsPWMucmFuZG9tLHA9aS5zb3VsLl87bi5leHBvcnRzPWl9KSh0LFwiLi9ub2RlXCIpLHQoZnVuY3Rpb24obil7ZnVuY3Rpb24gbygpe3ZhciB0O3JldHVybiB0PWY/YytmLm5vdygpOnIoKSx0PnU/KGE9MCx1PXQrby5kcmlmdCk6dT10KyhhKz0xKS9zK28uZHJpZnR9dmFyIGU9dChcIi4vdHlwZVwiKSxpPXQoXCIuL25vZGVcIikscj1lLnRpbWUuaXMsdT0tKDEvMCksYT0wLHM9MWUzLGY9XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHBlcmZvcm1hbmNlP3BlcmZvcm1hbmNlLnRpbWluZyYmcGVyZm9ybWFuY2U6ITEsYz1mJiZmLnRpbWluZyYmZi50aW1pbmcubmF2aWdhdGlvblN0YXJ0fHwoZj0hMSk7by5fPVwiPlwiLG8uZHJpZnQ9MCxvLmlzPWZ1bmN0aW9uKHQsbixlKXt2YXIgaT1uJiZ0JiZ0W3hdJiZ0W3hdW28uX118fGU7aWYoaSlyZXR1cm4gbShpPWlbbl0pP2k6LSgxLzApfSxvLmlmeT1mdW5jdGlvbih0LG4sZSxyLHUpe2lmKCF0fHwhdFt4XSl7aWYoIXUpcmV0dXJuO3Q9aS5zb3VsLmlmeSh0LHUpfXZhciBhPWQodFt4XSxvLl8pO3JldHVybiBsIT09biYmbiE9PXgmJihtKGUpJiYoYVtuXT1lKSxsIT09ciYmKHRbbl09cikpLHR9LG8udG89ZnVuY3Rpb24odCxuLGUpe3ZhciByPXRbbl07cmV0dXJuIGgocikmJihyPV8ocikpLG8uaWZ5KGUsbixvLmlzKHQsbikscixpLnNvdWwodCkpfSxmdW5jdGlvbigpe2Z1bmN0aW9uIHQodCxuKXt4IT09biYmby5pZnkodGhpcy5vLG4sdGhpcy5zKX1vLm1hcD1mdW5jdGlvbihuLGUsaSl7dmFyIHIsdT1oKHU9bnx8ZSk/dTpudWxsO3JldHVybiBuPWsobj1ufHxlKT9uOm51bGwsdSYmIW4/KGU9bShlKT9lOm8oKSx1W3hdPXVbeF18fHt9LHYodSx0LHtvOnUsczplfSksdSk6KGk9aXx8aChlKT9lOnIsZT1tKGUpP2U6bygpLGZ1bmN0aW9uKG8sdSxhLHMpe3JldHVybiBuPyhuLmNhbGwoaXx8dGhpc3x8e30sbyx1LGEscyksdm9pZChnKGEsdSkmJnI9PT1hW3VdfHx0LmNhbGwoe286YSxzOmV9LG8sdSkpKToodC5jYWxsKHtvOmEsczplfSxvLHUpLG8pfSl9fSgpO3ZhciBsLHA9ZS5vYmosZD1wLmFzLGc9cC5oYXMsaD1wLmlzLHY9cC5tYXAsXz1wLmNvcHksYj1lLm51bSxtPWIuaXMseT1lLmZuLGs9eS5pcyx4PWkuXztuLmV4cG9ydHM9b30pKHQsXCIuL3N0YXRlXCIpLHQoZnVuY3Rpb24obil7dmFyIG89dChcIi4vdHlwZVwiKSxlPXQoXCIuL3ZhbFwiKSxpPXQoXCIuL25vZGVcIikscj17fTshZnVuY3Rpb24oKXtmdW5jdGlvbiB0KHQsbyl7cmV0dXJuIHQmJm89PT1pLnNvdWwodCkmJmkuaXModCx0aGlzLmZuLHRoaXMuYXMpP3ZvaWQodGhpcy5jYiYmKG4ubj10LG4uYXM9dGhpcy5hcyx0aGlzLmNiLmNhbGwobi5hcyx0LG8sbikpKTohMH1mdW5jdGlvbiBuKHQpe3QmJmkuaXMobi5uLHQsbi5hcyl9ci5pcz1mdW5jdGlvbihuLG8sZSxpKXtyZXR1cm4gbiYmcyhuKSYmIWwobik/IWQobix0LHtjYjpvLGZuOmUsYXM6aX0pOiExfX0oKSxmdW5jdGlvbigpe2Z1bmN0aW9uIHQodCxyKXt2YXIgdTtyZXR1cm4odT1sKHQscikpP3U6KHIuZW52PXQsci5zb3VsPW8saS5pZnkoci5vYmosbixyKSYmKHQuZ3JhcGhbZS5yZWwuaXMoci5yZWwpXT1yLm5vZGUpLHIpfWZ1bmN0aW9uIG4obixvLHIpe3ZhciBzLGwscD10aGlzLGQ9cC5lbnY7aWYoaS5fPT09byYmYyhuLGUucmVsLl8pKXJldHVybiByLl87aWYocz1hKG4sbyxyLHAsZCkpe2lmKG98fChwLm5vZGU9cC5ub2RlfHxyfHx7fSxjKG4saS5fKSYmKHAubm9kZS5fPWcobi5fKSkscC5ub2RlPWkuc291bC5pZnkocC5ub2RlLGUucmVsLmlzKHAucmVsKSkscC5yZWw9cC5yZWx8fGUucmVsLmlmeShpLnNvdWwocC5ub2RlKSkpLChsPWQubWFwKSYmKGwuY2FsbChkLmFzfHx7fSxuLG8scixwKSxjKHIsbykpKXtpZihuPXJbb10sdT09PW4pcmV0dXJuIHZvaWQgZihyLG8pO2lmKCEocz1hKG4sbyxyLHAsZCkpKXJldHVybn1pZighbylyZXR1cm4gcC5ub2RlO2lmKCEwPT09cylyZXR1cm4gbjtpZihsPXQoZCx7b2JqOm4scGF0aDpwLnBhdGguY29uY2F0KG8pfSksbC5ub2RlKXJldHVybiBsLnJlbH19ZnVuY3Rpb24gbyh0KXt2YXIgbj10aGlzLG89ZS5yZWwuaXMobi5yZWwpLHI9bi5lbnYuZ3JhcGg7bi5yZWw9bi5yZWx8fGUucmVsLmlmeSh0KSxuLnJlbFtlLnJlbC5fXT10LG4ubm9kZSYmbi5ub2RlW2kuX10mJihuLm5vZGVbaS5fXVtlLnJlbC5fXT10KSxjKHIsbykmJihyW3RdPXJbb10sZihyLG8pKX1mdW5jdGlvbiBhKHQsbixvLGkscil7dmFyIHU7cmV0dXJuIGUuaXModCk/ITA6cyh0KT8xOih1PXIuaW52YWxpZCk/KHQ9dS5jYWxsKHIuYXN8fHt9LHQsbixvKSxhKHQsbixvLGkscikpOnZvaWQoci5lcnI9XCJJbnZhbGlkIHZhbHVlIGF0ICdcIitpLnBhdGguY29uY2F0KG4pLmpvaW4oXCIuXCIpK1wiJyFcIil9ZnVuY3Rpb24gbCh0LG4pe2Zvcih2YXIgbyxlPXQuc2VlbixpPWUubGVuZ3RoO2ktLTspaWYobz1lW2ldLG4ub2JqPT09by5vYmopcmV0dXJuIG87ZS5wdXNoKG4pfXIuaWZ5PWZ1bmN0aW9uKG4sbyxpKXt2YXIgcj17cGF0aDpbXSxvYmo6bn07cmV0dXJuIG8/XCJzdHJpbmdcIj09dHlwZW9mIG8/bz17c291bDpvfTpvIGluc3RhbmNlb2YgRnVuY3Rpb24mJihvLm1hcD1vKTpvPXt9LG8uc291bCYmKHIucmVsPWUucmVsLmlmeShvLnNvdWwpKSxvLmdyYXBoPW8uZ3JhcGh8fHt9LG8uc2Vlbj1vLnNlZW58fFtdLG8uYXM9by5hc3x8aSx0KG8sciksby5yb290PXIubm9kZSxvLmdyYXBofX0oKSxyLm5vZGU9ZnVuY3Rpb24odCl7dmFyIG49aS5zb3VsKHQpO2lmKG4pcmV0dXJuIHAoe30sbix0KX0sZnVuY3Rpb24oKXtmdW5jdGlvbiB0KHQsbil7dmFyIG8sdTtpZihpLl89PT1uKXtpZihsKHQsZS5yZWwuXykpcmV0dXJuO3JldHVybiB2b2lkKHRoaXMub2JqW25dPWcodCkpfXJldHVybihvPWUucmVsLmlzKHQpKT8odT10aGlzLm9wdC5zZWVuW29dKT92b2lkKHRoaXMub2JqW25dPXUpOnZvaWQodGhpcy5vYmpbbl09dGhpcy5vcHQuc2VlbltvXT1yLnRvKHRoaXMuZ3JhcGgsbyx0aGlzLm9wdCkpOnZvaWQodGhpcy5vYmpbbl09dCl9ci50bz1mdW5jdGlvbihuLG8sZSl7aWYobil7dmFyIGk9e307cmV0dXJuIGU9ZXx8e3NlZW46e319LGQobltvXSx0LHtvYmo6aSxncmFwaDpuLG9wdDplfSksaX19fSgpO3ZhciB1LGE9KG8uZm4uaXMsby5vYmopLHM9YS5pcyxmPWEuZGVsLGM9YS5oYXMsbD1hLmVtcHR5LHA9YS5wdXQsZD1hLm1hcCxnPWEuY29weTtuLmV4cG9ydHM9cn0pKHQsXCIuL2dyYXBoXCIpLHQoZnVuY3Rpb24obil7ZnVuY3Rpb24gbygpe3RoaXMuY2FjaGU9e319dmFyIGU9dChcIi4vdHlwZVwiKTtvLnByb3RvdHlwZS50cmFjaz1mdW5jdGlvbih0KXtyZXR1cm4gdGhpcy5jYWNoZVt0XT1lLnRpbWUuaXMoKSx0aGlzLnRvfHx0aGlzLmdjKCksdH0sby5wcm90b3R5cGUuY2hlY2s9ZnVuY3Rpb24odCl7cmV0dXJuIGUub2JqLmhhcyh0aGlzLmNhY2hlLHQpP3RoaXMudHJhY2sodCk6ITF9LG8ucHJvdG90eXBlLmdjPWZ1bmN0aW9uKCl7dmFyIHQ9dGhpcyxuPWUudGltZS5pcygpLG89bixpPTNlNTtlLm9iai5tYXAodC5jYWNoZSxmdW5jdGlvbihyLHUpe289TWF0aC5taW4obixyKSxpPm4tcnx8ZS5vYmouZGVsKHQuY2FjaGUsdSl9KTt2YXIgcj1lLm9iai5lbXB0eSh0LmNhY2hlKTtpZihyKXJldHVybiB2b2lkKHQudG89bnVsbCk7dmFyIHU9bi1vLGE9aS11O3QudG89c2V0VGltZW91dChmdW5jdGlvbigpe3QuZ2MoKX0sYSl9LG4uZXhwb3J0cz1vfSkodCxcIi4vZHVwXCIpLHQoZnVuY3Rpb24obil7ZnVuY3Rpb24gaSh0KXtyZXR1cm4gdCBpbnN0YW5jZW9mIGk/KHRoaXMuXz17Z3VuOnRoaXN9KS5ndW46dGhpcyBpbnN0YW5jZW9mIGk/aS5jcmVhdGUodGhpcy5fPXtndW46dGhpcyxvcHQ6dH0pOm5ldyBpKHQpfWkuaXM9ZnVuY3Rpb24odCl7cmV0dXJuIHQgaW5zdGFuY2VvZiBpfSxpLnZlcnNpb249LjcsaS5jaGFpbj1pLnByb3RvdHlwZSxpLmNoYWluLnRvSlNPTj1mdW5jdGlvbigpe307dmFyIHI9dChcIi4vdHlwZVwiKTtyLm9iai50byhyLGkpLGkuSEFNPXQoXCIuL0hBTVwiKSxpLnZhbD10KFwiLi92YWxcIiksaS5ub2RlPXQoXCIuL25vZGVcIiksaS5zdGF0ZT10KFwiLi9zdGF0ZVwiKSxpLmdyYXBoPXQoXCIuL2dyYXBoXCIpLGkuZHVwPXQoXCIuL2R1cFwiKSxpLnNjaGVkdWxlPXQoXCIuL3NjaGVkdWxlXCIpLGkub249dChcIi4vb25pZnlcIikoKSxpLl89e25vZGU6aS5ub2RlLl8sc291bDppLnZhbC5yZWwuXyxzdGF0ZTppLnN0YXRlLl8sZmllbGQ6XCIuXCIsdmFsdWU6XCI9XCJ9LGZ1bmN0aW9uKCl7ZnVuY3Rpb24gdCh0KXt2YXIgbixvPXRoaXMsZT1vLmFzO2lmKHQuZ3VufHwodC5ndW49ZS5ndW4pLHRbXCIjXCJdfHwodFtcIiNcIl09aS50ZXh0LnJhbmRvbSgpKSwhZS5kdXAuY2hlY2sodFtcIiNcIl0pKXtpZih0W1wiQFwiXSl7aWYoZS5hY2sodFtcIkBcIl0sdCkpcmV0dXJuO3JldHVybiBlLmR1cC50cmFjayh0W1wiI1wiXSksdm9pZCBpLm9uKFwib3V0XCIscCh0LHtndW46ZS5ndW59KSl9ZS5kdXAudHJhY2sodFtcIiNcIl0pLG49cCh0LHtndW46ZS5ndW59KSx0LmdldCYmaS5vbihcImdldFwiLG4pLHQucHV0JiZpLm9uKFwicHV0XCIsbiksaS5vbihcIm91dFwiLG4pfX1pLmNyZWF0ZT1mdW5jdGlvbihuKXtuLm9uPW4ub258fGkub24sbi5yb290PW4ucm9vdHx8bi5ndW4sbi5ncmFwaD1uLmdyYXBofHx7fSxuLmR1cD1uLmR1cHx8bmV3IGkuZHVwLG4uYXNrPWkub24uYXNrLG4uYWNrPWkub24uYWNrO3ZhciBvPW4uZ3VuLm9wdChuLm9wdCk7cmV0dXJuIG4ub25jZXx8KG4ub24oXCJpblwiLHQsbiksbi5vbihcIm91dFwiLHQsbikpLG4ub25jZT0xLG99fSgpLGZ1bmN0aW9uKCl7ZnVuY3Rpb24gdCh0LG4sbyxlKXt2YXIgcj10aGlzLHU9aS5zdGF0ZS5pcyhvLG4pO2lmKCF1KXJldHVybiByLmVycj1cIkVycm9yOiBObyBzdGF0ZSBvbiAnXCIrbitcIicgaW4gbm9kZSAnXCIrZStcIichXCI7dmFyIGE9ci5ncmFwaFtlXXx8dixzPWkuc3RhdGUuaXMoYSxuLCEwKSxmPWFbbl0sYz1pLkhBTShyLm1hY2hpbmUsdSxzLHQsZik7Yy5pbmNvbWluZ3x8Yy5kZWZlciYmKHIuZGVmZXI9dTwoci5kZWZlcnx8MS8wKT91OnIuZGVmZXIpLHIucHV0W2VdPWkuc3RhdGUudG8obyxuLHIucHV0W2VdKSwoci5kaWZmfHwoci5kaWZmPXt9KSlbZV09aS5zdGF0ZS50byhvLG4sci5kaWZmW2VdKX1mdW5jdGlvbiBuKHQsbil7dmFyIGU9KHRoaXMuZ3VuLl8ubmV4dHx8dilbbl07aWYoZSl7dmFyIHI9dGhpcy5tYXBbbl09e3B1dDp0aGlzLm5vZGU9dCxnZXQ6dGhpcy5zb3VsPW4sZ3VuOnRoaXMucmVmPWV9O2QodCxvLHRoaXMpLGkub24oXCJub2RlXCIscil9fWZ1bmN0aW9uIG8odCxuKXt2YXIgbz10aGlzLmdyYXBoLGU9dGhpcy5zb3VsLHI9dGhpcy5yZWYuXztvW2VdPWkuc3RhdGUudG8odGhpcy5ub2RlLG4sb1tlXSksKHIucHV0fHwoci5wdXQ9e30pKVtuXT10fWZ1bmN0aW9uIGUodCl7dC5ndW4mJnQuZ3VuLl8ub24oXCJpblwiLHQpfWkub24oXCJwdXRcIixmdW5jdGlvbihvKXtpZighb1tcIiNcIl0pcmV0dXJuIHRoaXMudG8ubmV4dChvKTt2YXIgcj10aGlzLGE9e2d1bjpvLmd1bixncmFwaDpvLmd1bi5fLmdyYXBoLHB1dDp7fSxtYXA6e30sbWFjaGluZTppLnN0YXRlKCl9O3JldHVybiBpLmdyYXBoLmlzKG8ucHV0LG51bGwsdCxhKXx8KGEuZXJyPVwiRXJyb3I6IEludmFsaWQgZ3JhcGghXCIpLGEuZXJyP2EuZ3VuLm9uKFwiaW5cIix7XCJAXCI6b1tcIiNcIl0sZXJyOmkubG9nKGEuZXJyKX0pOihkKGEucHV0LG4sYSksZChhLm1hcCxlLGEpLHUhPT1hLmRlZmVyJiZpLnNjaGVkdWxlKGEuZGVmZXIsZnVuY3Rpb24oKXtpLm9uKFwicHV0XCIsbyl9LGkuc3RhdGUpLHZvaWQoYS5kaWZmJiZyLnRvLm5leHQocChvLHtwdXQ6YS5kaWZmfSkpKSl9KX0oKSxmdW5jdGlvbigpe2kub24oXCJnZXRcIixmdW5jdGlvbih0KXt2YXIgbixvPXRoaXMsZT10LmdldFtnXSxyPXQuZ3VuLl8sdT1yLmdyYXBoW2VdLGE9dC5nZXRbaF0scz1yLm5leHR8fChyLm5leHQ9e30pLGY9KHNbZV18fHYpLl87aWYoIXV8fCFmKXJldHVybiBvLnRvLm5leHQodCk7aWYoYSl7aWYoIWwodSxhKSlyZXR1cm4gby50by5uZXh0KHQpO3U9aS5zdGF0ZS50byh1LGEpfWVsc2UgdT1pLm9iai5jb3B5KHUpO3U9aS5ncmFwaC5ub2RlKHUpLG49Zi5hY2ssci5vbihcImluXCIse1wiQFwiOnRbXCIjXCJdLGhvdzpcIm1lbVwiLHB1dDp1LGd1bjpmLmd1bn0pLG4+MHx8by50by5uZXh0KHQpfSl9KCksZnVuY3Rpb24oKXtpLm9uLmFzaz1mdW5jdGlvbih0LG4pe2lmKHRoaXMub24pe3ZhciBvPWkudGV4dC5yYW5kb20oKTtyZXR1cm4gdCYmdGhpcy5vbihvLHQsbiksb319LGkub24uYWNrPWZ1bmN0aW9uKHQsbil7aWYodCYmbiYmdGhpcy5vbil7dmFyIG89dFtcIiNcIl18fHQ7aWYodGhpcy50YWcmJnRoaXMudGFnW29dKXJldHVybiB0aGlzLm9uKG8sbiksITB9fX0oKSxmdW5jdGlvbigpe2kuY2hhaW4ub3B0PWZ1bmN0aW9uKHQpe3Q9dHx8e307dmFyIG49dGhpcyxvPW4uXyxlPXQucGVlcnN8fHQ7cmV0dXJuIGModCl8fCh0PXt9KSxjKG8ub3B0KXx8KG8ub3B0PXQpLGEoZSkmJihlPVtlXSkscyhlKSYmKGU9ZChlLGZ1bmN0aW9uKHQsbixvKXtvKHQse3VybDp0fSl9KSxjKG8ub3B0LnBlZXJzKXx8KG8ub3B0LnBlZXJzPXt9KSxvLm9wdC5wZWVycz1wKGUsby5vcHQucGVlcnMpKSxvLm9wdC53c2M9by5vcHQud3NjfHx7cHJvdG9jb2xzOlwiXCJ9LG8ub3B0LnBlZXJzPW8ub3B0LnBlZXJzfHx7fSxwKHQsby5vcHQpLGkub24oXCJvcHRcIixvKSxufX0oKTt2YXIgdSxhPWkudGV4dC5pcyxzPWkubGlzdC5pcyxmPWkub2JqLGM9Zi5pcyxsPWYuaGFzLHA9Zi50byxkPWYubWFwLGc9KGYuY29weSxpLl8uc291bCksaD1pLl8uZmllbGQsdj0oaS52YWwucmVsLmlzLHt9KTtvLmRlYnVnPWZ1bmN0aW9uKHQsbil7cmV0dXJuIG8uZGVidWcuaSYmdD09PW8uZGVidWcuaSYmby5kZWJ1Zy5pKysmJihvLmxvZy5hcHBseShvLGFyZ3VtZW50cyl8fG4pfSxpLmxvZz1mdW5jdGlvbigpe3JldHVybiFpLmxvZy5vZmYmJm8ubG9nLmFwcGx5KG8sYXJndW1lbnRzKSxbXS5zbGljZS5jYWxsKGFyZ3VtZW50cykuam9pbihcIiBcIil9LGkubG9nLm9uY2U9ZnVuY3Rpb24odCxuLG8pe3JldHVybihvPWkubG9nLm9uY2UpW3RdPW9bdF18fDAsb1t0XSsrfHxpLmxvZyhuKX0saS5sb2cub25jZShcIndlbGNvbWVcIixcIkhlbGxvIHdvbmRlcmZ1bCBwZXJzb24hIDopIFRoYW5rcyBmb3IgdXNpbmcgR1VOLCBmZWVsIGZyZWUgdG8gYXNrIGZvciBoZWxwIG9uIGh0dHBzOi8vZ2l0dGVyLmltL2FtYXJrL2d1biBhbmQgYXNrIFN0YWNrT3ZlcmZsb3cgcXVlc3Rpb25zIHRhZ2dlZCB3aXRoICdndW4nIVwiKSxcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93JiYod2luZG93Lkd1bj1pKSxcInVuZGVmaW5lZFwiIT10eXBlb2YgZSYmKGUuZXhwb3J0cz1pKSxuLmV4cG9ydHM9aX0pKHQsXCIuL3Jvb3RcIiksdChmdW5jdGlvbigpe3ZhciBuPXQoXCIuL3Jvb3RcIik7bi5jaGFpbi5iYWNrPWZ1bmN0aW9uKHQsbil7dmFyIGk7aWYoLTE9PT10fHwxLzA9PT10KXJldHVybiB0aGlzLl8ucm9vdDtpZigxPT09dClyZXR1cm4gdGhpcy5fLmJhY2t8fHRoaXM7dmFyIHI9dGhpcyx1PXIuXztpZihcInN0cmluZ1wiPT10eXBlb2YgdCYmKHQ9dC5zcGxpdChcIi5cIikpLHQgaW5zdGFuY2VvZiBBcnJheSl7dmFyIGE9MCxzPXQubGVuZ3RoLGk9dTtmb3IoYTtzPmE7YSsrKWk9KGl8fGUpW3RbYV1dO2lmKG8hPT1pKXJldHVybiBuP3I6aTtpZihpPXUuYmFjaylyZXR1cm4gaS5iYWNrKHQsbil9ZWxzZSBpZih0IGluc3RhbmNlb2YgRnVuY3Rpb24pe2Zvcih2YXIgZixpPXtiYWNrOnJ9OyhpPWkuYmFjaykmJihpPWkuXykmJiEoZj10KGksbikpOyk7cmV0dXJuIGZ9fTt2YXIgbyxlPXt9fSkodCxcIi4vYmFja1wiKSx0KGZ1bmN0aW9uKCl7ZnVuY3Rpb24gbyh0KXt2YXIgbixvLGUsaT10aGlzLmFzLHI9aS5ndW4sdT1yLmJhY2soLTEpO2lmKHQuZ3VufHwodC5ndW49ciksbz10LmdldClpZihlPW9bbV0pZT11LmdldChlKS5fLGcobyx5KT9nKG49ZS5wdXQsbz1vW3ldKSYmZS5vbihcImluXCIse2dldDplLmdldCxwdXQ6Yy5zdGF0ZS50byhuLG8pLGd1bjplLmd1bn0pOmcoZSxcInB1dFwiKSYmZS5vbihcImluXCIsZSk7ZWxzZSBpZihnKG8seSkpe289b1t5XTt2YXIgYT1vP3IuZ2V0KG8pLl86aTtpZihsIT09YS5wdXQpcmV0dXJuIHZvaWQgYS5vbihcImluXCIsYSk7aWYoZyhpLFwicHV0XCIpKXt2YXIgcyxmPWkucHV0O2lmKChzPWMubm9kZS5zb3VsKGYpKSYmKGY9Yy52YWwucmVsLmlmeShzKSkscz1jLnZhbC5yZWwuaXMoZikpe2lmKCF0Lmd1bi5fKXJldHVybjtyZXR1cm4gdm9pZCB0Lmd1bi5fLm9uKFwib3V0XCIse2dldDplPXtcIiNcIjpzLFwiLlwiOm8sZ3VuOnQuZ3VufSxcIiNcIjp1Ll8uYXNrKGMuSEFNLnN5bnRoLGUpLGd1bjp0Lmd1bn0pfWlmKGw9PT1mfHxjLnZhbC5pcyhmKSl7aWYoIXQuZ3VuLl8pcmV0dXJuO3JldHVybiB2b2lkIHQuZ3VuLl8ub24oXCJpblwiLHtnZXQ6byxndW46dC5ndW59KX19ZWxzZSBpLm1hcCYmYihpLm1hcCxmdW5jdGlvbih0KXt0LmF0Lm9uKFwiaW5cIix0LmF0KX0pO2lmKGkuc291bCl7aWYoIXQuZ3VuLl8pcmV0dXJuO3JldHVybiB2b2lkIHQuZ3VuLl8ub24oXCJvdXRcIix7Z2V0OmU9e1wiI1wiOmkuc291bCxcIi5cIjpvLGd1bjp0Lmd1bn0sXCIjXCI6dS5fLmFzayhjLkhBTS5zeW50aCxlKSxndW46dC5ndW59KX1pZihpLmdldCl7aWYoIWkuYmFjay5fKXJldHVybjtyZXR1cm4gdm9pZCBpLmJhY2suXy5vbihcIm91dFwiLHtnZXQ6aCh7fSx5LGkuZ2V0KSxndW46cn0pfXQ9Xyh0LHtnZXQ6e319KX1lbHNle2lmKGcoaSxcInB1dFwiKT9pLm9uKFwiaW5cIixpKTppLm1hcCYmYihpLm1hcCxmdW5jdGlvbih0KXt0LmF0Lm9uKFwiaW5cIix0LmF0KX0pLGkuYWNrJiYhZyhpLFwicHV0XCIpKXJldHVybjtpZihpLmFjaz0tMSxpLnNvdWwpcmV0dXJuIHZvaWQgaS5vbihcIm91dFwiLHtnZXQ6ZT17XCIjXCI6aS5zb3VsLGd1bjppLmd1bn0sXCIjXCI6dS5fLmFzayhjLkhBTS5zeW50aCxlKSxndW46aS5ndW59KTtpZihpLmdldCl7aWYoIWkuYmFjay5fKXJldHVybjtyZXR1cm4gdm9pZCBpLmJhY2suXy5vbihcIm91dFwiLHtnZXQ6aCh7fSx5LGkuZ2V0KSxndW46aS5ndW59KX19aS5iYWNrLl8ub24oXCJvdXRcIix0KX1mdW5jdGlvbiBlKHQpe3Q9dC5ffHx0O3t2YXIgbixvPXRoaXMsZT10aGlzLmFzLHU9dC5ndW4sZj11Ll8sZD10LnB1dDtlLmJhY2suX3x8cH1pZigwPmUuYWNrJiYhdC5hY2smJiFjLnZhbC5yZWwuaXMoZCkmJihlLmFjaz0xKSxlLmdldCYmdC5nZXQhPT1lLmdldCYmKHQ9Xyh0LHtnZXQ6ZS5nZXR9KSksZS5maWVsZCYmZiE9PWUmJih0PV8odCx7Z3VuOmUuZ3VufSksZi5hY2smJihlLmFjaz1lLmFja3x8Zi5hY2spKSxsPT09ZCl7aWYoby50by5uZXh0KHQpLGUuc291bClyZXR1cm47cmV0dXJuIHIoZSx0LG8pLGUuZmllbGQmJnMoZSx0KSx2KGYuZWNobyxlLmlkKSx2b2lkIHYoZS5tYXAsZi5pZCl9cmV0dXJuIGUuc291bD8oZS5yb290Ll8ubm93JiYodD1fKHQse3B1dDpkPWYucHV0fSkpLG8udG8ubmV4dCh0KSxyKGUsdCxvKSx2b2lkIGIoZCxhLHthdDp0LGNhdDplfSkpOihuPWMudmFsLnJlbC5pcyhkKSk/KGkoZSx0LGYsbiksby50by5uZXh0KHQpLHZvaWQgcihlLHQsbykpOmMudmFsLmlzKGQpPyhlLmZpZWxkfHxlLnNvdWw/cyhlLHQpOihmLmZpZWxkfHxmLnNvdWwpJiYoKGYuZWNob3x8KGYuZWNobz17fSkpW2UuaWRdPWUsKGUubWFwfHwoZS5tYXA9e30pKVtmLmlkXT1lLm1hcFtmLmlkXXx8e2F0OmZ9KSxvLnRvLm5leHQodCksdm9pZCByKGUsdCxvKSk6KGUuZmllbGQmJmYhPT1lJiZnKGYsXCJwdXRcIikmJihlLnB1dD1mLnB1dCksKG49Yy5ub2RlLnNvdWwoZCkpJiZmLmZpZWxkJiYoZi5wdXQ9ZS5yb290LmdldChuKS5fLnB1dCksby50by5uZXh0KHQpLHIoZSx0LG8pLGkoZSx0LGYsbiksdm9pZCBiKGQsYSx7YXQ6dCxjYXQ6ZX0pKX1mdW5jdGlvbiBpKHQsbixvLGUpe2lmKGUmJmshPT10LmdldCl7dmFyIHI9dC5yb290LmdldChlKS5fO3QuZmllbGQ/bz1yOm8uZmllbGQmJmkobyxuLG8sZSksbyE9PXQmJigoby5lY2hvfHwoby5lY2hvPXt9KSlbdC5pZF09dCx0LmZpZWxkJiYhKHQubWFwfHxwKVtvLmlkXSYmcyh0LG4pLHI9KHQubWFwfHwodC5tYXA9e30pKVtvLmlkXT10Lm1hcFtvLmlkXXx8e2F0Om99LGUhPT1yLnJlbCYmZih0LHIucmVsPWUpKX19ZnVuY3Rpb24gcih0LG4sbyl7dC5lY2hvJiYodC5maWVsZCYmKG49XyhuLHtldmVudDpvfSkpLGIodC5lY2hvLHUsbikpfWZ1bmN0aW9uIHUodCl7dC5vbihcImluXCIsdGhpcyl9ZnVuY3Rpb24gYSh0LG4pe3ZhciBvLGUsaSxyPXRoaXMuY2F0LHU9ci5uZXh0fHxwLGE9dGhpcy5hdDsoayE9PW58fHVbbl0pJiYobz11W25dKSYmKGk9by5fLGkuZmllbGQ/KHQmJnRbbV0mJmMudmFsLnJlbC5pcyh0KT09PWMubm9kZS5zb3VsKGkucHV0KXx8KGkucHV0PXQpLGU9byk6ZT1hLmd1bi5nZXQobiksaS5vbihcImluXCIse3B1dDp0LGdldDpuLGd1bjplLHZpYTphfSkpfWZ1bmN0aW9uIHModCl7aWYodC5maWVsZHx8dC5zb3VsKXt2YXIgbj10Lm1hcDt0Lm1hcD1udWxsLG51bGwhPT1uJiYobCE9PW58fHQucHV0PT09bCkmJihiKG4sZnVuY3Rpb24obil7KG49bi5hdCkmJnYobi5lY2hvLHQuaWQpfSksYih0Lm5leHQsZnVuY3Rpb24odCxuKXt2YXIgbz10Ll87by5wdXQ9bCxvLmFjayYmKG8uYWNrPS0xKSxvLm9uKFwiaW5cIix7Z2V0Om4sZ3VuOnQscHV0Omx9KX0pKX19ZnVuY3Rpb24gZih0LG4pe3ZhciBvPXQucm9vdC5nZXQobikuXztyZXR1cm4gdC5hY2s/KG8uYWNrPW8uYWNrfHwtMSx2b2lkIG8ub24oXCJvdXRcIix7Z2V0Om89e1wiI1wiOm4sZ3VuOm8uZ3VufSxcIiNcIjp0LnJvb3QuXy5hc2soYy5IQU0uc3ludGgsbyl9KSk6dm9pZCBiKHQubmV4dCxmdW5jdGlvbihvLGUpe28uXy5vbihcIm91dFwiLHtnZXQ6bz17XCIjXCI6bixcIi5cIjplLGd1bjpvfSxcIiNcIjp0LnJvb3QuXy5hc2soYy5IQU0uc3ludGgsbyl9KX0pfXZhciBjPXQoXCIuL3Jvb3RcIik7Yy5jaGFpbi5jaGFpbj1mdW5jdGlvbigpe3ZhciB0PXRoaXMuXyxpPW5ldyB0aGlzLmNvbnN0cnVjdG9yKHRoaXMpLHI9aS5fO3JldHVybiByLnJvb3Q9bj10LnJvb3Qsci5pZD0rK24uXy5vbmNlLHIuYmFjaz10aGlzLHIub249Yy5vbixjLm9uKFwiY2hhaW5cIixyKSxyLm9uKFwiaW5cIixlLHIpLHIub24oXCJvdXRcIixvLHIpLGl9LGMuY2hhaW4uY2hhaW4uaW5wdXQ9ZTt2YXIgbCxwPXt9LGQ9Yy5vYmosZz1kLmhhcyxoPWQucHV0LHY9ZC5kZWwsXz1kLnRvLGI9ZC5tYXAsbT1jLl8uc291bCx5PWMuXy5maWVsZCxrPWMubm9kZS5ffSkodCxcIi4vY2hhaW5cIiksdChmdW5jdGlvbigpe2Z1bmN0aW9uIG4odCxuKXt2YXIgbz1uLl8sZT1vLm5leHQsaT1uLmNoYWluKCkscj1pLl87cmV0dXJuIGV8fChlPW8ubmV4dD17fSksZVtyLmdldD10XT1pLG8ucm9vdD09PW4/ci5zb3VsPXQ6KG8uc291bHx8by5maWVsZCkmJihyLmZpZWxkPXQpLGl9ZnVuY3Rpb24gbyh0KXt2YXIgbixvPXRoaXMsZT1vLmFzLHI9dC5ndW4sYT1yLl8sZj10LnB1dDtpPT09ZiYmKGY9YS5wdXQpLChuPWYpJiZuW3MuX10mJihuPXMuaXMobikpJiYobj1hLnJvb3QuZ2V0KG4pLl8saSE9PW4ucHV0JiYodD11KHQse3B1dDpuLnB1dH0pKSksZS51c2UodCx0LmV2ZW50fHxvKSxvLnRvLm5leHQodCl9dmFyIGU9dChcIi4vcm9vdFwiKTtlLmNoYWluLmdldD1mdW5jdGlvbih0LGkscil7aWYoXCJzdHJpbmdcIiE9dHlwZW9mIHQpe2lmKHQgaW5zdGFuY2VvZiBGdW5jdGlvbil7dmFyIHU9dGhpcyxzPXUuXztyZXR1cm4gcj1pfHx7fSxyLnVzZT10LHIub3V0PXIub3V0fHx7Y2FwOjF9LHIub3V0LmdldD1yLm91dC5nZXR8fHt9LFwiX1wiIT1zLmdldCYmKHMucm9vdC5fLm5vdz0hMCkscy5vbihcImluXCIsbyxyKSxzLm9uKFwib3V0XCIsci5vdXQpLHMucm9vdC5fLm5vdz0hMSx1fXJldHVybiBhKHQpP3RoaXMuZ2V0KFwiXCIrdCxpLHIpOigocj10aGlzLmNoYWluKCkpLl8uZXJyPXtlcnI6ZS5sb2coXCJJbnZhbGlkIGdldCByZXF1ZXN0IVwiLHQpfSxpJiZpLmNhbGwocixyLl8uZXJyKSxyKX12YXIgdSxjLGw9dGhpcyxwPWwuXyxkPXAubmV4dHx8ZjtyZXR1cm4odT1kW3RdKXx8KHU9bih0LGwpKSwoYz1wLnN0dW4pJiYodS5fLnN0dW49dS5fLnN0dW58fGMpLGkmJmkgaW5zdGFuY2VvZiBGdW5jdGlvbiYmdS5nZXQoaSxyKSx1fTt2YXIgaSxyPWUub2JqLHU9KHIuaGFzLGUub2JqLnRvKSxhPWUubnVtLmlzLHM9ZS52YWwucmVsLGY9KGUubm9kZS5fLHt9KX0pKHQsXCIuL2dldFwiKSx0KGZ1bmN0aW9uKCl7ZnVuY3Rpb24gbih0KXt0LmJhdGNoPWU7dmFyIG49dC5vcHR8fHt9LG89dC5lbnY9cy5zdGF0ZS5tYXAocixuLnN0YXRlKTtyZXR1cm4gby5zb3VsPXQuc291bCx0LmdyYXBoPXMuZ3JhcGguaWZ5KHQuZGF0YSxvLHQpLG8uZXJyPygodC5hY2t8fGgpLmNhbGwodCx0Lm91dD17ZXJyOnMubG9nKG8uZXJyKX0pLHZvaWQodC5yZXMmJnQucmVzKCkpKTp2b2lkIHQuYmF0Y2goKX1mdW5jdGlvbiBlKCl7dmFyIHQ9dGhpczt0LmdyYXBoJiYhZCh0LnN0dW4saSkmJigodC5yZXN8fHYpKGZ1bmN0aW9uKCl7dC5yZWYuXy5vbihcIm91dFwiLHtjYXA6MyxndW46dC5yZWYscHV0OnQub3V0PXQuZW52LmdyYXBoLG9wdDp0Lm9wdCxcIiNcIjp0Lmd1bi5iYWNrKC0xKS5fLmFzayhmdW5jdGlvbihuKXt0aGlzLm9mZigpLHQuYWNrJiZ0LmFjayhuLHRoaXMpfSx0Lm9wdCl9KX0sdCksdC5yZXMmJnQucmVzKCkpfWZ1bmN0aW9uIGkodCl7cmV0dXJuIHQ/ITA6dm9pZCAwfWZ1bmN0aW9uIHIodCxuLG8sZSl7dmFyIGk9dGhpczshbiYmZS5wYXRoLmxlbmd0aCYmKGkucmVzfHx2KShmdW5jdGlvbigpe3ZhciB0PWUucGF0aCxuPWkucmVmLG89KGkub3B0LDApLHI9dC5sZW5ndGg7Zm9yKG87cj5vO28rKyluPW4uZ2V0KHRbb10pO2lmKGkubm90fHxzLm5vZGUuc291bChlLm9iaikpe3ZhciBhPXMubm9kZS5zb3VsKGUub2JqKXx8KChpLm9wdHx8e30pLnV1aWR8fGkuZ3VuLmJhY2soXCJvcHQudXVpZFwiKXx8cy50ZXh0LnJhbmRvbSkoKTtyZXR1cm4gbi5iYWNrKC0xKS5nZXQoYSksdm9pZCBlLnNvdWwoYSl9KGkuc3R1bj1pLnN0dW58fHt9KVt0XT0hMCxuLmdldChcIl9cIikuZ2V0KHUse2FzOnthdDplLGFzOml9fSl9LHthczppLGF0OmV9KX1mdW5jdGlvbiB1KHQsbil7dmFyIG89dGhpcy5hcyxlPW8uYXQ7aWYobz1vLmFzLHQuZ3VuJiZ0Lmd1bi5fLmJhY2spe24ub2ZmKCksdD10Lmd1bi5fLmJhY2suXzt2YXIgaT1zLm5vZGUuc291bChlLm9iail8fHMubm9kZS5zb3VsKHQucHV0KXx8cy52YWwucmVsLmlzKHQucHV0KXx8KChvLm9wdHx8e30pLnV1aWR8fG8uZ3VuLmJhY2soXCJvcHQudXVpZFwiKXx8cy50ZXh0LnJhbmRvbSkoKTt0Lmd1bi5iYWNrKC0xKS5nZXQoaSksZS5zb3VsKGkpLG8uc3R1bltlLnBhdGhdPSExLG8uYmF0Y2goKX19ZnVuY3Rpb24gYSh0LG4pe3ZhciBlPXRoaXMuYXM7aWYodC5ndW4mJnQuZ3VuLl8pe2lmKHQuZXJyKXJldHVybiB2b2lkIG8ubG9nKFwiUGxlYXNlIHJlcG9ydCB0aGlzIGFzIGFuIGlzc3VlISBQdXQuYW55LmVyclwiKTt2YXIgaSxyPXQuZ3VuLl8uYmFjay5fLHU9ci5wdXQsYT1lLm9wdHx8e307aWYobi5vZmYoKSxlLnJlZiE9PWUuZ3VuKXtpZihpPWUuZ3VuLl8uZ2V0fHxyLmdldCwhaSlyZXR1cm4gdm9pZCBvLmxvZyhcIlBsZWFzZSByZXBvcnQgdGhpcyBhcyBhbiBpc3N1ZSEgUHV0Lm5vLmdldFwiKTtlLmRhdGE9cCh7fSxpLGUuZGF0YSksaT1udWxsfWlmKGY9PT11KXtpZighci5nZXQpcmV0dXJuO3Iuc291bHx8KGk9ci5ndW4uYmFjayhmdW5jdGlvbih0KXtyZXR1cm4gdC5zb3VsP3Quc291bDp2b2lkKGUuZGF0YT1wKHt9LHQuZ2V0LGUuZGF0YSkpfSkpLGk9aXx8ci5nZXQscj1yLnJvb3QuZ2V0KGkpLl8sZS5ub3Q9ZS5zb3VsPWksdT1lLmRhdGF9ZS5ub3R8fChlLnNvdWw9cy5ub2RlLnNvdWwodSkpfHwoZS5zb3VsPWUucGF0aCYmbChlLmRhdGEpPyhhLnV1aWR8fHIucm9vdC5fLm9wdC51dWlkfHxzLnRleHQucmFuZG9tKSgpOnQuc291bHx8ci5zb3VsfHwoYS51dWlkfHxyLnJvb3QuXy5vcHQudXVpZHx8cy50ZXh0LnJhbmRvbSkoKSksZS5yZWYucHV0KGUuZGF0YSxlLnNvdWwsZSl9fXZhciBzPXQoXCIuL3Jvb3RcIik7cy5jaGFpbi5wdXQ9ZnVuY3Rpb24odCxvLGUpe3ZhciBpLHI9dGhpcyx1PXIuXyxmPXUucm9vdDtyZXR1cm4gZT1lfHx7fSxlLmRhdGE9dCxlLmd1bj1lLmd1bnx8cixcInN0cmluZ1wiPT10eXBlb2Ygbz9lLnNvdWw9bzplLmFjaz1vLHUuc291bCYmKGUuc291bD11LnNvdWwpLGUuc291bHx8Zj09PXI/bChlLmRhdGEpPyhlLmd1bj1yPWYuZ2V0KGUuc291bD1lLnNvdWx8fChlLm5vdD1zLm5vZGUuc291bChlLmRhdGEpfHwoZi5fLm9wdC51dWlkfHxzLnRleHQucmFuZG9tKSgpKSksZS5yZWY9ZS5ndW4sbihlKSxyKTooKGUuYWNrfHxoKS5jYWxsKGUsZS5vdXQ9e2VycjpzLmxvZyhcIkRhdGEgc2F2ZWQgdG8gdGhlIHJvb3QgbGV2ZWwgb2YgdGhlIGdyYXBoIG11c3QgYmUgYSBub2RlIChhbiBvYmplY3QpLCBub3QgYVwiLHR5cGVvZiBlLmRhdGEsJ29mIFwiJytlLmRhdGErJ1wiIScpfSksZS5yZXMmJmUucmVzKCkscik6cy5pcyh0KT8odC5nZXQoZnVuY3Rpb24odCxuKXtuLm9mZigpO3ZhciBpPXMubm9kZS5zb3VsKHQucHV0KTtyZXR1cm4gaT92b2lkIHIucHV0KHMudmFsLnJlbC5pZnkoaSksbyxlKTp2b2lkIHMubG9nKFwiVGhlIHJlZmVyZW5jZSB5b3UgYXJlIHNhdmluZyBpcyBhXCIsdHlwZW9mIHQucHV0LCdcIicrZS5wdXQrJ1wiLCBub3QgYSBub2RlIChvYmplY3QpIScpfSkscik6KGUucmVmPWUucmVmfHxmPT09KGk9dS5iYWNrKT9yOmksZS5yZWYuXy5zb3VsJiZzLnZhbC5pcyhlLmRhdGEpJiZ1LmdldD8oZS5kYXRhPXAoe30sdS5nZXQsZS5kYXRhKSxlLnJlZi5wdXQoZS5kYXRhLGUuc291bCxlKSxyKTooZS5yZWYuZ2V0KFwiX1wiKS5nZXQoYSx7YXM6ZX0pLGUub3V0fHwoZS5yZXM9ZS5yZXN8fHMub24uc3R1bihlLnJlZiksZS5ndW4uXy5zdHVuPWUucmVmLl8uc3R1bikscikpfTt2YXIgZixjPXMub2JqLGw9Yy5pcyxwPWMucHV0LGQ9Yy5tYXAsZz17fSxoPWZ1bmN0aW9uKCl7fSx2PWZ1bmN0aW9uKHQsbil7dC5jYWxsKG58fGcpfX0pKHQsXCIuL3B1dFwiKSx0KGZ1bmN0aW9uKG4pe3ZhciBlPXQoXCIuL3Jvb3RcIik7bi5leHBvcnRzPWUsZnVuY3Rpb24oKXtmdW5jdGlvbiB0KHQsbil7aWYoZS5fLm5vZGUhPT1uKXt2YXIgcj10aGlzLm5vZGUsdT10aGlzLnZlcnRleCxhPXRoaXMudW5pb24scz10aGlzLm1hY2hpbmUsZj1nKHIsbiksYz1nKHUsbik7aWYoaT09PWZ8fGk9PT1jKXJldHVybiEwO3ZhciBsPXQscD11W25dO2lmKCFfKGwpJiZpIT09bClyZXR1cm4hMDtpZighXyhwKSYmaSE9PXApcmV0dXJuITA7dmFyIGQ9ZS5IQU0ocyxmLGMsbCxwKTtpZihkLmVycilyZXR1cm4gdm9pZCBvLmxvZyhcIi4hSFlQT1RIRVRJQ0FMIEFNTkVTSUEgTUFDSElORSBFUlIhLlwiLG4sZC5lcnIpO2lmKCEoZC5zdGF0ZXx8ZC5oaXN0b3JpY2FsfHxkLmN1cnJlbnQpKXJldHVybiBkLmluY29taW5nPyhhW25dPXQsdm9pZCBoKGEsbixmKSk6ZC5kZWZlcj8oYVtuXT10LHZvaWQgaChhLG4sZikpOnZvaWQgMH19ZnVuY3Rpb24gbih0LG4pe3ZhciBvPXRoaXM7aWYoZS5fLm5vZGUhPT1uJiZfKHQpKXt2YXIgaT1vLm5vZGUscj1vLnZlcnRleCx1PWcoaSxuLCEwKSxhPWcocixuLCEwKSxzPW8uZGVsdGEsZj1lLkhBTShvLm1hY2hpbmUsdSxhLHQscltuXSk7Zi5pbmNvbWluZyYmKHNbbl09dCxoKHMsbix1KSl9fWUuSEFNLnVuaW9uPWZ1bmN0aW9uKG4sbyxpKXtyZXR1cm4gbyYmby5fJiYobj1ufHxlLm5vZGUuc291bC5pZnkoe186e1wiPlwiOnt9fX0sZS5ub2RlLnNvdWwobykpLG4mJm4uXyYmKGk9YShpKT97bWFjaGluZTppfTp7bWFjaGluZTplLnN0YXRlKCl9LGkudW5pb249bnx8ZS5vYmouY29weShuKSxpLnZlcnRleD1uLGkubm9kZT1vLCFsKG8sdCxpKSkpP2kudW5pb246dm9pZCAwfSxlLkhBTS5kZWx0YT1mdW5jdGlvbih0LG8saSl7cmV0dXJuIGk9YShpKT97bWFjaGluZTppfTp7bWFjaGluZTplLnN0YXRlKCl9LHQ/KGkuc291bD1lLm5vZGUuc291bChpLnZlcnRleD10KSxpLnNvdWw/KGkuZGVsdGE9ZS5ub2RlLnNvdWwuaWZ5KHt9LGkuc291bCksbChpLm5vZGU9byxuLGkpLGkuZGVsdGEpOnZvaWQgMCk6ZS5vYmouY29weShvKX0sZS5IQU0uc3ludGg9ZnVuY3Rpb24odCl7dmFyIG49dGhpcy5hcyxvPW4uZ3VuLl87aWYoIXQucHV0fHxuW1wiLlwiXSYmIWYodC5wdXRbbltcIiNcIl1dLG8uZ2V0KSl7aWYoby5wdXQhPT1pKXJldHVybjtyZXR1cm4gdm9pZCBvLm9uKFwiaW5cIix7Z2V0Om8uZ2V0LHB1dDpvLnB1dD1pLGd1bjpvLmd1bn0pfXQuZ3VuPW8ucm9vdCxlLm9uKFwicHV0XCIsdCl9LGUuSEFNLnN5bnRoXz1mdW5jdGlvbih0LG4sbyl7dmFyIHI9dGhpcy5hc3x8byx1PXIuXyxhPXUucm9vdC5fLHM9e307aWYoIXQucHV0KXtpZih1LnB1dCE9PWkpcmV0dXJuO3JldHVybiB2b2lkIHUub24oXCJpblwiLHtnZXQ6dS5nZXQscHV0OnUucHV0PWksZ3VuOnIsdmlhOnR9KX1sKHQucHV0LGZ1bmN0aW9uKHQsbil7dmFyIG89dGhpcy5ncmFwaDtzW25dPWUuSEFNLmRlbHRhKG9bbl0sdCx7Z3JhcGg6b30pLG9bbl09ZS5IQU0udW5pb24ob1tuXSx0KXx8b1tuXX0sYSksdC5ndW4hPT1hLmd1biYmKHM9dC5wdXQpLGwocyxmdW5jdGlvbihvLHIpe3ZhciBhPXRoaXMscz1hLm5leHR8fChhLm5leHQ9e30pLGw9c1tyXXx8KHNbcl09YS5ndW4uZ2V0KHIpKSxwPWwuXztyZXR1cm4gcC5wdXQ9YS5ncmFwaFtyXSx1LmZpZWxkJiYhZihvLHUuZmllbGQpPygodD1jKHQse30pKS5wdXQ9aSx2b2lkIGUuSEFNLnN5bnRoKHQsbix1Lmd1bikpOnZvaWQgcC5vbihcImluXCIse3B1dDpvLGdldDpyLGd1bjpsLHZpYTp0fSl9LGEpfX0oKTt7dmFyIGkscj1lLHU9ci5udW0sYT11LmlzLHM9ci5vYmosZj1zLmhhcyxjPShzLnB1dCxzLnRvKSxsPXMubWFwLHA9ZS5ub2RlLGQ9KHAuc291bCxwLmlzLHAuaWZ5LGUuc3RhdGUpLGc9ZC5pcyxoPWQuaWZ5LHY9ZS52YWwsXz12LmlzO3YucmVsLmlzfX0pKHQsXCIuL2luZGV4XCIpLHQoZnVuY3Rpb24obil7dmFyIG89dChcIi4vcm9vdFwiKTt0KFwiLi9pbmRleFwiKSx0KFwiLi9vcHRcIiksdChcIi4vY2hhaW5cIiksdChcIi4vYmFja1wiKSx0KFwiLi9wdXRcIiksdChcIi4vZ2V0XCIpLG4uZXhwb3J0cz1vfSkodCxcIi4vY29yZVwiKSx0KGZ1bmN0aW9uKCl7dmFyIG49dChcIi4vY29yZVwiKTtuLmNoYWluLnBhdGg9ZnVuY3Rpb24odCxvLGUpe3ZhciBpLHI9dGhpcyx1PXI7aWYoZT1lfHx7fSxlLnBhdGg9ITAsbi5sb2cub25jZShcInBhdGhpbmdcIixcIldhcm5pbmc6IGAucGF0aGAgdG8gYmUgcmVtb3ZlZCBmcm9tIGNvcmUgKGJ1dCBhdmFpbGFibGUgYXMgYW4gZXh0ZW5zaW9uKSwgdXNlIGAuZ2V0YCBjaGFpbnMgaW5zdGVhZC4gSWYgeW91IGFyZSBvcHBvc2VkIHRvIHRoaXMsIHBsZWFzZSB2b2ljZSB5b3VyIG9waW5pb24gaW4gaHR0cHM6Ly9naXR0ZXIuaW0vYW1hcmsvZ3VuIGFuZCBhc2sgb3RoZXJzLlwiKSx1PT09dS5fLnJvb3QpcmV0dXJuIG8mJm8oe2VycjpuLmxvZyhcIkNhbid0IGRvIHRoYXQgb24gcm9vdCBpbnN0YW5jZS5cIil9KSx1O2lmKFwic3RyaW5nXCI9PXR5cGVvZiB0KXtpZihpPXQuc3BsaXQoZS5zcGxpdHx8XCIuXCIpLDE9PT1pLmxlbmd0aClyZXR1cm4gdT1yLmdldCh0LG8sZSksdS5fLm9wdD1lLHU7dD1pfWlmKHQgaW5zdGFuY2VvZiBBcnJheSl7aWYodC5sZW5ndGg+MSl7dT1yO3ZhciBhPTAscz10Lmxlbmd0aDtmb3IoYTtzPmE7YSsrKXU9dS5nZXQodFthXSxhKzE9PT1zP286bnVsbCxlKX1lbHNlIHU9ci5nZXQodFswXSxvLGUpO3JldHVybiB1Ll8ub3B0PWUsdX1yZXR1cm4gdHx8MD09dD8odT1yLmdldChcIlwiK3QsbyxlKSx1Ll8ub3B0PWUsdSk6cn19KSh0LFwiLi9wYXRoXCIpLHQoZnVuY3Rpb24oKXtmdW5jdGlvbiBuKHQsbil7dmFyIG8scj10aGlzLHU9dC5ndW4scz11Ll8sZj1zLnB1dHx8dC5wdXQsbz1yLmxhc3QsYz1zLmlkK3QuZ2V0O2lmKGkhPT1mKXtpZihmJiZmW2EuX10mJihvPWEuaXMoZikpKXtpZihvPXMucm9vdC5nZXQobykuXyxpPT09by5wdXQpcmV0dXJuO2Y9by5wdXR9ci5jaGFuZ2UmJihmPXQucHV0KSwoby5wdXQhPT1mfHxvLmdldCE9PWN8fGUubm9kZS5zb3VsKGYpKSYmKG8ucHV0PWYsby5nZXQ9YyxzLmxhc3Q9ZixyLmFzP3Iub2suY2FsbChyLmFzLHQsbik6ci5vay5jYWxsKHUsZix0LmdldCx0LG4pKX19ZnVuY3Rpb24gbyh0LG4pe3ZhciBlLHI9dGhpcy5hcyx1PXIuY2F0LHM9dC5ndW4sZj1zLl8sYz1mLnB1dHx8dC5wdXQ7aWYoYyYmY1thLl9dJiYoZT1hLmlzKGMpKSl7aWYoZT11LnJvb3QuZ2V0KGUpLl8saT09PWUucHV0KXJldHVybjtjPWUucHV0fWlmKG4ud2FpdCYmY2xlYXJUaW1lb3V0KG4ud2FpdCksIXIuYXN5bmMpcmV0dXJuIHZvaWQobi53YWl0PXNldFRpbWVvdXQoZnVuY3Rpb24oKXtvLmNhbGwoe2FzOnJ9LHQsbixuLndhaXR8fDEpfSxyLndhaXR8fDk5KSk7aWYodS5maWVsZHx8dS5zb3VsKXtpZihuLm9mZigpKXJldHVybn1lbHNle2lmKChyLnNlZW49ci5zZWVufHx7fSlbZi5pZF0pcmV0dXJuO3Iuc2VlbltmLmlkXT0hMH1yLm9rLmNhbGwodC5ndW58fHIuZ3VuLGMsdC5nZXQpfXZhciBlPXQoXCIuL2NvcmVcIik7ZS5jaGFpbi5vbj1mdW5jdGlvbih0LG8sZSxpKXt2YXIgcix1LGE9dGhpcyxmPWEuXztpZihcInN0cmluZ1wiPT10eXBlb2YgdClyZXR1cm4gbz8ocj1mLm9uKHQsbyxlfHxmLGkpLGUmJmUuZ3VuJiYoZS5zdWJzfHwoZS5zdWJzPVtdKSkucHVzaChyKSx1PWZ1bmN0aW9uKCl7ciYmci5vZmYmJnIub2ZmKCksdS5vZmYoKX0sdS5vZmY9YS5vZmYuYmluZChhKXx8cyxhLm9mZj11LGEpOmYub24odCk7dmFyIGM9bztyZXR1cm4gYz0hMD09PWM/e2NoYW5nZTohMH06Y3x8e30sYy5vaz10LGMubGFzdD17fSxhLmdldChuLGMpLGF9LGUuY2hhaW4udmFsPWZ1bmN0aW9uKHQsbil7dmFyIHI9dGhpcyx1PXIuXyxhPXUucHV0O2lmKDA8dS5hY2smJmkhPT1hKXJldHVybih0fHxzKS5jYWxsKHIsYSx1LmdldCkscjtpZighdCl7ZS5sb2cub25jZShcInZhbG9uY2VcIixcIkNoYWluYWJsZSB2YWwgaXMgZXhwZXJpbWVudGFsLCBpdHMgYmVoYXZpb3IgYW5kIEFQSSBtYXkgY2hhbmdlIG1vdmluZyBmb3J3YXJkLiBQbGVhc2UgcGxheSB3aXRoIGl0IGFuZCByZXBvcnQgYnVncyBhbmQgaWRlYXMgb24gaG93IHRvIGltcHJvdmUgaXQuXCIpO3ZhciBmPXIuY2hhaW4oKTtyZXR1cm4gZi5fLnZhbD1yLnZhbChmdW5jdGlvbigpe2YuXy5vbihcImluXCIsci5fKX0pLGZ9cmV0dXJuKG49bnx8e30pLm9rPXQsbi5jYXQ9dSxyLmdldChvLHthczpufSksbi5hc3luYz0hMCxyfSxlLmNoYWluLm9mZj1mdW5jdGlvbigpe3ZhciB0LG49dGhpcyxvPW4uXyxlPW8uYmFja3x8e30saT1lLl87cmV0dXJuIGk/KCh0PWkubmV4dCkmJih0W28uZ2V0XT91KHQsby5nZXQpOm9ial9tYXAodCxmdW5jdGlvbihvLGUpe249PT1vJiZ1KHQsZSl9KSksKHQ9bi5iYWNrKC0xKSk9PT1lJiZ1KHQuZ3JhcGgsby5nZXQpLG8ub25zJiYodD1vLm9uc1tcIkAkXCJdKSYmb2JqX21hcCh0LnMsZnVuY3Rpb24odCl7dC5vZmYoKX0pLG4pOnZvaWQgMH07dmFyIGkscj1lLm9iaix1PShyLmhhcyxyLmRlbCksYT0oci50byxlLnZhbC5yZWwpLHM9ZnVuY3Rpb24oKXt9fSkodCxcIi4vb25cIiksdChmdW5jdGlvbigpe2Z1bmN0aW9uIG4odCxuKXtuLm9mZigpLHQuZXJyfHxlIT09dC5wdXR8fHRoaXMubm90JiZ0aGlzLm5vdC5jYWxsKHQuZ3VuLHQuZ2V0LGZ1bmN0aW9uKCl7by5sb2coXCJQbGVhc2UgcmVwb3J0IHRoaXMgYnVnIG9uIGh0dHBzOi8vZ2l0dGVyLmltL2FtYXJrL2d1biBhbmQgaW4gdGhlIGlzc3Vlcy5cIiksbmVlZC50by5pbXBsZW1lbnR9KX12YXIgZSxpPXQoXCIuL2NvcmVcIik7aS5jaGFpbi5ub3Q9ZnVuY3Rpb24odCl7cmV0dXJuIGkubG9nLm9uY2UoXCJub3R0b2JlXCIsXCJXYXJuaW5nOiBgLm5vdGAgdG8gYmUgcmVtb3ZlZCBmcm9tIGNvcmUgKGJ1dCBhdmFpbGFibGUgYXMgYW4gZXh0ZW5zaW9uKSwgdXNlIGAudmFsYCBpbnN0ZWFkLCB3aGljaCBub3cgc3VwcG9ydHMgKHYwLjcueCspICdub3QgZm91bmQgZGF0YScgYXMgYHVuZGVmaW5lZGAgZGF0YSBpbiBjYWxsYmFja3MuIElmIHlvdSBhcmUgb3Bwb3NlZCB0byB0aGlzLCBwbGVhc2Ugdm9pY2UgeW91ciBvcGluaW9uIGluIGh0dHBzOi8vZ2l0dGVyLmltL2FtYXJrL2d1biBhbmQgYXNrIG90aGVycy5cIiksdGhpcy5nZXQobix7bm90OnR9KX19KSh0LFwiLi9ub3RcIiksdChmdW5jdGlvbigpe2Z1bmN0aW9uIG4odCl7dC5wdXQmJiFlLnZhbC5pcyh0LnB1dCkmJih0aGlzLmFzLnZhbCYmdGhpcy5vZmYoKSxyKHQucHV0LG8se2NhdDp0aGlzLmFzLGd1bjp0Lmd1bn0pLHRoaXMudG8ubmV4dCh0KSl9ZnVuY3Rpb24gbyh0LG4pe2lmKGEhPT1uKXt2YXIgbz10aGlzLmNhdCxlPXRoaXMuZ3VuLmdldChuKSxpPWUuXzsoaS5lY2hvfHwoaS5lY2hvPXt9KSlbby5pZF09b319dmFyIGU9dChcIi4vY29yZVwiKTtlLmNoYWluLm1hcD1mdW5jdGlvbih0KXt2YXIgbyxyPXRoaXMsYT1yLl87cmV0dXJuIHQ/KGUubG9nLm9uY2UoXCJtYXBmblwiLFwiTWFwIGZ1bmN0aW9ucyBhcmUgZXhwZXJpbWVudGFsLCB0aGVpciBiZWhhdmlvciBhbmQgQVBJIG1heSBjaGFuZ2UgbW92aW5nIGZvcndhcmQuIFBsZWFzZSBwbGF5IHdpdGggaXQgYW5kIHJlcG9ydCBidWdzIGFuZCBpZGVhcyBvbiBob3cgdG8gaW1wcm92ZSBpdC5cIiksbz1yLmNoYWluKCksci5tYXAoKS5vbihmdW5jdGlvbihuLHIsYSxzKXt2YXIgZj0odHx8dSkuY2FsbCh0aGlzLG4scixhLHMpO2lmKGkhPT1mKXJldHVybiBlLmlzKGYpP3ZvaWQgby5fLm9uKFwiaW5cIixmLl8pOnZvaWQgby5fLm9uKFwiaW5cIix7Z2V0OnIscHV0OmYsZ3VuOm99KX0pLG8pOihvPWEuZmllbGRzKT9vOihvPWEuZmllbGRzPXIuY2hhaW4oKSxvLl8udmFsPXIuYmFjayhcInZhbFwiKSxyLm9uKFwiaW5cIixuLG8uXyksbyl9O3ZhciBpLHI9ZS5vYmoubWFwLHU9ZnVuY3Rpb24oKXt9LGE9ZS5ub2RlLl99KSh0LFwiLi9tYXBcIiksdChmdW5jdGlvbigpe3ZhciBuPXQoXCIuL2NvcmVcIik7bi5jaGFpbi5zZXQ9ZnVuY3Rpb24odCxvLGUpe3ZhciBpLHI9dGhpcztyZXR1cm4gbz1vfHxmdW5jdGlvbigpe30sKGk9bi5ub2RlLnNvdWwodCkpP3Iuc2V0KHIuYmFjaygtMSkuZ2V0KGkpLG8sZSk6bi5pcyh0KT8odC5nZXQoXCJfXCIpLmdldChmdW5jdGlvbih0LGkpeyF0Lmd1bnx8IXQuZ3VuLl8uYmFjayxpLm9mZigpLHQ9dC5ndW4uXy5iYWNrLl87dmFyIHU9e30sYT10LnB1dCxzPW4ubm9kZS5zb3VsKGEpO3JldHVybiBzP3ZvaWQgci5wdXQobi5vYmoucHV0KHUscyxuLnZhbC5yZWwuaWZ5KHMpKSxvLGUpOm8uY2FsbChyLHtlcnI6bi5sb2coJ09ubHkgYSBub2RlIGNhbiBiZSBsaW5rZWQhIE5vdCBcIicrYSsnXCIhJyl9KX0se3dhaXQ6MH0pLHQpOm4ub2JqLmlzKHQpP3Iuc2V0KHIuXy5yb290LnB1dCh0KSxvLGUpOnIuZ2V0KG4udGV4dC5yYW5kb20oKSkucHV0KHQpfX0pKHQsXCIuL3NldFwiKSx0KGZ1bmN0aW9uKCl7aWYoXCJ1bmRlZmluZWRcIiE9dHlwZW9mIEd1bil7dmFyIHQsbj1mdW5jdGlvbigpe307XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdyYmKHQ9d2luZG93KTt2YXIgbyxlPXQubG9jYWxTdG9yYWdlfHx7c2V0SXRlbTpuLHJlbW92ZUl0ZW06bixnZXRJdGVtOm59LGk9e30scj17fSx1PTAsYT0xZTQ7R3VuLm9uKFwicHV0XCIsZnVuY3Rpb24odCl7ZnVuY3Rpb24gbigpe2NsZWFyVGltZW91dChvKTt2YXIgbj1pLGE9cjt1PTAsbz0hMSxpPXt9LHI9e30sR3VuLm9iai5tYXAoYSxmdW5jdGlvbih0LG4pe3Q9bFtuXXx8YVtuXXx8dDt0cnl7ZS5zZXRJdGVtKGYucHJlZml4K24sSlNPTi5zdHJpbmdpZnkodCkpfWNhdGNoKG8pe3M9b3x8XCJsb2NhbFN0b3JhZ2UgZmFpbHVyZVwifX0pLEd1bi5vYmouZW1wdHkodC5ndW4uYmFjayhcIm9wdC5wZWVyc1wiKSkmJkd1bi5vYmoubWFwKG4sZnVuY3Rpb24odCxuKXt0Lm9uKFwiaW5cIix7XCJAXCI6bixlcnI6cyxvazowfSl9KX12YXIgcyxmLGM9dC5ndW4uXy5yb290O3RoaXMudG8ubmV4dCh0KSwoZj17fSkucHJlZml4PSh0Lm9wdHx8ZikucHJlZml4fHx0Lmd1bi5iYWNrKFwib3B0LnByZWZpeFwiKXx8XCJndW4vXCI7dmFyIGw9Yy5fLmdyYXBoO3JldHVybiBHdW4ub2JqLm1hcCh0LnB1dCxmdW5jdGlvbih0LG4pe3Jbbl09cltuXXx8bFtuXXx8dH0pLHUrPTEsaVt0W1wiI1wiXV09Yyx1Pj1hP24oKTp2b2lkKG98fChjbGVhclRpbWVvdXQobyksbz1zZXRUaW1lb3V0KG4sMWUzKSkpfSksR3VuLm9uKFwiZ2V0XCIsZnVuY3Rpb24odCl7dGhpcy50by5uZXh0KHQpO3ZhciBuLG8saSx1LGE9dC5ndW4scz10LmdldDtpZigoaT10Lm9wdHx8e30pLnByZWZpeD1pLnByZWZpeHx8dC5ndW4uYmFjayhcIm9wdC5wcmVmaXhcIil8fFwiZ3VuL1wiLHMmJihuPXNbR3VuLl8uc291bF0pKXt2YXIgZj1zW1wiLlwiXTtvPUd1bi5vYmouaWZ5KGUuZ2V0SXRlbShpLnByZWZpeCtuKXx8bnVsbCl8fHJbbl18fHUsbyYmZiYmKG89R3VuLnN0YXRlLnRvKG8sZikpLChvfHxHdW4ub2JqLmVtcHR5KGEuYmFjayhcIm9wdC5wZWVyc1wiKSkpJiZhLm9uKFwiaW5cIix7XCJAXCI6dFtcIiNcIl0scHV0Okd1bi5ncmFwaC5ub2RlKG8pLGhvdzpcImxTXCJ9KX19KX19KSh0LFwiLi9hZGFwdGVycy9sb2NhbFN0b3JhZ2VcIiksdChmdW5jdGlvbigpe2Z1bmN0aW9uIG4odCl7dmFyIG49YSxvPXRoaXMsaT10LndpcmV8fGUodCxvKTtyZXR1cm4gby53c3AmJm8ud3NwLmNvdW50KyssaT9pLnJlYWR5U3RhdGU9PT1pLk9QRU4/dm9pZCBpLnNlbmQobik6dm9pZCh0LnF1ZXVlPXQucXVldWV8fFtdKS5wdXNoKG4pOnZvaWQgMH1mdW5jdGlvbiBvKHQsbixlKXtpZihlJiZ0KXt0cnl7dD1KU09OLnBhcnNlKHQuZGF0YXx8dCl9Y2F0Y2goaSl7fWlmKHQgaW5zdGFuY2VvZiBBcnJheSlmb3IodmFyIHIsdT0wO3I9dFt1KytdOylvKHIsbixlKTtlbHNlIGUud3NwJiYxPT09ZS53c3AuY291bnQmJigodC5ib2R5fHx0KS53c3A9ZiksZS5ndW4ub24oXCJpblwiLHQuYm9keXx8dCl9fWZ1bmN0aW9uIGUodCxlKXtpZih0JiZ0LnVybCl7dmFyIHM9dC51cmwucmVwbGFjZShcImh0dHBcIixcIndzXCIpLGY9dC53aXJlPW5ldyB1KHMsZS5vcHQud3NjLnByb3RvY29scyxlLm9wdC53c2MpO3JldHVybiBmLm9uY2xvc2U9ZnVuY3Rpb24oKXtpKHQsZSl9LGYub25lcnJvcj1mdW5jdGlvbihuKXtpKHQsZSksbiYmXCJFQ09OTlJFRlVTRURcIj09PW4uY29kZX0sZi5vbm9wZW49ZnVuY3Rpb24oKXt2YXIgbz10LnF1ZXVlO3QucXVldWU9W10sci5vYmoubWFwKG8sZnVuY3Rpb24obyl7YT1vLG4uY2FsbChlLHQpfSl9LGYub25tZXNzYWdlPWZ1bmN0aW9uKG4pe28obix0LGUpfSxmfX1mdW5jdGlvbiBpKHQsbil7Y2xlYXJUaW1lb3V0KHQuZGVmZXIpLHQuZGVmZXI9c2V0VGltZW91dChmdW5jdGlvbigpe2UodCxuKX0sMmUzKX12YXIgcj10KFwiLi9jb3JlXCIpO2lmKFwidW5kZWZpbmVkXCI9PXR5cGVvZiBKU09OKXRocm93IG5ldyBFcnJvcihcIkd1biBkZXBlbmRzIG9uIEpTT04uIFBsZWFzZSBsb2FkIGl0IGZpcnN0OlxcbmFqYXguY2RuanMuY29tL2FqYXgvbGlicy9qc29uMi8yMDExMDIyMy9qc29uMi5qc1wiKTt2YXIgdTtpZihcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93KXt1PXdpbmRvdy5XZWJTb2NrZXR8fHdpbmRvdy53ZWJraXRXZWJTb2NrZXR8fHdpbmRvdy5tb3pXZWJTb2NrZXQ7dmFyIGEscyxmPWZ1bmN0aW9uKCl7fTtyLm9uKFwib3V0XCIsZnVuY3Rpb24odCl7dGhpcy50by5uZXh0KHQpO3ZhciBvPXQuZ3VuLl8ucm9vdC5fLGU9by53c3B8fChvLndzcD17fSk7aWYoIXQud3NwfHwxIT09ZS5jb3VudCl7aWYoYT1KU09OLnN0cmluZ2lmeSh0KSxvLnVkcmFpbilyZXR1cm4gdm9pZCBvLnVkcmFpbi5wdXNoKGEpO28udWRyYWluPVtdLGNsZWFyVGltZW91dChzKSxzPXNldFRpbWVvdXQoZnVuY3Rpb24oKXtpZihvLnVkcmFpbil7dmFyIHQ9by51ZHJhaW47by51ZHJhaW49bnVsbCx0Lmxlbmd0aCYmKGE9SlNPTi5zdHJpbmdpZnkodCksci5vYmoubWFwKG8ub3B0LnBlZXJzLG4sbykpfX0sMSksZS5jb3VudD0wLHIub2JqLm1hcChvLm9wdC5wZWVycyxuLG8pfX0pfX0pKHQsXCIuL3BvbHlmaWxsL3JlcXVlc3RcIil9KCk7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9pbmRleCcpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuXG52YXIgX3BvbnlmaWxsID0gcmVxdWlyZSgnLi9wb255ZmlsbCcpO1xuXG52YXIgX3BvbnlmaWxsMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX3BvbnlmaWxsKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgJ2RlZmF1bHQnOiBvYmogfTsgfVxuXG52YXIgcm9vdDsgLyogZ2xvYmFsIHdpbmRvdyAqL1xuXG5cbmlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgcm9vdCA9IHNlbGY7XG59IGVsc2UgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gIHJvb3QgPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gIHJvb3QgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gIHJvb3QgPSBtb2R1bGU7XG59IGVsc2Uge1xuICByb290ID0gRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbn1cblxudmFyIHJlc3VsdCA9ICgwLCBfcG9ueWZpbGwyWydkZWZhdWx0J10pKHJvb3QpO1xuZXhwb3J0c1snZGVmYXVsdCddID0gcmVzdWx0OyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG5cdHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHNbJ2RlZmF1bHQnXSA9IHN5bWJvbE9ic2VydmFibGVQb255ZmlsbDtcbmZ1bmN0aW9uIHN5bWJvbE9ic2VydmFibGVQb255ZmlsbChyb290KSB7XG5cdHZhciByZXN1bHQ7XG5cdHZhciBfU3ltYm9sID0gcm9vdC5TeW1ib2w7XG5cblx0aWYgKHR5cGVvZiBfU3ltYm9sID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0aWYgKF9TeW1ib2wub2JzZXJ2YWJsZSkge1xuXHRcdFx0cmVzdWx0ID0gX1N5bWJvbC5vYnNlcnZhYmxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSBfU3ltYm9sKCdvYnNlcnZhYmxlJyk7XG5cdFx0XHRfU3ltYm9sLm9ic2VydmFibGUgPSByZXN1bHQ7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJlc3VsdCA9ICdAQG9ic2VydmFibGUnO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgaW5kZXhfMSA9IHJlcXVpcmUoXCIuLi9pbmRleFwiKTtcbnZhciBlbXB0eSA9IHt9O1xudmFyIERyb3BSZXBlYXRzT3BlcmF0b3IgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERyb3BSZXBlYXRzT3BlcmF0b3IoaW5zLCBmbikge1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5mbiA9IGZuO1xuICAgICAgICB0aGlzLnR5cGUgPSAnZHJvcFJlcGVhdHMnO1xuICAgICAgICB0aGlzLm91dCA9IG51bGw7XG4gICAgICAgIHRoaXMudiA9IGVtcHR5O1xuICAgIH1cbiAgICBEcm9wUmVwZWF0c09wZXJhdG9yLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRHJvcFJlcGVhdHNPcGVyYXRvci5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMub3V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy52ID0gZW1wdHk7XG4gICAgfTtcbiAgICBEcm9wUmVwZWF0c09wZXJhdG9yLnByb3RvdHlwZS5pc0VxID0gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZm4gPyB0aGlzLmZuKHgsIHkpIDogeCA9PT0geTtcbiAgICB9O1xuICAgIERyb3BSZXBlYXRzT3BlcmF0b3IucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKCF1KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgdiA9IHRoaXMudjtcbiAgICAgICAgaWYgKHYgIT09IGVtcHR5ICYmIHRoaXMuaXNFcSh0LCB2KSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy52ID0gdDtcbiAgICAgICAgdS5fbih0KTtcbiAgICB9O1xuICAgIERyb3BSZXBlYXRzT3BlcmF0b3IucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAoIXUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIERyb3BSZXBlYXRzT3BlcmF0b3IucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAoIXUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBEcm9wUmVwZWF0c09wZXJhdG9yO1xufSgpKTtcbmV4cG9ydHMuRHJvcFJlcGVhdHNPcGVyYXRvciA9IERyb3BSZXBlYXRzT3BlcmF0b3I7XG4vKipcbiAqIERyb3BzIGNvbnNlY3V0aXZlIGR1cGxpY2F0ZSB2YWx1ZXMgaW4gYSBzdHJlYW0uXG4gKlxuICogTWFyYmxlIGRpYWdyYW06XG4gKlxuICogYGBgdGV4dFxuICogLS0xLS0yLS0xLS0xLS0xLS0yLS0zLS00LS0zLS0zfFxuICogICAgIGRyb3BSZXBlYXRzXG4gKiAtLTEtLTItLTEtLS0tLS0tLTItLTMtLTQtLTMtLS18XG4gKiBgYGBcbiAqXG4gKiBFeGFtcGxlOlxuICpcbiAqIGBgYGpzXG4gKiBpbXBvcnQgZHJvcFJlcGVhdHMgZnJvbSAneHN0cmVhbS9leHRyYS9kcm9wUmVwZWF0cydcbiAqXG4gKiBjb25zdCBzdHJlYW0gPSB4cy5vZigxLCAyLCAxLCAxLCAxLCAyLCAzLCA0LCAzLCAzKVxuICogICAuY29tcG9zZShkcm9wUmVwZWF0cygpKVxuICpcbiAqIHN0cmVhbS5hZGRMaXN0ZW5lcih7XG4gKiAgIG5leHQ6IGkgPT4gY29uc29sZS5sb2coaSksXG4gKiAgIGVycm9yOiBlcnIgPT4gY29uc29sZS5lcnJvcihlcnIpLFxuICogICBjb21wbGV0ZTogKCkgPT4gY29uc29sZS5sb2coJ2NvbXBsZXRlZCcpXG4gKiB9KVxuICogYGBgXG4gKlxuICogYGBgdGV4dFxuICogPiAxXG4gKiA+IDJcbiAqID4gMVxuICogPiAyXG4gKiA+IDNcbiAqID4gNFxuICogPiAzXG4gKiA+IGNvbXBsZXRlZFxuICogYGBgXG4gKlxuICogRXhhbXBsZSB3aXRoIGEgY3VzdG9tIGlzRXF1YWwgZnVuY3Rpb246XG4gKlxuICogYGBganNcbiAqIGltcG9ydCBkcm9wUmVwZWF0cyBmcm9tICd4c3RyZWFtL2V4dHJhL2Ryb3BSZXBlYXRzJ1xuICpcbiAqIGNvbnN0IHN0cmVhbSA9IHhzLm9mKCdhJywgJ2InLCAnYScsICdBJywgJ0InLCAnYicpXG4gKiAgIC5jb21wb3NlKGRyb3BSZXBlYXRzKCh4LCB5KSA9PiB4LnRvTG93ZXJDYXNlKCkgPT09IHkudG9Mb3dlckNhc2UoKSkpXG4gKlxuICogc3RyZWFtLmFkZExpc3RlbmVyKHtcbiAqICAgbmV4dDogaSA9PiBjb25zb2xlLmxvZyhpKSxcbiAqICAgZXJyb3I6IGVyciA9PiBjb25zb2xlLmVycm9yKGVyciksXG4gKiAgIGNvbXBsZXRlOiAoKSA9PiBjb25zb2xlLmxvZygnY29tcGxldGVkJylcbiAqIH0pXG4gKiBgYGBcbiAqXG4gKiBgYGB0ZXh0XG4gKiA+IGFcbiAqID4gYlxuICogPiBhXG4gKiA+IEJcbiAqID4gY29tcGxldGVkXG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpc0VxdWFsIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIG9mIHR5cGVcbiAqIGAoeDogVCwgeTogVCkgPT4gYm9vbGVhbmAgdGhhdCB0YWtlcyBhbiBldmVudCBmcm9tIHRoZSBpbnB1dCBzdHJlYW0gYW5kXG4gKiBjaGVja3MgaWYgaXQgaXMgZXF1YWwgdG8gcHJldmlvdXMgZXZlbnQsIGJ5IHJldHVybmluZyBhIGJvb2xlYW4uXG4gKiBAcmV0dXJuIHtTdHJlYW19XG4gKi9cbmZ1bmN0aW9uIGRyb3BSZXBlYXRzKGlzRXF1YWwpIHtcbiAgICBpZiAoaXNFcXVhbCA9PT0gdm9pZCAwKSB7IGlzRXF1YWwgPSB2b2lkIDA7IH1cbiAgICByZXR1cm4gZnVuY3Rpb24gZHJvcFJlcGVhdHNPcGVyYXRvcihpbnMpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBpbmRleF8xLlN0cmVhbShuZXcgRHJvcFJlcGVhdHNPcGVyYXRvcihpbnMsIGlzRXF1YWwpKTtcbiAgICB9O1xufVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gZHJvcFJlcGVhdHM7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1kcm9wUmVwZWF0cy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBfX2V4dGVuZHMgPSAodGhpcyAmJiB0aGlzLl9fZXh0ZW5kcykgfHwgZnVuY3Rpb24gKGQsIGIpIHtcbiAgICBmb3IgKHZhciBwIGluIGIpIGlmIChiLmhhc093blByb3BlcnR5KHApKSBkW3BdID0gYltwXTtcbiAgICBmdW5jdGlvbiBfXygpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGQ7IH1cbiAgICBkLnByb3RvdHlwZSA9IGIgPT09IG51bGwgPyBPYmplY3QuY3JlYXRlKGIpIDogKF9fLnByb3RvdHlwZSA9IGIucHJvdG90eXBlLCBuZXcgX18oKSk7XG59O1xudmFyIHN5bWJvbF9vYnNlcnZhYmxlXzEgPSByZXF1aXJlKFwic3ltYm9sLW9ic2VydmFibGVcIik7XG52YXIgTk8gPSB7fTtcbmV4cG9ydHMuTk8gPSBOTztcbmZ1bmN0aW9uIG5vb3AoKSB7IH1cbmZ1bmN0aW9uIGNwKGEpIHtcbiAgICB2YXIgbCA9IGEubGVuZ3RoO1xuICAgIHZhciBiID0gQXJyYXkobCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyArK2kpXG4gICAgICAgIGJbaV0gPSBhW2ldO1xuICAgIHJldHVybiBiO1xufVxuZnVuY3Rpb24gYW5kKGYxLCBmMikge1xuICAgIHJldHVybiBmdW5jdGlvbiBhbmRGbih0KSB7XG4gICAgICAgIHJldHVybiBmMSh0KSAmJiBmMih0KTtcbiAgICB9O1xufVxuZnVuY3Rpb24gX3RyeShjLCB0LCB1KSB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGMuZih0KTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgdS5fZShlKTtcbiAgICAgICAgcmV0dXJuIE5PO1xuICAgIH1cbn1cbnZhciBOT19JTCA9IHtcbiAgICBfbjogbm9vcCxcbiAgICBfZTogbm9vcCxcbiAgICBfYzogbm9vcCxcbn07XG5leHBvcnRzLk5PX0lMID0gTk9fSUw7XG4vLyBtdXRhdGVzIHRoZSBpbnB1dFxuZnVuY3Rpb24gaW50ZXJuYWxpemVQcm9kdWNlcihwcm9kdWNlcikge1xuICAgIHByb2R1Y2VyLl9zdGFydCA9IGZ1bmN0aW9uIF9zdGFydChpbCkge1xuICAgICAgICBpbC5uZXh0ID0gaWwuX247XG4gICAgICAgIGlsLmVycm9yID0gaWwuX2U7XG4gICAgICAgIGlsLmNvbXBsZXRlID0gaWwuX2M7XG4gICAgICAgIHRoaXMuc3RhcnQoaWwpO1xuICAgIH07XG4gICAgcHJvZHVjZXIuX3N0b3AgPSBwcm9kdWNlci5zdG9wO1xufVxudmFyIFN0cmVhbVN1YiA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gU3RyZWFtU3ViKF9zdHJlYW0sIF9saXN0ZW5lcikge1xuICAgICAgICB0aGlzLl9zdHJlYW0gPSBfc3RyZWFtO1xuICAgICAgICB0aGlzLl9saXN0ZW5lciA9IF9saXN0ZW5lcjtcbiAgICB9XG4gICAgU3RyZWFtU3ViLnByb3RvdHlwZS51bnN1YnNjcmliZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fc3RyZWFtLnJlbW92ZUxpc3RlbmVyKHRoaXMuX2xpc3RlbmVyKTtcbiAgICB9O1xuICAgIHJldHVybiBTdHJlYW1TdWI7XG59KCkpO1xudmFyIE9ic2VydmVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBPYnNlcnZlcihfbGlzdGVuZXIpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIgPSBfbGlzdGVuZXI7XG4gICAgfVxuICAgIE9ic2VydmVyLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVyLl9uKHZhbHVlKTtcbiAgICB9O1xuICAgIE9ic2VydmVyLnByb3RvdHlwZS5lcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIuX2UoZXJyKTtcbiAgICB9O1xuICAgIE9ic2VydmVyLnByb3RvdHlwZS5jb21wbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXIuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBPYnNlcnZlcjtcbn0oKSk7XG52YXIgRnJvbU9ic2VydmFibGUgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEZyb21PYnNlcnZhYmxlKG9ic2VydmFibGUpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2Zyb21PYnNlcnZhYmxlJztcbiAgICAgICAgdGhpcy5pbnMgPSBvYnNlcnZhYmxlO1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlO1xuICAgIH1cbiAgICBGcm9tT2JzZXJ2YWJsZS5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xuICAgICAgICB0aGlzLl9zdWIgPSB0aGlzLmlucy5zdWJzY3JpYmUobmV3IE9ic2VydmVyKG91dCkpO1xuICAgICAgICBpZiAoIXRoaXMuYWN0aXZlKVxuICAgICAgICAgICAgdGhpcy5fc3ViLnVuc3Vic2NyaWJlKCk7XG4gICAgfTtcbiAgICBGcm9tT2JzZXJ2YWJsZS5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9zdWIpXG4gICAgICAgICAgICB0aGlzLl9zdWIudW5zdWJzY3JpYmUoKTtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBGcm9tT2JzZXJ2YWJsZTtcbn0oKSk7XG52YXIgTWVyZ2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIE1lcmdlKGluc0Fycikge1xuICAgICAgICB0aGlzLnR5cGUgPSAnbWVyZ2UnO1xuICAgICAgICB0aGlzLmluc0FyciA9IGluc0FycjtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5hYyA9IDA7XG4gICAgfVxuICAgIE1lcmdlLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB2YXIgcyA9IHRoaXMuaW5zQXJyO1xuICAgICAgICB2YXIgTCA9IHMubGVuZ3RoO1xuICAgICAgICB0aGlzLmFjID0gTDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBMOyBpKyspXG4gICAgICAgICAgICBzW2ldLl9hZGQodGhpcyk7XG4gICAgfTtcbiAgICBNZXJnZS5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzID0gdGhpcy5pbnNBcnI7XG4gICAgICAgIHZhciBMID0gcy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTDsgaSsrKVxuICAgICAgICAgICAgc1tpXS5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgTWVyZ2UucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9uKHQpO1xuICAgIH07XG4gICAgTWVyZ2UucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIE1lcmdlLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKC0tdGhpcy5hYyA8PSAwKSB7XG4gICAgICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHUuX2MoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIE1lcmdlO1xufSgpKTtcbnZhciBDb21iaW5lTGlzdGVuZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIENvbWJpbmVMaXN0ZW5lcihpLCBvdXQsIHApIHtcbiAgICAgICAgdGhpcy5pID0gaTtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMucCA9IHA7XG4gICAgICAgIHAuaWxzLnB1c2godGhpcyk7XG4gICAgfVxuICAgIENvbWJpbmVMaXN0ZW5lci5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucCwgb3V0ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmIChvdXQgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAocC51cCh0LCB0aGlzLmkpKSB7XG4gICAgICAgICAgICB2YXIgYSA9IHAudmFscztcbiAgICAgICAgICAgIHZhciBsID0gYS5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgYiA9IEFycmF5KGwpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyArK2kpXG4gICAgICAgICAgICAgICAgYltpXSA9IGFbaV07XG4gICAgICAgICAgICBvdXQuX24oYik7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIENvbWJpbmVMaXN0ZW5lci5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciBvdXQgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKG91dCA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIG91dC5fZShlcnIpO1xuICAgIH07XG4gICAgQ29tYmluZUxpc3RlbmVyLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLnA7XG4gICAgICAgIGlmIChwLm91dCA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICgtLXAuTmMgPT09IDApXG4gICAgICAgICAgICBwLm91dC5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIENvbWJpbmVMaXN0ZW5lcjtcbn0oKSk7XG52YXIgQ29tYmluZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQ29tYmluZShpbnNBcnIpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2NvbWJpbmUnO1xuICAgICAgICB0aGlzLmluc0FyciA9IGluc0FycjtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5pbHMgPSBbXTtcbiAgICAgICAgdGhpcy5OYyA9IHRoaXMuTm4gPSAwO1xuICAgICAgICB0aGlzLnZhbHMgPSBbXTtcbiAgICB9XG4gICAgQ29tYmluZS5wcm90b3R5cGUudXAgPSBmdW5jdGlvbiAodCwgaSkge1xuICAgICAgICB2YXIgdiA9IHRoaXMudmFsc1tpXTtcbiAgICAgICAgdmFyIE5uID0gIXRoaXMuTm4gPyAwIDogdiA9PT0gTk8gPyAtLXRoaXMuTm4gOiB0aGlzLk5uO1xuICAgICAgICB0aGlzLnZhbHNbaV0gPSB0O1xuICAgICAgICByZXR1cm4gTm4gPT09IDA7XG4gICAgfTtcbiAgICBDb21iaW5lLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB2YXIgcyA9IHRoaXMuaW5zQXJyO1xuICAgICAgICB2YXIgbiA9IHRoaXMuTmMgPSB0aGlzLk5uID0gcy5sZW5ndGg7XG4gICAgICAgIHZhciB2YWxzID0gdGhpcy52YWxzID0gbmV3IEFycmF5KG4pO1xuICAgICAgICBpZiAobiA9PT0gMCkge1xuICAgICAgICAgICAgb3V0Ll9uKFtdKTtcbiAgICAgICAgICAgIG91dC5fYygpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YWxzW2ldID0gTk87XG4gICAgICAgICAgICAgICAgc1tpXS5fYWRkKG5ldyBDb21iaW5lTGlzdGVuZXIoaSwgb3V0LCB0aGlzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIENvbWJpbmUucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcyA9IHRoaXMuaW5zQXJyO1xuICAgICAgICB2YXIgbiA9IHMubGVuZ3RoO1xuICAgICAgICB2YXIgaWxzID0gdGhpcy5pbHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKVxuICAgICAgICAgICAgc1tpXS5fcmVtb3ZlKGlsc1tpXSk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMuaWxzID0gW107XG4gICAgICAgIHRoaXMudmFscyA9IFtdO1xuICAgIH07XG4gICAgcmV0dXJuIENvbWJpbmU7XG59KCkpO1xudmFyIEZyb21BcnJheSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRnJvbUFycmF5KGEpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2Zyb21BcnJheSc7XG4gICAgICAgIHRoaXMuYSA9IGE7XG4gICAgfVxuICAgIEZyb21BcnJheS5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB2YXIgYSA9IHRoaXMuYTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBhLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgICAgIG91dC5fbihhW2ldKTtcbiAgICAgICAgb3V0Ll9jKCk7XG4gICAgfTtcbiAgICBGcm9tQXJyYXkucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgIH07XG4gICAgcmV0dXJuIEZyb21BcnJheTtcbn0oKSk7XG52YXIgRnJvbVByb21pc2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEZyb21Qcm9taXNlKHApIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2Zyb21Qcm9taXNlJztcbiAgICAgICAgdGhpcy5vbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLnAgPSBwO1xuICAgIH1cbiAgICBGcm9tUHJvbWlzZS5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB2YXIgcHJvZCA9IHRoaXM7XG4gICAgICAgIHRoaXMub24gPSB0cnVlO1xuICAgICAgICB0aGlzLnAudGhlbihmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgaWYgKHByb2Qub24pIHtcbiAgICAgICAgICAgICAgICBvdXQuX24odik7XG4gICAgICAgICAgICAgICAgb3V0Ll9jKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBvdXQuX2UoZSk7XG4gICAgICAgIH0pLnRoZW4obm9vcCwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHRocm93IGVycjsgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgRnJvbVByb21pc2UucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLm9uID0gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gRnJvbVByb21pc2U7XG59KCkpO1xudmFyIFBlcmlvZGljID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBQZXJpb2RpYyhwZXJpb2QpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ3BlcmlvZGljJztcbiAgICAgICAgdGhpcy5wZXJpb2QgPSBwZXJpb2Q7XG4gICAgICAgIHRoaXMuaW50ZXJ2YWxJRCA9IC0xO1xuICAgICAgICB0aGlzLmkgPSAwO1xuICAgIH1cbiAgICBQZXJpb2RpYy5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGludGVydmFsSGFuZGxlcigpIHsgb3V0Ll9uKHNlbGYuaSsrKTsgfVxuICAgICAgICB0aGlzLmludGVydmFsSUQgPSBzZXRJbnRlcnZhbChpbnRlcnZhbEhhbmRsZXIsIHRoaXMucGVyaW9kKTtcbiAgICB9O1xuICAgIFBlcmlvZGljLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuaW50ZXJ2YWxJRCAhPT0gLTEpXG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWxJRCk7XG4gICAgICAgIHRoaXMuaW50ZXJ2YWxJRCA9IC0xO1xuICAgICAgICB0aGlzLmkgPSAwO1xuICAgIH07XG4gICAgcmV0dXJuIFBlcmlvZGljO1xufSgpKTtcbnZhciBEZWJ1ZyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRGVidWcoaW5zLCBhcmcpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2RlYnVnJztcbiAgICAgICAgdGhpcy5pbnMgPSBpbnM7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMucyA9IG5vb3A7XG4gICAgICAgIHRoaXMubCA9ICcnO1xuICAgICAgICBpZiAodHlwZW9mIGFyZyA9PT0gJ3N0cmluZycpXG4gICAgICAgICAgICB0aGlzLmwgPSBhcmc7XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICB0aGlzLnMgPSBhcmc7XG4gICAgfVxuICAgIERlYnVnLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRGVidWcucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgRGVidWcucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgcyA9IHRoaXMucywgbCA9IHRoaXMubDtcbiAgICAgICAgaWYgKHMgIT09IG5vb3ApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcyh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdS5fZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChsKVxuICAgICAgICAgICAgY29uc29sZS5sb2cobCArICc6JywgdCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHQpO1xuICAgICAgICB1Ll9uKHQpO1xuICAgIH07XG4gICAgRGVidWcucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIERlYnVnLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9jKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRGVidWc7XG59KCkpO1xudmFyIERyb3AgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERyb3AobWF4LCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2Ryb3AnO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5tYXggPSBtYXg7XG4gICAgICAgIHRoaXMuZHJvcHBlZCA9IDA7XG4gICAgfVxuICAgIERyb3AucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMuZHJvcHBlZCA9IDA7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQodGhpcyk7XG4gICAgfTtcbiAgICBEcm9wLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9O1xuICAgIERyb3AucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAodGhpcy5kcm9wcGVkKysgPj0gdGhpcy5tYXgpXG4gICAgICAgICAgICB1Ll9uKHQpO1xuICAgIH07XG4gICAgRHJvcC5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgRHJvcC5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIERyb3A7XG59KCkpO1xudmFyIEVuZFdoZW5MaXN0ZW5lciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRW5kV2hlbkxpc3RlbmVyKG91dCwgb3ApIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMub3AgPSBvcDtcbiAgICB9XG4gICAgRW5kV2hlbkxpc3RlbmVyLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5vcC5lbmQoKTtcbiAgICB9O1xuICAgIEVuZFdoZW5MaXN0ZW5lci5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHRoaXMub3V0Ll9lKGVycik7XG4gICAgfTtcbiAgICBFbmRXaGVuTGlzdGVuZXIucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLm9wLmVuZCgpO1xuICAgIH07XG4gICAgcmV0dXJuIEVuZFdoZW5MaXN0ZW5lcjtcbn0oKSk7XG52YXIgRW5kV2hlbiA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRW5kV2hlbihvLCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2VuZFdoZW4nO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5vID0gbztcbiAgICAgICAgdGhpcy5vaWwgPSBOT19JTDtcbiAgICB9XG4gICAgRW5kV2hlbi5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5vLl9hZGQodGhpcy5vaWwgPSBuZXcgRW5kV2hlbkxpc3RlbmVyKG91dCwgdGhpcykpO1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRW5kV2hlbi5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMuby5fcmVtb3ZlKHRoaXMub2lsKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5vaWwgPSBOT19JTDtcbiAgICB9O1xuICAgIEVuZFdoZW4ucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9jKCk7XG4gICAgfTtcbiAgICBFbmRXaGVuLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fbih0KTtcbiAgICB9O1xuICAgIEVuZFdoZW4ucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIEVuZFdoZW4ucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVuZCgpO1xuICAgIH07XG4gICAgcmV0dXJuIEVuZFdoZW47XG59KCkpO1xudmFyIEZpbHRlciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRmlsdGVyKHBhc3NlcywgaW5zKSB7XG4gICAgICAgIHRoaXMudHlwZSA9ICdmaWx0ZXInO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5mID0gcGFzc2VzO1xuICAgIH1cbiAgICBGaWx0ZXIucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQodGhpcyk7XG4gICAgfTtcbiAgICBGaWx0ZXIucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgRmlsdGVyLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHIgPSBfdHJ5KHRoaXMsIHQsIHUpO1xuICAgICAgICBpZiAociA9PT0gTk8gfHwgIXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBGaWx0ZXIucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIEZpbHRlci5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIEZpbHRlcjtcbn0oKSk7XG52YXIgRmxhdHRlbkxpc3RlbmVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGbGF0dGVuTGlzdGVuZXIob3V0LCBvcCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5vcCA9IG9wO1xuICAgIH1cbiAgICBGbGF0dGVuTGlzdGVuZXIucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgdGhpcy5vdXQuX24odCk7XG4gICAgfTtcbiAgICBGbGF0dGVuTGlzdGVuZXIucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB0aGlzLm91dC5fZShlcnIpO1xuICAgIH07XG4gICAgRmxhdHRlbkxpc3RlbmVyLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5vcC5pbm5lciA9IE5PO1xuICAgICAgICB0aGlzLm9wLmxlc3MoKTtcbiAgICB9O1xuICAgIHJldHVybiBGbGF0dGVuTGlzdGVuZXI7XG59KCkpO1xudmFyIEZsYXR0ZW4gPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEZsYXR0ZW4oaW5zKSB7XG4gICAgICAgIHRoaXMudHlwZSA9ICdmbGF0dGVuJztcbiAgICAgICAgdGhpcy5pbnMgPSBpbnM7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMub3BlbiA9IHRydWU7XG4gICAgICAgIHRoaXMuaW5uZXIgPSBOTztcbiAgICAgICAgdGhpcy5pbCA9IE5PX0lMO1xuICAgIH1cbiAgICBGbGF0dGVuLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLm9wZW4gPSB0cnVlO1xuICAgICAgICB0aGlzLmlubmVyID0gTk87XG4gICAgICAgIHRoaXMuaWwgPSBOT19JTDtcbiAgICAgICAgdGhpcy5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIEZsYXR0ZW4ucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy5pbm5lciAhPT0gTk8pXG4gICAgICAgICAgICB0aGlzLmlubmVyLl9yZW1vdmUodGhpcy5pbCk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMub3BlbiA9IHRydWU7XG4gICAgICAgIHRoaXMuaW5uZXIgPSBOTztcbiAgICAgICAgdGhpcy5pbCA9IE5PX0lMO1xuICAgIH07XG4gICAgRmxhdHRlbi5wcm90b3R5cGUubGVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAoIXRoaXMub3BlbiAmJiB0aGlzLmlubmVyID09PSBOTylcbiAgICAgICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIEZsYXR0ZW4ucHJvdG90eXBlLl9uID0gZnVuY3Rpb24gKHMpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgX2EgPSB0aGlzLCBpbm5lciA9IF9hLmlubmVyLCBpbCA9IF9hLmlsO1xuICAgICAgICBpZiAoaW5uZXIgIT09IE5PICYmIGlsICE9PSBOT19JTClcbiAgICAgICAgICAgIGlubmVyLl9yZW1vdmUoaWwpO1xuICAgICAgICAodGhpcy5pbm5lciA9IHMpLl9hZGQodGhpcy5pbCA9IG5ldyBGbGF0dGVuTGlzdGVuZXIodSwgdGhpcykpO1xuICAgIH07XG4gICAgRmxhdHRlbi5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgRmxhdHRlbi5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMub3BlbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLmxlc3MoKTtcbiAgICB9O1xuICAgIHJldHVybiBGbGF0dGVuO1xufSgpKTtcbnZhciBGb2xkID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGb2xkKGYsIHNlZWQsIGlucykge1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICB0aGlzLnR5cGUgPSAnZm9sZCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmYgPSBmdW5jdGlvbiAodCkgeyByZXR1cm4gZihfdGhpcy5hY2MsIHQpOyB9O1xuICAgICAgICB0aGlzLmFjYyA9IHRoaXMuc2VlZCA9IHNlZWQ7XG4gICAgfVxuICAgIEZvbGQucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMuYWNjID0gdGhpcy5zZWVkO1xuICAgICAgICBvdXQuX24odGhpcy5hY2MpO1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgRm9sZC5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgICAgIHRoaXMuYWNjID0gdGhpcy5zZWVkO1xuICAgIH07XG4gICAgRm9sZC5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciByID0gX3RyeSh0aGlzLCB0LCB1KTtcbiAgICAgICAgaWYgKHIgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9uKHRoaXMuYWNjID0gcik7XG4gICAgfTtcbiAgICBGb2xkLnByb3RvdHlwZS5fZSA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9lKGVycik7XG4gICAgfTtcbiAgICBGb2xkLnByb3RvdHlwZS5fYyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHUgPSB0aGlzLm91dDtcbiAgICAgICAgaWYgKHUgPT09IE5PKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB1Ll9jKCk7XG4gICAgfTtcbiAgICByZXR1cm4gRm9sZDtcbn0oKSk7XG52YXIgTGFzdCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gTGFzdChpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ2xhc3QnO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICAgICAgdGhpcy5oYXMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy52YWwgPSBOTztcbiAgICB9XG4gICAgTGFzdC5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5oYXMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIExhc3QucHJvdG90eXBlLl9zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLnZhbCA9IE5PO1xuICAgIH07XG4gICAgTGFzdC5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB0aGlzLmhhcyA9IHRydWU7XG4gICAgICAgIHRoaXMudmFsID0gdDtcbiAgICB9O1xuICAgIExhc3QucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2UoZXJyKTtcbiAgICB9O1xuICAgIExhc3QucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmICh0aGlzLmhhcykge1xuICAgICAgICAgICAgdS5fbih0aGlzLnZhbCk7XG4gICAgICAgICAgICB1Ll9jKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdS5fZShuZXcgRXJyb3IoJ2xhc3QoKSBmYWlsZWQgYmVjYXVzZSBpbnB1dCBzdHJlYW0gY29tcGxldGVkJykpO1xuICAgIH07XG4gICAgcmV0dXJuIExhc3Q7XG59KCkpO1xudmFyIE1hcE9wID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBNYXBPcChwcm9qZWN0LCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ21hcCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmYgPSBwcm9qZWN0O1xuICAgIH1cbiAgICBNYXBPcC5wcm90b3R5cGUuX3N0YXJ0ID0gZnVuY3Rpb24gKG91dCkge1xuICAgICAgICB0aGlzLm91dCA9IG91dDtcbiAgICAgICAgdGhpcy5pbnMuX2FkZCh0aGlzKTtcbiAgICB9O1xuICAgIE1hcE9wLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9O1xuICAgIE1hcE9wLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHIgPSBfdHJ5KHRoaXMsIHQsIHUpO1xuICAgICAgICBpZiAociA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24ocik7XG4gICAgfTtcbiAgICBNYXBPcC5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgTWFwT3AucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX2MoKTtcbiAgICB9O1xuICAgIHJldHVybiBNYXBPcDtcbn0oKSk7XG52YXIgUmVtZW1iZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFJlbWVtYmVyKGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAncmVtZW1iZXInO1xuICAgICAgICB0aGlzLmlucyA9IGlucztcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9XG4gICAgUmVtZW1iZXIucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQob3V0KTtcbiAgICB9O1xuICAgIFJlbWVtYmVyLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzLm91dCk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgfTtcbiAgICByZXR1cm4gUmVtZW1iZXI7XG59KCkpO1xudmFyIFJlcGxhY2VFcnJvciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUmVwbGFjZUVycm9yKHJlcGxhY2VyLCBpbnMpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ3JlcGxhY2VFcnJvcic7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLmYgPSByZXBsYWNlcjtcbiAgICB9XG4gICAgUmVwbGFjZUVycm9yLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgUmVwbGFjZUVycm9yLnByb3RvdHlwZS5fc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5pbnMuX3JlbW92ZSh0aGlzKTtcbiAgICAgICAgdGhpcy5vdXQgPSBOTztcbiAgICB9O1xuICAgIFJlcGxhY2VFcnJvci5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAodCkge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHUuX24odCk7XG4gICAgfTtcbiAgICBSZXBsYWNlRXJyb3IucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgdSA9IHRoaXMub3V0O1xuICAgICAgICBpZiAodSA9PT0gTk8pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLmlucy5fcmVtb3ZlKHRoaXMpO1xuICAgICAgICAgICAgKHRoaXMuaW5zID0gdGhpcy5mKGVycikpLl9hZGQodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHUuX2UoZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFJlcGxhY2VFcnJvci5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIFJlcGxhY2VFcnJvcjtcbn0oKSk7XG52YXIgU3RhcnRXaXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBTdGFydFdpdGgoaW5zLCB2YWwpIHtcbiAgICAgICAgdGhpcy50eXBlID0gJ3N0YXJ0V2l0aCc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLnZhbCA9IHZhbDtcbiAgICB9XG4gICAgU3RhcnRXaXRoLnByb3RvdHlwZS5fc3RhcnQgPSBmdW5jdGlvbiAob3V0KSB7XG4gICAgICAgIHRoaXMub3V0ID0gb3V0O1xuICAgICAgICB0aGlzLm91dC5fbih0aGlzLnZhbCk7XG4gICAgICAgIHRoaXMuaW5zLl9hZGQob3V0KTtcbiAgICB9O1xuICAgIFN0YXJ0V2l0aC5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcy5vdXQpO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgIH07XG4gICAgcmV0dXJuIFN0YXJ0V2l0aDtcbn0oKSk7XG52YXIgVGFrZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVGFrZShtYXgsIGlucykge1xuICAgICAgICB0aGlzLnR5cGUgPSAndGFrZSc7XG4gICAgICAgIHRoaXMuaW5zID0gaW5zO1xuICAgICAgICB0aGlzLm91dCA9IE5PO1xuICAgICAgICB0aGlzLm1heCA9IG1heDtcbiAgICAgICAgdGhpcy50YWtlbiA9IDA7XG4gICAgfVxuICAgIFRha2UucHJvdG90eXBlLl9zdGFydCA9IGZ1bmN0aW9uIChvdXQpIHtcbiAgICAgICAgdGhpcy5vdXQgPSBvdXQ7XG4gICAgICAgIHRoaXMudGFrZW4gPSAwO1xuICAgICAgICBpZiAodGhpcy5tYXggPD0gMClcbiAgICAgICAgICAgIG91dC5fYygpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLmlucy5fYWRkKHRoaXMpO1xuICAgIH07XG4gICAgVGFrZS5wcm90b3R5cGUuX3N0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5zLl9yZW1vdmUodGhpcyk7XG4gICAgICAgIHRoaXMub3V0ID0gTk87XG4gICAgfTtcbiAgICBUYWtlLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIG0gPSArK3RoaXMudGFrZW47XG4gICAgICAgIGlmIChtIDwgdGhpcy5tYXgpXG4gICAgICAgICAgICB1Ll9uKHQpO1xuICAgICAgICBlbHNlIGlmIChtID09PSB0aGlzLm1heCkge1xuICAgICAgICAgICAgdS5fbih0KTtcbiAgICAgICAgICAgIHUuX2MoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVGFrZS5wcm90b3R5cGUuX2UgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fZShlcnIpO1xuICAgIH07XG4gICAgVGFrZS5wcm90b3R5cGUuX2MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB1ID0gdGhpcy5vdXQ7XG4gICAgICAgIGlmICh1ID09PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdS5fYygpO1xuICAgIH07XG4gICAgcmV0dXJuIFRha2U7XG59KCkpO1xudmFyIFN0cmVhbSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gU3RyZWFtKHByb2R1Y2VyKSB7XG4gICAgICAgIHRoaXMuX3Byb2QgPSBwcm9kdWNlciB8fCBOTztcbiAgICAgICAgdGhpcy5faWxzID0gW107XG4gICAgICAgIHRoaXMuX3N0b3BJRCA9IE5PO1xuICAgICAgICB0aGlzLl9kbCA9IE5PO1xuICAgICAgICB0aGlzLl9kID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3RhcmdldCA9IE5PO1xuICAgICAgICB0aGlzLl9lcnIgPSBOTztcbiAgICB9XG4gICAgU3RyZWFtLnByb3RvdHlwZS5fbiA9IGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHZhciBhID0gdGhpcy5faWxzO1xuICAgICAgICB2YXIgTCA9IGEubGVuZ3RoO1xuICAgICAgICBpZiAodGhpcy5fZClcbiAgICAgICAgICAgIHRoaXMuX2RsLl9uKHQpO1xuICAgICAgICBpZiAoTCA9PSAxKVxuICAgICAgICAgICAgYVswXS5fbih0KTtcbiAgICAgICAgZWxzZSBpZiAoTCA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBiID0gY3AoYSk7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IEw7IGkrKylcbiAgICAgICAgICAgICAgICBiW2ldLl9uKHQpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9lID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICBpZiAodGhpcy5fZXJyICE9PSBOTylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy5fZXJyID0gZXJyO1xuICAgICAgICB2YXIgYSA9IHRoaXMuX2lscztcbiAgICAgICAgdmFyIEwgPSBhLmxlbmd0aDtcbiAgICAgICAgdGhpcy5feCgpO1xuICAgICAgICBpZiAodGhpcy5fZClcbiAgICAgICAgICAgIHRoaXMuX2RsLl9lKGVycik7XG4gICAgICAgIGlmIChMID09IDEpXG4gICAgICAgICAgICBhWzBdLl9lKGVycik7XG4gICAgICAgIGVsc2UgaWYgKEwgPT0gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgYiA9IGNwKGEpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBMOyBpKyspXG4gICAgICAgICAgICAgICAgYltpXS5fZShlcnIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5fZCAmJiBMID09IDApXG4gICAgICAgICAgICB0aHJvdyB0aGlzLl9lcnI7XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYSA9IHRoaXMuX2lscztcbiAgICAgICAgdmFyIEwgPSBhLmxlbmd0aDtcbiAgICAgICAgdGhpcy5feCgpO1xuICAgICAgICBpZiAodGhpcy5fZClcbiAgICAgICAgICAgIHRoaXMuX2RsLl9jKCk7XG4gICAgICAgIGlmIChMID09IDEpXG4gICAgICAgICAgICBhWzBdLl9jKCk7XG4gICAgICAgIGVsc2UgaWYgKEwgPT0gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgYiA9IGNwKGEpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBMOyBpKyspXG4gICAgICAgICAgICAgICAgYltpXS5fYygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl94ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5faWxzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKHRoaXMuX3Byb2QgIT09IE5PKVxuICAgICAgICAgICAgdGhpcy5fcHJvZC5fc3RvcCgpO1xuICAgICAgICB0aGlzLl9lcnIgPSBOTztcbiAgICAgICAgdGhpcy5faWxzID0gW107XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9zdG9wTm93ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBXQVJOSU5HOiBjb2RlIHRoYXQgY2FsbHMgdGhpcyBtZXRob2Qgc2hvdWxkXG4gICAgICAgIC8vIGZpcnN0IGNoZWNrIGlmIHRoaXMuX3Byb2QgaXMgdmFsaWQgKG5vdCBgTk9gKVxuICAgICAgICB0aGlzLl9wcm9kLl9zdG9wKCk7XG4gICAgICAgIHRoaXMuX2VyciA9IE5PO1xuICAgICAgICB0aGlzLl9zdG9wSUQgPSBOTztcbiAgICB9O1xuICAgIFN0cmVhbS5wcm90b3R5cGUuX2FkZCA9IGZ1bmN0aW9uIChpbCkge1xuICAgICAgICB2YXIgdGEgPSB0aGlzLl90YXJnZXQ7XG4gICAgICAgIGlmICh0YSAhPT0gTk8pXG4gICAgICAgICAgICByZXR1cm4gdGEuX2FkZChpbCk7XG4gICAgICAgIHZhciBhID0gdGhpcy5faWxzO1xuICAgICAgICBhLnB1c2goaWwpO1xuICAgICAgICBpZiAoYS5sZW5ndGggPiAxKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAodGhpcy5fc3RvcElEICE9PSBOTykge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX3N0b3BJRCk7XG4gICAgICAgICAgICB0aGlzLl9zdG9wSUQgPSBOTztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwID0gdGhpcy5fcHJvZDtcbiAgICAgICAgICAgIGlmIChwICE9PSBOTylcbiAgICAgICAgICAgICAgICBwLl9zdGFydCh0aGlzKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgU3RyZWFtLnByb3RvdHlwZS5fcmVtb3ZlID0gZnVuY3Rpb24gKGlsKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHZhciB0YSA9IHRoaXMuX3RhcmdldDtcbiAgICAgICAgaWYgKHRhICE9PSBOTylcbiAgICAgICAgICAgIHJldHVybiB0YS5fcmVtb3ZlKGlsKTtcbiAgICAgICAgdmFyIGEgPSB0aGlzLl9pbHM7XG4gICAgICAgIHZhciBpID0gYS5pbmRleE9mKGlsKTtcbiAgICAgICAgaWYgKGkgPiAtMSkge1xuICAgICAgICAgICAgYS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICBpZiAodGhpcy5fcHJvZCAhPT0gTk8gJiYgYS5sZW5ndGggPD0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2VyciA9IE5PO1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0b3BJRCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gX3RoaXMuX3N0b3BOb3coKTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChhLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BydW5lQ3ljbGVzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIElmIGFsbCBwYXRocyBzdGVtbWluZyBmcm9tIGB0aGlzYCBzdHJlYW0gZXZlbnR1YWxseSBlbmQgYXQgYHRoaXNgXG4gICAgLy8gc3RyZWFtLCB0aGVuIHdlIHJlbW92ZSB0aGUgc2luZ2xlIGxpc3RlbmVyIG9mIGB0aGlzYCBzdHJlYW0sIHRvXG4gICAgLy8gZm9yY2UgaXQgdG8gZW5kIGl0cyBleGVjdXRpb24gYW5kIGRpc3Bvc2UgcmVzb3VyY2VzLiBUaGlzIG1ldGhvZFxuICAgIC8vIGFzc3VtZXMgYXMgYSBwcmVjb25kaXRpb24gdGhhdCB0aGlzLl9pbHMgaGFzIGp1c3Qgb25lIGxpc3RlbmVyLlxuICAgIFN0cmVhbS5wcm90b3R5cGUuX3BydW5lQ3ljbGVzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5faGFzTm9TaW5rcyh0aGlzLCBbXSkpXG4gICAgICAgICAgICB0aGlzLl9yZW1vdmUodGhpcy5faWxzWzBdKTtcbiAgICB9O1xuICAgIC8vIENoZWNrcyB3aGV0aGVyICp0aGVyZSBpcyBubyogcGF0aCBzdGFydGluZyBmcm9tIGB4YCB0aGF0IGxlYWRzIHRvIGFuIGVuZFxuICAgIC8vIGxpc3RlbmVyIChzaW5rKSBpbiB0aGUgc3RyZWFtIGdyYXBoLCBmb2xsb3dpbmcgZWRnZXMgQS0+QiB3aGVyZSBCIGlzIGFcbiAgICAvLyBsaXN0ZW5lciBvZiBBLiBUaGlzIG1lYW5zIHRoZXNlIHBhdGhzIGNvbnN0aXR1dGUgYSBjeWNsZSBzb21laG93LiBJcyBnaXZlblxuICAgIC8vIGEgdHJhY2Ugb2YgYWxsIHZpc2l0ZWQgbm9kZXMgc28gZmFyLlxuICAgIFN0cmVhbS5wcm90b3R5cGUuX2hhc05vU2lua3MgPSBmdW5jdGlvbiAoeCwgdHJhY2UpIHtcbiAgICAgICAgaWYgKHRyYWNlLmluZGV4T2YoeCkgIT09IC0xKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGVsc2UgaWYgKHgub3V0ID09PSB0aGlzKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGVsc2UgaWYgKHgub3V0ICYmIHgub3V0ICE9PSBOTylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9oYXNOb1NpbmtzKHgub3V0LCB0cmFjZS5jb25jYXQoeCkpO1xuICAgICAgICBlbHNlIGlmICh4Ll9pbHMpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBOID0geC5faWxzLmxlbmd0aDsgaSA8IE47IGkrKylcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX2hhc05vU2lua3MoeC5faWxzW2ldLCB0cmFjZS5jb25jYXQoeCkpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLmN0b3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzIGluc3RhbmNlb2YgTWVtb3J5U3RyZWFtID8gTWVtb3J5U3RyZWFtIDogU3RyZWFtO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQWRkcyBhIExpc3RlbmVyIHRvIHRoZSBTdHJlYW0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0xpc3RlbmVyfSBsaXN0ZW5lclxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgbGlzdGVuZXIuX24gPSBsaXN0ZW5lci5uZXh0IHx8IG5vb3A7XG4gICAgICAgIGxpc3RlbmVyLl9lID0gbGlzdGVuZXIuZXJyb3IgfHwgbm9vcDtcbiAgICAgICAgbGlzdGVuZXIuX2MgPSBsaXN0ZW5lci5jb21wbGV0ZSB8fCBub29wO1xuICAgICAgICB0aGlzLl9hZGQobGlzdGVuZXIpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIExpc3RlbmVyIGZyb20gdGhlIFN0cmVhbSwgYXNzdW1pbmcgdGhlIExpc3RlbmVyIHdhcyBhZGRlZCB0byBpdC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TGlzdGVuZXI8VD59IGxpc3RlbmVyXG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uIChsaXN0ZW5lcikge1xuICAgICAgICB0aGlzLl9yZW1vdmUobGlzdGVuZXIpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQWRkcyBhIExpc3RlbmVyIHRvIHRoZSBTdHJlYW0gcmV0dXJuaW5nIGEgU3Vic2NyaXB0aW9uIHRvIHJlbW92ZSB0aGF0XG4gICAgICogbGlzdGVuZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0xpc3RlbmVyfSBsaXN0ZW5lclxuICAgICAqIEByZXR1cm5zIHtTdWJzY3JpcHRpb259XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5zdWJzY3JpYmUgPSBmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgdGhpcy5hZGRMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtU3ViKHRoaXMsIGxpc3RlbmVyKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEFkZCBpbnRlcm9wIGJldHdlZW4gbW9zdC5qcyBhbmQgUnhKUyA1XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGVbc3ltYm9sX29ic2VydmFibGVfMS5kZWZhdWx0XSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IFN0cmVhbSBnaXZlbiBhIFByb2R1Y2VyLlxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSB7UHJvZHVjZXJ9IHByb2R1Y2VyIEFuIG9wdGlvbmFsIFByb2R1Y2VyIHRoYXQgZGljdGF0ZXMgaG93IHRvXG4gICAgICogc3RhcnQsIGdlbmVyYXRlIGV2ZW50cywgYW5kIHN0b3AgdGhlIFN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLmNyZWF0ZSA9IGZ1bmN0aW9uIChwcm9kdWNlcikge1xuICAgICAgICBpZiAocHJvZHVjZXIpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcHJvZHVjZXIuc3RhcnQgIT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICB8fCB0eXBlb2YgcHJvZHVjZXIuc3RvcCAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2R1Y2VyIHJlcXVpcmVzIGJvdGggc3RhcnQgYW5kIHN0b3AgZnVuY3Rpb25zJyk7XG4gICAgICAgICAgICBpbnRlcm5hbGl6ZVByb2R1Y2VyKHByb2R1Y2VyKTsgLy8gbXV0YXRlcyB0aGUgaW5wdXRcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbShwcm9kdWNlcik7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IE1lbW9yeVN0cmVhbSBnaXZlbiBhIFByb2R1Y2VyLlxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSB7UHJvZHVjZXJ9IHByb2R1Y2VyIEFuIG9wdGlvbmFsIFByb2R1Y2VyIHRoYXQgZGljdGF0ZXMgaG93IHRvXG4gICAgICogc3RhcnQsIGdlbmVyYXRlIGV2ZW50cywgYW5kIHN0b3AgdGhlIFN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtNZW1vcnlTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLmNyZWF0ZVdpdGhNZW1vcnkgPSBmdW5jdGlvbiAocHJvZHVjZXIpIHtcbiAgICAgICAgaWYgKHByb2R1Y2VyKVxuICAgICAgICAgICAgaW50ZXJuYWxpemVQcm9kdWNlcihwcm9kdWNlcik7IC8vIG11dGF0ZXMgdGhlIGlucHV0XG4gICAgICAgIHJldHVybiBuZXcgTWVtb3J5U3RyZWFtKHByb2R1Y2VyKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBTdHJlYW0gdGhhdCBkb2VzIG5vdGhpbmcgd2hlbiBzdGFydGVkLiBJdCBuZXZlciBlbWl0cyBhbnkgZXZlbnQuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAgICAgICAgICBuZXZlclxuICAgICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAZmFjdG9yeSB0cnVlXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5uZXZlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0oeyBfc3RhcnQ6IG5vb3AsIF9zdG9wOiBub29wIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIFN0cmVhbSB0aGF0IGltbWVkaWF0ZWx5IGVtaXRzIHRoZSBcImNvbXBsZXRlXCIgbm90aWZpY2F0aW9uIHdoZW5cbiAgICAgKiBzdGFydGVkLCBhbmQgdGhhdCdzIGl0LlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogZW1wdHlcbiAgICAgKiAtfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0uZW1wdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuZXcgU3RyZWFtKHtcbiAgICAgICAgICAgIF9zdGFydDogZnVuY3Rpb24gKGlsKSB7IGlsLl9jKCk7IH0sXG4gICAgICAgICAgICBfc3RvcDogbm9vcCxcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgU3RyZWFtIHRoYXQgaW1tZWRpYXRlbHkgZW1pdHMgYW4gXCJlcnJvclwiIG5vdGlmaWNhdGlvbiB3aXRoIHRoZVxuICAgICAqIHZhbHVlIHlvdSBwYXNzZWQgYXMgdGhlIGBlcnJvcmAgYXJndW1lbnQgd2hlbiB0aGUgc3RyZWFtIHN0YXJ0cywgYW5kIHRoYXQnc1xuICAgICAqIGl0LlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogdGhyb3coWClcbiAgICAgKiAtWFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSBlcnJvciBUaGUgZXJyb3IgZXZlbnQgdG8gZW1pdCBvbiB0aGUgY3JlYXRlZCBzdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS50aHJvdyA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbSh7XG4gICAgICAgICAgICBfc3RhcnQ6IGZ1bmN0aW9uIChpbCkgeyBpbC5fZShlcnJvcik7IH0sXG4gICAgICAgICAgICBfc3RvcDogbm9vcCxcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgc3RyZWFtIGZyb20gYW4gQXJyYXksIFByb21pc2UsIG9yIGFuIE9ic2VydmFibGUuXG4gICAgICpcbiAgICAgKiBAZmFjdG9yeSB0cnVlXG4gICAgICogQHBhcmFtIHtBcnJheXxQcm9taXNlTGlrZXxPYnNlcnZhYmxlfSBpbnB1dCBUaGUgaW5wdXQgdG8gbWFrZSBhIHN0cmVhbSBmcm9tLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0uZnJvbSA9IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICBpZiAodHlwZW9mIGlucHV0W3N5bWJvbF9vYnNlcnZhYmxlXzEuZGVmYXVsdF0gPT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICByZXR1cm4gU3RyZWFtLmZyb21PYnNlcnZhYmxlKGlucHV0KTtcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIGlucHV0LnRoZW4gPT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICByZXR1cm4gU3RyZWFtLmZyb21Qcm9taXNlKGlucHV0KTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkpXG4gICAgICAgICAgICByZXR1cm4gU3RyZWFtLmZyb21BcnJheShpbnB1dCk7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJUeXBlIG9mIGlucHV0IHRvIGZyb20oKSBtdXN0IGJlIGFuIEFycmF5LCBQcm9taXNlLCBvciBPYnNlcnZhYmxlXCIpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIFN0cmVhbSB0aGF0IGltbWVkaWF0ZWx5IGVtaXRzIHRoZSBhcmd1bWVudHMgdGhhdCB5b3UgZ2l2ZSB0b1xuICAgICAqICpvZiosIHRoZW4gY29tcGxldGVzLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogb2YoMSwyLDMpXG4gICAgICogMTIzfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSBhIFRoZSBmaXJzdCB2YWx1ZSB5b3Ugd2FudCB0byBlbWl0IGFzIGFuIGV2ZW50IG9uIHRoZSBzdHJlYW0uXG4gICAgICogQHBhcmFtIGIgVGhlIHNlY29uZCB2YWx1ZSB5b3Ugd2FudCB0byBlbWl0IGFzIGFuIGV2ZW50IG9uIHRoZSBzdHJlYW0uIE9uZVxuICAgICAqIG9yIG1vcmUgb2YgdGhlc2UgdmFsdWVzIG1heSBiZSBnaXZlbiBhcyBhcmd1bWVudHMuXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5vZiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGl0ZW1zID0gW107XG4gICAgICAgIGZvciAodmFyIF9pID0gMDsgX2kgPCBhcmd1bWVudHMubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgICAgICBpdGVtc1tfaV0gPSBhcmd1bWVudHNbX2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBTdHJlYW0uZnJvbUFycmF5KGl0ZW1zKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIGFuIGFycmF5IHRvIGEgc3RyZWFtLiBUaGUgcmV0dXJuZWQgc3RyZWFtIHdpbGwgZW1pdCBzeW5jaHJvbm91c2x5XG4gICAgICogYWxsIHRoZSBpdGVtcyBpbiB0aGUgYXJyYXksIGFuZCB0aGVuIGNvbXBsZXRlLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogZnJvbUFycmF5KFsxLDIsM10pXG4gICAgICogMTIzfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGZhY3RvcnkgdHJ1ZVxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBiZSBjb252ZXJ0ZWQgYXMgYSBzdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5mcm9tQXJyYXkgPSBmdW5jdGlvbiAoYXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IEZyb21BcnJheShhcnJheSkpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ29udmVydHMgYSBwcm9taXNlIHRvIGEgc3RyZWFtLiBUaGUgcmV0dXJuZWQgc3RyZWFtIHdpbGwgZW1pdCB0aGUgcmVzb2x2ZWRcbiAgICAgKiB2YWx1ZSBvZiB0aGUgcHJvbWlzZSwgYW5kIHRoZW4gY29tcGxldGUuIEhvd2V2ZXIsIGlmIHRoZSBwcm9taXNlIGlzXG4gICAgICogcmVqZWN0ZWQsIHRoZSBzdHJlYW0gd2lsbCBlbWl0IHRoZSBjb3JyZXNwb25kaW5nIGVycm9yLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogZnJvbVByb21pc2UoIC0tLS00MiApXG4gICAgICogLS0tLS0tLS0tLS0tLS0tLS00MnxcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge1Byb21pc2VMaWtlfSBwcm9taXNlIFRoZSBwcm9taXNlIHRvIGJlIGNvbnZlcnRlZCBhcyBhIHN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLmZyb21Qcm9taXNlID0gZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IEZyb21Qcm9taXNlKHByb21pc2UpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIGFuIE9ic2VydmFibGUgaW50byBhIFN0cmVhbS5cbiAgICAgKlxuICAgICAqIEBmYWN0b3J5IHRydWVcbiAgICAgKiBAcGFyYW0ge2FueX0gb2JzZXJ2YWJsZSBUaGUgb2JzZXJ2YWJsZSB0byBiZSBjb252ZXJ0ZWQgYXMgYSBzdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5mcm9tT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChvYnMpIHtcbiAgICAgICAgaWYgKG9icy5lbmRXaGVuKVxuICAgICAgICAgICAgcmV0dXJuIG9icztcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IEZyb21PYnNlcnZhYmxlKG9icykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHN0cmVhbSB0aGF0IHBlcmlvZGljYWxseSBlbWl0cyBpbmNyZW1lbnRhbCBudW1iZXJzLCBldmVyeVxuICAgICAqIGBwZXJpb2RgIG1pbGxpc2Vjb25kcy5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqICAgICBwZXJpb2RpYygxMDAwKVxuICAgICAqIC0tLTAtLS0xLS0tMi0tLTMtLS00LS0tLi4uXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAZmFjdG9yeSB0cnVlXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHBlcmlvZCBUaGUgaW50ZXJ2YWwgaW4gbWlsbGlzZWNvbmRzIHRvIHVzZSBhcyBhIHJhdGUgb2ZcbiAgICAgKiBlbWlzc2lvbi5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnBlcmlvZGljID0gZnVuY3Rpb24gKHBlcmlvZCkge1xuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbShuZXcgUGVyaW9kaWMocGVyaW9kKSk7XG4gICAgfTtcbiAgICBTdHJlYW0ucHJvdG90eXBlLl9tYXAgPSBmdW5jdGlvbiAocHJvamVjdCkge1xuICAgICAgICByZXR1cm4gbmV3ICh0aGlzLmN0b3IoKSkobmV3IE1hcE9wKHByb2plY3QsIHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFRyYW5zZm9ybXMgZWFjaCBldmVudCBmcm9tIHRoZSBpbnB1dCBTdHJlYW0gdGhyb3VnaCBhIGBwcm9qZWN0YCBmdW5jdGlvbixcbiAgICAgKiB0byBnZXQgYSBTdHJlYW0gdGhhdCBlbWl0cyB0aG9zZSB0cmFuc2Zvcm1lZCBldmVudHMuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLTEtLS0zLS01LS0tLS03LS0tLS0tXG4gICAgICogICAgbWFwKGkgPT4gaSAqIDEwKVxuICAgICAqIC0tMTAtLTMwLTUwLS0tLTcwLS0tLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IHByb2plY3QgQSBmdW5jdGlvbiBvZiB0eXBlIGAodDogVCkgPT4gVWAgdGhhdCB0YWtlcyBldmVudFxuICAgICAqIGB0YCBvZiB0eXBlIGBUYCBmcm9tIHRoZSBpbnB1dCBTdHJlYW0gYW5kIHByb2R1Y2VzIGFuIGV2ZW50IG9mIHR5cGUgYFVgLCB0b1xuICAgICAqIGJlIGVtaXR0ZWQgb24gdGhlIG91dHB1dCBTdHJlYW0uXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUubWFwID0gZnVuY3Rpb24gKHByb2plY3QpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcChwcm9qZWN0KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEl0J3MgbGlrZSBgbWFwYCwgYnV0IHRyYW5zZm9ybXMgZWFjaCBpbnB1dCBldmVudCB0byBhbHdheXMgdGhlIHNhbWVcbiAgICAgKiBjb25zdGFudCB2YWx1ZSBvbiB0aGUgb3V0cHV0IFN0cmVhbS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tMS0tLTMtLTUtLS0tLTctLS0tLVxuICAgICAqICAgICAgIG1hcFRvKDEwKVxuICAgICAqIC0tMTAtLTEwLTEwLS0tLTEwLS0tLVxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHBhcmFtIHByb2plY3RlZFZhbHVlIEEgdmFsdWUgdG8gZW1pdCBvbiB0aGUgb3V0cHV0IFN0cmVhbSB3aGVuZXZlciB0aGVcbiAgICAgKiBpbnB1dCBTdHJlYW0gZW1pdHMgYW55IHZhbHVlLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLm1hcFRvID0gZnVuY3Rpb24gKHByb2plY3RlZFZhbHVlKSB7XG4gICAgICAgIHZhciBzID0gdGhpcy5tYXAoZnVuY3Rpb24gKCkgeyByZXR1cm4gcHJvamVjdGVkVmFsdWU7IH0pO1xuICAgICAgICB2YXIgb3AgPSBzLl9wcm9kO1xuICAgICAgICBvcC50eXBlID0gJ21hcFRvJztcbiAgICAgICAgcmV0dXJuIHM7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBPbmx5IGFsbG93cyBldmVudHMgdGhhdCBwYXNzIHRoZSB0ZXN0IGdpdmVuIGJ5IHRoZSBgcGFzc2VzYCBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIEVhY2ggZXZlbnQgZnJvbSB0aGUgaW5wdXQgc3RyZWFtIGlzIGdpdmVuIHRvIHRoZSBgcGFzc2VzYCBmdW5jdGlvbi4gSWYgdGhlXG4gICAgICogZnVuY3Rpb24gcmV0dXJucyBgdHJ1ZWAsIHRoZSBldmVudCBpcyBmb3J3YXJkZWQgdG8gdGhlIG91dHB1dCBzdHJlYW0sXG4gICAgICogb3RoZXJ3aXNlIGl0IGlzIGlnbm9yZWQgYW5kIG5vdCBmb3J3YXJkZWQuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLTEtLS0yLS0zLS0tLS00LS0tLS01LS0tNi0tNy04LS1cbiAgICAgKiAgICAgZmlsdGVyKGkgPT4gaSAlIDIgPT09IDApXG4gICAgICogLS0tLS0tMi0tLS0tLS0tNC0tLS0tLS0tLTYtLS0tOC0tXG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBwYXNzZXMgQSBmdW5jdGlvbiBvZiB0eXBlIGAodDogVCkgKz4gYm9vbGVhbmAgdGhhdCB0YWtlc1xuICAgICAqIGFuIGV2ZW50IGZyb20gdGhlIGlucHV0IHN0cmVhbSBhbmQgY2hlY2tzIGlmIGl0IHBhc3NlcywgYnkgcmV0dXJuaW5nIGFcbiAgICAgKiBib29sZWFuLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmZpbHRlciA9IGZ1bmN0aW9uIChwYXNzZXMpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLl9wcm9kO1xuICAgICAgICBpZiAocCBpbnN0YW5jZW9mIEZpbHRlcilcbiAgICAgICAgICAgIHJldHVybiBuZXcgU3RyZWFtKG5ldyBGaWx0ZXIoYW5kKHAuZiwgcGFzc2VzKSwgcC5pbnMpKTtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IEZpbHRlcihwYXNzZXMsIHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIExldHMgdGhlIGZpcnN0IGBhbW91bnRgIG1hbnkgZXZlbnRzIGZyb20gdGhlIGlucHV0IHN0cmVhbSBwYXNzIHRvIHRoZVxuICAgICAqIG91dHB1dCBzdHJlYW0sIHRoZW4gbWFrZXMgdGhlIG91dHB1dCBzdHJlYW0gY29tcGxldGUuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLWEtLS1iLS1jLS0tLWQtLS1lLS1cbiAgICAgKiAgICB0YWtlKDMpXG4gICAgICogLS1hLS0tYi0tY3xcbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBhbW91bnQgSG93IG1hbnkgZXZlbnRzIHRvIGFsbG93IGZyb20gdGhlIGlucHV0IHN0cmVhbVxuICAgICAqIGJlZm9yZSBjb21wbGV0aW5nIHRoZSBvdXRwdXQgc3RyZWFtLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnRha2UgPSBmdW5jdGlvbiAoYW1vdW50KSB7XG4gICAgICAgIHJldHVybiBuZXcgKHRoaXMuY3RvcigpKShuZXcgVGFrZShhbW91bnQsIHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIElnbm9yZXMgdGhlIGZpcnN0IGBhbW91bnRgIG1hbnkgZXZlbnRzIGZyb20gdGhlIGlucHV0IHN0cmVhbSwgYW5kIHRoZW5cbiAgICAgKiBhZnRlciB0aGF0IHN0YXJ0cyBmb3J3YXJkaW5nIGV2ZW50cyBmcm9tIHRoZSBpbnB1dCBzdHJlYW0gdG8gdGhlIG91dHB1dFxuICAgICAqIHN0cmVhbS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tYS0tLWItLWMtLS0tZC0tLWUtLVxuICAgICAqICAgICAgIGRyb3AoMylcbiAgICAgKiAtLS0tLS0tLS0tLS0tLWQtLS1lLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBhbW91bnQgSG93IG1hbnkgZXZlbnRzIHRvIGlnbm9yZSBmcm9tIHRoZSBpbnB1dCBzdHJlYW1cbiAgICAgKiBiZWZvcmUgZm9yd2FyZGluZyBhbGwgZXZlbnRzIGZyb20gdGhlIGlucHV0IHN0cmVhbSB0byB0aGUgb3V0cHV0IHN0cmVhbS5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5kcm9wID0gZnVuY3Rpb24gKGFtb3VudCkge1xuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbShuZXcgRHJvcChhbW91bnQsIHRoaXMpKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFdoZW4gdGhlIGlucHV0IHN0cmVhbSBjb21wbGV0ZXMsIHRoZSBvdXRwdXQgc3RyZWFtIHdpbGwgZW1pdCB0aGUgbGFzdCBldmVudFxuICAgICAqIGVtaXR0ZWQgYnkgdGhlIGlucHV0IHN0cmVhbSwgYW5kIHRoZW4gd2lsbCBhbHNvIGNvbXBsZXRlLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogLS1hLS0tYi0tYy0tZC0tLS18XG4gICAgICogICAgICAgbGFzdCgpXG4gICAgICogLS0tLS0tLS0tLS0tLS0tLS1kfFxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUubGFzdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obmV3IExhc3QodGhpcykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUHJlcGVuZHMgdGhlIGdpdmVuIGBpbml0aWFsYCB2YWx1ZSB0byB0aGUgc2VxdWVuY2Ugb2YgZXZlbnRzIGVtaXR0ZWQgYnkgdGhlXG4gICAgICogaW5wdXQgc3RyZWFtLiBUaGUgcmV0dXJuZWQgc3RyZWFtIGlzIGEgTWVtb3J5U3RyZWFtLCB3aGljaCBtZWFucyBpdCBpc1xuICAgICAqIGFscmVhZHkgYHJlbWVtYmVyKClgJ2QuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLS0xLS0tMi0tLS0tMy0tLVxuICAgICAqICAgc3RhcnRXaXRoKDApXG4gICAgICogMC0tMS0tLTItLS0tLTMtLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSBpbml0aWFsIFRoZSB2YWx1ZSBvciBldmVudCB0byBwcmVwZW5kLlxuICAgICAqIEByZXR1cm4ge01lbW9yeVN0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnN0YXJ0V2l0aCA9IGZ1bmN0aW9uIChpbml0aWFsKSB7XG4gICAgICAgIHJldHVybiBuZXcgTWVtb3J5U3RyZWFtKG5ldyBTdGFydFdpdGgodGhpcywgaW5pdGlhbCkpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogVXNlcyBhbm90aGVyIHN0cmVhbSB0byBkZXRlcm1pbmUgd2hlbiB0byBjb21wbGV0ZSB0aGUgY3VycmVudCBzdHJlYW0uXG4gICAgICpcbiAgICAgKiBXaGVuIHRoZSBnaXZlbiBgb3RoZXJgIHN0cmVhbSBlbWl0cyBhbiBldmVudCBvciBjb21wbGV0ZXMsIHRoZSBvdXRwdXRcbiAgICAgKiBzdHJlYW0gd2lsbCBjb21wbGV0ZS4gQmVmb3JlIHRoYXQgaGFwcGVucywgdGhlIG91dHB1dCBzdHJlYW0gd2lsbCBiZWhhdmVzXG4gICAgICogbGlrZSB0aGUgaW5wdXQgc3RyZWFtLlxuICAgICAqXG4gICAgICogTWFyYmxlIGRpYWdyYW06XG4gICAgICpcbiAgICAgKiBgYGB0ZXh0XG4gICAgICogLS0tMS0tLTItLS0tLTMtLTQtLS0tNS0tLS02LS0tXG4gICAgICogICBlbmRXaGVuKCAtLS0tLS0tLWEtLWItLXwgKVxuICAgICAqIC0tLTEtLS0yLS0tLS0zLS00LS18XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0gb3RoZXIgU29tZSBvdGhlciBzdHJlYW0gdGhhdCBpcyB1c2VkIHRvIGtub3cgd2hlbiBzaG91bGQgdGhlIG91dHB1dFxuICAgICAqIHN0cmVhbSBvZiB0aGlzIG9wZXJhdG9yIGNvbXBsZXRlLlxuICAgICAqIEByZXR1cm4ge1N0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmVuZFdoZW4gPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyAodGhpcy5jdG9yKCkpKG5ldyBFbmRXaGVuKG90aGVyLCB0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBcIkZvbGRzXCIgdGhlIHN0cmVhbSBvbnRvIGl0c2VsZi5cbiAgICAgKlxuICAgICAqIENvbWJpbmVzIGV2ZW50cyBmcm9tIHRoZSBwYXN0IHRocm91Z2hvdXRcbiAgICAgKiB0aGUgZW50aXJlIGV4ZWN1dGlvbiBvZiB0aGUgaW5wdXQgc3RyZWFtLCBhbGxvd2luZyB5b3UgdG8gYWNjdW11bGF0ZSB0aGVtXG4gICAgICogdG9nZXRoZXIuIEl0J3MgZXNzZW50aWFsbHkgbGlrZSBgQXJyYXkucHJvdG90eXBlLnJlZHVjZWAuIFRoZSByZXR1cm5lZFxuICAgICAqIHN0cmVhbSBpcyBhIE1lbW9yeVN0cmVhbSwgd2hpY2ggbWVhbnMgaXQgaXMgYWxyZWFkeSBgcmVtZW1iZXIoKWAnZC5cbiAgICAgKlxuICAgICAqIFRoZSBvdXRwdXQgc3RyZWFtIHN0YXJ0cyBieSBlbWl0dGluZyB0aGUgYHNlZWRgIHdoaWNoIHlvdSBnaXZlIGFzIGFyZ3VtZW50LlxuICAgICAqIFRoZW4sIHdoZW4gYW4gZXZlbnQgaGFwcGVucyBvbiB0aGUgaW5wdXQgc3RyZWFtLCBpdCBpcyBjb21iaW5lZCB3aXRoIHRoYXRcbiAgICAgKiBzZWVkIHZhbHVlIHRocm91Z2ggdGhlIGBhY2N1bXVsYXRlYCBmdW5jdGlvbiwgYW5kIHRoZSBvdXRwdXQgdmFsdWUgaXNcbiAgICAgKiBlbWl0dGVkIG9uIHRoZSBvdXRwdXQgc3RyZWFtLiBgZm9sZGAgcmVtZW1iZXJzIHRoYXQgb3V0cHV0IHZhbHVlIGFzIGBhY2NgXG4gICAgICogKFwiYWNjdW11bGF0b3JcIiksIGFuZCB0aGVuIHdoZW4gYSBuZXcgaW5wdXQgZXZlbnQgYHRgIGhhcHBlbnMsIGBhY2NgIHdpbGwgYmVcbiAgICAgKiBjb21iaW5lZCB3aXRoIHRoYXQgdG8gcHJvZHVjZSB0aGUgbmV3IGBhY2NgIGFuZCBzbyBmb3J0aC5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tLS0tLTEtLS0tLTEtLTItLS0tMS0tLS0xLS0tLS0tXG4gICAgICogICBmb2xkKChhY2MsIHgpID0+IGFjYyArIHgsIDMpXG4gICAgICogMy0tLS0tNC0tLS0tNS0tNy0tLS04LS0tLTktLS0tLS1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGFjY3VtdWxhdGUgQSBmdW5jdGlvbiBvZiB0eXBlIGAoYWNjOiBSLCB0OiBUKSA9PiBSYCB0aGF0XG4gICAgICogdGFrZXMgdGhlIHByZXZpb3VzIGFjY3VtdWxhdGVkIHZhbHVlIGBhY2NgIGFuZCB0aGUgaW5jb21pbmcgZXZlbnQgZnJvbSB0aGVcbiAgICAgKiBpbnB1dCBzdHJlYW0gYW5kIHByb2R1Y2VzIHRoZSBuZXcgYWNjdW11bGF0ZWQgdmFsdWUuXG4gICAgICogQHBhcmFtIHNlZWQgVGhlIGluaXRpYWwgYWNjdW11bGF0ZWQgdmFsdWUsIG9mIHR5cGUgYFJgLlxuICAgICAqIEByZXR1cm4ge01lbW9yeVN0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmZvbGQgPSBmdW5jdGlvbiAoYWNjdW11bGF0ZSwgc2VlZCkge1xuICAgICAgICByZXR1cm4gbmV3IE1lbW9yeVN0cmVhbShuZXcgRm9sZChhY2N1bXVsYXRlLCBzZWVkLCB0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhbiBlcnJvciB3aXRoIGFub3RoZXIgc3RyZWFtLlxuICAgICAqXG4gICAgICogV2hlbiAoYW5kIGlmKSBhbiBlcnJvciBoYXBwZW5zIG9uIHRoZSBpbnB1dCBzdHJlYW0sIGluc3RlYWQgb2YgZm9yd2FyZGluZ1xuICAgICAqIHRoYXQgZXJyb3IgdG8gdGhlIG91dHB1dCBzdHJlYW0sICpyZXBsYWNlRXJyb3IqIHdpbGwgY2FsbCB0aGUgYHJlcGxhY2VgXG4gICAgICogZnVuY3Rpb24gd2hpY2ggcmV0dXJucyB0aGUgc3RyZWFtIHRoYXQgdGhlIG91dHB1dCBzdHJlYW0gd2lsbCByZXBsaWNhdGUuXG4gICAgICogQW5kLCBpbiBjYXNlIHRoYXQgbmV3IHN0cmVhbSBhbHNvIGVtaXRzIGFuIGVycm9yLCBgcmVwbGFjZWAgd2lsbCBiZSBjYWxsZWRcbiAgICAgKiBhZ2FpbiB0byBnZXQgYW5vdGhlciBzdHJlYW0gdG8gc3RhcnQgcmVwbGljYXRpbmcuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLTEtLS0yLS0tLS0zLS00LS0tLS1YXG4gICAgICogICByZXBsYWNlRXJyb3IoICgpID0+IC0tMTAtLXwgKVxuICAgICAqIC0tMS0tLTItLS0tLTMtLTQtLS0tLS0tLTEwLS18XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSByZXBsYWNlIEEgZnVuY3Rpb24gb2YgdHlwZSBgKGVycikgPT4gU3RyZWFtYCB0aGF0IHRha2VzXG4gICAgICogdGhlIGVycm9yIHRoYXQgb2NjdXJyZWQgb24gdGhlIGlucHV0IHN0cmVhbSBvciBvbiB0aGUgcHJldmlvdXMgcmVwbGFjZW1lbnRcbiAgICAgKiBzdHJlYW0gYW5kIHJldHVybnMgYSBuZXcgc3RyZWFtLiBUaGUgb3V0cHV0IHN0cmVhbSB3aWxsIGJlaGF2ZSBsaWtlIHRoZVxuICAgICAqIHN0cmVhbSB0aGF0IHRoaXMgZnVuY3Rpb24gcmV0dXJucy5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5yZXBsYWNlRXJyb3IgPSBmdW5jdGlvbiAocmVwbGFjZSkge1xuICAgICAgICByZXR1cm4gbmV3ICh0aGlzLmN0b3IoKSkobmV3IFJlcGxhY2VFcnJvcihyZXBsYWNlLCB0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBGbGF0dGVucyBhIFwic3RyZWFtIG9mIHN0cmVhbXNcIiwgaGFuZGxpbmcgb25seSBvbmUgbmVzdGVkIHN0cmVhbSBhdCBhIHRpbWVcbiAgICAgKiAobm8gY29uY3VycmVuY3kpLlxuICAgICAqXG4gICAgICogSWYgdGhlIGlucHV0IHN0cmVhbSBpcyBhIHN0cmVhbSB0aGF0IGVtaXRzIHN0cmVhbXMsIHRoZW4gdGhpcyBvcGVyYXRvciB3aWxsXG4gICAgICogcmV0dXJuIGFuIG91dHB1dCBzdHJlYW0gd2hpY2ggaXMgYSBmbGF0IHN0cmVhbTogZW1pdHMgcmVndWxhciBldmVudHMuIFRoZVxuICAgICAqIGZsYXR0ZW5pbmcgaGFwcGVucyB3aXRob3V0IGNvbmN1cnJlbmN5LiBJdCB3b3JrcyBsaWtlIHRoaXM6IHdoZW4gdGhlIGlucHV0XG4gICAgICogc3RyZWFtIGVtaXRzIGEgbmVzdGVkIHN0cmVhbSwgKmZsYXR0ZW4qIHdpbGwgc3RhcnQgaW1pdGF0aW5nIHRoYXQgbmVzdGVkXG4gICAgICogb25lLiBIb3dldmVyLCBhcyBzb29uIGFzIHRoZSBuZXh0IG5lc3RlZCBzdHJlYW0gaXMgZW1pdHRlZCBvbiB0aGUgaW5wdXRcbiAgICAgKiBzdHJlYW0sICpmbGF0dGVuKiB3aWxsIGZvcmdldCB0aGUgcHJldmlvdXMgbmVzdGVkIG9uZSBpdCB3YXMgaW1pdGF0aW5nLCBhbmRcbiAgICAgKiB3aWxsIHN0YXJ0IGltaXRhdGluZyB0aGUgbmV3IG5lc3RlZCBvbmUuXG4gICAgICpcbiAgICAgKiBNYXJibGUgZGlhZ3JhbTpcbiAgICAgKlxuICAgICAqIGBgYHRleHRcbiAgICAgKiAtLSstLS0tLS0tLSstLS0tLS0tLS0tLS0tLS1cbiAgICAgKiAgIFxcICAgICAgICBcXFxuICAgICAqICAgIFxcICAgICAgIC0tLS0xLS0tLTItLS0zLS1cbiAgICAgKiAgICAtLWEtLWItLS0tYy0tLS1kLS0tLS0tLS1cbiAgICAgKiAgICAgICAgICAgZmxhdHRlblxuICAgICAqIC0tLS0tYS0tYi0tLS0tLTEtLS0tMi0tLTMtLVxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyZWFtfVxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuZmxhdHRlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLl9wcm9kO1xuICAgICAgICByZXR1cm4gbmV3IFN0cmVhbShuZXcgRmxhdHRlbih0aGlzKSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBQYXNzZXMgdGhlIGlucHV0IHN0cmVhbSB0byBhIGN1c3RvbSBvcGVyYXRvciwgdG8gcHJvZHVjZSBhbiBvdXRwdXQgc3RyZWFtLlxuICAgICAqXG4gICAgICogKmNvbXBvc2UqIGlzIGEgaGFuZHkgd2F5IG9mIHVzaW5nIGFuIGV4aXN0aW5nIGZ1bmN0aW9uIGluIGEgY2hhaW5lZCBzdHlsZS5cbiAgICAgKiBJbnN0ZWFkIG9mIHdyaXRpbmcgYG91dFN0cmVhbSA9IGYoaW5TdHJlYW0pYCB5b3UgY2FuIHdyaXRlXG4gICAgICogYG91dFN0cmVhbSA9IGluU3RyZWFtLmNvbXBvc2UoZilgLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gb3BlcmF0b3IgQSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgc3RyZWFtIGFzIGlucHV0IGFuZFxuICAgICAqIHJldHVybnMgYSBzdHJlYW0gYXMgd2VsbC5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5jb21wb3NlID0gZnVuY3Rpb24gKG9wZXJhdG9yKSB7XG4gICAgICAgIHJldHVybiBvcGVyYXRvcih0aGlzKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gb3V0cHV0IHN0cmVhbSB0aGF0IGJlaGF2ZXMgbGlrZSB0aGUgaW5wdXQgc3RyZWFtLCBidXQgYWxzb1xuICAgICAqIHJlbWVtYmVycyB0aGUgbW9zdCByZWNlbnQgZXZlbnQgdGhhdCBoYXBwZW5zIG9uIHRoZSBpbnB1dCBzdHJlYW0sIHNvIHRoYXQgYVxuICAgICAqIG5ld2x5IGFkZGVkIGxpc3RlbmVyIHdpbGwgaW1tZWRpYXRlbHkgcmVjZWl2ZSB0aGF0IG1lbW9yaXNlZCBldmVudC5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge01lbW9yeVN0cmVhbX1cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnJlbWVtYmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IE1lbW9yeVN0cmVhbShuZXcgUmVtZW1iZXIodGhpcykpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBvdXRwdXQgc3RyZWFtIHRoYXQgaWRlbnRpY2FsbHkgYmVoYXZlcyBsaWtlIHRoZSBpbnB1dCBzdHJlYW0sXG4gICAgICogYnV0IGFsc28gcnVucyBhIGBzcHlgIGZ1bmN0aW9uIGZvIGVhY2ggZXZlbnQsIHRvIGhlbHAgeW91IGRlYnVnIHlvdXIgYXBwLlxuICAgICAqXG4gICAgICogKmRlYnVnKiB0YWtlcyBhIGBzcHlgIGZ1bmN0aW9uIGFzIGFyZ3VtZW50LCBhbmQgcnVucyB0aGF0IGZvciBlYWNoIGV2ZW50XG4gICAgICogaGFwcGVuaW5nIG9uIHRoZSBpbnB1dCBzdHJlYW0uIElmIHlvdSBkb24ndCBwcm92aWRlIHRoZSBgc3B5YCBhcmd1bWVudCxcbiAgICAgKiB0aGVuICpkZWJ1Zyogd2lsbCBqdXN0IGBjb25zb2xlLmxvZ2AgZWFjaCBldmVudC4gVGhpcyBoZWxwcyB5b3UgdG9cbiAgICAgKiB1bmRlcnN0YW5kIHRoZSBmbG93IG9mIGV2ZW50cyB0aHJvdWdoIHNvbWUgb3BlcmF0b3IgY2hhaW4uXG4gICAgICpcbiAgICAgKiBQbGVhc2Ugbm90ZSB0aGF0IGlmIHRoZSBvdXRwdXQgc3RyZWFtIGhhcyBubyBsaXN0ZW5lcnMsIHRoZW4gaXQgd2lsbCBub3RcbiAgICAgKiBzdGFydCwgd2hpY2ggbWVhbnMgYHNweWAgd2lsbCBuZXZlciBydW4gYmVjYXVzZSBubyBhY3R1YWwgZXZlbnQgaGFwcGVucyBpblxuICAgICAqIHRoYXQgY2FzZS5cbiAgICAgKlxuICAgICAqIE1hcmJsZSBkaWFncmFtOlxuICAgICAqXG4gICAgICogYGBgdGV4dFxuICAgICAqIC0tMS0tLS0yLS0tLS0zLS0tLS00LS1cbiAgICAgKiAgICAgICAgIGRlYnVnXG4gICAgICogLS0xLS0tLTItLS0tLTMtLS0tLTQtLVxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGFiZWxPclNweSBBIHN0cmluZyB0byB1c2UgYXMgdGhlIGxhYmVsIHdoZW4gcHJpbnRpbmdcbiAgICAgKiBkZWJ1ZyBpbmZvcm1hdGlvbiBvbiB0aGUgY29uc29sZSwgb3IgYSAnc3B5JyBmdW5jdGlvbiB0aGF0IHRha2VzIGFuIGV2ZW50XG4gICAgICogYXMgYXJndW1lbnQsIGFuZCBkb2VzIG5vdCBuZWVkIHRvIHJldHVybiBhbnl0aGluZy5cbiAgICAgKiBAcmV0dXJuIHtTdHJlYW19XG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5kZWJ1ZyA9IGZ1bmN0aW9uIChsYWJlbE9yU3B5KSB7XG4gICAgICAgIHJldHVybiBuZXcgKHRoaXMuY3RvcigpKShuZXcgRGVidWcodGhpcywgbGFiZWxPclNweSkpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogKmltaXRhdGUqIGNoYW5nZXMgdGhpcyBjdXJyZW50IFN0cmVhbSB0byBlbWl0IHRoZSBzYW1lIGV2ZW50cyB0aGF0IHRoZVxuICAgICAqIGBvdGhlcmAgZ2l2ZW4gU3RyZWFtIGRvZXMuIFRoaXMgbWV0aG9kIHJldHVybnMgbm90aGluZy5cbiAgICAgKlxuICAgICAqIFRoaXMgbWV0aG9kIGV4aXN0cyB0byBhbGxvdyBvbmUgdGhpbmc6ICoqY2lyY3VsYXIgZGVwZW5kZW5jeSBvZiBzdHJlYW1zKiouXG4gICAgICogRm9yIGluc3RhbmNlLCBsZXQncyBpbWFnaW5lIHRoYXQgZm9yIHNvbWUgcmVhc29uIHlvdSBuZWVkIHRvIGNyZWF0ZSBhXG4gICAgICogY2lyY3VsYXIgZGVwZW5kZW5jeSB3aGVyZSBzdHJlYW0gYGZpcnN0JGAgZGVwZW5kcyBvbiBzdHJlYW0gYHNlY29uZCRgXG4gICAgICogd2hpY2ggaW4gdHVybiBkZXBlbmRzIG9uIGBmaXJzdCRgOlxuICAgICAqXG4gICAgICogPCEtLSBza2lwLWV4YW1wbGUgLS0+XG4gICAgICogYGBganNcbiAgICAgKiBpbXBvcnQgZGVsYXkgZnJvbSAneHN0cmVhbS9leHRyYS9kZWxheSdcbiAgICAgKlxuICAgICAqIHZhciBmaXJzdCQgPSBzZWNvbmQkLm1hcCh4ID0+IHggKiAxMCkudGFrZSgzKTtcbiAgICAgKiB2YXIgc2Vjb25kJCA9IGZpcnN0JC5tYXAoeCA9PiB4ICsgMSkuc3RhcnRXaXRoKDEpLmNvbXBvc2UoZGVsYXkoMTAwKSk7XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBIb3dldmVyLCB0aGF0IGlzIGludmFsaWQgSmF2YVNjcmlwdCwgYmVjYXVzZSBgc2Vjb25kJGAgaXMgdW5kZWZpbmVkXG4gICAgICogb24gdGhlIGZpcnN0IGxpbmUuIFRoaXMgaXMgaG93ICppbWl0YXRlKiBjYW4gaGVscCBzb2x2ZSBpdDpcbiAgICAgKlxuICAgICAqIGBgYGpzXG4gICAgICogaW1wb3J0IGRlbGF5IGZyb20gJ3hzdHJlYW0vZXh0cmEvZGVsYXknXG4gICAgICpcbiAgICAgKiB2YXIgc2Vjb25kUHJveHkkID0geHMuY3JlYXRlKCk7XG4gICAgICogdmFyIGZpcnN0JCA9IHNlY29uZFByb3h5JC5tYXAoeCA9PiB4ICogMTApLnRha2UoMyk7XG4gICAgICogdmFyIHNlY29uZCQgPSBmaXJzdCQubWFwKHggPT4geCArIDEpLnN0YXJ0V2l0aCgxKS5jb21wb3NlKGRlbGF5KDEwMCkpO1xuICAgICAqIHNlY29uZFByb3h5JC5pbWl0YXRlKHNlY29uZCQpO1xuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogV2UgY3JlYXRlIGBzZWNvbmRQcm94eSRgIGJlZm9yZSB0aGUgb3RoZXJzLCBzbyBpdCBjYW4gYmUgdXNlZCBpbiB0aGVcbiAgICAgKiBkZWNsYXJhdGlvbiBvZiBgZmlyc3QkYC4gVGhlbiwgYWZ0ZXIgYm90aCBgZmlyc3QkYCBhbmQgYHNlY29uZCRgIGFyZVxuICAgICAqIGRlZmluZWQsIHdlIGhvb2sgYHNlY29uZFByb3h5JGAgd2l0aCBgc2Vjb25kJGAgd2l0aCBgaW1pdGF0ZSgpYCB0byB0ZWxsXG4gICAgICogdGhhdCB0aGV5IGFyZSBcInRoZSBzYW1lXCIuIGBpbWl0YXRlYCB3aWxsIG5vdCB0cmlnZ2VyIHRoZSBzdGFydCBvZiBhbnlcbiAgICAgKiBzdHJlYW0sIGl0IGp1c3QgYmluZHMgYHNlY29uZFByb3h5JGAgYW5kIGBzZWNvbmQkYCB0b2dldGhlci5cbiAgICAgKlxuICAgICAqIFRoZSBmb2xsb3dpbmcgaXMgYW4gZXhhbXBsZSB3aGVyZSBgaW1pdGF0ZSgpYCBpcyBpbXBvcnRhbnQgaW4gQ3ljbGUuanNcbiAgICAgKiBhcHBsaWNhdGlvbnMuIEEgcGFyZW50IGNvbXBvbmVudCBjb250YWlucyBzb21lIGNoaWxkIGNvbXBvbmVudHMuIEEgY2hpbGRcbiAgICAgKiBoYXMgYW4gYWN0aW9uIHN0cmVhbSB3aGljaCBpcyBnaXZlbiB0byB0aGUgcGFyZW50IHRvIGRlZmluZSBpdHMgc3RhdGU6XG4gICAgICpcbiAgICAgKiA8IS0tIHNraXAtZXhhbXBsZSAtLT5cbiAgICAgKiBgYGBqc1xuICAgICAqIGNvbnN0IGNoaWxkQWN0aW9uUHJveHkkID0geHMuY3JlYXRlKCk7XG4gICAgICogY29uc3QgcGFyZW50ID0gUGFyZW50KHsuLi5zb3VyY2VzLCBjaGlsZEFjdGlvbiQ6IGNoaWxkQWN0aW9uUHJveHkkfSk7XG4gICAgICogY29uc3QgY2hpbGRBY3Rpb24kID0gcGFyZW50LnN0YXRlJC5tYXAocyA9PiBzLmNoaWxkLmFjdGlvbiQpLmZsYXR0ZW4oKTtcbiAgICAgKiBjaGlsZEFjdGlvblByb3h5JC5pbWl0YXRlKGNoaWxkQWN0aW9uJCk7XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBOb3RlLCB0aG91Z2gsIHRoYXQgKipgaW1pdGF0ZSgpYCBkb2VzIG5vdCBzdXBwb3J0IE1lbW9yeVN0cmVhbXMqKi4gSWYgd2VcbiAgICAgKiB3b3VsZCBhdHRlbXB0IHRvIGltaXRhdGUgYSBNZW1vcnlTdHJlYW0gaW4gYSBjaXJjdWxhciBkZXBlbmRlbmN5LCB3ZSB3b3VsZFxuICAgICAqIGVpdGhlciBnZXQgYSByYWNlIGNvbmRpdGlvbiAod2hlcmUgdGhlIHN5bXB0b20gd291bGQgYmUgXCJub3RoaW5nIGhhcHBlbnNcIilcbiAgICAgKiBvciBhbiBpbmZpbml0ZSBjeWNsaWMgZW1pc3Npb24gb2YgdmFsdWVzLiBJdCdzIHVzZWZ1bCB0byB0aGluayBhYm91dFxuICAgICAqIE1lbW9yeVN0cmVhbXMgYXMgY2VsbHMgaW4gYSBzcHJlYWRzaGVldC4gSXQgZG9lc24ndCBtYWtlIGFueSBzZW5zZSB0b1xuICAgICAqIGRlZmluZSBhIHNwcmVhZHNoZWV0IGNlbGwgYEExYCB3aXRoIGEgZm9ybXVsYSB0aGF0IGRlcGVuZHMgb24gYEIxYCBhbmRcbiAgICAgKiBjZWxsIGBCMWAgZGVmaW5lZCB3aXRoIGEgZm9ybXVsYSB0aGF0IGRlcGVuZHMgb24gYEExYC5cbiAgICAgKlxuICAgICAqIElmIHlvdSBmaW5kIHlvdXJzZWxmIHdhbnRpbmcgdG8gdXNlIGBpbWl0YXRlKClgIHdpdGggYVxuICAgICAqIE1lbW9yeVN0cmVhbSwgeW91IHNob3VsZCByZXdvcmsgeW91ciBjb2RlIGFyb3VuZCBgaW1pdGF0ZSgpYCB0byB1c2UgYVxuICAgICAqIFN0cmVhbSBpbnN0ZWFkLiBMb29rIGZvciB0aGUgc3RyZWFtIGluIHRoZSBjaXJjdWxhciBkZXBlbmRlbmN5IHRoYXRcbiAgICAgKiByZXByZXNlbnRzIGFuIGV2ZW50IHN0cmVhbSwgYW5kIHRoYXQgd291bGQgYmUgYSBjYW5kaWRhdGUgZm9yIGNyZWF0aW5nIGFcbiAgICAgKiBwcm94eSBTdHJlYW0gd2hpY2ggdGhlbiBpbWl0YXRlcyB0aGUgdGFyZ2V0IFN0cmVhbS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyZWFtfSB0YXJnZXQgVGhlIG90aGVyIHN0cmVhbSB0byBpbWl0YXRlIG9uIHRoZSBjdXJyZW50IG9uZS4gTXVzdFxuICAgICAqIG5vdCBiZSBhIE1lbW9yeVN0cmVhbS5cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLmltaXRhdGUgPSBmdW5jdGlvbiAodGFyZ2V0KSB7XG4gICAgICAgIGlmICh0YXJnZXQgaW5zdGFuY2VvZiBNZW1vcnlTdHJlYW0pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgTWVtb3J5U3RyZWFtIHdhcyBnaXZlbiB0byBpbWl0YXRlKCksIGJ1dCBpdCBvbmx5ICcgK1xuICAgICAgICAgICAgICAgICdzdXBwb3J0cyBhIFN0cmVhbS4gUmVhZCBtb3JlIGFib3V0IHRoaXMgcmVzdHJpY3Rpb24gaGVyZTogJyArXG4gICAgICAgICAgICAgICAgJ2h0dHBzOi8vZ2l0aHViLmNvbS9zdGFsdHoveHN0cmVhbSNmYXEnKTtcbiAgICAgICAgdGhpcy5fdGFyZ2V0ID0gdGFyZ2V0O1xuICAgICAgICBmb3IgKHZhciBpbHMgPSB0aGlzLl9pbHMsIE4gPSBpbHMubGVuZ3RoLCBpID0gMDsgaSA8IE47IGkrKylcbiAgICAgICAgICAgIHRhcmdldC5fYWRkKGlsc1tpXSk7XG4gICAgICAgIHRoaXMuX2lscyA9IFtdO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRm9yY2VzIHRoZSBTdHJlYW0gdG8gZW1pdCB0aGUgZ2l2ZW4gdmFsdWUgdG8gaXRzIGxpc3RlbmVycy5cbiAgICAgKlxuICAgICAqIEFzIHRoZSBuYW1lIGluZGljYXRlcywgaWYgeW91IHVzZSB0aGlzLCB5b3UgYXJlIG1vc3QgbGlrZWx5IGRvaW5nIHNvbWV0aGluZ1xuICAgICAqIFRoZSBXcm9uZyBXYXkuIFBsZWFzZSB0cnkgdG8gdW5kZXJzdGFuZCB0aGUgcmVhY3RpdmUgd2F5IGJlZm9yZSB1c2luZyB0aGlzXG4gICAgICogbWV0aG9kLiBVc2UgaXQgb25seSB3aGVuIHlvdSBrbm93IHdoYXQgeW91IGFyZSBkb2luZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB2YWx1ZSBUaGUgXCJuZXh0XCIgdmFsdWUgeW91IHdhbnQgdG8gYnJvYWRjYXN0IHRvIGFsbCBsaXN0ZW5lcnMgb2ZcbiAgICAgKiB0aGlzIFN0cmVhbS5cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnNoYW1lZnVsbHlTZW5kTmV4dCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB0aGlzLl9uKHZhbHVlKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZvcmNlcyB0aGUgU3RyZWFtIHRvIGVtaXQgdGhlIGdpdmVuIGVycm9yIHRvIGl0cyBsaXN0ZW5lcnMuXG4gICAgICpcbiAgICAgKiBBcyB0aGUgbmFtZSBpbmRpY2F0ZXMsIGlmIHlvdSB1c2UgdGhpcywgeW91IGFyZSBtb3N0IGxpa2VseSBkb2luZyBzb21ldGhpbmdcbiAgICAgKiBUaGUgV3JvbmcgV2F5LiBQbGVhc2UgdHJ5IHRvIHVuZGVyc3RhbmQgdGhlIHJlYWN0aXZlIHdheSBiZWZvcmUgdXNpbmcgdGhpc1xuICAgICAqIG1ldGhvZC4gVXNlIGl0IG9ubHkgd2hlbiB5b3Uga25vdyB3aGF0IHlvdSBhcmUgZG9pbmcuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2FueX0gZXJyb3IgVGhlIGVycm9yIHlvdSB3YW50IHRvIGJyb2FkY2FzdCB0byBhbGwgdGhlIGxpc3RlbmVycyBvZlxuICAgICAqIHRoaXMgU3RyZWFtLlxuICAgICAqL1xuICAgIFN0cmVhbS5wcm90b3R5cGUuc2hhbWVmdWxseVNlbmRFcnJvciA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICB0aGlzLl9lKGVycm9yKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZvcmNlcyB0aGUgU3RyZWFtIHRvIGVtaXQgdGhlIFwiY29tcGxldGVkXCIgZXZlbnQgdG8gaXRzIGxpc3RlbmVycy5cbiAgICAgKlxuICAgICAqIEFzIHRoZSBuYW1lIGluZGljYXRlcywgaWYgeW91IHVzZSB0aGlzLCB5b3UgYXJlIG1vc3QgbGlrZWx5IGRvaW5nIHNvbWV0aGluZ1xuICAgICAqIFRoZSBXcm9uZyBXYXkuIFBsZWFzZSB0cnkgdG8gdW5kZXJzdGFuZCB0aGUgcmVhY3RpdmUgd2F5IGJlZm9yZSB1c2luZyB0aGlzXG4gICAgICogbWV0aG9kLiBVc2UgaXQgb25seSB3aGVuIHlvdSBrbm93IHdoYXQgeW91IGFyZSBkb2luZy5cbiAgICAgKi9cbiAgICBTdHJlYW0ucHJvdG90eXBlLnNoYW1lZnVsbHlTZW5kQ29tcGxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2MoKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEFkZHMgYSBcImRlYnVnXCIgbGlzdGVuZXIgdG8gdGhlIHN0cmVhbS4gVGhlcmUgY2FuIG9ubHkgYmUgb25lIGRlYnVnXG4gICAgICogbGlzdGVuZXIsIHRoYXQncyB3aHkgdGhpcyBpcyAnc2V0RGVidWdMaXN0ZW5lcicuIFRvIHJlbW92ZSB0aGUgZGVidWdcbiAgICAgKiBsaXN0ZW5lciwganVzdCBjYWxsIHNldERlYnVnTGlzdGVuZXIobnVsbCkuXG4gICAgICpcbiAgICAgKiBBIGRlYnVnIGxpc3RlbmVyIGlzIGxpa2UgYW55IG90aGVyIGxpc3RlbmVyLiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIHRoYXQgYVxuICAgICAqIGRlYnVnIGxpc3RlbmVyIGlzIFwic3RlYWx0aHlcIjogaXRzIHByZXNlbmNlL2Fic2VuY2UgZG9lcyBub3QgdHJpZ2dlciB0aGVcbiAgICAgKiBzdGFydC9zdG9wIG9mIHRoZSBzdHJlYW0gKG9yIHRoZSBwcm9kdWNlciBpbnNpZGUgdGhlIHN0cmVhbSkuIFRoaXMgaXNcbiAgICAgKiB1c2VmdWwgc28geW91IGNhbiBpbnNwZWN0IHdoYXQgaXMgZ29pbmcgb24gd2l0aG91dCBjaGFuZ2luZyB0aGUgYmVoYXZpb3JcbiAgICAgKiBvZiB0aGUgcHJvZ3JhbS4gSWYgeW91IGhhdmUgYW4gaWRsZSBzdHJlYW0gYW5kIHlvdSBhZGQgYSBub3JtYWwgbGlzdGVuZXIgdG9cbiAgICAgKiBpdCwgdGhlIHN0cmVhbSB3aWxsIHN0YXJ0IGV4ZWN1dGluZy4gQnV0IGlmIHlvdSBzZXQgYSBkZWJ1ZyBsaXN0ZW5lciBvbiBhblxuICAgICAqIGlkbGUgc3RyZWFtLCBpdCB3b24ndCBzdGFydCBleGVjdXRpbmcgKG5vdCB1bnRpbCB0aGUgZmlyc3Qgbm9ybWFsIGxpc3RlbmVyXG4gICAgICogaXMgYWRkZWQpLlxuICAgICAqXG4gICAgICogQXMgdGhlIG5hbWUgaW5kaWNhdGVzLCB3ZSBkb24ndCByZWNvbW1lbmQgdXNpbmcgdGhpcyBtZXRob2QgdG8gYnVpbGQgYXBwXG4gICAgICogbG9naWMuIEluIGZhY3QsIGluIG1vc3QgY2FzZXMgdGhlIGRlYnVnIG9wZXJhdG9yIHdvcmtzIGp1c3QgZmluZS4gT25seSB1c2VcbiAgICAgKiB0aGlzIG9uZSBpZiB5b3Uga25vdyB3aGF0IHlvdSdyZSBkb2luZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TGlzdGVuZXI8VD59IGxpc3RlbmVyXG4gICAgICovXG4gICAgU3RyZWFtLnByb3RvdHlwZS5zZXREZWJ1Z0xpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyKSB7XG4gICAgICAgIGlmICghbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2QgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX2RsID0gTk87XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9kID0gdHJ1ZTtcbiAgICAgICAgICAgIGxpc3RlbmVyLl9uID0gbGlzdGVuZXIubmV4dCB8fCBub29wO1xuICAgICAgICAgICAgbGlzdGVuZXIuX2UgPSBsaXN0ZW5lci5lcnJvciB8fCBub29wO1xuICAgICAgICAgICAgbGlzdGVuZXIuX2MgPSBsaXN0ZW5lci5jb21wbGV0ZSB8fCBub29wO1xuICAgICAgICAgICAgdGhpcy5fZGwgPSBsaXN0ZW5lcjtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIFN0cmVhbTtcbn0oKSk7XG4vKipcbiAqIEJsZW5kcyBtdWx0aXBsZSBzdHJlYW1zIHRvZ2V0aGVyLCBlbWl0dGluZyBldmVudHMgZnJvbSBhbGwgb2YgdGhlbVxuICogY29uY3VycmVudGx5LlxuICpcbiAqICptZXJnZSogdGFrZXMgbXVsdGlwbGUgc3RyZWFtcyBhcyBhcmd1bWVudHMsIGFuZCBjcmVhdGVzIGEgc3RyZWFtIHRoYXRcbiAqIGJlaGF2ZXMgbGlrZSBlYWNoIG9mIHRoZSBhcmd1bWVudCBzdHJlYW1zLCBpbiBwYXJhbGxlbC5cbiAqXG4gKiBNYXJibGUgZGlhZ3JhbTpcbiAqXG4gKiBgYGB0ZXh0XG4gKiAtLTEtLS0tMi0tLS0tMy0tLS0tLS0tNC0tLVxuICogLS0tLWEtLS0tLWItLS0tYy0tLWQtLS0tLS1cbiAqICAgICAgICAgICAgbWVyZ2VcbiAqIC0tMS1hLS0yLS1iLS0zLWMtLS1kLS00LS0tXG4gKiBgYGBcbiAqXG4gKiBAZmFjdG9yeSB0cnVlXG4gKiBAcGFyYW0ge1N0cmVhbX0gc3RyZWFtMSBBIHN0cmVhbSB0byBtZXJnZSB0b2dldGhlciB3aXRoIG90aGVyIHN0cmVhbXMuXG4gKiBAcGFyYW0ge1N0cmVhbX0gc3RyZWFtMiBBIHN0cmVhbSB0byBtZXJnZSB0b2dldGhlciB3aXRoIG90aGVyIHN0cmVhbXMuIFR3b1xuICogb3IgbW9yZSBzdHJlYW1zIG1heSBiZSBnaXZlbiBhcyBhcmd1bWVudHMuXG4gKiBAcmV0dXJuIHtTdHJlYW19XG4gKi9cblN0cmVhbS5tZXJnZSA9IGZ1bmN0aW9uIG1lcmdlKCkge1xuICAgIHZhciBzdHJlYW1zID0gW107XG4gICAgZm9yICh2YXIgX2kgPSAwOyBfaSA8IGFyZ3VtZW50cy5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgc3RyZWFtc1tfaV0gPSBhcmd1bWVudHNbX2ldO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFN0cmVhbShuZXcgTWVyZ2Uoc3RyZWFtcykpO1xufTtcbi8qKlxuICogQ29tYmluZXMgbXVsdGlwbGUgaW5wdXQgc3RyZWFtcyB0b2dldGhlciB0byByZXR1cm4gYSBzdHJlYW0gd2hvc2UgZXZlbnRzXG4gKiBhcmUgYXJyYXlzIHRoYXQgY29sbGVjdCB0aGUgbGF0ZXN0IGV2ZW50cyBmcm9tIGVhY2ggaW5wdXQgc3RyZWFtLlxuICpcbiAqICpjb21iaW5lKiBpbnRlcm5hbGx5IHJlbWVtYmVycyB0aGUgbW9zdCByZWNlbnQgZXZlbnQgZnJvbSBlYWNoIG9mIHRoZSBpbnB1dFxuICogc3RyZWFtcy4gV2hlbiBhbnkgb2YgdGhlIGlucHV0IHN0cmVhbXMgZW1pdHMgYW4gZXZlbnQsIHRoYXQgZXZlbnQgdG9nZXRoZXJcbiAqIHdpdGggYWxsIHRoZSBvdGhlciBzYXZlZCBldmVudHMgYXJlIGNvbWJpbmVkIGludG8gYW4gYXJyYXkuIFRoYXQgYXJyYXkgd2lsbFxuICogYmUgZW1pdHRlZCBvbiB0aGUgb3V0cHV0IHN0cmVhbS4gSXQncyBlc3NlbnRpYWxseSBhIHdheSBvZiBqb2luaW5nIHRvZ2V0aGVyXG4gKiB0aGUgZXZlbnRzIGZyb20gbXVsdGlwbGUgc3RyZWFtcy5cbiAqXG4gKiBNYXJibGUgZGlhZ3JhbTpcbiAqXG4gKiBgYGB0ZXh0XG4gKiAtLTEtLS0tMi0tLS0tMy0tLS0tLS0tNC0tLVxuICogLS0tLWEtLS0tLWItLS0tLWMtLWQtLS0tLS1cbiAqICAgICAgICAgIGNvbWJpbmVcbiAqIC0tLS0xYS0yYS0yYi0zYi0zYy0zZC00ZC0tXG4gKiBgYGBcbiAqXG4gKiBOb3RlOiB0byBtaW5pbWl6ZSBnYXJiYWdlIGNvbGxlY3Rpb24sICpjb21iaW5lKiB1c2VzIHRoZSBzYW1lIGFycmF5XG4gKiBpbnN0YW5jZSBmb3IgZWFjaCBlbWlzc2lvbi4gIElmIHlvdSBuZWVkIHRvIGNvbXBhcmUgZW1pc3Npb25zIG92ZXIgdGltZSxcbiAqIGNhY2hlIHRoZSB2YWx1ZXMgd2l0aCBgbWFwYCBmaXJzdDpcbiAqXG4gKiBgYGBqc1xuICogaW1wb3J0IHBhaXJ3aXNlIGZyb20gJ3hzdHJlYW0vZXh0cmEvcGFpcndpc2UnXG4gKlxuICogY29uc3Qgc3RyZWFtMSA9IHhzLm9mKDEpO1xuICogY29uc3Qgc3RyZWFtMiA9IHhzLm9mKDIpO1xuICpcbiAqIHhzLmNvbWJpbmUoc3RyZWFtMSwgc3RyZWFtMikubWFwKFxuICogICBjb21iaW5lZEVtaXNzaW9ucyA9PiAoWyAuLi5jb21iaW5lZEVtaXNzaW9ucyBdKVxuICogKS5jb21wb3NlKHBhaXJ3aXNlKVxuICogYGBgXG4gKlxuICogQGZhY3RvcnkgdHJ1ZVxuICogQHBhcmFtIHtTdHJlYW19IHN0cmVhbTEgQSBzdHJlYW0gdG8gY29tYmluZSB0b2dldGhlciB3aXRoIG90aGVyIHN0cmVhbXMuXG4gKiBAcGFyYW0ge1N0cmVhbX0gc3RyZWFtMiBBIHN0cmVhbSB0byBjb21iaW5lIHRvZ2V0aGVyIHdpdGggb3RoZXIgc3RyZWFtcy5cbiAqIE11bHRpcGxlIHN0cmVhbXMsIG5vdCBqdXN0IHR3bywgbWF5IGJlIGdpdmVuIGFzIGFyZ3VtZW50cy5cbiAqIEByZXR1cm4ge1N0cmVhbX1cbiAqL1xuU3RyZWFtLmNvbWJpbmUgPSBmdW5jdGlvbiBjb21iaW5lKCkge1xuICAgIHZhciBzdHJlYW1zID0gW107XG4gICAgZm9yICh2YXIgX2kgPSAwOyBfaSA8IGFyZ3VtZW50cy5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgc3RyZWFtc1tfaV0gPSBhcmd1bWVudHNbX2ldO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFN0cmVhbShuZXcgQ29tYmluZShzdHJlYW1zKSk7XG59O1xuZXhwb3J0cy5TdHJlYW0gPSBTdHJlYW07XG52YXIgTWVtb3J5U3RyZWFtID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoTWVtb3J5U3RyZWFtLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIE1lbW9yeVN0cmVhbShwcm9kdWNlcikge1xuICAgICAgICB2YXIgX3RoaXMgPSBfc3VwZXIuY2FsbCh0aGlzLCBwcm9kdWNlcikgfHwgdGhpcztcbiAgICAgICAgX3RoaXMuX2hhcyA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gX3RoaXM7XG4gICAgfVxuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUuX24gPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICB0aGlzLl92ID0geDtcbiAgICAgICAgdGhpcy5faGFzID0gdHJ1ZTtcbiAgICAgICAgX3N1cGVyLnByb3RvdHlwZS5fbi5jYWxsKHRoaXMsIHgpO1xuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS5fYWRkID0gZnVuY3Rpb24gKGlsKSB7XG4gICAgICAgIHZhciB0YSA9IHRoaXMuX3RhcmdldDtcbiAgICAgICAgaWYgKHRhICE9PSBOTylcbiAgICAgICAgICAgIHJldHVybiB0YS5fYWRkKGlsKTtcbiAgICAgICAgdmFyIGEgPSB0aGlzLl9pbHM7XG4gICAgICAgIGEucHVzaChpbCk7XG4gICAgICAgIGlmIChhLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9oYXMpXG4gICAgICAgICAgICAgICAgaWwuX24odGhpcy5fdik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3N0b3BJRCAhPT0gTk8pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9oYXMpXG4gICAgICAgICAgICAgICAgaWwuX24odGhpcy5fdik7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5fc3RvcElEKTtcbiAgICAgICAgICAgIHRoaXMuX3N0b3BJRCA9IE5PO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX2hhcylcbiAgICAgICAgICAgIGlsLl9uKHRoaXMuX3YpO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwID0gdGhpcy5fcHJvZDtcbiAgICAgICAgICAgIGlmIChwICE9PSBOTylcbiAgICAgICAgICAgICAgICBwLl9zdGFydCh0aGlzKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS5fc3RvcE5vdyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5faGFzID0gZmFsc2U7XG4gICAgICAgIF9zdXBlci5wcm90b3R5cGUuX3N0b3BOb3cuY2FsbCh0aGlzKTtcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUuX3ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2hhcyA9IGZhbHNlO1xuICAgICAgICBfc3VwZXIucHJvdG90eXBlLl94LmNhbGwodGhpcyk7XG4gICAgfTtcbiAgICBNZW1vcnlTdHJlYW0ucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uIChwcm9qZWN0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXAocHJvamVjdCk7XG4gICAgfTtcbiAgICBNZW1vcnlTdHJlYW0ucHJvdG90eXBlLm1hcFRvID0gZnVuY3Rpb24gKHByb2plY3RlZFZhbHVlKSB7XG4gICAgICAgIHJldHVybiBfc3VwZXIucHJvdG90eXBlLm1hcFRvLmNhbGwodGhpcywgcHJvamVjdGVkVmFsdWUpO1xuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS50YWtlID0gZnVuY3Rpb24gKGFtb3VudCkge1xuICAgICAgICByZXR1cm4gX3N1cGVyLnByb3RvdHlwZS50YWtlLmNhbGwodGhpcywgYW1vdW50KTtcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUuZW5kV2hlbiA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgICAgICByZXR1cm4gX3N1cGVyLnByb3RvdHlwZS5lbmRXaGVuLmNhbGwodGhpcywgb3RoZXIpO1xuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS5yZXBsYWNlRXJyb3IgPSBmdW5jdGlvbiAocmVwbGFjZSkge1xuICAgICAgICByZXR1cm4gX3N1cGVyLnByb3RvdHlwZS5yZXBsYWNlRXJyb3IuY2FsbCh0aGlzLCByZXBsYWNlKTtcbiAgICB9O1xuICAgIE1lbW9yeVN0cmVhbS5wcm90b3R5cGUucmVtZW1iZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgTWVtb3J5U3RyZWFtLnByb3RvdHlwZS5kZWJ1ZyA9IGZ1bmN0aW9uIChsYWJlbE9yU3B5KSB7XG4gICAgICAgIHJldHVybiBfc3VwZXIucHJvdG90eXBlLmRlYnVnLmNhbGwodGhpcywgbGFiZWxPclNweSk7XG4gICAgfTtcbiAgICByZXR1cm4gTWVtb3J5U3RyZWFtO1xufShTdHJlYW0pKTtcbmV4cG9ydHMuTWVtb3J5U3RyZWFtID0gTWVtb3J5U3RyZWFtO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gU3RyZWFtO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwidmFyIGxpYiA9IHJlcXVpcmUoJy4uLy4uL2xpYi9pbmRleCcpO1xudmFyIHJ1biA9IHJlcXVpcmUoJ0BjeWNsZS9ydW4nKS5ydW47XG52YXIgeHN0cmVhbSA9IHJlcXVpcmUoJ3hzdHJlYW0nKS5kZWZhdWx0O1xuXG5cbnZhciBkcm9wUmVwZWF0cyA9IHJlcXVpcmUoJ3hzdHJlYW0vZXh0cmEvZHJvcFJlcGVhdHMnKS5kZWZhdWx0O1xudmFyIGVxdWFsID0gcmVxdWlyZSgnZGVlcC1lcXVhbCcpO1xuXG5cbnZhciBtYWtlR3VuRHJpdmVyID0gbGliLm1ha2VHdW5Ecml2ZXI7XG5cbnZhciBhc3NlcnQgPSBjaGFpLmFzc2VydDtcblxuXG5cbmZ1bmN0aW9uIHNpbmtUb0d1bihldmVudFN0cmVhbSkge1xuICAgIHJldHVybiBldmVudFN0cmVhbVxuICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgcmV0dXJuIGV2ZW50LnR5cGVLZXkgPT09ICdvdXQtZ3VuJztcbiAgICAgICAgfSlcbiAgICAgICAgLm1hcChmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiBjb21tYW5kKGd1bkluc3RhbmNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGd1bkluc3RhbmNlXG4gICAgICAgICAgICAgICAgICAgIC5nZXQoJ2V4YW1wbGUvdG9kby9kYXRhJylcbiAgICAgICAgICAgICAgICAgICAgLnBhdGgoZXZlbnQucGF5bG9hZC5rZXkpXG4gICAgICAgICAgICAgICAgICAgIC5wdXQoZXZlbnQucGF5bG9hZC52YWx1ZSlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xufVxuXG52YXIgdGVzdEFycmF5ID0gW3tcbiAgICAgICAgdHlwZUtleTogJ291dC1ndW4nLFxuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBrZXk6ICcxJyxcbiAgICAgICAgICAgIHZhbHVlOiBcInRlc3QxXCJcbiAgICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgICB0eXBlS2V5OiAnb3V0LWd1bicsXG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgIGtleTogJzInLFxuICAgICAgICAgICAgdmFsdWU6IFwidGVzdDJcIlxuICAgICAgICB9XG4gICAgfSxcbiAgICB7XG4gICAgICAgIHR5cGVLZXk6ICdvdXQtZ3VuJyxcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAga2V5OiAnMycsXG4gICAgICAgICAgICB2YWx1ZTogXCJ0ZXN0M1wiXG4gICAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgdHlwZUtleTogJ291dC1ndW4nLFxuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBrZXk6ICc0JyxcbiAgICAgICAgICAgIHZhbHVlOiBcInRlc3Q0XCJcbiAgICAgICAgfVxuICAgIH1cbl1cblxuLy8gZnVuY3Rpb24gbWFpbihzb3VyY2VzKSB7XG5cblxuLy8gICAgIHZhciBnZXQkID0gc291cmNlcy5ndW4uZ2V0KGZ1bmN0aW9uIChndW5JbnN0YW5jZSkge1xuLy8gICAgICAgICByZXR1cm4gZ3VuSW5zdGFuY2UuZ2V0KCdleGFtcGxlL3RvZG8vZGF0YScpO1xuLy8gICAgIH0pLmNvbXBvc2UoZHJvcFJlcGVhdHMoZXF1YWwpKVxuLy8gICAgIC5kZWJ1ZygnZ2V0JylcblxuLy8gICAgIGdldCQuYWRkTGlzdGVuZXIoe1xuLy8gICAgICAgICBuZXh0OiBmdW5jdGlvbihldmVudCl7XG4vLyAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKGV2ZW50KTtcbi8vICAgICAgICAgfVxuLy8gICAgIH0pXG5cbi8vICAgICB2YXIgdGVzdFB1dCQgPSB4c3RyZWFtLmZyb21BcnJheSh0ZXN0QXJyYXkpO1xuXG4vLyAgICAgdmFyIGd1blNpbmtTdHJlYW0kID0gc2lua1RvR3VuKHRlc3RQdXQkKTtcblxuLy8gICAgIHJldHVybiB7XG4vLyAgICAgICAgIGd1bjogZ3VuU2lua1N0cmVhbSRcbi8vICAgICB9O1xuLy8gfVxuXG4vLyB2YXIgZHJpdmVycyA9IHtcbi8vICAgICBndW46IG1ha2VHdW5Ecml2ZXIoKVxuLy8gfVxuXG4vLyBjeWNsZS5ydW4obWFpbiwgZHJpdmVycylcblxuXG5cblxuXG5cblxuXG5kZXNjcmliZSgnTWFrZUd1bkRyaXZlciBGYWN0b3J5JywgZnVuY3Rpb24gKCkge1xuXG4gICAgaXQoJ2lzIGEgZnVuY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgbWFrZUd1bkRyaXZlciwgJ2Z1bmN0aW9uJyk7XG4gICAgfSk7XG5cbiAgICBpdCgncmV0dXJucyBhIGZ1bmN0aW9uJywgZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHZhciBndW5Ecml2ZXIgPSBtYWtlR3VuRHJpdmVyKCdodHRwOi8vYScpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGd1bkRyaXZlciwgJ2Z1bmN0aW9uJyk7XG4gICAgfSk7XG5cbn0pO1xuXG5cbmRlc2NyaWJlKCdjeWNsZS1ndW4gZHJpdmVyIGluc3RhbmNlJywgZnVuY3Rpb24gKCkge1xuXG5cbiAgICBmdW5jdGlvbiBtYWluKHNvdXJjZXMpIHtcblxuXG4gICAgICAgIGl0KCdzb3VyY2VzIGlzIGFuIG9iamVjdCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2Ygc291cmNlcy5ndW4sICdvYmplY3QnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaXQoJ0d1blNvdXJjZSBoYXMgc2VsZWN0LCBzaGFsbG93LCBlYWNoIG1ldGhvZHMnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHNvdXJjZXMuZ3VuLnNlbGVjdCwgJ2Z1bmN0aW9uJyk7XG4gICAgICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHNvdXJjZXMuZ3VuLnNoYWxsb3csICdmdW5jdGlvbicpO1xuICAgICAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBzb3VyY2VzLmd1bi5lYWNoLCAnZnVuY3Rpb24nKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaXQoJ2dldHMgaW5ib3VuZCBzdHJlYW0gZnJvbSBndW4nLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZ2V0JCA9IHNvdXJjZXMuZ3VuXG4gICAgICAgICAgICAgICAgLnNlbGVjdCgnZXhhbXBsZScpLnNlbGVjdCgndG9kbycpLnNlbGVjdCgnZGF0YScpXG4gICAgICAgICAgICAgICAgLnNoYWxsb3coKTtcblxuICAgICAgICAgICAgZ2V0JC5hZGRMaXN0ZW5lcih7XG4gICAgICAgICAgICAgICAgbmV4dDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGV2ZW50KVxuICAgICAgICAgICAgICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGV2ZW50LCAnb2JqZWN0Jyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGl0KCdjaGVja3MgZGF0YSBlbGVtZW50cyBhcmUgc2FtZSBhcyB0aG9zZSBzZW50JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGdldCQgPSBzb3VyY2VzLmd1blxuICAgICAgICAgICAgICAgIC5zZWxlY3QoJ2V4YW1wbGUnKS5zZWxlY3QoJ3RvZG8nKS5zZWxlY3QoJ2RhdGEnKVxuICAgICAgICAgICAgICAgIC5zaGFsbG93KCk7XG5cbiAgICAgICAgICAgIGdldCQuYWRkTGlzdGVuZXIoe1xuICAgICAgICAgICAgICAgIG5leHQ6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhldmVudClcbiAgICAgICAgICAgICAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50WycxJ10sICd0ZXN0MScpO1xuICAgICAgICAgICAgICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRbJzInXSwgJ3Rlc3QyJyk7XG4gICAgICAgICAgICAgICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChldmVudFsnMyddLCAndGVzdDMnKTtcbiAgICAgICAgICAgICAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Wyc0J10sICd0ZXN0NCcpO1xuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5cbiAgICAgICAgdmFyIHRlc3RQdXQkID0geHN0cmVhbS5mcm9tQXJyYXkodGVzdEFycmF5KTtcblxuICAgICAgICBjb25zdCBndW5TaW5rU3RyZWFtJCA9IHNpbmtUb0d1bih0ZXN0UHV0JCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGd1bjogZ3VuU2lua1N0cmVhbSRcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICB2YXIgZHJpdmVycyA9IHtcbiAgICAgICAgZ3VuOiBtYWtlR3VuRHJpdmVyKHtyb290OiAnLyd9KVxuICAgIH1cblxuICAgIHJ1bihtYWluLCBkcml2ZXJzKVxuXG59KTsiXX0=
