package com.erp.inventory.project;

import com.erp.common.ApiException;
import com.erp.inventory.project.dto.ProjectGroupDtos.CreateProjectGroupRequest;
import com.erp.inventory.project.dto.ProjectGroupDtos.ProjectGroupResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectGroupService {

    private final ProjectGroupRepository projectGroupRepository;

    @Transactional(readOnly = true)
    public List<ProjectGroupResponse> findAll() {
        return projectGroupRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder", "code")).stream()
                .map(ProjectGroupResponse::from).toList();
    }

    @Transactional
    public ProjectGroupResponse create(CreateProjectGroupRequest req) {
        String code = req.code().trim();
        if (projectGroupRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 프로젝트그룹 코드입니다: " + code);
        }
        ProjectGroup g = ProjectGroup.builder().code(code).name(req.name().trim())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0).active(req.active() == null || req.active()).build();
        return ProjectGroupResponse.from(projectGroupRepository.save(g));
    }

    @Transactional
    public void delete(Long id) {
        ProjectGroup g = projectGroupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트그룹을 찾을 수 없습니다. id=" + id));
        projectGroupRepository.delete(g);
    }
}
