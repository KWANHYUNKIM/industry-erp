package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.ManagementItem;
import com.erp.inventory.dto.ManagementItemDtos.CreateManagementItemRequest;
import com.erp.inventory.dto.ManagementItemDtos.ManagementItemResponse;
import com.erp.inventory.dto.ManagementItemDtos.UpdateManagementItemRequest;
import com.erp.inventory.repository.ManagementItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import com.erp.inventory.dto.ManagementItemDtos;

@Service
@RequiredArgsConstructor
public class ManagementItemService {

    private final ManagementItemRepository managementItemRepository;

    @Transactional(readOnly = true)
    public List<ManagementItemResponse> findAll() {
        return managementItemRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(ManagementItemResponse::from)
                .toList();
    }

    @Transactional
    public ManagementItemResponse create(CreateManagementItemRequest req) {
        String code = StringUtils.hasText(req.code()) ? req.code().trim() : generateCode();
        if (managementItemRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 관리항목코드입니다: " + code);
        }
        ManagementItem m = ManagementItem.builder()
                .code(code)
                .name(req.name())
                .description(req.description())
                .active(true)
                .build();
        return ManagementItemResponse.from(managementItemRepository.save(m));
    }

    @Transactional
    public ManagementItemResponse update(Long id, UpdateManagementItemRequest req) {
        ManagementItem m = getItem(id);
        m.setName(req.name());
        m.setDescription(req.description());
        if (req.active() != null) {
            m.setActive(req.active());
        }
        return ManagementItemResponse.from(m);
    }

    @Transactional
    public void delete(Long id) {
        managementItemRepository.delete(getItem(id));
    }

    private ManagementItem getItem(Long id) {
        return managementItemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("관리항목을 찾을 수 없습니다. id=" + id));
    }

    /** 코드 미입력 시 MG### 자동채번 */
    private String generateCode() {
        return "MG" + String.format("%03d", managementItemRepository.countByCodeStartingWith("MG") + 1);
    }
}
