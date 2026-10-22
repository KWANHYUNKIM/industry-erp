import { useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import { EcCond, EcCondTabs } from '../../components/EcStatusPanel'
import { periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { ecAlert } from '../../components/EcDialog'
import { useCondPickers } from '../../utils/useCondPickers'
import { useRequired } from '../../utils/useRequired'

const MODES = ['다규격별(종)', '다규격별(횡)'] as const
type Mode = typeof MODES[number]

/**
 * 재고 I › 출력물 › 재고현황 › 다규격별재고현황 (이카운트 E040720, 2026-10-22 원본 실측)
 *
 * <p>조건(탭 [기본] [전체], 펼쳐서 시작): 기준일자(한 날짜, 기본 오늘) · 창고 · 품목 ·
 * 규격그룹1/규격코드1 · 규격그룹2/규격코드2 · 규격그룹3/규격코드3 · 구분 ◉다규격별(종) ○다규격별(횡) ·
 * 기타 □결재방표시 □재고수량0포함(막힘) □수량관리제외품목포함 ☑사용중단품목포함. 아래 줄 맨 앞 [현황(종)⌄] 은 구분을 따라
 * [현황(횡)] 으로 바뀐다.
 *
 * <p>규격그룹 셋을 다 비우고 [검색(F8)] 을 누르면 세 칸이 빨갛게 둘리고 창이 뜬다:
 * '다음 중 하나의 항목은 선택 바랍니다. - 규격그룹1 - 규격그룹2 - 규격그룹3'.
 *
 * <p>결과(출력물): 종 — 기준품목코드 · 기준품목명 · 규격 · 재고수량, 횡 — 기준품목코드 · 기준품목명 · 규격 · 합계.
 * 원본 loginaa 는 다규격 품목이 없어 규격그룹 100(사이즈1)으로 조회해도 '등록된 데이터가 없습니다.' 였다.
 * 우리는 품목등록의 [다규격품목] · 규격그룹 마스터가 아직 모양만이라(plans/재고1.md 65행) 결과는 늘 빈 표다 —
 * 원본 자료와 같은 모양. 규격그룹은 코드도움 대신 글자칸이다.
 */
export default function MultiSpecStockPage() {
  const pickers = useCondPickers(['items', 'warehouses'])
  const req = useRequired()
  const today = periodOf('금일')!.to
  const [date, setDate] = useState(today)
  const [warehouseId, setWarehouseId] = useState('')
  const [itemId, setItemId] = useState('')
  const [groups, setGroups] = useState<[string, string][]>([['', ''], ['', ''], ['', '']])
  const [mode, setMode] = useState<Mode>('다규격별(종)')
  const [signBox, setSignBox] = useState(false)
  const [withUntracked, setWithUntracked] = useState(false)
  const [withInactive, setWithInactive] = useState(true)
  const [result, setResult] = useState<{ date: string; mode: Mode; warehouseId: string; itemId: string } | null>(null)

  const setGroup = (i: number, k: 0 | 1, v: string) =>
    setGroups((g) => g.map((p, j) => (j === i ? (k === 0 ? [v, p[1]] : [p[0], v]) : p)) as [string, string][])

  function load() {
    const filled = groups.some((g) => g[0].trim())
    if (!req.check({ g1: filled, g2: filled, g3: filled })) {
      void ecAlert('다음 중 하나의 항목은 선택 바랍니다.\n- 규격그룹1\n- 규격그룹2\n- 규격그룹3')
      return
    }
    // 조회한 조건을 같이 남긴다 — 다규격 품목이 생기면 창고 · 품목으로 줄을 거른다.
    setResult({ date, mode, warehouseId, itemId })
  }

  const reset = () => {
    setDate(today); setWarehouseId(''); setItemId(''); setGroups([['', ''], ['', ''], ['', '']])
    setMode('다규격별(종)'); setSignBox(false); setWithUntracked(false); setWithInactive(true); req.reset()
  }

  const filledNow = groups.some((g) => g[0].trim())

  return (
    <EcListShell
      title="다규격별재고현황"
      searchable={false}
      signLine={signBox}
      onReset={reset}
      formMenu={{ current: mode === '다규격별(종)' ? '현황(종)' : '현황(횡)' }}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond mb-[8px]">
        <EcCondTabs />
        <EcCond label="기준일자">
          <EcDateField value={date} onChange={setDate} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} emptyLabel="전체" value={warehouseId} onChange={setWarehouseId}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" popupTitle="품목검색" hideLabel width={220} emptyLabel="전체" value={itemId} onChange={setItemId}
                           items={pickers.items} />
        </EcCond>
        {[0, 1, 2].map((i) => (
          <EcCond key={i} label={`규격그룹${i + 1}/규격코드${i + 1}`} span={2}>
            <div className={`inline-flex items-center gap-[4px] ${req.cls(`g${i + 1}`, filledNow)}`}>
              <input className="ec-input w-[220px]" placeholder={`규격그룹${i + 1}/규격코드${i + 1}`} aria-label={`규격그룹${i + 1}`}
                     value={groups[i][0]} onChange={(e) => setGroup(i, 0, e.target.value)} />
              <span>/</span>
              <input className="ec-input w-[160px]" aria-label={`규격코드${i + 1}`}
                     value={groups[i][1]} onChange={(e) => setGroup(i, 1, e.target.value)} />
            </div>
          </EcCond>
        ))}
        <EcCond label="구분">
          {MODES.map((m) => (
            <label key={m} className="mr-[10px] inline-flex items-center gap-[3px]">
              <input type="radio" name="multi-spec-mode" checked={mode === m} onChange={() => setMode(m)} /> {m}
            </label>
          ))}
        </EcCond>
        <EcCond label="기타" span="full">
          <label className="mr-[12px] inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
          <label className="mr-[12px] inline-flex items-center gap-[3px] text-ec-hint">
            <input type="checkbox" disabled /> 재고수량0포함
          </label>
          <label className="mr-[12px] inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} /> 수량관리제외품목포함
          </label>
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
          </label>
        </EcCond>
      </ul>

      {result && (
        <div className="overflow-x-auto">
          <div className="ec-report-frame">
            <EcReportHead title="다규격별재고현황" period={reportPeriod(result.date)} sign={signBox} />
            <table className="text-left ec-report ec-report-head400">
              <thead>
                <tr>
                  <th>기준품목코드</th>
                  <th>기준품목명</th>
                  <th>규격</th>
                  <th className="text-right">{result.mode === '다규격별(종)' ? '재고수량' : '합계'}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={4} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              </tbody>
            </table>
            <EcReportFoot />
          </div>
        </div>
      )}
    </EcListShell>
  )
}
