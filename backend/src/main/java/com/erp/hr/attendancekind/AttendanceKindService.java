package com.erp.hr.attendancekind;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.AttendanceKindRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.AttendanceKindResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 관리 › 근태관리 › 기본사항등록 › 근태항목등록(원본 E020701). 근태코드는 비우면 다음 번호(30013 꼴),
 * 저장은 안내 없이 목록에 붙고, [사용중단/재사용 ▲] 의 삭제는 '삭제하시겠습니까?'.
 */
@Service
@RequiredArgsConstructor
public class AttendanceKindService {

    private final AttendanceKindRepository repository;
    private final DocumentNoGenerator documentNoGenerator;

    @Transactional(readOnly = true)
    public List<AttendanceKindResponse> findAll() {
        return repository.findAllByOrderByCodeAsc().stream().map(AttendanceKindResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public String nextCode() {
        return documentNoGenerator.nextMasterCode("", "attendance_kinds", "code", 5);
    }

    @Transactional
    public AttendanceKindResponse create(AttendanceKindRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextCode() : req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 등록된 근태코드입니다: " + code);
        if (repository.existsByName(req.name().trim())) throw ApiException.conflict("이미 등록된 근태명칭입니다: " + req.name().trim());
        AttendanceKind k = AttendanceKind.builder().code(code).active(true).build();
        apply(k, req);
        return AttendanceKindResponse.from(repository.save(k));
    }

    @Transactional
    public AttendanceKindResponse update(Long id, AttendanceKindRequest req) {
        AttendanceKind k = get(id);
        if (repository.existsByNameAndIdNot(req.name().trim(), id)) {
            throw ApiException.conflict("이미 등록된 근태명칭입니다: " + req.name().trim());
        }
        apply(k, req);
        if (req.active() != null) k.setActive(req.active());
        return AttendanceKindResponse.from(k);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private void apply(AttendanceKind k, AttendanceKindRequest req) {
        k.setName(req.name().trim());
        k.setKindGroup(req.kindGroup() == null || req.kindGroup().isBlank() ? null : req.kindGroup().trim());
        k.setType(req.type());
        k.setHourUnit(req.hourUnit());
        k.setRemark(req.remark() == null || req.remark().isBlank() ? null : req.remark().trim());
    }

    private AttendanceKind get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("근태항목을 찾을 수 없습니다."));
    }
}
