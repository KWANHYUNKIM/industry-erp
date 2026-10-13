/**
 * 표에 줄이 없을 때의 한 줄 — '등록된 데이터가 없습니다.' / '불러오는 중…'. 모양은 `.ec-empty` 한 곳에서 정한다.
 * colSpan 은 표의 열 수와 같아야 한다(qa/ui-check.mjs 가 머리 열 수와 맞춰 본다).
 *
 *   {loading ? <EcEmptyRow colSpan={8} loading /> : rows.length === 0 && <EcEmptyRow colSpan={8} />}
 */
export default function EcEmptyRow({ colSpan, loading = false, text }: {
  colSpan: number
  loading?: boolean
  text?: string
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="ec-empty">
        {text ?? (loading ? '불러오는 중…' : '등록된 데이터가 없습니다.')}
      </td>
    </tr>
  )
}
