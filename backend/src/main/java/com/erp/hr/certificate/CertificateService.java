package com.erp.hr.certificate;

import com.erp.common.ApiException;
import com.erp.hr.certificate.dto.CertificateDtos.CertificateRequest;
import com.erp.hr.certificate.dto.CertificateDtos.CertificateResponse;
import com.erp.hr.employee.Employee;
import com.erp.hr.employee.EmployeeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 관리 › 인사관리 › 각종증명서인쇄(원본 E020606). 발행번호는 발행일의 해마다 1부터 매긴다(원본 2015-1 · 2016-1 · 2026-1).
 */
@Service
@RequiredArgsConstructor
public class CertificateService {

    private final CertificateRepository certificateRepository;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public List<CertificateResponse> findAll() {
        return certificateRepository.findAllWithRefs().stream().map(CertificateResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public CertificateResponse find(Long id) {
        return CertificateResponse.from(get(id));
    }

    @Transactional
    public CertificateResponse create(CertificateRequest req) {
        Employee e = employee(req);
        int year = req.issueDate().getYear();
        Certificate c = Certificate.builder()
                .issueYear(year)
                .issueSeq(certificateRepository.maxSeq(year) + 1)
                .kind(req.kind())
                .employee(e)
                .purpose(blankToNull(req.purpose()))
                .issueDate(req.issueDate())
                .build();
        return CertificateResponse.from(certificateRepository.save(c));
    }

    /** 수정 — 발행번호는 그대로 둔다. */
    @Transactional
    public CertificateResponse update(Long id, CertificateRequest req) {
        Certificate c = get(id);
        c.setKind(req.kind());
        c.setEmployee(employee(req));
        c.setPurpose(blankToNull(req.purpose()));
        c.setIssueDate(req.issueDate());
        return CertificateResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        certificateRepository.delete(get(id));
    }

    private Employee employee(CertificateRequest req) {
        Employee e = employeeService.get(req.employeeId());
        if (req.kind() == CertificateKind.RESIGNATION && e.getResignDate() == null) {
            throw ApiException.badRequest("퇴사일이 없는 사원입니다. 퇴직증명서를 발급할 수 없습니다: " + e.getName());
        }
        return e;
    }

    private Certificate get(Long id) {
        return certificateRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("증명서를 찾을 수 없습니다."));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
