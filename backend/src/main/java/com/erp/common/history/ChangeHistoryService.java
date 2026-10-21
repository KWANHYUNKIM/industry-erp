package com.erp.common.history;

import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import com.erp.common.history.dto.ChangeHistoryDtos.SlipHistoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 공용 [H] '이력' — 마스터 · 자료 서비스가 저장할 때 {@link #record} 로 한 줄씩 적고, 창이 열리면 차례대로 돌려준다.
 * 같은 트랜잭션에 참여하므로 저장이 롤백되면 이력도 남지 않는다.
 * 작업자는 지금 요청의 로그인 이름(SecurityContext)이다 — auth 모듈을 모르고, 서비스마다 아이디를 넘겨받지 않는다.
 * 붙이는 법은 .claude/skills/ecount-diff/plans/공용.md '[H] 이력 붙이는 법'.
 */
@Service
@RequiredArgsConstructor
public class ChangeHistoryService {

    /** 원본 [상태] 글자 */
    public static final String CREATED = "신규";
    public static final String UPDATED = "수정";
    public static final String DELETED = "삭제";
    public static final String STOPPED = "사용중단";
    public static final String REUSED = "재사용";

    private final ChangeHistoryRepository repository;

    @Transactional
    public void record(String target, Long targetId, String action) {
        repository.save(ChangeHistory.builder()
                .target(target).targetId(targetId).action(action)
                .worker(currentUser()).workedAt(LocalDateTime.now())
                .build());
    }

    /** 수정 저장 — 사용 여부가 바뀌었으면 원본처럼 [사용중단] · [재사용] 으로 적는다(거래처등록 이력 실측). */
    @Transactional
    public void recordUpdate(String target, Long targetId, boolean wasActive, boolean isActive) {
        record(target, targetId, wasActive == isActive ? UPDATED : isActive ? REUSED : STOPPED);
    }

    /**
     * 전표 한 장의 행위 때 모습 — 거래이력조회(재고) E040716 한 줄의 칸들. 각 모듈 서비스가 자기 전표에서 만들어 넘긴다
     * (common 은 Sales · Purchase 를 모른다). 지운 전표도 원본은 그 때 거래처 · 품목을 보여 주므로 글자로 박아 둔다.
     */
    public record SlipSnapshot(String menu, LocalDate docDate, String docNo,
                               String partnerCode, String partnerName, String itemSummary,
                               String managerCode, String managerName, String docStatus) {
        /** 거래처 · 담당자 · 전표상태 없이 메뉴 · 전표일자/번호 · 품목(요약)만 있는 전표(재고 · 생산). */
        public static SlipSnapshot of(String menu, LocalDate docDate, String docNo, String itemSummary) {
            return new SlipSnapshot(menu, docDate, docNo, null, null, itemSummary, null, null, null);
        }
    }

    /** 원본 상태 변경 행위 글자(견적서 [진행상태변경] 실측 '상태변경'). */
    public static final String STATUS_CHANGED = "상태변경";

    /**
     * 거래이력조회 [품목명] 칸 — 조회 화면 [품목명(요약)] 과 같은 꼴 '포장재 [30cm*40cm] 외 1건'.
     * common 은 Item 을 모르므로 첫 줄 품목명 · 규격과 줄 수를 받는다(줄이 없으면 null).
     */
    public static String itemSummary(String firstName, String firstSpec, int lineCount) {
        if (lineCount <= 0 || firstName == null) return null;
        String s = firstName + (firstSpec == null || firstSpec.isBlank() ? "" : " [" + firstSpec + "]");
        return lineCount > 1 ? s + " 외 " + (lineCount - 1) + "건" : s;
    }

    /** 전표 등록 · 수정 · 삭제를 한 줄 적는다 — 같은 줄이 그 전표 [H] 에도 뜬다(target · targetId 가 같다). */
    @Transactional
    public void recordSlip(String target, Long targetId, String action, SlipSnapshot s) {
        repository.save(ChangeHistory.builder()
                .target(target).targetId(targetId).action(action)
                .worker(currentUser()).workedAt(LocalDateTime.now())
                .menu(s.menu()).docDate(s.docDate()).docNo(s.docNo())
                .partnerCode(s.partnerCode()).partnerName(s.partnerName()).itemSummary(s.itemSummary())
                .managerCode(s.managerCode()).managerName(s.managerName()).docStatus(s.docStatus())
                .build());
    }

    /**
     * 줄을 지웠다 다시 쓰는 전표(수정하면 행 id 가 바뀜)용 — 같은 전표번호로 먼저 적은 이력이 있으면 그 대상 id 를 이어 쓴다.
     * 없으면 fallbackId. 그래야 수정 뒤에도 [H] 와 [최종이력만 검색] 이 한 전표로 묶인다.
     */
    @Transactional
    public void recordSlipByNo(String target, Long fallbackId, String action, SlipSnapshot s) {
        Long id = s.docNo() == null ? fallbackId
                : repository.findFirstByTargetAndDocNoOrderByIdAsc(target, s.docNo()).map(ChangeHistory::getTargetId).orElse(fallbackId);
        recordSlip(target, id, action, s);
    }

    /**
     * 거래이력조회(재고) — 작업일자 기간(끝 날 포함) · 메뉴 · 작업자 · 행위로 고른다.
     * 원본 차례(2026-10-21 실측): 전표번호(일자 · 번호) 큰 것부터, 같은 전표 안은 늦게 한 작업부터.
     * [수정순] 이면 작업일시 늦은 것부터. [최종이력만 검색] 이면 전표마다 마지막 작업 한 줄.
     */
    @Transactional(readOnly = true)
    public List<SlipHistoryResponse> searchSlips(LocalDate from, LocalDate to, List<String> menus, String worker,
                                                 List<String> actions, boolean latestOnly, boolean byWorkTime) {
        List<ChangeHistory> rows = new ArrayList<>(repository.findSlips(from.atStartOfDay(), to.plusDays(1).atStartOfDay()));
        Comparator<ChangeHistory> byWork = Comparator.comparing(ChangeHistory::getWorkedAt).thenComparing(ChangeHistory::getId);
        Comparator<ChangeHistory> bySlip = Comparator.comparing(ChangeHistory::getDocDate, Comparator.nullsFirst(Comparator.<LocalDate>naturalOrder()))
                .thenComparing(ChangeHistory::getDocNo, Comparator.nullsFirst(Comparator.<String>naturalOrder()));
        Comparator<ChangeHistory> order = byWorkTime ? byWork.reversed() : bySlip.reversed().thenComparing(byWork.reversed());
        rows.sort(byWork.reversed());
        Set<String> seen = new HashSet<>();
        List<ChangeHistory> kept = new ArrayList<>();
        for (ChangeHistory h : rows) {
            if (menus != null && !menus.isEmpty() && !menus.contains(h.getMenu())) continue;
            if (worker != null && !worker.isBlank() && (h.getWorker() == null || !h.getWorker().equalsIgnoreCase(worker.trim()))) continue;
            if (latestOnly && !seen.add(h.getTarget() + ":" + h.getTargetId())) continue;
            if (actions != null && !actions.isEmpty() && !actions.contains(h.getAction())) continue;
            kept.add(h);
        }
        kept.sort(order);
        return kept.stream().map(h -> new SlipHistoryResponse(h.getId(), h.getTarget(), h.getTargetId(), h.getWorkedAt(),
                h.getMenu(), h.getDocDate(), h.getDocNo(), h.getAction(), h.getPartnerCode(), h.getPartnerName(),
                h.getItemSummary(), h.getManagerCode(), h.getManagerName(), h.getWorker(), h.getDocStatus())).toList();
    }

    /** 적어 둔 줄만 — 오래된 것부터(원본 No. 1 이 처음 작업). */
    @Transactional(readOnly = true)
    public List<ChangeHistoryResponse> list(String target, Long targetId) {
        return list(target, targetId, null, null);
    }

    /**
     * 적어 둔 줄이 없으면(이 표를 만들기 전 자료) 만든 사람 · 때로 '신규' 한 줄을 지어 보인다.
     *
     * @param createdBy 대상의 만든 사람(모르면 null)
     * @param createdAt 대상의 만든 때(모르면 null — 그러면 빈 격자)
     */
    @Transactional(readOnly = true)
    public List<ChangeHistoryResponse> list(String target, Long targetId, String createdBy, LocalDateTime createdAt) {
        List<ChangeHistoryResponse> out = new ArrayList<>();
        for (ChangeHistory h : repository.findByTargetAndTargetIdOrderByWorkedAtAscIdAsc(target, targetId)) {
            out.add(new ChangeHistoryResponse(out.size() + 1, h.getWorker(), h.getWorkedAt(), h.getAction(), h.getDocStatus()));
        }
        if (out.isEmpty() && createdAt != null) out.add(new ChangeHistoryResponse(1, createdBy, createdAt, CREATED, null));
        return out;
    }

    private static String currentUser() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a == null || !a.isAuthenticated() ? null : a.getName();
    }
}
