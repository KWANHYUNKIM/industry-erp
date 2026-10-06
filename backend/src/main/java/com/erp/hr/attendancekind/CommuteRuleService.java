package com.erp.hr.attendancekind;

import com.erp.common.ApiException;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleRequest;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 관리 › 근태관리 › 출/퇴근(사원) › 출/퇴근반영기준(원본 E020725). 지금은 규칙을 담아 두기만 한다 —
 * 출퇴근 기록을 근태로 옮기는 셈(지각 · 조퇴 · 추가근무시간)은 아직 이 규칙을 읽지 않는다.
 */
@Service
@RequiredArgsConstructor
public class CommuteRuleService {

    private final CommuteRuleRepository repository;

    @Transactional(readOnly = true)
    public List<CommuteRuleResponse> findAll() {
        return repository.findAllByOrderByCodeAsc().stream().map(CommuteRuleResponse::from).toList();
    }

    @Transactional
    public CommuteRuleResponse create(CommuteRuleRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 등록된 반영기준코드입니다: " + code);
        CommuteRule r = CommuteRule.builder().code(code).active(true).build();
        apply(r, req);
        return CommuteRuleResponse.from(repository.save(r));
    }

    @Transactional
    public CommuteRuleResponse update(Long id, CommuteRuleRequest req) {
        CommuteRule r = get(id);
        apply(r, req);
        if (req.active() != null) r.setActive(req.active());
        return CommuteRuleResponse.from(r);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private void apply(CommuteRule r, CommuteRuleRequest req) {
        r.setName(req.name().trim());
        r.setHourUnit(req.hourUnit());
        r.setMethod(req.method());
        r.setDirectBasis(req.directBasis());
        r.setMinHours(req.minHours());
        r.setMinMinutes(req.minMinutes());
        r.setEx1From(blank(req.ex1From())); r.setEx1To(blank(req.ex1To()));
        r.setEx2From(blank(req.ex2From())); r.setEx2To(blank(req.ex2To()));
        r.setEx3From(blank(req.ex3From())); r.setEx3To(blank(req.ex3To()));
        r.setRemark(blank(req.remark()));
    }

    private CommuteRule get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("출/퇴근반영기준을 찾을 수 없습니다."));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
