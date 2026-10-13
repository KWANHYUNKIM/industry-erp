package com.erp.hr.attendancekind;

import com.erp.common.ApiException;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleRequest;
import com.erp.hr.attendancekind.dto.CommuteRuleDtos.CommuteRuleResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 관리 › 근태관리 › 출/퇴근(사원) › 출/퇴근반영기준(원본 E020725). 셈은 {@link CommuteReflectService} 가
 * 이 규칙으로 한다(근태입력 [출/퇴근 ▲ › 사원기준]).
 */
@Service
@RequiredArgsConstructor
public class CommuteRuleService {

    private final CommuteRuleRepository repository;
    private final AttendanceKindRepository kindRepository;

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
        kindRepository.findCommuteKinds().stream().filter(k -> k.getCommuteRule().getId().equals(id))
                .forEach(k -> k.setHourUnit(r.isHourUnit()));
        return CommuteRuleResponse.from(r);
    }

    @Transactional
    public void delete(Long id) {
        if (kindRepository.existsByCommuteRule_Id(id)) {
            throw ApiException.badRequest("근태항목에서 사용 중인 출/퇴근반영기준은 삭제할 수 없습니다.");
        }
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
        r.setBaseFrom(blank(req.baseFrom())); r.setBaseTo(blank(req.baseTo()));
        r.setHalfFrom(blank(req.halfFrom())); r.setHalfTo(blank(req.halfTo()));
        r.setHalfUse(req.halfUse());
        r.setWeekdays(req.weekdays() == null || req.weekdays().isBlank() ? "0111110" : req.weekdays());
        r.setDayKind(req.dayKind() == null ? CommuteRuleDayKind.ALL : req.dayKind());
        // 최대시간 · 반영단위는 원본도 계산단위 '시간' 일 때만 보인다
        r.setMaxHours(req.hourUnit() ? req.maxHours() : null);
        r.setMaxMinutes(req.hourUnit() ? req.maxMinutes() : null);
        r.setUnitHours(req.hourUnit() ? req.unitHours() : null);
        r.setUnitMinutes(req.hourUnit() ? req.unitMinutes() : null);
        r.setRemark(blank(req.remark()));
    }

    private CommuteRule get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("출/퇴근반영기준을 찾을 수 없습니다."));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
