package com.erp.inventory.managementitem;

import com.erp.common.history.ChangeHistoryService;

import com.erp.common.DocumentNoGenerator;
import com.erp.common.ApiException;
import com.erp.inventory.managementitem.dto.ManagementItemDtos.CreateManagementItemRequest;
import com.erp.inventory.managementitem.dto.ManagementItemDtos.ManagementItemResponse;
import com.erp.inventory.managementitem.dto.ManagementItemDtos.UpdateManagementItemRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import com.erp.inventory.managementitem.dto.ManagementItemDtos;

@Service
@RequiredArgsConstructor
public class ManagementItemService {

    private final ManagementItemRepository managementItemRepository;
    private final com.erp.common.usage.UnusedCodeFinder unusedCodeFinder;
    private final DocumentNoGenerator documentNoGenerator;
    private final ChangeHistoryService changeHistory;
    /** [H] 이력 대상 이름 — 한 번 정하면 바꾸지 않는다(공용.md '붙이는 법'). */
    public static final String HISTORY_TARGET = "MANAGEMENT_ITEM";

    /** 새로 고르는 자리에서 쓴다. 사용중지한 관리항목을 품목에 새로 붙일 수는 없다. */
    @Transactional(readOnly = true)
    public ManagementItem getUsable(Long id) {
        ManagementItem m = get(id);
        if (!m.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 관리항목입니다: " + m.getCode() + " " + m.getName());
        }
        return m;
    }

    @Transactional(readOnly = true)
    public List<ManagementItemResponse> findAll() {
        return managementItemRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(ManagementItemResponse::from)
                .toList();
    }

    /** 다른 서비스가 관리항목 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public ManagementItem get(Long id) {
        return managementItemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("관리항목을 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public ManagementItemResponse create(CreateManagementItemRequest req) {
        String code = StringUtils.hasText(req.code()) ? req.code().trim() : generateCode();
        if (managementItemRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 관리항목등록에 존재하는 코드입니다.");   // 원본 E040104 글 그대로
        }
        ManagementItem m = ManagementItem.builder()
                .code(code)
                .name(req.name())
                .description(req.description())
                .active(true)
                .build();
        ManagementItem saved = managementItemRepository.save(m);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return ManagementItemResponse.from(saved);
    }

    @Transactional
    public ManagementItemResponse update(Long id, UpdateManagementItemRequest req) {
        ManagementItem m = getItem(id);
        boolean wasActive = m.isActive();
        m.setName(req.name());
        m.setDescription(req.description());
        if (req.active() != null) {
            m.setActive(req.active());
        }
        changeHistory.recordUpdate(HISTORY_TARGET, m.getId(), wasActive, m.isActive());
        return ManagementItemResponse.from(m);
    }

    @Transactional
    public void delete(Long id) {
        managementItemRepository.delete(getItem(id));
        changeHistory.record(HISTORY_TARGET, id, ChangeHistoryService.DELETED);
    }

    private ManagementItem getItem(Long id) {
        return managementItemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("관리항목을 찾을 수 없습니다. id=" + id));
    }

    /** 코드 미입력 시 MG### 자동채번 */
    private String generateCode() {
        return documentNoGenerator.nextMasterCode("MG", "management_items", "code", 3);
    }

    /** 미사용코드조회 — 기간 안 전표에 안 쓰인 관리항목(그 항목을 단 품목이 쓰였는지로 본다) id (원본 재고1 리스트의 [미사용코드조회]) */
    @Transactional(readOnly = true)
    public List<Long> findUnusedIds(java.time.LocalDate from, java.time.LocalDate to) {
        return unusedCodeFinder.unusedIdsVia("management_items", "items", "management_item_id", from, to);
    }
}
