package com.erp.hr.employee;

import com.erp.hr.employee.dto.EmployeeDtos.AssignDepartmentRequest;
import com.erp.hr.employee.dto.EmployeeDtos.AssignmentResponse;
import com.erp.hr.employee.dto.EmployeeDtos.AssignmentSlipRequest;
import com.erp.hr.employee.dto.EmployeeDtos.CreateAssignmentRequest;
import com.erp.hr.employee.dto.EmployeeDtos.EmployeeResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;
import com.erp.hr.employee.dto.EmployeeDtos;

/**
 * 사원 마스터. 급여관리 기초등록의 사원등록에 대응.
 * (HrController 의 /hr/employees 는 로그인 User 기반이라 별개다)
 */
@lombok.extern.slf4j.Slf4j
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;
    private final EmployeeProfileService profileService;

    @GetMapping
    public List<EmployeeResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return maskIfNeeded(employeeService.findAll(), principal);
    }

    /** 퇴사자를 포함한 전 사원 (인사관리) */
    @GetMapping("/all")
    public List<EmployeeResponse> listAll(@AuthenticationPrincipal UserPrincipal principal) {
        return maskIfNeeded(employeeService.findAllIncludingResigned(), principal);
    }

    /**
     * 기본급은 인사·급여 권한이 있는 사람에게만 보낸다.
     *
     * <p>사원 목록 자체는 막을 수 없다 — 담당자 드롭다운으로 여기저기서 쓰기 때문이다.
     * 그래서 목록은 열어 두고 <b>급여 칸만</b> 가린다. 이걸 안 하면 급여명세를 막아 놔도
     * 사원 목록으로 기본급이 그대로 새어 나간다(실제로 그랬다).
     */
    private List<EmployeeResponse> maskIfNeeded(List<EmployeeResponse> rows, UserPrincipal principal) {
        if (canSeeSalary(principal)) {
            return rows;
        }
        return rows.stream().map(EmployeeResponse::maskSalary).toList();
    }

    private boolean canSeeSalary(UserPrincipal principal) {
        if (principal == null) return false;
        if (principal.isAdmin()) return true;
        return principal.getPermissionCodes().contains("PAYROLL")
                || principal.getPermissionCodes().contains("HR");
    }

    /**
     * 주민등록번호 원문 — 사원등록 수정 창만 쓴다. 목록 · 상세 응답은 늘 가린다(900101-1******, docs/보안-점검.md H3).
     * 인사 · 급여 권한(또는 마스터)만, 화면 머리와 무관하게. 누가 누구 것을 봤는지 남긴다(번호는 안 남긴다).
     */
    @GetMapping("/{id}/resident-no")
    public EmployeeDtos.ResidentNoResponse residentNo(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        if (!canSeeSalary(principal)) {
            throw com.erp.common.ApiException.forbidden("주민등록번호 원문은 인사 · 급여 권한이 있어야 볼 수 있습니다.");
        }
        log.info("주민등록번호 원문 조회 — 사용자 {} · 사원 id {}", principal.getUsername(), id);
        return new EmployeeDtos.ResidentNoResponse(employeeService.residentNo(id));
    }

    /** 사원별 발령이력 */
    @GetMapping("/{id}/assignments")
    public List<AssignmentResponse> assignments(@PathVariable Long id) {
        return employeeService.findAssignments(id);
    }

    /** 인사발령 (입사·전보·승진·퇴사·재입사). 사원의 현재 부서·직위·재직상태가 함께 갱신된다. */
    @PostMapping("/{id}/assignments")
    public AssignmentResponse assign(@PathVariable Long id,
                                     @Valid @RequestBody CreateAssignmentRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return employeeService.createAssignment(id, req, principal.getUsername());
    }

    /** 인사발령조회 · 현황 — 기준일자(전표 일자) 기간 */
    @GetMapping("/assignment-slips")
    public List<AssignmentResponse> assignmentSlips(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                     @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return employeeService.findAssignmentSlips(from, to);
    }

    @GetMapping("/assignment-slips/{slipDate}/{slipNo}")
    public List<AssignmentResponse> assignmentSlip(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo) {
        return employeeService.findAssignmentSlip(slipDate, slipNo);
    }

    /** 인사발령입력 [저장(F8)] */
    @PostMapping("/assignment-slips")
    public List<AssignmentResponse> createAssignmentSlip(@Valid @RequestBody AssignmentSlipRequest req,
                                                         @AuthenticationPrincipal UserPrincipal principal) {
        return employeeService.createAssignmentSlip(req, principal.getUsername());
    }

    /** 인사발령입력수정 [저장(F8)] */
    @PutMapping("/assignment-slips/{slipDate}/{slipNo}")
    public List<AssignmentResponse> updateAssignmentSlip(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo,
                                                         @Valid @RequestBody AssignmentSlipRequest req,
                                                         @AuthenticationPrincipal UserPrincipal principal) {
        return employeeService.updateAssignmentSlip(slipDate, slipNo, req, principal.getUsername());
    }

    @DeleteMapping("/assignment-slips/{slipDate}/{slipNo}")
    public void deleteAssignmentSlip(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate slipDate, @PathVariable int slipNo) {
        employeeService.deleteAssignmentSlip(slipDate, slipNo);
    }

    /** 인사카드 [인사자료] — 항목별 줄 수(자료 있는 [입력]을 칠한다). */
    @GetMapping("/{id}/hr-details")
    public java.util.Map<HrDetailCategory, Long> hrDetailCounts(@PathVariable Long id) {
        return employeeService.hrDetailCounts(id);
    }

    @GetMapping("/{id}/hr-details/{category}")
    public List<EmployeeDtos.HrDetailRow> hrDetails(@PathVariable Long id, @PathVariable HrDetailCategory category) {
        return employeeService.hrDetails(id, category);
    }

    @PutMapping("/{id}/hr-details/{category}")
    public List<EmployeeDtos.HrDetailRow> saveHrDetails(@PathVariable Long id, @PathVariable HrDetailCategory category,
                                                        @Valid @RequestBody List<EmployeeDtos.HrDetailRow> rows) {
        return employeeService.saveHrDetails(id, category, rows);
    }

    @DeleteMapping("/{id}/hr-details/{category}")
    public void deleteHrDetails(@PathVariable Long id, @PathVariable HrDetailCategory category) {
        employeeService.deleteHrDetails(id, category);
    }

    /** 인사카드 창 사원 곁 자료 — 여권번호 · 신상명세서 · 추천인 · 보증보험 · 무주택자 · 추가정보 열다섯 칸. */
    @GetMapping("/{id}/profile")
    public com.erp.hr.employee.dto.EmployeeProfileDtos.Profile profile(@PathVariable Long id) {
        return profileService.get(id);
    }

    @PutMapping("/{id}/profile")
    public com.erp.hr.employee.dto.EmployeeProfileDtos.Profile saveProfile(
            @PathVariable Long id, @Valid @RequestBody com.erp.hr.employee.dto.EmployeeProfileDtos.Profile req) {
        return profileService.save(id, req);
    }

    /** 원본 사원등록 폼이 미리 채우는 다음 사원번호. */
    @GetMapping("/next-code")
    public EmployeeDtos.NextCodeResponse nextCode() {
        return new EmployeeDtos.NextCodeResponse(employeeService.nextCode());
    }

    /** 원본 사원(담당)등록의 [신규]. */
    @PostMapping
    public EmployeeDtos.EmployeeResponse create(
            @Valid @RequestBody EmployeeDtos.CreateEmployeeRequest req) {
        return employeeService.create(req);
    }

    /** 사원 수정. 퇴사도 여기서 한다(퇴사일을 넣으면 퇴사자로 내려간다). */
    @PutMapping("/{id}")
    public EmployeeDtos.EmployeeResponse update(
            @PathVariable Long id, @Valid @RequestBody EmployeeDtos.UpdateEmployeeRequest req) {
        return employeeService.update(id, req);
    }

    /** 세무 퇴사자리스트의 [퇴직처리] 저장 — 입사 · 퇴사일자 · 퇴사사유 */
    @PutMapping("/{id}/retirement")
    public EmployeeDtos.EmployeeResponse retire(@PathVariable Long id, @Valid @RequestBody EmployeeDtos.RetireRequest req) {
        return employeeService.retire(id, req);
    }

    /** 세무 퇴사자리스트의 [삭제] · [선택삭제] — 퇴사를 거두고 재직으로 */
    @PostMapping("/retirement/cancel")
    public void cancelRetire(@RequestBody java.util.List<Long> ids) {
        employeeService.cancelRetire(ids);
    }

    /** 원본 [선택삭제]·[삭제]. 전표·급여·근태가 물고 있는 사원은 FK 가 막는다. */
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        employeeService.delete(id);
    }

    /** 부서 배치 (조직도에서 사원을 부서로 옮길 때) */
    @PutMapping("/{id}/department")
    public EmployeeResponse assignDepartment(@PathVariable Long id, @Valid @RequestBody AssignDepartmentRequest req) {
        return employeeService.assignDepartment(id, req);
    }
}
