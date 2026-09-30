export class SpatialHash {
  private readonly cols: number
  private readonly rows: number
  private readonly cells: number[][]

  constructor(
    private readonly width: number,
    private readonly height: number,
    cellSize = 128,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize))
    this.rows = Math.max(1, Math.ceil(height / cellSize))
    this.cells = new Array(this.cols * this.rows)
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = []
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      if (cell !== undefined) cell.length = 0
    }
  }

  insert(index: number, x: number, y: number, radius: number): void {
    const minCol = this.colOf(x - radius)
    const maxCol = this.colOf(x + radius)
    const minRow = this.rowOf(y - radius)
    const maxRow = this.rowOf(y + radius)
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        this.cells[row * this.cols + col]?.push(index)
      }
    }
  }

  /** Fills `out` with candidate indices and returns how many were written. */
  query(x: number, y: number, radius: number, out: number[]): number {
    let count = 0
    const minCol = this.colOf(x - radius)
    const maxCol = this.colOf(x + radius)
    const minRow = this.rowOf(y - radius)
    const maxRow = this.rowOf(y + radius)
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.cells[row * this.cols + col]
        if (cell === undefined) continue
        for (let i = 0; i < cell.length; i++) {
          const value = cell[i]
          if (value === undefined) continue
          let duplicate = false
          for (let j = 0; j < count; j++) {
            if (out[j] === value) {
              duplicate = true
              break
            }
          }
          if (!duplicate) out[count++] = value
        }
      }
    }
    out.length = Math.max(out.length, count)
    return count
  }

  private colOf(x: number): number {
    const raw = Math.floor((x / this.width) * this.cols)
    return Math.min(this.cols - 1, Math.max(0, raw))
  }

  private rowOf(y: number): number {
    const raw = Math.floor((y / this.height) * this.rows)
    return Math.min(this.rows - 1, Math.max(0, raw))
  }
}
