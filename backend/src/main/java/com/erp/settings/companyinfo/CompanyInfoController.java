package com.erp.settings.companyinfo;

import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoRequest;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos;

@RestController
@RequestMapping("/api/company")
@RequiredArgsConstructor
public class CompanyInfoController {

    private final CompanyInfoService companyInfoService;

    @GetMapping
    public CompanyInfoResponse get() {
        return companyInfoService.get();
    }

    @PutMapping
    public CompanyInfoResponse save(@Valid @RequestBody CompanyInfoRequest req) {
        return companyInfoService.save(req);
    }

    /** 로고 그림 — 머리 로고 자리 · 탭 아이콘. 없으면 404. */
    @GetMapping("/logo")
    public org.springframework.http.ResponseEntity<byte[]> logo() {
        return companyInfoService.logo()
                .map(l -> org.springframework.http.ResponseEntity.ok()
                        .contentType(org.springframework.http.MediaType.parseMediaType(l.type()))
                        .cacheControl(org.springframework.http.CacheControl.noCache())
                        .body(l.data()))
                .orElseGet(() -> org.springframework.http.ResponseEntity.notFound().build());
    }

    @PostMapping("/logo")
    public CompanyInfoResponse uploadLogo(@RequestPart("file") org.springframework.web.multipart.MultipartFile file) throws java.io.IOException {
        return companyInfoService.saveLogo(file.getContentType(), file.getBytes());
    }

    @DeleteMapping("/logo")
    public CompanyInfoResponse deleteLogo() {
        return companyInfoService.deleteLogo();
    }
}
