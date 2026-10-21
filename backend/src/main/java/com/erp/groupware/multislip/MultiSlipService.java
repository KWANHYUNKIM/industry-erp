package com.erp.groupware.multislip;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.common.history.ChangeHistoryService;
import com.erp.groupware.multislip.dto.MultiSlipDtos.ChangeMultiSlipStatusRequest;
import com.erp.groupware.multislip.dto.MultiSlipDtos.MultiSlipResponse;
import com.erp.groupware.multislip.dto.MultiSlipDtos.SaveMultiSlipRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 다목적 전표(그룹웨어 › 다목적관리). 판매 · 채권 · 출퇴근 자료를 끌어오지 않는다 — 원본도 사람이 숫자를 직접 치는 표다.
 * 담당자 · 사번 · 부서 코드의 이름은 화면이 사원 · 부서 목록에서 붙여 보내고 서버는 글자로 둔다(groupware → hr 간선을 만들지 않으려고).
 */
@Service
@RequiredArgsConstructor
public class MultiSlipService {

    /** 원본 빈 저장 알림 표의 [사유] 글자 그대로. */
    public static final String EMPTY_GRID = "그리드(표)에 최소 1줄 이상 입력되어야 합니다.";

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final MultiSlipRepository multiSlipRepository;
    private final DocumentNoGenerator docNo;
    private final ChangeHistoryService changeHistory;
    private final com.erp.common.StoredFileRepository storedFileRepository;

    private com.erp.common.StoredFile attachmentOf(Long id) {
        if (id == null) return null;
        var f = storedFileRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("첨부 파일을 찾을 수 없습니다. id=" + id));
        if (f.getOwnerCode() == null) f.setOwnerCode("GROUPWARE");
        return f;
    }
    /** [H] 이력 대상 글자(change_histories.target). */
    public static final String HISTORY_TARGET = "MULTI_SLIP";

    private ChangeHistoryService.SlipSnapshot snapshot(MultiSlip s) {
        return ChangeHistoryService.SlipSnapshot.withStatus(s.getBoard().getDisplayName(), s.getSlipDate(),
                s.getSlipDate().toString().replace("-", "") + "-" + s.getSlipNo(), null, s.getStatus().getDisplayName());
    }

    @Transactional(readOnly = true)
    public List<MultiSlipResponse> findAll(MultiSlipBoard board) {
        return multiSlipRepository.findByBoardWithLines(board).stream().map(MultiSlipResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public MultiSlipResponse get(Long id) {
        return MultiSlipResponse.from(find(id));
    }

    @Transactional
    public MultiSlipResponse create(SaveMultiSlipRequest req) {
        List<Map<String, Object>> lines = filledLines(req.board(), req.lines());
        MultiSlip slip = MultiSlip.builder()
                .board(req.board())
                .slipDate(req.slipDate())
                .slipNo(nextNo(req.board(), req.slipDate()))
                .attachment(attachmentOf(req.attachmentId()))
                .build();
        putLines(slip, lines);
        MultiSlip saved = multiSlipRepository.save(slip);
        changeHistory.recordSlip(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED, snapshot(saved));
        return MultiSlipResponse.from(saved);
    }

    /** 수정 — 줄을 통째로 바꾼다. 작성일은 처음 저장 시각 그대로(원본 같음). 일자를 바꾸면 그 날의 다음 순번. */
    @Transactional
    public MultiSlipResponse update(Long id, SaveMultiSlipRequest req) {
        MultiSlip slip = find(id);
        List<Map<String, Object>> lines = filledLines(slip.getBoard(), req.lines());
        if (!slip.getSlipDate().equals(req.slipDate())) {
            slip.setSlipNo(nextNo(slip.getBoard(), req.slipDate()));
            slip.setSlipDate(req.slipDate());
        }
        slip.setAttachment(attachmentOf(req.attachmentId()));
        slip.getLines().clear();
        multiSlipRepository.flush();
        putLines(slip, lines);
        changeHistory.recordSlip(HISTORY_TARGET, slip.getId(), ChangeHistoryService.UPDATED, snapshot(slip));
        return MultiSlipResponse.from(slip);
    }

    @Transactional
    public List<MultiSlipResponse> changeStatus(ChangeMultiSlipStatusRequest req) {
        List<MultiSlip> slips = multiSlipRepository.findAllById(req.ids());
        slips.forEach(s -> {
            s.setStatus(req.status());
            changeHistory.recordSlip(HISTORY_TARGET, s.getId(), ChangeHistoryService.STATUS_CHANGED, snapshot(s));
        });
        return slips.stream().map(MultiSlipResponse::from).toList();
    }

    @Transactional
    public void delete(Long id) {
        multiSlipRepository.delete(find(id));
    }

    private MultiSlip find(Long id) {
        return multiSlipRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("전표를 찾을 수 없습니다. id=" + id));
    }

    private int nextNo(MultiSlipBoard board, java.time.LocalDate date) {
        return docNo.nextSeq("multi_slips:" + board.name(), date, multiSlipRepository.maxSlipNo(board, date));
    }

    private void putLines(MultiSlip slip, List<Map<String, Object>> lines) {
        int no = 1;
        for (Map<String, Object> f : lines) {
            slip.getLines().add(MultiSlipLine.builder().slip(slip).lineNo(no++).fields(f).build());
        }
    }

    /**
     * 입력된 줄만 남긴다. 남는 줄이 없으면 원본 알림 — 단 월근태는 원본이 빈 채로도 저장한다(빈 줄 하나).
     * 2026-10-21 loginaa 실측: 채권회수는 [거래처] 만 고른 줄은 '최소 1줄' 알림, [거래처] + [목표금액] 은 담당자 없이 저장 ·
     * 월근태는 빈 창 [저장] 이 빈 전표로, [이름] 만 넣은 줄도 저장(계산 칸 0 이 줄을 채운다).
     */
    private List<Map<String, Object>> filledLines(MultiSlipBoard board, List<Map<String, Object>> raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw != null) {
            for (Map<String, Object> r : raw) {
                if (r == null || !board.isEntered(r)) continue;
                Map<String, Object> f = new HashMap<>(r);
                recompute(board, f);
                out.add(f);
            }
        }
        if (out.isEmpty()) {
            if (board != MultiSlipBoard.MONTHLY_ATTENDANCE) throw ApiException.badRequest(EMPTY_GRID);
            Map<String, Object> blank = new HashMap<>();
            recompute(board, blank);
            out.add(blank);
        }
        return out;
    }

    /** 계산 칸은 화면이 보낸 값을 믿지 않고 다시 매긴다. 식은 원본에서 쳐 본 것(E200276.md 3.3 · 3.4). */
    static void recompute(MultiSlipBoard board, Map<String, Object> f) {
        switch (board) {
            case BOND_COLLECT -> {
                // 총 회수액 = 1차 + 2차 + 3차, 미달금액 = 목표 − 총, 회수율 = 총 ÷ 목표 × 100
                BigDecimal target = num(f.get("target"));
                BigDecimal total = num(f.get("c1")).add(num(f.get("c2"))).add(num(f.get("c3")));
                f.put("total", total);
                f.put("shortfall", target.subtract(total));
                f.put("rate", target.signum() == 0 ? null : pct(total, target));
            }
            case MONTHLY_ATTENDANCE -> {
                // 근무일수 = 근무가능 − 휴가, 순 = 총 − 청구, 표준 = 근무일수 × 9, 추가 = 순 − 표준,
                // 추가근무율 = 추가 ÷ 표준 × 100, C-Type = (순 − 근무일수 × 7) ÷ (근무일수 × 7) × 100
                BigDecimal workDays = num(f.get("availDays")).subtract(num(f.get("vacationDays")));
                BigDecimal net = num(f.get("totalHours")).subtract(num(f.get("claimedHours")));
                BigDecimal standard = workDays.multiply(BigDecimal.valueOf(9));
                BigDecimal extra = net.subtract(standard);
                BigDecimal base7 = workDays.multiply(BigDecimal.valueOf(7));
                f.put("workDays", workDays);
                f.put("netHours", net);
                f.put("standardHours", standard);
                f.put("extraHours", extra);
                f.put("extraRate", standard.signum() == 0 ? null : pct(extra, standard));
                f.put("cType", base7.signum() == 0 ? null : pct(net.subtract(base7), base7));
            }
            default -> { }
        }
    }

    private static BigDecimal pct(BigDecimal a, BigDecimal b) {
        return a.multiply(HUNDRED).divide(b, 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal num(Object v) {
        if (v == null) return BigDecimal.ZERO;
        String s = v.toString().replace(",", "").trim();
        if (s.isEmpty()) return BigDecimal.ZERO;
        try { return new BigDecimal(s); }
        catch (NumberFormatException e) { throw ApiException.badRequest("숫자가 아닙니다: " + v); }
    }
}
