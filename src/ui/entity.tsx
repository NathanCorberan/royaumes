import { look } from './theme'

/** Le libellé fournit une alternative accessible au symbole Unicode. */
export function Entity({ kind, showLabel = false }: { kind: string; showLabel?: boolean }) {
  const { glyph, label } = look(kind)
  return (
    <span className="entity" title={label}>
      <span aria-hidden="true">{glyph}</span>
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
