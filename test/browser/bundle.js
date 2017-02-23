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

},{"../node_modules/gun/gun.js":9,"deep-equal":6,"xstream":14,"xstream/extra/dropRepeats":13}],2:[function(require,module,exports){
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
