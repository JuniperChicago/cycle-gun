# cycle-gun

**WIP**

A [cycle.js](https://github.com/cyclejs/cyclejs) driver that wraps a [gun.js](https://github.com/amark/gun) store instance.

Note: This driver currently depends on the [xstream](https://github.com/staltz/xstream) library.

## Overview

- A gun store is created inside a driver function pointing to an optional peer.
- A a method named `get` is returned with the sources.
- The `get` method accepts a function argument that accesses the gun store directly and returns an event stream.
- The returned event stream transforms selected events from the gun store into xstream events
- transform functions are bundled with the payload and streamed into driver sinks
 
## Creating `get` Stream

The get stream applies a function to the gun instance, usually with a `gun.get('key')` and attaches a reactive stream that listens to the response of the initial function and any changes to the data stored under the given key, both the local instance and synced changes from peers of the gun instance as well.

```typescript

const {gun} = sources;

const gunTodoEvent$ = gun.get((gunInstance) => {
    return gunInstance.get('example/todo/data')
    })
    .compose(dropRepeats(equal))
    .map((todoState) => {
      return { typeKey: 'example-todo-data', payload: todoState };
    })

```

## Sinking messages to gun driver

In this version, we sink payload and transform messages to
the gun driver by sending a transform function through the
stream with payload references.

```typescript
  var outgoingGunTodo$ = event$
    .filter(keyFilter('out-gun-todo'))
    .map((event) => {
      return (gunInstance) => {
        return gunInstance.get('example/todo/data').path(uuid()).put(event.payload);
      }
    })
```

## A more complete example

Note: virtual-dom details omitted and transducers are verbose here

```typescript
import xs from 'xstream';
import { run } from '@cycle/xstream-run';
import { makeDOMDriver } from '@cycle/dom';
import { makeGunDriver } from 'cycle-gun';
import * as uuid from 'uuid-random';
import * as equal from 'deep-equal';
import dropRepeats from 'xstream/extra/dropRepeats';


function gunGetTodo(gun) {
    return gun.get('example/todo/data');
}

function main(sources) {

  const {DOM, gun} = sources;

  const gunTodoEvent$ = gun.get(gunGetTodo));

  // Transform gun events into action messages
  const gunState$ = gunTodoEvent$
    .compose(dropRepeats(equal))
    .map((event) => {
      return { typeKey: 'getTodo', payload: event };
    })

  // sink gunState$ into a state reducer or into vdom




  // sink streams of payloaded reducers to gun driver
  const outgoingGunEvents$ = event$
    .filter(event => event.typeKey === 'putTodo')
    .map((event) => {
      return (gunInstance) => {
        return gunInstance.get('example/todo/data').path(uuid()).put(event.payload);
      }
    })

  return {
    // DOM: vtree$
    gun: outgoingGunEvents$

    // DOM: xs.from([div('.container', [h1(['this is a test'])])])
  };
}

//const socketIODriver = makeSocketIODriver(socket);

const drivers = {
  // DOM: makeDOMDriver('#app'),
  gun: makeGunDriver('http://localhost:3500')
};

run(main, drivers);

```












