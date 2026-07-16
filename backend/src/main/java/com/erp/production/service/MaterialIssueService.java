package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.production.domain.MaterialIssue;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.WorkOrder;
import com.erp.production.dto.MaterialIssueDtos.CreateMaterialIssueRequest;
import com.erp.production.dto.MaterialIssueDtos.MaterialIssueResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.production.repository.MaterialIssueRepository;
import com.erp.inventory.repository.WarehouseRepository;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.dto.MaterialIssueDtos;

@Service
@RequiredArgsConstructor
public class MaterialIssueService {

    private final MaterialIssueRepository materialIssueRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final WorkOrderRepository workOrderRepository;

    @Transactional(readOnly = true)
    public List<MaterialIssueResponse> findAll(Long itemId, LocalDate from, LocalDate to) {
        return materialIssueRepository.findAllWithRefs().stream()
                .filter(mi -> itemId == null || mi.getItem().getId().equals(itemId))
                .filter(mi -> from == null || !mi.getIssueDate().isBefore(from))
                .filter(mi -> to == null || !mi.getIssueDate().isAfter(to))
                .map(MaterialIssueResponse::from)
                .toList();
    }

    @Transactional
    public MaterialIssueResponse create(CreateMaterialIssueRequest req) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));

        Warehouse warehouse = null;
        if (req.warehouseId() != null) {
            warehouse = warehouseRepository.findById(req.warehouseId())
                    .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));
        }

        WorkOrder workOrder = null;
        if (req.workOrderId() != null) {
            workOrder = workOrderRepository.findById(req.workOrderId())
                    .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + req.workOrderId()));
        }

        MaterialIssue mi = MaterialIssue.builder()
                .item(item)
                .warehouse(warehouse)
                .workOrder(workOrder)
                .qty(req.qty())
                .issueDate(req.issueDate() != null ? req.issueDate() : LocalDate.now())
                .note(req.note())
                .build();

        return MaterialIssueResponse.from(materialIssueRepository.save(mi));
    }

    @Transactional
    public void delete(Long id) {
        MaterialIssue mi = materialIssueRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산불출 내역을 찾을 수 없습니다. id=" + id));
        materialIssueRepository.delete(mi);
    }
}
