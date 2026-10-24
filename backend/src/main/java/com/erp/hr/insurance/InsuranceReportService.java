package com.erp.hr.insurance;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.insurance.dto.InsuranceReportDtos.ReportRequest;
import com.erp.hr.insurance.dto.InsuranceReportDtos.ReportResponse;
import com.erp.hr.insurance.dto.InsuranceReportDtos.WorkplaceRequest;
import com.erp.hr.insurance.dto.InsuranceReportDtos.WorkplaceResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 관리 › 급여관리 › 4대보험신고(원본 N001768 ~ N001771, 2026-10-14 실측).
 * 저장 검증은 원본 '아래의 경우 처리가 불가능합니다.' 창의 줄 그대로 — 사업장이 빈 칸마다 '사업장명[기본값설정] 필수'.
 * 신고서 파일 · EDI 전송(신고 · 결과조회 · 인증서관리)은 만들지 않는다. 선택삭제는 표시만(삭제구분 조건).
 */
@Service
@RequiredArgsConstructor
public class InsuranceReportService {

    public static final String WORKPLACE_REQUIRED = "사업장명[기본값설정] 필수";
    public static final String EMPLOYEE_REQUIRED = "사원 필수";
    public static final String RESIDENT_NO_REQUIRED = "주민등록번호 필수";
    public static final String HANGUL_ONLY = "한글만 입력 가능합니다.";
    public static final String APPLY_REQUIRED = "신청구분을 1개 이상 선택해 주세요.";
    public static final String GRID_REQUIRED = "그리드(표)에 최소 1줄 이상 입력되어야 합니다.";

    private final InsuranceReportRepository reportRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final InsuranceWorkplaceRepository workplaceRepository;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public List<WorkplaceResponse> workplaces() {
        return workplaceRepository.findAllByOrderByIdAsc().stream().map(WorkplaceResponse::from).toList();
    }

    /** 사업장관리등록 — 원본: 사업장관리번호 11자리가 아니면 '자릿수는 11입니다.' */
    @Transactional
    public WorkplaceResponse createWorkplace(WorkplaceRequest req) {
        if (req.name() == null || req.name().isBlank()) throw ApiException.badRequest("사업장명을 입력 바랍니다.");
        String no = req.manageNo() == null ? "" : req.manageNo().trim();
        if (!no.matches("\\d{11}")) throw ApiException.badRequest("자릿수는 11입니다.");
        if (workplaceRepository.existsByManageNo(no)) throw ApiException.badRequest("이미 등록된 사업장관리번호입니다.");
        return WorkplaceResponse.from(workplaceRepository.save(InsuranceWorkplace.builder()
                .name(req.name().trim()).manageNo(no).phone(blank(req.phone())).build()));
    }

    /** 사업장관리수정 — 사업장관리번호는 막힌다(원본 수정 창에서 글자로만 보임). */
    @Transactional
    public WorkplaceResponse updateWorkplace(Long id, WorkplaceRequest req) {
        InsuranceWorkplace w = workplace(id);
        if (req.name() == null || req.name().isBlank()) throw ApiException.badRequest("사업장명을 입력 바랍니다.");
        w.setName(req.name().trim());
        w.setPhone(blank(req.phone()));
        return WorkplaceResponse.from(w);
    }

    @Transactional
    public WorkplaceResponse toggleWorkplace(Long id) {
        InsuranceWorkplace w = workplace(id);
        w.setActive(!w.isActive());
        return WorkplaceResponse.from(w);
    }

    @Transactional
    public void deleteWorkplace(Long id) {
        workplaceRepository.delete(workplace(id));
    }

    @Transactional(readOnly = true)
    public List<ReportResponse> list(LocalDate from, LocalDate to) {
        return reportRepository.findInPeriod(from, to).stream().map(ReportResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ReportResponse find(Long id) {
        return ReportResponse.from(get(id));
    }

    @Transactional
    public ReportResponse create(ReportRequest req) {
        InsuranceReport r = InsuranceReport.builder()
                .reportDate(req.reportDate())
                .reportSeq(docNoGenerator.nextSeq("insurance_reports", req.reportDate(), reportRepository.maxSeq(req.reportDate())))
                .kind(req.kind())
                .build();
        apply(r, req);
        return ReportResponse.from(reportRepository.save(r));
    }

    /** 수정 — 일자-No. · 서식은 그대로 둔다. */
    @Transactional
    public ReportResponse update(Long id, ReportRequest req) {
        InsuranceReport r = get(id);
        if (r.isDeleted()) throw ApiException.badRequest("삭제된 신고입니다.");
        apply(r, req);
        return ReportResponse.from(r);
    }

    /** [선택삭제] — 줄을 지우지 않고 삭제 표시(원본 조건 삭제구분 전체 · 미삭제 · 삭제). */
    @Transactional
    public void markDeleted(List<Long> ids) {
        for (Long id : ids) get(id).setDeleted(true);
    }

    private void apply(InsuranceReport r, ReportRequest req) {
        List<String> errors = new ArrayList<>();
        boolean dependent = r.getKind() == InsuranceReportKind.DEPENDENT;
        if (!dependent) {
            if (req.pensionWorkplaceId() == null) errors.add(WORKPLACE_REQUIRED);
            if (req.employmentWorkplaceId() == null) errors.add(WORKPLACE_REQUIRED);
            if (req.accidentWorkplaceId() == null) errors.add(WORKPLACE_REQUIRED);
        }
        if (req.healthWorkplaceId() == null) errors.add(WORKPLACE_REQUIRED);
        if (!errors.isEmpty()) throw ApiException.badRequest(String.join("\n", errors));
        // 원본(2026-10-24 실측): 사원 · 주민등록번호가 비면 창 없이 칸 테두리만 빨갛다 — API 로는 한 줄 문구.
        if (req.employeeId() == null) throw ApiException.badRequest(EMPLOYEE_REQUIRED);
        String residentNo = req.residentNo() == null ? "" : req.residentNo().replaceAll("[^0-9]", "");
        if (residentNo.isEmpty()) throw ApiException.badRequest(RESIDENT_NO_REQUIRED);
        var employee = employeeService.get(req.employeeId());
        String name = blank(req.reportName()) != null ? req.reportName().trim() : employee.getName();
        if (!name.matches("[가-힣]+")) throw ApiException.badRequest(HANGUL_ONLY);
        if (!dependent && !(req.pensionApply() || req.healthApply() || req.employmentApply() || req.accidentApply()))
            throw ApiException.badRequest(APPLY_REQUIRED);
        if (dependent && blank(req.dependents()) == null) throw ApiException.badRequest(GRID_REQUIRED);

        r.setEmployee(employee);
        r.setResidentNo(residentNo);
        r.setReportName(name);
        r.setPensionWorkplace(dependent ? null : workplace(req.pensionWorkplaceId()));
        r.setHealthWorkplace(workplace(req.healthWorkplaceId()));
        r.setEmploymentWorkplace(dependent ? null : workplace(req.employmentWorkplaceId()));
        r.setAccidentWorkplace(dependent ? null : workplace(req.accidentWorkplaceId()));
        r.setPensionApply(!dependent && req.pensionApply());
        r.setPensionDate(r.isPensionApply() ? req.pensionDate() : null);
        r.setHealthApply(!dependent && req.healthApply());
        r.setHealthDate(r.isHealthApply() ? req.healthDate() : null);
        r.setEmploymentApply(!dependent && req.employmentApply());
        r.setEmploymentDate(r.isEmploymentApply() ? req.employmentDate() : null);
        r.setAccidentApply(!dependent && req.accidentApply());
        r.setAccidentDate(r.isAccidentApply() ? req.accidentDate() : null);
        r.setPhone(blank(req.phone()));
        r.setDetail(blank(req.detail()));
        r.setDependents(blank(req.dependents()));
    }

    private InsuranceReport get(Long id) {
        return reportRepository.findById(id).orElseThrow(() -> ApiException.notFound("신고를 찾을 수 없습니다."));
    }

    private InsuranceWorkplace workplace(Long id) {
        return workplaceRepository.findById(id).orElseThrow(() -> ApiException.notFound("사업장을 찾을 수 없습니다."));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
