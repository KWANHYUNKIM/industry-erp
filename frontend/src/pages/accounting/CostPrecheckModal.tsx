import { Fragment, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { EcReportHead, EcReportFoot } from '../../components/EcReportFrame'

/**
 * 원가생성/수정(E040802) [원가생성전 점검사항] — 2026-10-20 loginaa 실측.
 *
 * <p>원본은 안내문이 아니라 출력물이다: 제목 '원가생성전 점검사항', '회사명 : …' 오른쪽에 오늘 날짜, 그 아래 여섯 항목이
 * 저마다 [품목코드 · 품목명[규격]](4번은 + 생산공정명) 표를 단다. 걸린 품목이 없으면 '등록된 데이터가 없습니다.' 한 줄.
 * 아래 출력 시각 · [인쇄] · [Excel] · [닫기]. 기본등록을 저장하면 저절로 뜬다(우리도 같다).
 * loginaa 2026-10-20: 1 · 2 · 4 · 5 · 6 은 빈 표, 3 은 제품 · 반제품 일곱(A001 익스트림 울트라 명품 조립PC [1EA] …).
 *
 * <p>우리 판정(원본 규칙을 글로 본 적이 없어 항목 글자대로 짰다):
 * 1 제품 · 반제품인데 공정(BOR)이 없다 — 우리 생산공정은 품목등록이 아니라 BOR 첫 공정이다.
 * 2 제품 · 반제품인데 쓰는 BOM 이 없다.
 * 3 제품 · 반제품의 외주비 단가가 0 — 우리 품목에는 노무비 · 경비 가중치 칸이 없어 외주비 단가만 본다.
 * 4 BOM 의 소모품(제품 · 반제품)이 생산품보다 뒤 공정(BOR 첫 공정 순번이 더 큼)이다.
 * 5 원재료 · 부재료가 BOM 의 생산품으로 등록돼 있다.
 * 6 세트품목인데 제품 · 상품이 아니다.
 * 원본 조건 판(기준년월 · 검색(F8))과 [Excel] 은 없다.
 */
interface Item { id: number; code: string; name: string; spec: string | null; category: string; active: boolean; subcontractPrice: number | null; setItem: boolean }
interface Bom { productId: number; active: boolean; lines: { componentId: number }[] }
interface Bor { productId: number; processName: string; seq: number; active?: boolean }
interface Row { code: string; name: string; process?: string }

const MADE = ['FINISHED', 'SEMI_FINISHED']
const nameSpec = (name: string, spec: string | null) => (spec ? `${name} [${spec}]` : name)
const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` }

const TITLES = [
  '1. 반제품과 제품의 생산공정이 등록되어 있는지 확인. (기초등록 > 품목등록)',
  '2. 반제품과 제품의 BOM이 등록되어있는지 확인. (생산/외주 > BOM등록)',
  '3. 반제품과 제품의 외주비 단가, 노무비·경비의 가중치 확인. (기초등록 >품목등록)',
  '4. BOM등록 시 생산품과 소모품의 생산공정 순번 확인. (생산/외주 > BOM등록)',
  '5. 원재료와 부재료는 BOM의 소모 품목으로만 등록되어있는지 확인. (생산외주 > BOM등록)',
  '6. 세트품목은 제품과 상품만 등록 되어있는지 확인. (기초등록 > 품목등록)',
]

export default function CostPrecheckModal({ onClose }: { onClose: () => void }) {
  const [sections, setSections] = useState<Row[][] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.get<Item[]>('/items'), api.get<Bom[]>('/boms'), api.get<Bor[]>('/bor')])
      .then(([i, b, r]) => {
        const items = i.data.filter((x) => x.active !== false)
        const byId = new Map(items.map((x) => [x.id, x]))
        const boms = b.data.filter((x) => x.active !== false)
        const first = new Map<number, Bor>()
        for (const o of [...r.data].filter((x) => x.active !== false).sort((x, y) => x.seq - y.seq)) if (!first.has(o.productId)) first.set(o.productId, o)
        const row = (x: Item, process?: string): Row => ({ code: x.code, name: nameSpec(x.name, x.spec), process })
        const made = items.filter((x) => MADE.includes(x.category)).sort((x, y) => x.code.localeCompare(y.code))
        const bomProducts = new Set(boms.map((x) => x.productId))
        const s4 = new Map<number, Row>()
        for (const bom of boms) {
          const pf = first.get(bom.productId)
          for (const l of bom.lines) {
            const c = byId.get(l.componentId); const cf = first.get(l.componentId)
            if (c && pf && cf && MADE.includes(c.category) && cf.seq > pf.seq) s4.set(c.id, row(c, cf.processName))
          }
        }
        setSections([
          made.filter((x) => !first.has(x.id)).map((x) => row(x)),
          made.filter((x) => !bomProducts.has(x.id)).map((x) => row(x)),
          made.filter((x) => !x.subcontractPrice).map((x) => row(x)),
          [...s4.values()].sort((x, y) => x.code.localeCompare(y.code)),
          items.filter((x) => ['RAW_MATERIAL', 'SUB_MATERIAL'].includes(x.category) && bomProducts.has(x.id)).map((x) => row(x)),
          items.filter((x) => x.setItem && !['FINISHED', 'MERCHANDISE'].includes(x.category)).map((x) => row(x)),
        ])
      })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  return (
    <Modal open title="원가생성전 점검사항" width={700} error={error} onClose={onClose}>{(
      <div>
        <EcReportHead title="원가생성전 점검사항" period={today()} />
        {sections && sections.map((rows, k) => (
          <Fragment key={TITLES[k]}>
            <div className="mt-[8px] mb-[4px]">{TITLES[k]}</div>
            {k === 3 ? (
              <table className="ec-report w-full text-left">
                <thead><tr><th>품목코드</th><th>품목명[규격]</th><th>생산공정명</th></tr></thead>
                <tbody>
                  {rows.length === 0
                    ? <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                    : rows.map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.name}</td><td>{r.process}</td></tr>)}
                </tbody>
              </table>
            ) : (
              <table className="ec-report w-full text-left">
                <thead><tr><th>품목코드</th><th>품목명[규격]</th></tr></thead>
                <tbody>
                  {rows.length === 0
                    ? <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                    : rows.map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.name}</td></tr>)}
                </tbody>
              </table>
            )}
          </Fragment>
        ))}
        <EcReportFoot page={false} />
        <div className="flex gap-[4px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )}</Modal>
  )
}
