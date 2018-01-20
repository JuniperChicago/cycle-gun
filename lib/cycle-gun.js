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
    return function gunDriver(sink) {
        sink.addListener({
            next: function (command) { return command(gun); },
        });
        return new GunSource(gun, []);
    };
}
exports.makeGunDriver = makeGunDriver;
//# sourceMappingURL=cycle-gun.js.map