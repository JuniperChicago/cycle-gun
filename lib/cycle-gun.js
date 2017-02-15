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
//# sourceMappingURL=cycle-gun.js.map