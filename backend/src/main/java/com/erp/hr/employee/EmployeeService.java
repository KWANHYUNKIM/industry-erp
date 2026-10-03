package com.erp.hr.employee;

import com.erp.hr.department.Department;
import com.erp.hr.department.DepartmentService;
import com.erp.common.ApiException;
import com.erp.hr.employee.dto.EmployeeDtos.AssignDepartmentRequest;
import com.erp.hr.employee.dto.EmployeeDtos.AssignmentResponse;
import com.erp.hr.employee.dto.EmployeeDtos.AssignmentSlipLine;
import com.erp.hr.employee.dto.EmployeeDtos.AssignmentSlipRequest;
import com.erp.hr.employee.dto.EmployeeDtos.CreateAssignmentRequest;
import com.erp.hr.employee.dto.EmployeeDtos.CreateEmployeeRequest;
import com.erp.hr.employee.dto.EmployeeDtos.EmployeeResponse;
import com.erp.hr.employee.dto.EmployeeDtos.UpdateEmployeeRequest;
import com.erp.common.DocumentNoGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.hr.employee.dto.EmployeeDtos;

/** 사원 마스터. 급여관리 기초등록(사원등록)과 인사관리(발령이력)에 대응. */
@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final EmployeeAssignmentRepository assignmentRepository;
    private final DepartmentService departmentService;
    private final DocumentNoGenerator documentNoGenerator;
    private final EmployeeHrDetailRepository hrDetailRepository;

    /** 재직 중인 사원 (급여·조직도용) */
    @Transactional(readOnly = true)
    public List<EmployeeResponse> findAll() {
        return employeeRepository.findActiveWithDepartment().stream()
                .map(EmployeeResponse::from)
                .toList();
    }

    /** 퇴사자를 포함한 전 사원 (인사관리용) */
    @Transactional(readOnly = true)
    public List<EmployeeResponse> findAllIncludingResigned() {
        return employeeRepository.findAllWithDepartment().stream()
                .map(EmployeeResponse::from)
                .toList();
    }

    /**
     * 원본 사원등록 폼은 열자마자 [사원번호]에 다음 번호(00007 꼴, 다섯 자리)를 채워 둔다.
     * 숫자로만 된 사번 중 가장 큰 것 + 1 이다 — '2019-001' 처럼 사람이 정한 번호와는 섞이지 않는다.
     */
    @Transactional
    public String nextCode() {
        return documentNoGenerator.nextMasterCode("", "employees", "code", 5);
    }

    @Transactional
    public EmployeeResponse create(CreateEmployeeRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextCode() : req.code().trim();
        if (employeeRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 사번입니다: " + code);
        }
        Employee e = Employee.builder()
                .code(code)
                .name(req.name().trim())
                .department(req.departmentId() != null ? departmentService.get(req.departmentId()) : null)
                .jobTitle(req.jobTitle())
                .hireDate(req.hireDate() != null ? req.hireDate() : LocalDate.now())
                .baseSalary(req.baseSalary() != null ? req.baseSalary() : BigDecimal.ZERO)
                .phone(req.phone())
                .email(req.email())
                .searchKeyword(req.searchKeyword())
                .remark(req.remark())
                .payType(req.payType() != null ? req.payType() : PayType.FIXED)
                .mobile(req.mobile())
                .resignReason(req.resignReason())
                .address(req.address())
                .bankCode(req.bankCode())
                .bankName(req.bankName())
                .accountNo(req.accountNo())
                .accountHolder(req.accountHolder())
                .hireKind(blankToNull(req.hireKind()))
                .duty(blankToNull(req.duty()))
                .active(true)
                .build();
        return EmployeeResponse.from(employeeRepository.save(e));
    }

    /**
     * 사원 수정.
     *
     * <p><b>퇴사일을 넣으면 사용중단으로 함께 내린다.</b> 둘을 따로 두면 "퇴사일은 있는데
     * 아직 담당자로 뜨는" 사원이 생긴다 — 실제로 그런 자료가 제일 헷갈린다.
     * 되살릴 때(active=true)는 퇴사일을 지운다.
     */
    @Transactional
    public EmployeeResponse update(Long id, UpdateEmployeeRequest req) {
        Employee e = get(id);
        e.setName(req.name().trim());
        e.setDepartment(req.departmentId() != null ? departmentService.get(req.departmentId()) : null);
        e.setJobTitle(req.jobTitle());
        // 안 보낸 화면(옛 클라이언트)이 지우지 않게 — 빈 글자를 보내야 지운다
        if (req.hireKind() != null) e.setHireKind(blankToNull(req.hireKind()));
        if (req.duty() != null) e.setDuty(blankToNull(req.duty()));
        if (req.hireDate() != null) e.setHireDate(req.hireDate());
        if (req.baseSalary() != null) {
            if (req.baseSalary().signum() < 0) {
                throw ApiException.badRequest("기본급은 0 이상이어야 합니다.");
            }
            e.setBaseSalary(req.baseSalary());
        }

        e.setPhone(req.phone());
        e.setEmail(req.email());
        e.setSearchKeyword(req.searchKeyword());
        e.setRemark(req.remark());
        if (req.payType() != null) e.setPayType(req.payType());
        e.setMobile(req.mobile());
        e.setResignReason(req.resignReason());
        e.setAddress(req.address());
        e.setBankCode(req.bankCode());
        e.setBankName(req.bankName());
        e.setAccountNo(req.accountNo());
        e.setAccountHolder(req.accountHolder());

        boolean active = req.active() == null ? e.isActive() : req.active();
        if (req.resignDate() != null) {
            e.setResignDate(req.resignDate());
            active = false;
        }
        if (active) {
            e.setResignDate(null);
        }
        e.setActive(active);
        return EmployeeResponse.from(e);
    }

    /**
     * 원본 사원리스트의 [선택삭제] · 사원등록 창의 [삭제].
     *
     * <p>원본은 확인 창("한번 지워진 자료는 복구될 수 없습니다.") 뒤에 실제로 지운다.
     * 다만 전표·급여·근태가 물고 있는 사원은 지우면 지난 자료가 누구 것인지 잃으므로
     * FK 가 막고, {@code GlobalExceptionHandler} 가 "…에서 쓰고 있어 지울 수 없습니다" 로 알린다.
     * 그런 사원은 퇴사일을 넣어 퇴사자로 내린다.
     */
    @Transactional
    public void delete(Long id) {
        Employee e = get(id);
        employeeRepository.delete(e);
        employeeRepository.flush();   // FK 위반을 이 트랜잭션 안에서 터뜨린다
    }

    /**
     * 새로 <b>고르는</b> 자리에서 쓴다. 퇴사·사용중지한 사원은 담당자로 못 고른다.
     *
     * <p>지난 전표가 물고 있는 사원을 읽는 자리에서는 쓰지 않는다 — 퇴사했다고 그 사람이
     * 팔았던 전표의 담당자가 사라지면 안 된다.
     */
    @Transactional(readOnly = true)
    public Employee getUsable(Long id) {
        Employee e = get(id);
        if (!e.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 사원입니다: " + e.getCode() + " " + e.getName());
        }
        return e;
    }


    /** 부서 배치. departmentId 가 null 이면 미배치로 되돌린다. */
    @Transactional
    public EmployeeResponse assignDepartment(Long id, AssignDepartmentRequest req) {
        Employee e = get(id);
        e.setDepartment(req.departmentId() != null ? departmentService.get(req.departmentId()) : null);
        return EmployeeResponse.from(e);
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> findAssignments(Long employeeId) {
        get(employeeId);
        return assignmentRepository.findByEmployee(employeeId).stream()
                .map(AssignmentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> findAllAssignments() {
        return assignmentRepository.findAllWithRefs().stream()
                .map(AssignmentResponse::from)
                .toList();
    }

    /**
     * 인사발령. 이력을 남기고 사원의 현재 상태(부서·직위·재직·입퇴사일)를 갱신한다.
     * 발령에서 지정하지 않은 부서·직위는 직전 값을 그대로 이어받는다. 그날의 새 전표 한 장이 된다.
     */
    @Transactional
    public AssignmentResponse createAssignment(Long employeeId, CreateAssignmentRequest req, String username) {
        Employee e = get(employeeId);
        Department prevDept = e.getDepartment();
        String prevTitle = e.getJobTitle();
        applyAssignment(e, req.type(), req.assignDate(), req.departmentId(), req.jobTitle());
        EmployeeAssignment a = EmployeeAssignment.builder()
                .employee(e)
                .slipDate(req.assignDate())
                .slipNo(nextSlipNo(req.assignDate()))
                .assignDate(req.assignDate())
                .type(req.type())
                .prevDepartment(prevDept)
                .prevJobTitle(prevTitle)
                // 발령에서 바뀌지 않은 항목은 사원의 현재값(= 직전 값)을 그대로 기록한다
                .department(e.getDepartment())
                .jobTitle(e.getJobTitle())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return AssignmentResponse.from(assignmentRepository.save(a));
    }

    /** 발령 유형대로 사원의 현재 상태를 바꾼다. */
    private void applyAssignment(Employee e, AssignmentType type, LocalDate date, Long departmentId, String jobTitle) {
        switch (type) {
            case TRANSFER -> {
                if (!e.isActive()) throw ApiException.badRequest("퇴사한 사원은 전보할 수 없습니다. 재입사 발령을 먼저 하세요.");
                if (departmentId == null) throw ApiException.badRequest("전보 발령은 부서를 지정해야 합니다.");
                e.setDepartment(departmentService.get(departmentId));
            }
            case PROMOTION -> {
                if (!e.isActive()) throw ApiException.badRequest("퇴사한 사원은 승진할 수 없습니다. 재입사 발령을 먼저 하세요.");
                if (jobTitle == null || jobTitle.isBlank()) {
                    throw ApiException.badRequest("승진 발령은 직위를 지정해야 합니다.");
                }
                e.setJobTitle(jobTitle.trim());
                if (departmentId != null) e.setDepartment(departmentService.get(departmentId));
            }
            case RESIGN -> {
                if (!e.isActive()) throw ApiException.conflict("이미 퇴사한 사원입니다: " + e.getName());
                e.setActive(false);
                e.setResignDate(date);
            }
            case HIRE, REHIRE -> {
                // 재입사는 퇴사자만. 입사는 퇴사자 외에, 입사일이 비어 있는 재직자의 기록 보정도 허용한다
                // (기존 사원 중 입사일이 없는 사람이 있고, 그걸 넣을 다른 경로가 없다).
                if (e.isActive()) {
                    if (type == AssignmentType.REHIRE) {
                        throw ApiException.conflict("재직 중인 사원입니다: " + e.getName());
                    }
                    if (e.getHireDate() != null) {
                        throw ApiException.conflict("이미 입사일이 등록된 재직 사원입니다: " + e.getName());
                    }
                }
                e.setActive(true);
                e.setResignDate(null);
                if (type == AssignmentType.HIRE) {
                    e.setHireDate(date);
                }
                if (departmentId != null) e.setDepartment(departmentService.get(departmentId));
                if (jobTitle != null && !jobTitle.isBlank()) e.setJobTitle(jobTitle.trim());
            }
            case GENERAL -> {
                if (departmentId != null) e.setDepartment(departmentService.get(departmentId));
                if (jobTitle != null && !jobTitle.isBlank()) e.setJobTitle(jobTitle.trim());
            }
        }
    }

    private int nextSlipNo(LocalDate slipDate) {
        return assignmentRepository.maxSlipNo(slipDate) + 1;
    }

    /** 인사발령조회 · 현황 — 기준일자(전표 일자) 기간의 발령 줄. 화면이 전표로 묶는다. */
    @Transactional(readOnly = true)
    public List<AssignmentResponse> findAssignmentSlips(LocalDate from, LocalDate to) {
        return assignmentRepository.findBySlipDateBetween(from, to).stream()
                .map(AssignmentResponse::from)
                .toList();
    }

    /** 인사발령입력 전표 한 장의 줄. */
    @Transactional(readOnly = true)
    public List<AssignmentResponse> findAssignmentSlip(LocalDate slipDate, int slipNo) {
        List<EmployeeAssignment> lines = assignmentRepository.findSlip(slipDate, slipNo);
        if (lines.isEmpty()) throw ApiException.notFound("인사발령 전표를 찾을 수 없습니다.");
        return lines.stream().map(AssignmentResponse::from).toList();
    }

    /**
     * 인사발령입력 [저장(F8)] — 원본처럼 줄마다 사번을 넣으면 이전 직위·부서가 사원의 지금 값으로 채워진다.
     * '사원정보에 반영' 이 켜져 있으면 발령 직위·부서(와 퇴사 · 입사 유형의 재직상태)를 사원에 옮긴다.
     */
    @Transactional
    public List<AssignmentResponse> createAssignmentSlip(AssignmentSlipRequest req, String username) {
        return saveSlipLines(req, nextSlipNo(req.slipDate()), username);
    }

    /** 인사발령입력수정 — 일자는 막히고 줄을 통째로 바꾼다. 지운 줄이 사원에 옮긴 값은 되돌리지 않는다(원본도 같다). */
    @Transactional
    public List<AssignmentResponse> updateAssignmentSlip(LocalDate slipDate, int slipNo, AssignmentSlipRequest req, String username) {
        List<EmployeeAssignment> old = assignmentRepository.findSlip(slipDate, slipNo);
        if (old.isEmpty()) throw ApiException.notFound("인사발령 전표를 찾을 수 없습니다.");
        assignmentRepository.deleteAll(old);
        assignmentRepository.flush();
        return saveSlipLines(new AssignmentSlipRequest(slipDate, req.reflect(), req.lines()), slipNo, username);
    }

    /** 인사발령 전표 삭제('전표를 삭제하겠습니까?'). */
    @Transactional
    public void deleteAssignmentSlip(LocalDate slipDate, int slipNo) {
        List<EmployeeAssignment> old = assignmentRepository.findSlip(slipDate, slipNo);
        if (old.isEmpty()) throw ApiException.notFound("인사발령 전표를 찾을 수 없습니다.");
        assignmentRepository.deleteAll(old);
    }

    private List<AssignmentResponse> saveSlipLines(AssignmentSlipRequest req, int slipNo, String username) {
        if (req.lines() == null || req.lines().isEmpty()) throw ApiException.badRequest("발령 줄을 입력 바랍니다.");
        List<AssignmentResponse> out = new java.util.ArrayList<>();
        for (AssignmentSlipLine l : req.lines()) {
            Employee e = get(l.employeeId());
            Department prevDept = e.getDepartment();
            String prevTitle = e.getJobTitle();
            LocalDate date = l.assignDate() != null ? l.assignDate() : req.slipDate();
            Department toDept;
            String toTitle;
            if (req.reflect()) {
                applyAssignment(e, l.type(), date, l.departmentId(), l.jobTitle());
                toDept = e.getDepartment();
                toTitle = e.getJobTitle();
            } else {
                toDept = l.departmentId() != null ? departmentService.get(l.departmentId()) : prevDept;
                toTitle = l.jobTitle() != null && !l.jobTitle().isBlank() ? l.jobTitle().trim() : prevTitle;
            }
            EmployeeAssignment a = EmployeeAssignment.builder()
                    .employee(e)
                    .slipDate(req.slipDate())
                    .slipNo(slipNo)
                    .assignDate(date)
                    .type(l.type())
                    .hireKind(l.hireKind() != null && !l.hireKind().isBlank() ? l.hireKind().trim() : null)
                    .prevDepartment(prevDept)
                    .prevJobTitle(prevTitle)
                    .department(toDept)
                    .jobTitle(toTitle)
                    .remark(l.remark())
                    .createdBy(username)
                    .build();
            out.add(AssignmentResponse.from(assignmentRepository.save(a)));
        }
        return out;
    }

    /** 인사카드 [인사자료] 한 항목의 줄들. */
    @Transactional(readOnly = true)
    public List<com.erp.hr.employee.dto.EmployeeDtos.HrDetailRow> hrDetails(Long employeeId, HrDetailCategory category) {
        get(employeeId);
        return hrDetailRepository.findByEmployee_IdAndCategoryOrderByLineNo(employeeId, category).stream()
                .map(com.erp.hr.employee.dto.EmployeeDtos.HrDetailRow::from).toList();
    }

    /** 원본 [인사자료] 입력 창 [저장] — 그 항목의 줄을 통째로 바꾼다(빈 줄은 버린다). */
    @Transactional
    public List<com.erp.hr.employee.dto.EmployeeDtos.HrDetailRow> saveHrDetails(
            Long employeeId, HrDetailCategory category, List<com.erp.hr.employee.dto.EmployeeDtos.HrDetailRow> rows) {
        Employee e = get(employeeId);
        hrDetailRepository.deleteByEmployee_IdAndCategory(employeeId, category);
        hrDetailRepository.flush();
        int n = 0;
        for (var r : rows) {
            boolean blank = r.fromDate() == null && r.toDate() == null && r.date3() == null && r.date4() == null
                    && java.util.stream.Stream.of(r.text1(), r.text2(), r.text3(), r.text4(), r.text5(), r.text6(), r.text7(),
                            r.text8(), r.text9(), r.text10())
                    .allMatch(t -> t == null || t.isBlank());
            if (blank) continue;
            hrDetailRepository.save(EmployeeHrDetail.builder()
                    .employee(e).category(category).lineNo(++n)
                    .fromDate(r.fromDate()).toDate(r.toDate()).date3(r.date3()).date4(r.date4())
                    .text1(r.text1()).text2(r.text2()).text3(r.text3()).text4(r.text4())
                    .text5(r.text5()).text6(r.text6()).text7(r.text7())
                    .text8(r.text8()).text9(r.text9()).text10(r.text10())
                    .build());
        }
        return hrDetails(employeeId, category);
    }

    /** 원본 [인사자료] 입력 창 [삭제] — '한번 지워진 자료는 복구될 수 없습니다.' */
    @Transactional
    public void deleteHrDetails(Long employeeId, HrDetailCategory category) {
        hrDetailRepository.deleteByEmployee_IdAndCategory(employeeId, category);
    }

    /** 인사카드 목록에서 [입력] 칸을 자료 있음으로 칠하려고 — 항목별 줄 수. */
    @Transactional(readOnly = true)
    public java.util.Map<HrDetailCategory, Long> hrDetailCounts(Long employeeId) {
        java.util.Map<HrDetailCategory, Long> out = new java.util.EnumMap<>(HrDetailCategory.class);
        for (var d : hrDetailRepository.findByEmployee_IdOrderByCategoryAscLineNoAsc(employeeId)) out.merge(d.getCategory(), 1L, Long::sum);
        return out;
    }

    /** 같은 모듈의 다른 서비스(근로계약 등)가 사원 엔티티를 얻는 진입점. */
    @Transactional(readOnly = true)
    public Employee get(Long id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + id));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
