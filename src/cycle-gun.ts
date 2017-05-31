import xs, {Listener, Stream} from 'xstream'
import * as Gun from 'gun'

export class GunSource {
  private gun: any
  private path: Array<string>

  constructor(gun: any, path: Array<string>) {
    this.gun = gun
    this.path = path
  }

  public select(key: string): GunSource {
    return new GunSource(this.gun, this.path.concat(key))
  }

  public shallow(): Stream<any> {
    const self = this

    return xs.create({
      start(listener: Listener<any>) {
        self.gun.path(...self.path).on((x: any) => {
          listener.next(x)
        })
      },
      stop() {
      },
    })
  }

  public each(): Stream<{key: string, value: any}> {
    const self = this

    return xs.create({
      start(listener: Listener<{key: string, value: any}>) {
        self.gun.path(...self.path).map().on((value: any, key: string) => {
          listener.next({key, value})
        })
      },
      stop() {
      },
    })
  }
}

export type Command = (gun: any) => void

export function makeGunDriver(opts: any) {
  const gun = Gun(opts).get(opts.root)

  return function gunDriver(sink: Stream<Function>) {
    sink.addListener({
      next: (command: Command) => command(gun),
    })

    return new GunSource(gun, [])
  }
}
