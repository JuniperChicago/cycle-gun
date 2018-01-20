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
                    .get(event.payload.key)
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
        console.log('sources', sources)

        it('sources is an object', function () {
            assert.strictEqual(typeof sources.gun, 'object');
        });

        it('GunSource has select, shallow, each methods', function () {

            console.log(sources.gun);
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
                    console.log('get$ event', event)
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