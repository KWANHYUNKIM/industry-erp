import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import { ymd } from '../../../utils/periods'
import type { Payslip } from '../../../types/api'
import EcDateInput from '../../../components/ui/EcDateInput'

interface Account { id: number; code: string; name: string }
interface Ledger { payMonth: string; name: string }
interface Line { side: '차변' | '대변'; accountId: string; amount: number; memo: string }

const won = (n: number) => Number(n).toLocaleString('ko-KR')

/**
 * 확정 대장 [급여대장 ▸ 전표생성] (원본 E090106, 2026-10-13 실측 · 2026-10-21 저장까지 해 봄 — 실지급액 줄 계정 비면 말풍선 '계정코드를 입력 바랍니다.', 보통예금(1039) 고르고 저장 → 안내 없이 닫힘).
 *
 * <p>원본은 일반전표 입력 창(오늘 일자)을 세 줄로 채워 연다:
 * 차) 8029 직원급여(판) 지급총액 · 적요 = 대장명칭 / 대) <b>계정 빈칸</b> 실지급액 / 대) 2549 예수금 공제총액. 차대 합 = 지급총액.
 * 실지급액 줄의 계정(보통예금 · 미지급금 …)은 사람이 고른다. 우리 계정표에는 직원급여(판) 가 없어 급여(801) · 예수금(254)를 쓴다.
 * 저장은 일반전표(POST /journals)와 같다. 회계1 의 급여이체도 분개를 만들므로 같은 달을 둘 다 하면 두 번 잡힌다(원본도 같다).
 */
export default function PayrollSlipCreate({ ledger, onClose, onSaved }: { ledger: Ledger | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [date, setDate] = useState(ymd(new Date()))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ledger) return
    setError(''); setDate(ymd(new Date()))
    Promise.all([api.get<Account[]>('/accounts', { params: { slip: true } }), api.get<Payslip[]>('/payslips', { params: { month: ledger.payMonth } })])
      .then(([a, p]) => {
        setAccounts(a.data)
        const by = (code: string) => String(a.data.find((x) => x.code === code)?.id ?? '')
        const gross = p.data.reduce((s, x) => s + Number(x.grossPay), 0)
        const ded = p.data.reduce((s, x) => s + Number(x.deductionTotal), 0)
        setLines([
          { side: '차변', accountId: by('8029'), amount: gross, memo: ledger.name },
          { side: '대변', accountId: '', amount: gross - ded, memo: '' },
          { side: '대변', accountId: by('2549'), amount: ded, memo: '' },
        ])
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [ledger])

  const debit = lines.filter((l) => l.side === '차변').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.side === '대변').reduce((s, l) => s + l.amount, 0)

  async function save() {
    if (!ledger) return
    const used = lines.filter((l) => l.amount !== 0)
    if (used.some((l) => !l.accountId)) { setError('계정코드를 입력 바랍니다.'); return }
    try {
      await api.post('/journals', {
        entryDate: date, description: ledger.name,
        lines: used.map((l) => ({ accountId: Number(l.accountId), debit: l.side === '차변' ? l.amount : 0, credit: l.side === '대변' ? l.amount : 0, description: l.memo || undefined })),
      })
      onSaved('') /* 원본(2026-10-21 실측): 저장하면 안내 없이 창이 닫히고, 같은 대장에서 [전표생성] 을 다시 눌러도 막지 않는다(회계 일반전표 26/10/21-32 가 생김) */
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <Modal error={error} open={!!ledger} title="전표생성" width={820} onClose={onClose}>{(
      <>
        <ul className="ec-form mb-[8px]">
          <li className="wide">
            <span className="title">일자</span>
            <div className="form"><EcDateInput className="ec-input w-[160px]" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </li>
        </ul>
        <table className="w-full whitespace-nowrap">
          <thead>
            <tr><th>구분</th><th>계정</th><th className="text-right">차변</th><th className="text-right">대변</th><th>적요</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{l.side}</td>
                <td>
                  <select className="ec-input w-full" aria-label={`${i + 1}줄 계정`} value={l.accountId}
                          onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, accountId: e.target.value } : x)))}>
                    <option value=""></option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </td>
                <td className="text-right">{l.side === '차변' ? won(l.amount) : 0}</td>
                <td className="text-right">{l.side === '대변' ? won(l.amount) : 0}</td>
                <td>{l.memo}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2}></td><td className="text-right">{won(debit)}</td><td className="text-right">{won(credit)}</td><td></td></tr>
          </tfoot>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </>
    )}</Modal>
  )
}
