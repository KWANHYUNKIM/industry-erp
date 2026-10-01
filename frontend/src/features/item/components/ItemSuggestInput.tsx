import { useCallback, type CSSProperties } from 'react'
import SuggestInput from '../../../components/SuggestInput'
import { fetchItemSuggest, type ItemSuggestField } from '../api/itemSuggest'

/**
 * 품목명·규격 자동완성 칸. 후보는 <b>로그인한 회사의 품목 마스터</b>에서 온다
 * (GET /api/items/suggest). 화면에 후보를 적어 두지 않으니 회사가 늘어도 손댈 곳이 없다.
 */
export default function ItemSuggestInput({ field, value, onChange, width, placeholder, title, style }: {
  field: ItemSuggestField
  value: string
  onChange: (v: string) => void
  width?: number | string
  placeholder?: string
  title?: string
  style?: CSSProperties
}) {
  const fetcher = useCallback((q: string) => fetchItemSuggest(field, q), [field])
  return (
    <SuggestInput value={value} onChange={onChange} fetchSuggestions={fetcher}
                  width={width} placeholder={placeholder} title={title} style={style} />
  )
}
