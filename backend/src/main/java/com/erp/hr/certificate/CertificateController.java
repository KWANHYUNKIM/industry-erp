package com.erp.hr.certificate;

import com.erp.hr.certificate.dto.CertificateDtos.CertificateRequest;
import com.erp.hr.certificate.dto.CertificateDtos.CertificateResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/certificates")
@RequiredArgsConstructor
public class CertificateController {

    private final CertificateService certificateService;

    @GetMapping
    public List<CertificateResponse> list() {
        return certificateService.findAll();
    }

    @GetMapping("/{id}")
    public CertificateResponse get(@PathVariable Long id) {
        return certificateService.find(id);
    }

    @PostMapping
    public CertificateResponse create(@Valid @RequestBody CertificateRequest req) {
        return certificateService.create(req);
    }

    @PutMapping("/{id}")
    public CertificateResponse update(@PathVariable Long id, @Valid @RequestBody CertificateRequest req) {
        return certificateService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        certificateService.delete(id);
    }
}
