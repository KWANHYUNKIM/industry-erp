package com.erp.inventory.salesrep;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.common.history.ChangeHistoryService;
import com.erp.inventory.salesrep.dto.SalesRepDtos.SalesRepRequest;
import com.erp.inventory.salesrep.dto.SalesRepDtos.SalesRepResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 사원(담당) 마스터. 다른 모듈(trade)은 이 서비스로 담당자를 얻는다. */
@Service
@RequiredArgsConstructor
public class SalesRepService {

    /** [H] 이력 대상 이름 — 한 번 정하면 바꾸지 않는다. */
    public static final String HISTORY_TARGET = "SALES_REP";

    private final SalesRepRepository repository;
    private final DocumentNoGenerator documentNoGenerator;
    private final ChangeHistoryService changeHistory;

    /** 전표 코드도움 — 사용 중인 것만, 코드 차례. */
    @Transactional(readOnly = true)
    public List<SalesRepResponse> findActive() {
        return repository.findByActiveTrueOrderByCodeAsc().stream().map(SalesRepResponse::from).toList();
    }

    /** 사원(담당)리스트 — 사용중단 포함, 코드 차례(원본 기본 차례). */
    @Transactional(readOnly = true)
    public List<SalesRepResponse> findAll() {
        return repository.findAllByOrderByCodeAsc().stream().map(SalesRepResponse::from).toList();
    }

    /** 원본 신규 창은 [사원(담당)코드] 에 다음 번호(다섯 자리 숫자)를 미리 채운다. */
    @Transactional
    public String nextCode() {
        return documentNoGenerator.nextMasterCode("", "sales_reps", "code", 5);
    }

    @Transactional
    public SalesRepResponse create(SalesRepRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextCode() : req.code().trim();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 사원(담당)코드입니다: " + code);
        }
        SalesRep r = SalesRep.builder().code(code).name(req.name().trim()).build();
        apply(r, req);
        SalesRep saved = repository.save(r);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return SalesRepResponse.from(saved);
    }

    @Transactional
    public SalesRepResponse update(Long id, SalesRepRequest req) {
        SalesRep r = get(id);
        r.setName(req.name().trim());
        apply(r, req);
        changeHistory.recordUpdate(HISTORY_TARGET, id, r.isActive(), r.isActive());
        return SalesRepResponse.from(r);
    }

    /** [사용중단/재사용] */
    @Transactional
    public SalesRepResponse setActive(Long id, boolean active) {
        SalesRep r = get(id);
        boolean was = r.isActive();
        r.setActive(active);
        changeHistory.recordUpdate(HISTORY_TARGET, id, was, active);
        return SalesRepResponse.from(r);
    }

    /** 원본은 확인 뒤 실제로 지운다. 전표가 물고 있으면 FK 가 막는다(GlobalExceptionHandler 가 알린다). */
    @Transactional
    public void delete(Long id) {
        SalesRep r = get(id);
        repository.delete(r);
        repository.flush();
        changeHistory.record(HISTORY_TARGET, id, ChangeHistoryService.DELETED);
    }

    /** 지난 전표를 읽는 자리 · 사용중단을 따지지 않는 자리. */
    @Transactional(readOnly = true)
    public SalesRep get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사원(담당)을 찾을 수 없습니다. id=" + id));
    }

    /** 새로 <b>고르는</b> 자리 — 사용중단한 담당자는 못 고른다. */
    @Transactional(readOnly = true)
    public SalesRep getUsable(Long id) {
        SalesRep r = get(id);
        if (!r.isActive()) {
            throw ApiException.badRequest("사용중단된 사원(담당)입니다: " + r.getCode() + " " + r.getName());
        }
        return r;
    }

    private static void apply(SalesRep r, SalesRepRequest req) {
        r.setSearchKeyword(blankToNull(req.searchKeyword()));
        r.setRemark(blankToNull(req.remark()));
        r.setPhone(blankToNull(req.phone()));
        r.setEmail(blankToNull(req.email()));
        r.setExtra3(blankToNull(req.extra3()));
        r.setExtra4(blankToNull(req.extra4()));
        r.setExtra5(blankToNull(req.extra5()));
        r.setExtra6(blankToNull(req.extra6()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
