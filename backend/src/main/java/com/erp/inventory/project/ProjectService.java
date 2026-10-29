package com.erp.inventory.project;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.common.history.ChangeHistoryService;
import com.erp.inventory.project.dto.ProjectDtos.CreateProjectRequest;
import com.erp.inventory.project.dto.ProjectDtos.ProjectResponse;
import com.erp.inventory.project.dto.ProjectDtos.UpdateProjectRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.project.dto.ProjectDtos;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final com.erp.common.usage.UnusedCodeFinder unusedCodeFinder;
    private final DocumentNoGenerator documentNoGenerator;
    private final ChangeHistoryService changeHistory;
    /** [H] 이력 대상 이름 — 한 번 정하면 바꾸지 않는다(공용.md '붙이는 법'). */
    public static final String HISTORY_TARGET = "PROJECT";

    @Transactional(readOnly = true)
    public List<ProjectResponse> findAll() {
        return projectRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
                .map(ProjectResponse::from)
                .toList();
    }

    @Transactional
    public ProjectResponse create(CreateProjectRequest req, String username) {
        LocalDate start = req.startDate() != null ? req.startDate() : LocalDate.now();
        String code = req.code() == null || req.code().isBlank() ? generateCode(start) : req.code().trim();
        if (projectRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 프로젝트코드입니다: " + code);
        }
        Project p = Project.builder()
                .code(code)
                .name(req.name())
                .manager(req.manager())
                .startDate(start)
                .endDate(req.endDate())
                .progress(0)
                .status(req.status() != null ? req.status() : ProjectStatus.PLANNING)
                .remark(req.remark())
                .group1(blankToNull(req.group1()))
                .group2(blankToNull(req.group2()))
                .extraText1(req.extraText1())
                .extraText2(req.extraText2())
                .extraText3(req.extraText3())
                .extraNum1(req.extraNum1())
                .extraNum2(req.extraNum2())
                .extraNum3(req.extraNum3())
                .extraLong1(req.extraLong1())
                .extraLong2(req.extraLong2())
                .extraLong3(req.extraLong3())
                .extraDate1(req.extraDate1())
                .extraDate2(req.extraDate2())
                .extraDate3(req.extraDate3())
                .createdBy(username)
                .build();
        Project saved = projectRepository.save(p);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return ProjectResponse.from(saved);
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    /** 다른 서비스가 프로젝트 엔티티를 얻는 진입점 (전표에 붙이기 위해). */
    @Transactional(readOnly = true)
    public Project get(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public ProjectResponse update(Long id, UpdateProjectRequest req) {
        Project p = projectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다. id=" + id));
        boolean wasActive = p.isActive();

        if (req.name() != null) p.setName(req.name());
        if (req.manager() != null) p.setManager(req.manager());
        if (req.startDate() != null) p.setStartDate(req.startDate());
        if (req.endDate() != null) p.setEndDate(req.endDate());
        if (req.progress() != null) p.setProgress(req.progress());
        if (req.status() != null) p.setStatus(req.status());
        if (req.remark() != null) p.setRemark(req.remark());
        if (req.group1() != null) p.setGroup1(blankToNull(req.group1()));
        if (req.group2() != null) p.setGroup2(blankToNull(req.group2()));
        if (req.active() != null) p.setActive(req.active());
        if (req.extraText1() != null) p.setExtraText1(blankToNull(req.extraText1()));
        if (req.extraText2() != null) p.setExtraText2(blankToNull(req.extraText2()));
        if (req.extraText3() != null) p.setExtraText3(blankToNull(req.extraText3()));
        if (req.extraNum1() != null) p.setExtraNum1(req.extraNum1());
        if (req.extraNum2() != null) p.setExtraNum2(req.extraNum2());
        if (req.extraNum3() != null) p.setExtraNum3(req.extraNum3());
        if (req.extraLong1() != null) p.setExtraLong1(blankToNull(req.extraLong1()));
        if (req.extraLong2() != null) p.setExtraLong2(blankToNull(req.extraLong2()));
        if (req.extraLong3() != null) p.setExtraLong3(blankToNull(req.extraLong3()));
        if (req.extraDate1() != null) p.setExtraDate1(req.extraDate1());
        if (req.extraDate2() != null) p.setExtraDate2(req.extraDate2());
        if (req.extraDate3() != null) p.setExtraDate3(req.extraDate3());

        // 완료 처리 시 진척률 100 동기화
        if (p.getStatus() == ProjectStatus.DONE) p.setProgress(100);
        changeHistory.recordUpdate(HISTORY_TARGET, p.getId(), wasActive, p.isActive());

        return ProjectResponse.from(p);
    }

    /**
     * 프로젝트 삭제. 판매·구매·비용 전표나 프로젝트계획이 참조 중이면 FK 제약이 막는다.
     * inventory는 상위 모듈(trade·accounting)을 참조할 수 없으므로, 여기서 참조 여부를 직접
     * 조회하지 않고 DB 제약 위반을 잡아 사용자 메시지로 번역한다(모듈 경계 유지).
     */
    @Transactional
    public void delete(Long id) {
        Project p = projectRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다. id=" + id));
        try {
            projectRepository.delete(p);
            projectRepository.flush();   // FK 위반을 이 시점에 발생시켜 잡는다
            changeHistory.record(HISTORY_TARGET, id, ChangeHistoryService.DELETED);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("이 프로젝트를 참조하는 전표·계획·업무일지가 있어 삭제할 수 없습니다. 먼저 연결을 해제하세요.");
        }
    }

    /*
     * PRJ-26 + 일련번호. 예전엔 countByCodeStartingWith + 1 이라, QA 가 쌓은 같은 이름 프로젝트
     * 460개를 정리하자 다음 번호가 PRJ-2605 로 되돌아갔다 — 프로젝트 수가 462 에 닿으면 이미 있는
     * PRJ-26462 를 다시 준다. 공용 nextMasterCode(가장 큰 번호 + 1, 락)로 바꿨다.
     */
    private String generateCode(LocalDate date) {
        String prefix = "PRJ-" + String.format("%02d", date.getYear() % 100);
        return documentNoGenerator.nextMasterCode(prefix, "projects", "code", 2);
    }

    /** 미사용코드조회 — 기간 안 전표에 안 쓰인 프로젝트 id (원본 재고1 리스트의 [미사용코드조회]) */
    @Transactional(readOnly = true)
    public List<Long> findUnusedIds(java.time.LocalDate from, java.time.LocalDate to) {
        return unusedCodeFinder.unusedIds("projects", from, to);
    }
}
