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

TODO: Complete example












