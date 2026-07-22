package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.ProjectStatus;
import com.erp.inventory.dto.ProjectDtos.CreateProjectRequest;
import com.erp.inventory.dto.ProjectDtos.ProjectResponse;
import com.erp.inventory.dto.ProjectDtos.UpdateProjectRequest;
import com.erp.inventory.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.ProjectDtos;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;

    @Transactional(readOnly = true)
    public List<ProjectResponse> findAll() {
        return projectRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
                .map(ProjectResponse::from)
                .toList();
    }

    @Transactional
    public ProjectResponse create(CreateProjectRequest req, String username) {
        LocalDate start = req.startDate() != null ? req.startDate() : LocalDate.now();
        Project p = Project.builder()
                .code(generateCode(start))
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
            throw ApiException.badRequest("이 프로젝트를 참조하는 전표·계획이 있어 삭제할 수 없습니다. 먼저 연결을 해제하세요.");
        }
    }

    private String generateCode(LocalDate date) {
        String prefix = "PRJ-" + String.format("%02d", date.getYear() % 100);
        long seq = projectRepository.countByCodeStartingWith(prefix) + 1;
        return prefix + String.format("%02d", seq);
    }
}
