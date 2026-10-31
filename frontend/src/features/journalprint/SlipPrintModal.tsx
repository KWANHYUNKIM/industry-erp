import Modal from '../../components/Modal'
import { printHtml } from '../../utils/print'

/**
 * 원본 전표 · 결의서 인쇄 창 — 서식을 창 안에 미리 보이고 아래 [인쇄] · [닫기].
 * 서식은 앱 전역 표 규칙을 안 받게 iframe 에 띄운다(인쇄 창과 같은 그림).
 */
export default function SlipPrintModal({ title, html, onClose }: { title: string; html: string | null; onClose: () => void }) {
  return (
    <Modal open={html != null} title={title} width={760} onClose={onClose}>
      <iframe title={`${title} 미리보기`} className="w-full h-[480px] border-0 bg-white" srcDoc={html ?? ''} />
      <div className="flex gap-[5px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary"
                onClick={() => { if (html) printHtml(html) }}>인쇄</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
