package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.PartnerGroup;
import com.erp.dto.PartnerGroupDtos.CreatePartnerGroupRequest;
import com.erp.dto.PartnerGroupDtos.PartnerGroupResponse;
import com.erp.dto.PartnerGroupDtos.UpdatePartnerGroupRequest;
import com.erp.repository.PartnerGroupRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PartnerGroupService {

    private final PartnerGroupRepository partnerGroupRepository;

    @Transactional(readOnly = true)
    public List<PartnerGroupResponse> findAll() {
        return partnerGroupRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder", "code")).stream()
                .map(PartnerGroupResponse::from)
                .toList();
    }

    @Transactional
    public PartnerGroupResponse create(CreatePartnerGroupRequest req) {
        if (partnerGroupRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 거래처그룹 코드입니다: " + req.code());
        }
        PartnerGroup g = PartnerGroup.builder()
                .code(req.code())
                .name(req.name())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .build();
        return PartnerGroupResponse.from(partnerGroupRepository.save(g));
    }

    @Transactional
    public PartnerGroupResponse update(Long id, UpdatePartnerGroupRequest req) {
        PartnerGroup g = getPartnerGroup(id);
        g.setName(req.name());
        if (req.sortOrder() != null) {
            g.setSortOrder(req.sortOrder());
        }
        if (req.active() != null) {
            g.setActive(req.active());
        }
        return PartnerGroupResponse.from(g);
    }

    /** 거래처가 참조 중인 그룹은 지울 수 없다. 사용을 멈추려면 active=false 로 내린다. */
    @Transactional
    public void delete(Long id) {
        PartnerGroup g = getPartnerGroup(id);
        try {
            partnerGroupRepository.delete(g);
            partnerGroupRepository.flush();
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict(
                    "이 거래처그룹을 사용하는 거래처가 있어 삭제할 수 없습니다. 사용중지하려면 '사용여부'를 해제하세요.");
        }
    }

    private PartnerGroup getPartnerGroup(Long id) {
        return partnerGroupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("거래처그룹을 찾을 수 없습니다. id=" + id));
    }
}
