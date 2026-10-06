package com.erp.inventory.project;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
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
    private final DocumentNoGenerator documentNoGenerator;

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
                .createdBy(username)
                .build();
        return ProjectResponse.from(projectRepository.save(p));
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

        if (req.name() != null) p.setName(req.name());
        if (req.manager() != null) p.setManager(req.manager());
        if (req.startDate() != null) p.setStartDate(req.startDate());
        if (req.endDate() != null) p.setEndDate(req.endDate());
        if (req.progress() != null) p.setProgress(req.progress());
        if (req.status() != null) p.setStatus(req.status());
        if (req.remark() != null) p.setRemark(req.remark());
        if (req.active() != null) p.setActive(req.active());

        // 완료 처리 시 진척률 100 동기화
        if (p.getStatus() == ProjectStatus.DONE) p.setProgress(100);

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
}
