package com.erp.common.history;

import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

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
            out.add(new ChangeHistoryResponse(out.size() + 1, h.getWorker(), h.getWorkedAt(), h.getAction()));
        }
        if (out.isEmpty() && createdAt != null) out.add(new ChangeHistoryResponse(1, createdBy, createdAt, CREATED));
        return out;
    }

    private static String currentUser() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a == null || !a.isAuthenticated() ? null : a.getName();
    }
}
