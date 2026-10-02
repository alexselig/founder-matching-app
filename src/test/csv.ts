export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\r' && text[index + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      index += 1
    } else {
      cell += char
    }
  }
  row.push(cell)
  rows.push(row)
  return rows
}

export function csvRecords(text: string) {
  const [header, ...rows] = parseCsv(text)
  return rows.map((row) =>
    Object.fromEntries(header!.map((label, index) => [label, row[index]])),
  )
}
