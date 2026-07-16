package com.erp.settings.service;

import com.erp.settings.domain.CompanyInfo;
import com.erp.settings.dto.CompanyInfoDtos.CompanyInfoRequest;
import com.erp.settings.dto.CompanyInfoDtos.CompanyInfoResponse;
import com.erp.settings.repository.CompanyInfoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.erp.settings.dto.CompanyInfoDtos;

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
}
