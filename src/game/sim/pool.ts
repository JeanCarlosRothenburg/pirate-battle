export class Pool<T> {
  private readonly free: T[] = []

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    initialSize: number,
  ) {
    for (let i = 0; i < initialSize; i++) this.free.push(factory())
  }

  acquire(): T {
    const item = this.free.pop()
    return item ?? this.factory()
  }

  release(item: T): void {
    this.reset(item)
    this.free.push(item)
  }
}

export function compactInPlace<T extends { alive: boolean }>(
  items: T[],
  onRemoved: (item: T) => void,
): void {
  let write = 0
  for (let read = 0; read < items.length; read++) {
    const item = items[read]
    if (item === undefined) continue
    if (item.alive) {
      items[write++] = item
    } else {
      onRemoved(item)
    }
  }
  items.length = write
}
