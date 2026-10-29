package com.erp.settings.companyinfo;

import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoRequest;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos;

@Service
@RequiredArgsConstructor
public class CompanyInfoService {

    private final CompanyInfoRepository companyInfoRepository;

    /** 회사정보 조회. 미등록 시 null 반환(프론트에서 빈 폼 처리). */
    @Transactional(readOnly = true)
    public CompanyInfoResponse get() {
        return companyInfoRepository.findFirstByOrderByIdAsc()
                .map(CompanyInfoResponse::from)
                .orElse(null);
    }

    /** 단일 레코드 upsert(있으면 수정, 없으면 생성). */
    @Transactional
    public CompanyInfoResponse save(CompanyInfoRequest req) {
        CompanyInfo c = companyInfoRepository.findFirstByOrderByIdAsc()
                .orElseGet(() -> CompanyInfo.builder().build());

        c.setName(req.name());
        c.setCeo(req.ceo());
        c.setBizRegNo(req.bizRegNo());
        c.setCorpRegNo(req.corpRegNo());
        c.setBizType(req.bizType());
        c.setBizItem(req.bizItem());
        c.setTel(req.tel());
        c.setFax(req.fax());
        c.setEmail(req.email());
        c.setZipcode(req.zipcode());
        c.setAddress(req.address());
        c.setAddressDetail(req.addressDetail());

        return CompanyInfoResponse.from(companyInfoRepository.save(c));
    }

    /** 로고 그림 크기 상한 — 머리 줄 높이에 맞춰 줄여 그리는 마크라 크게 받을 까닭이 없다. */
    public static final int LOGO_MAX = 512 * 1024;
    private static final java.util.Set<String> LOGO_TYPES =
            java.util.Set.of("image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon");

    /** 로고 그림(형식 · 바이트). 없으면 빈 값. */
    public record Logo(String type, byte[] data) {}

    @Transactional(readOnly = true)
    public java.util.Optional<Logo> logo() {
        return companyInfoRepository.findFirstByOrderByIdAsc()
                .filter(c -> c.getLogo() != null && c.getLogo().length > 0)
                .map(c -> new Logo(c.getLogoType() != null ? c.getLogoType() : "image/png", c.getLogo()));
    }

    /** 로고 올리기 — 회사정보를 먼저 저장해야 한다(상호가 없는 회사정보는 만들지 않는다). */
    @Transactional
    public CompanyInfoResponse saveLogo(String contentType, byte[] data) {
        if (data == null || data.length == 0) throw com.erp.common.ApiException.badRequest("로고 그림 파일을 선택하세요.");
        if (data.length > LOGO_MAX) throw com.erp.common.ApiException.badRequest("로고 그림은 512KB 까지 올릴 수 있습니다.");
        String type = contentType == null ? "" : contentType.toLowerCase(java.util.Locale.ROOT);
        if (!LOGO_TYPES.contains(type)) throw com.erp.common.ApiException.badRequest("로고는 그림 파일(png · jpg · gif · webp · svg · ico)만 올릴 수 있습니다.");
        CompanyInfo c = companyInfoRepository.findFirstByOrderByIdAsc()
                .orElseThrow(() -> com.erp.common.ApiException.badRequest("회사정보를 먼저 저장하세요."));
        c.setLogo(data);
        c.setLogoType(type);
        c.setLogoVersion(System.currentTimeMillis());
        return CompanyInfoResponse.from(c);
    }

    /** 로고 지우기 — 머리 로고 자리는 다시 상호 글자. */
    @Transactional
    public CompanyInfoResponse deleteLogo() {
        CompanyInfo c = companyInfoRepository.findFirstByOrderByIdAsc().orElse(null);
        if (c == null) return null;
        c.setLogo(null);
        c.setLogoType(null);
        c.setLogoVersion(System.currentTimeMillis());
        return CompanyInfoResponse.from(c);
    }
}
