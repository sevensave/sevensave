/** true, если версия a новее b. Версии вида 1.2.3, «v» в начале допускается. */
export function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (Number.isNaN(x) || Number.isNaN(y)) return false
    if (x !== y) return x > y
  }
  return false
}
