
import xs from 'xstream';
import * as Gun from 'gun';
import dropRepeats from 'xstream/extra/dropRepeats';
import * as equal from 'deep-equal';

export function makeGunDriver(url) {
    // TODO: multiple peer handling?

    const gun = Gun(url);

    function get(gunFn) {

        if (typeof gunFn !== 'function') throw 'Function Required to get gun stream';

        const loc = gunFn(gun);
        let eventListener = null;

        return xs.create({
            start: (listener) => {
                eventListener = (event) => {
                    return listener.next(event);
                };
                loc.on(eventListener);
            },
            stop: () => {
                // socket.removeEventListener(typeKey, this.eventListener);
            }
        })
    };
    
    function processTransform(inputFunction){
        return inputFunction(gun);
    }
    
    return (event$) => {
        event$.addListener({
            next: (transform) => {
                // TODO: Error handling
                return processTransform(transform);
            }
        });

        return {
            get
        };
    };

} 