/**
 * 본문 편집 도구 모음 아이콘 — 원본 기안서작성 도구 모음(11-편집도구모음.png)을 본뜬 16px 선 그림.
 * 색은 글자색(currentColor)을 따른다.
 */
const PATHS: Record<string, string> = {
  undo: 'M5 4 2 7l3 3M2 7h8a4 4 0 0 1 0 8H7',
  redo: 'M11 4l3 3-3 3M14 7H6a4 4 0 0 0 0 8h3',
  vTop: 'M2 2.5h12M5 6h6M5 9h6M5 12h6',
  vMid: 'M5 3h6M2 8h12M5 13h6M5 5.5h6M5 10.5h6',
  vBottom: 'M5 4h6M5 7h6M5 10h6M2 13.5h12',
  aLeft: 'M2 3h12M2 6h8M2 9h12M2 12h8',
  aCenter: 'M2 3h12M4 6h8M2 9h12M4 12h8',
  aRight: 'M2 3h12M6 6h8M2 9h12M6 12h8',
  bucket: 'M3 8l5-5 5 5-5 5zM3 8h10M13 10c0 1 1 2 1 3',
  nowrap: 'M2 4h9M2 8h12M2 12h5M12 6l2 2-2 2M10 12l4-8',
  docAlign: 'M2 2v12M5 4h9v3H5zM5 9h6v3H5z',
  table: 'M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10M10 3v10',
  textbox: 'M2 2h12v12H2zM5 5h6M8 5v6',
  line: 'M2 14 14 2',
  image: 'M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3M10.5 6.5h.01',
  stamp: 'M6 2h4v4l2 2v2H4V8l2-2zM3 13h10',
  link: 'M7 9l2-2M6 7 4.5 8.5a2.1 2.1 0 0 0 3 3L9 10M10 9l1.5-1.5a2.1 2.1 0 0 0-3-3L7 6',
  border: 'M2 2h12v12H2zM2 8h12M8 2v12',
  rowIns: 'M2 3h12v7H2zM2 6.5h12M8 11v4M6 13h4',
  colIns: 'M2 2h12v7H2zM6 2v7M10 2v7M8 11v4M6 13h4',
  merge: 'M2 3h12v10H2zM2 8h3M11 8h3M6 8h4M8.5 6.5 10 8 8.5 9.5',
  rowDel: 'M2 3h12v7H2zM2 6.5h12M6 12l3 3M9 12l-3 3',
  forward: 'M2 2h8v8H2zM6 6h8v8H6z',
  backward: 'M6 6h8v8H6zM2 2h8v8H2z',
  dimension: 'M2 2h12v12H2zM5 5h6v6H5zM2 2l3 3M14 14l-3-3',
}

export default function EditorIcon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg className="ec-ed-svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
         strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
      {(name === 'forward' || name === 'backward') && (
        <rect className={name === 'forward' ? 'ec-ed-svg-front' : 'ec-ed-svg-back'}
              x={name === 'forward' ? 6 : 2} y={name === 'forward' ? 6 : 2} width="8" height="8" />
      )}
    </svg>
  )
}
