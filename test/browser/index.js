var lib = require('../../lib/index');
var cycle = require('@cycle/xstream-run').default;
var xstream = require('xstream').default;



var makeGunDriver = lib.makeGunDriver;


var assert = chai.assert;


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

        })

        it('returns a get method', function(){

            assert.strictEqual(typeof sources.gun.get, 'function');
        })


        return {}
    }

    var drivers = {
        gun: makeGunDriver()
    }

    cycle.run(main, drivers)







})






function addClass(el, newClass) {
    if (el.className.indexOf(newClass) === -1) {
        el.className += newClass;
    }
}


describe('addClass', function () {
    it('should add class to element', function () {
        var element = {
            className: ''
        };

        addClass(element, 'test-class');

        assert.equal(element.className, 'test-class');
    });

    it('should not add a class which already exists');
});