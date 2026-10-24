package com.erp.hr.attendancekind;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.attendancekind.dto.AttendanceKindGroupDtos.GroupRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindGroupDtos.GroupResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 근태그룹 — 원본 '근태그룹검색' 창(코드 · 명, [신규] · [수정]). 근태그룹 코드는 비우면 다음 번호(00001 꼴).
 * 이름을 바꾸면 그 그룹을 쓰던 근태항목의 [근태그룹]도 같이 바꾼다(근태항목은 이름을 담는다).
 * 근태항목이 쓰는 그룹은 지울 수 없다.
 */
@Service
@RequiredArgsConstructor
public class AttendanceKindGroupService {

    private final AttendanceKindGroupRepository repository;
    private final AttendanceKindRepository kindRepository;
    private final DocumentNoGenerator documentNoGenerator;

    @Transactional(readOnly = true)
    public List<GroupResponse> findAll() {
        return repository.findAllByOrderByCodeAsc().stream().map(GroupResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public String nextCode() {
        return documentNoGenerator.nextMasterCode("", "attendance_kind_groups", "code", 5);
    }

    @Transactional
    public GroupResponse create(GroupRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextCode() : req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 등록된 근태그룹 코드입니다: " + code);
        return GroupResponse.from(repository.save(AttendanceKindGroup.builder().code(code).name(req.name().trim()).build()));
    }

    @Transactional
    public GroupResponse update(Long id, GroupRequest req) {
        AttendanceKindGroup g = get(id);
        String newName = req.name().trim();
        if (!newName.equals(g.getName())) {
            for (AttendanceKind k : kindRepository.findByKindGroup(g.getName())) k.setKindGroup(newName);
            g.setName(newName);
        }
        return GroupResponse.from(g);
    }

    @Transactional
    public void delete(Long id) {
        AttendanceKindGroup g = get(id);
        if (!kindRepository.findByKindGroup(g.getName()).isEmpty())
            throw ApiException.conflict("근태항목에서 쓰고 있는 근태그룹입니다: " + g.getName());
        repository.delete(g);
    }

    private AttendanceKindGroup get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("근태그룹을 찾을 수 없습니다."));
    }
}
