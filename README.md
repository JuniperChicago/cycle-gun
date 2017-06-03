# cycle-gun

A [cycle.js](https://github.com/cyclejs/cyclejs) driver that wraps a [gun.js](https://github.com/amark/gun) store instance.

Note: This driver currently depends on the [xstream](https://github.com/staltz/xstream) library.

## Overview

- Gun.js store is created inside a cycle driver pointing to an optional peer.
- The source from the Gun driver is an object with 3 methods: `select`, `shallow`, and `each`
- The sink stream emits "command" functions which take the gun.js instance and apply some changes to it using the normal Gun.js API

## Installation

```
npm install --save cycle-gun
```

## GunSource

The source from the Gun.js driver is an object with some methods that return streams.

Use `gunSource.select('books')` to go to the `books` path in the graph. It returns a new `gunSource` object.

Use `gunSource.shallow()` to get a Stream of the data under the current path. This is equivalent to Gun's `.on(callback)` API.

```typescript
const presidentAge$ = sources.gun
  .select('president').shallow()
  .map(x => {
    // x is the data for `president`
    return x.age;
  })
```

Use `gunSource.each()` to get a Stream of the data under each child property of the current path. This is equivalent to Gun's `.map().on(callback)` API. The return stream will emit an object `{key, value}`. This method is useful when the current path points to a set of many resources.

```typescript
const book$ = sources.gun
  .select('books').each()
  .map(x => {
    // x is an object {key, value} representing ONE book
    return x.value;
  })
```

## Sinking commands to gun driver

In this version, we can send commands to the gun driver by sending a function through the sink stream with payload references.

```typescript
const outgoingGunTodo$ = event$
  .map((event) => function command(gunInstance) {
    return gunInstance
      .get('example/todo/data')
      .path(uuid())
      .put(event.payload);
  })
```

## A more detailed example

Note: virtual-dom details omitted and transducers are verbose here

```typescript
import xs from 'xstream';
import { run } from '@cycle/run';
//import { makeDOMDriver } from '@cycle/dom';
import { makeGunDriver } from 'cycle-gun';
import * as uuid from 'uuid-random';
import * as equal from 'deep-equal';
import dropRepeats from 'xstream/extra/dropRepeats';

function main(sources) {

  const {DOM, gun} = sources;

  const gunTodoEvent$ = sources.gun
    .select('example').select('todo').select('data')
    .shallow();

  // map gun driver events into messages, or return as state
  const gunState$ = gunTodoEvent$
    .compose(dropRepeats(equal))
    .map((event) => {
      return { typeKey: 'getTodo', payload: event };
    })

  // sink gunState$ into a flux-type store or into vdom




  // sink map filtered stream of payloads into function and emit function
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
  };
}

const drivers = {
  // DOM: makeDOMDriver('#app'),
  gun: makeGunDriver({root: 'root', peers: ['http://localhost:3500']})
};

run(main, drivers);

```


## Other cyclejs reources

Please see [awesome-cyclejs](https://github.com/cyclejs-community/awesome-cyclejs) - A curated list of awesome Cycle.js resources.


[MIT License](./LICENSE)












