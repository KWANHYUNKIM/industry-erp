package com.erp.hr.department;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.department.dto.DepartmentDtos.CreateDepartmentRequest;
import com.erp.hr.department.dto.DepartmentDtos.DepartmentResponse;
import com.erp.hr.department.dto.DepartmentDtos.UpdateDepartmentRequest;
import com.erp.hr.employee.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.hr.department.dto.DepartmentDtos;

/** 부서 마스터. 조직도 트리(자기참조)와 사원 배치의 규칙을 소유한다. */
@Service
@RequiredArgsConstructor
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final EmployeeRepository employeeRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<DepartmentResponse> findAll() {
        return departmentRepository.findAllWithParent().stream()
                .map(d -> DepartmentResponse.from(d, employeeRepository.countByDepartmentId(d.getId())))
                .toList();
    }

    @Transactional
    public DepartmentResponse create(CreateDepartmentRequest req) {
        String code = (req.code() == null || req.code().isBlank()) ? nextCode() : req.code().trim();
        if (departmentRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 부서코드입니다: " + code);
        }
        Department d = Department.builder()
                .code(code)
                .name(req.name().trim())
                .parent(req.parentId() != null ? get(req.parentId()) : null)
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .build();
        return DepartmentResponse.from(departmentRepository.save(d), 0);
    }

    @Transactional
    public DepartmentResponse update(Long id, UpdateDepartmentRequest req) {
        Department d = get(id);
        Department parent = req.parentId() != null ? get(req.parentId()) : null;
        checkNoCycle(d, parent);

        d.setName(req.name().trim());
        d.setParent(parent);
        if (req.sortOrder() != null) d.setSortOrder(req.sortOrder());
        if (req.active() != null) d.setActive(req.active());
        return DepartmentResponse.from(d, employeeRepository.countByDepartmentId(d.getId()));
    }

    /**
     * 조직도등록 [부서장지정] — 원본은 한 부서에 부서장 한 명이고, 새로 지정하면 앞사람은 '일반'으로 돌아간다.
     * 소속을 따지지 않는다(원본 [부서장설정] 창에서 다른 부서 사람도 고를 수 있다).
     */
    @Transactional
    public DepartmentResponse setHead(Long id, Long employeeId) {
        Department d = get(id);
        if (employeeId != null && !employeeRepository.existsById(employeeId)) {
            throw ApiException.notFound("사원을 찾을 수 없습니다. id=" + employeeId);
        }
        d.setHeadEmployeeId(employeeId);
        return DepartmentResponse.from(d, employeeRepository.countByDepartmentId(d.getId()));
    }

    /**
     * 조직도등록 Fn › 미포함 — 그 부서와 하위부서를 모두 미포함으로 돌리고, 맨 위 부서만 상위에서 떼어 [미포함] 아래에 세운다
     * (하위부서는 그 아래 그대로). 다시 넣으면(하위부서추가) 고른 상위 밑에 붙고 하위부서까지 포함으로 돌아온다.
     */
    @Transactional
    public DepartmentResponse placeInOrg(Long id, DepartmentDtos.OrgPlacementRequest req) {
        Department d = get(id);
        List<Department> all = departmentRepository.findAll();
        java.util.List<Department> subtree = new java.util.ArrayList<>(List.of(d));
        for (int i = 0; i < subtree.size(); i++) {
            Long pid = subtree.get(i).getId();
            all.stream().filter(c -> c.getParent() != null && c.getParent().getId().equals(pid) && !subtree.contains(c)).forEach(subtree::add);
        }
        if (req.excluded()) {
            d.setParent(null);
        } else {
            if (req.parentId() != null) {
                Department parent = get(req.parentId());
                if (subtree.contains(parent)) throw ApiException.badRequest("자기 자신이나 하위부서 밑으로는 넣을 수 없습니다.");
                if (parent.isOrgExcluded()) throw ApiException.badRequest("미포함 부서 밑으로는 넣을 수 없습니다.");
                d.setParent(parent);
            } else {
                d.setParent(null);
            }
        }
        subtree.forEach(x -> x.setOrgExcluded(req.excluded()));
        return DepartmentResponse.from(d, employeeRepository.countByDepartmentId(d.getId()));
    }

    /** 조직도등록 [부서장설정] 창 [저장(F8)] — 줄마다 부서장을 그대로 덮는다(빈칸이면 부서장 없음). */
    @Transactional
    public void setHeads(List<DepartmentDtos.HeadLine> lines) {
        for (DepartmentDtos.HeadLine l : lines) {
            if (l.departmentId() == null) continue;
            setHead(l.departmentId(), l.employeeId());
        }
    }

    @Transactional
    public void delete(Long id) {
        Department d = get(id);
        long employees = employeeRepository.countByDepartmentId(id);
        if (employees > 0) {
            throw ApiException.conflict("소속 사원이 " + employees + "명 있어 삭제할 수 없습니다. 사원을 먼저 옮기세요.");
        }
        // 원본 부서등록 [삭제]: "조직도에 포함된 부서인 경우에는 조직도에서도 하위부서를 포함하여 모두 삭제됩니다."
        // 하위 부서는 부서로 남고 조직도 배치(상위 부서)만 풀린다 — 막지 않는다.
        departmentRepository.findAll().stream()
                .filter(c -> c.getParent() != null && c.getParent().getId().equals(id))
                .forEach(c -> c.setParent(null));
        departmentRepository.flush();
        departmentRepository.delete(d);
    }

    /** 다른 모듈(사원 배치 등)에서 부서 엔티티가 필요할 때 쓰는 진입점. */
    @Transactional(readOnly = true)
    public Department get(Long id) {
        return departmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("부서를 찾을 수 없습니다. id=" + id));
    }

    /**
     * 자기 자신이나 자기 하위 부서를 상위로 지정하면 트리가 사이클이 되어
     * 조직도 렌더링이 무한루프에 빠진다.
     */
    private void checkNoCycle(Department target, Department parent) {
        for (Department p = parent; p != null; p = p.getParent()) {
            if (p.getId().equals(target.getId())) {
                throw ApiException.badRequest("자기 자신이나 하위 부서를 상위 부서로 지정할 수 없습니다.");
            }
        }
    }

    /**
     * 다음 부서코드 — 원본 부서등록 창처럼 다섯 자리(00010 꼴). 숫자로만 된 코드 중 가장 큰 것 + 1.
     * <b>번호 공간을 먼저 잠근다</b>(nextMasterCode).
     *
     * <p>잠그지 않으면 두 요청이 같은 count 를 읽어 같은 코드를 만들고, 뒤에 커밋한 쪽이
     * departments.code UNIQUE 제약에 걸려 500 으로 죽는다. 쓰는 사람은 이유를 알 수 없다.
     */
    @Transactional
    public String nextCode() {
        return docNoGenerator.nextMasterCode("", "departments", "code", 5);
    }
}
