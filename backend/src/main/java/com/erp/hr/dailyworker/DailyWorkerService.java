package com.erp.hr.dailyworker;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.dailyworker.dto.DailyWorkerDtos.DailyWorkerRequest;
import com.erp.hr.dailyworker.dto.DailyWorkerDtos.DailyWorkerResponse;
import com.erp.hr.department.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 관리 › 일용근로급여관리 › 일용근로 사원등록(원본 E020105). 사원번호는 비우면 다음 다섯 자리(00003). */
@Service
@RequiredArgsConstructor
public class DailyWorkerService {

    private final DailyWorkerRepository dailyWorkerRepository;
    private final DailyWorkEntryRepository dailyWorkEntryRepository;
    private final DailyWorkConfirmRepository dailyWorkConfirmRepository;
    private final DailyPayLineRepository dailyPayLineRepository;
    private final DepartmentService departmentService;
    private final DocumentNoGenerator documentNoGenerator;

    @Transactional(readOnly = true)
    public List<DailyWorkerResponse> findAll() {
        return dailyWorkerRepository.findAllWithRefs().stream().map(DailyWorkerResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DailyWorkerResponse find(Long id) {
        return DailyWorkerResponse.from(get(id));
    }

    @Transactional(readOnly = true)
    public String nextCode() {
        return documentNoGenerator.nextMasterCode("", "daily_workers", "code", 5);
    }

    @Transactional
    public DailyWorkerResponse create(DailyWorkerRequest req) {
        String code = req.code() == null || req.code().isBlank()
                ? documentNoGenerator.nextMasterCode("", "daily_workers", "code", 5) : req.code().trim();
        if (dailyWorkerRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 사원번호입니다: " + code);
        }
        DailyWorker w = DailyWorker.builder().code(code).build();
        apply(w, req);
        return DailyWorkerResponse.from(dailyWorkerRepository.save(w));
    }

    /** 수정 — 사원번호는 그대로(원본 사원번호 칸은 [변경]으로만 바꾼다). */
    @Transactional
    public DailyWorkerResponse update(Long id, DailyWorkerRequest req) {
        DailyWorker w = get(id);
        apply(w, req);
        return DailyWorkerResponse.from(w);
    }

    /** 원본 '한번 지워진 자료는 복구될 수 없습니다. 삭제하겠습니까?' */
    @Transactional
    public void delete(Long id) {
        DailyWorker w = get(id);
        if (dailyWorkEntryRepository.existsByWorker_Id(id)) {
            throw ApiException.conflict("근무입력에 쓰인 사원은 삭제할 수 없습니다: " + w.getName());
        }
        if (dailyWorkConfirmRepository.existsByWorker_Id(id) || dailyPayLineRepository.existsByWorker_Id(id)) {
            throw ApiException.conflict("급여대장에 쓰인 사원은 삭제할 수 없습니다: " + w.getName());
        }
        dailyWorkerRepository.delete(w);
    }

    private void apply(DailyWorker w, DailyWorkerRequest req) {
        w.setName(req.name().trim());
        w.setForeigner(req.foreigner());
        w.setNationality(req.foreigner() ? blank(req.nationality()) : null);
        w.setDepartment(req.departmentId() != null ? departmentService.get(req.departmentId()) : null);
        w.setMobile(blank(req.mobile()));
        w.setEmail(blank(req.email()));
        w.setHireDate(req.hireDate());
        w.setResignDate(req.resignDate());
        w.setZipcode(blank(req.zipcode()));
        w.setAddress(blank(req.address()));
        w.setEmploymentInsurance(req.employmentInsurance());
        w.setPensionAuto(req.pensionAuto());
        w.setPensionBase(req.pensionAuto() ? null : req.pensionBase());
        w.setHealthAuto(req.healthAuto());
        w.setHealthBase(req.healthAuto() ? null : req.healthBase());
        w.setBankName(blank(req.bankName()));
        w.setAccountNo(blank(req.accountNo()));
        w.setAccountHolder(blank(req.accountHolder()));
        w.setRemark(blank(req.remark()));
        w.setDailyWage(req.dailyWage());
        w.setFixedIncomeTax(req.fixedIncomeTax());
        w.setFixedLocalTax(req.fixedLocalTax());
    }

    private DailyWorker get(Long id) {
        return dailyWorkerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("일용근로 사원을 찾을 수 없습니다."));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
